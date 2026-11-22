import { supabase } from '../lib/supabase'
import type { ResultTeam, WeekMeta, WeeklyResult } from '../types/leaderboard'
import { loadAttendedScores, type AttendedScore } from './scores'

const PHOTO_BUCKET = 'week-photos'
const PHOTO_TYPES: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }
const PHOTO_MAX_BYTES = 5 * 1024 * 1024

interface WeekRow {
  week_number: number
  played_on: string | null
  notes: string | null
  podium_photo_url: string | null
}

const toMeta = (row: WeekRow): WeekMeta => ({
  weekNumber: row.week_number,
  playedOn: row.played_on,
  notes: row.notes,
  podiumPhotoUrl: row.podium_photo_url,
})

export function buildTeams(rows: AttendedScore[]): ResultTeam[] {
  const teams = new Map<string, ResultTeam>()
  for (const r of rows) {
    if (r.courtNumber == null || r.finishOrder == null) continue
    const key = `${r.courtNumber}-${r.finishOrder}`
    const team = teams.get(key) ?? {
      courtNumber: r.courtNumber,
      finishOrder: r.finishOrder,
      players: [],
    }
    team.players.push({ playerId: r.playerId, name: r.playerName ?? 'Unknown', points: r.points })
    teams.set(key, team)
  }
  return [...teams.values()].sort(
    (a, b) => a.courtNumber - b.courtNumber || a.finishOrder - b.finishOrder
  )
}

/** All weeks that have scores or metadata, oldest first. */
export async function fetchWeeklyResults(): Promise<WeeklyResult[]> {
  const [scores, weeksRes] = await Promise.all([
    loadAttendedScores(),
    supabase.from('weeks').select('week_number, played_on, notes, podium_photo_url'),
  ])
  if (weeksRes.error) throw weeksRes.error

  const metaByWeek = new Map(
    ((weeksRes.data ?? []) as WeekRow[]).map((w) => [w.week_number, toMeta(w)])
  )
  const weekNumbers = new Set<number>([...scores.map((s) => s.weekNumber), ...metaByWeek.keys()])

  return [...weekNumbers]
    .sort((a, b) => a - b)
    .map((weekNumber) => {
      const weekRows = scores.filter((s) => s.weekNumber === weekNumber)
      const meta = metaByWeek.get(weekNumber) ?? {
        weekNumber,
        playedOn: null,
        notes: null,
        podiumPhotoUrl: null,
      }
      return { ...meta, teams: buildTeams(weekRows), attendeeCount: weekRows.length }
    })
}

/** Create or update a week's metadata. Safe to call again at any time (weeks stay editable). */
export async function saveWeekMeta(
  weekNumber: number,
  fields: Partial<Pick<WeekMeta, 'playedOn' | 'notes' | 'podiumPhotoUrl'>>
): Promise<void> {
  const row: Record<string, unknown> = {
    week_number: weekNumber,
    updated_at: new Date().toISOString(),
  }
  if (fields.playedOn !== undefined) row.played_on = fields.playedOn
  if (fields.notes !== undefined) row.notes = fields.notes
  if (fields.podiumPhotoUrl !== undefined) row.podium_photo_url = fields.podiumPhotoUrl

  const { error } = await supabase.from('weeks').upsert(row, { onConflict: 'week_number' })
  if (error) throw error
}

async function listWeekPhotoPaths(weekNumber: number): Promise<string[]> {
  const { data } = await supabase.storage.from(PHOTO_BUCKET).list(`week-${weekNumber}`)
  return (data ?? []).map((f) => `week-${weekNumber}/${f.name}`)
}

/** Upload (or replace) the single podium photo for a week and store its public URL. */
export async function uploadWeekPhoto(weekNumber: number, file: File): Promise<string> {
  // Same list as the bucket (20261203000000_security_hardening.sql). The extension comes from the
  // type, never from the user's file name.
  const ext = PHOTO_TYPES[file.type]
  if (!ext) throw new Error('Please choose a JPEG, PNG or WebP image')
  if (file.size > PHOTO_MAX_BYTES) throw new Error('That photo is larger than 5 MB')
  const path = `week-${weekNumber}/${Date.now()}.${ext}` // unique name avoids stale caches

  const { error: uploadError } = await supabase.storage
    .from(PHOTO_BUCKET)
    .upload(path, file, { contentType: file.type })
  if (uploadError) throw uploadError

  const { data } = supabase.storage.from(PHOTO_BUCKET).getPublicUrl(path)
  await saveWeekMeta(weekNumber, { podiumPhotoUrl: data.publicUrl })

  // Only after the new photo is saved, drop any previous one for this week
  const stale = (await listWeekPhotoPaths(weekNumber)).filter((p) => p !== path)
  if (stale.length > 0) await supabase.storage.from(PHOTO_BUCKET).remove(stale)

  return data.publicUrl
}

/** Remove a week's photo from storage and clear the stored URL. */
export async function removeWeekPhoto(weekNumber: number): Promise<void> {
  const paths = await listWeekPhotoPaths(weekNumber)
  if (paths.length > 0) await supabase.storage.from(PHOTO_BUCKET).remove(paths)
  await saveWeekMeta(weekNumber, { podiumPhotoUrl: null })
}
