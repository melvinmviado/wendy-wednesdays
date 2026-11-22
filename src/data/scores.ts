import { supabase } from '@/lib/supabase'

/** One attended weekly_scores row, with the player's name joined in. */
export interface AttendedScore {
  playerId: string
  weekNumber: number
  courtNumber: number | null
  finishOrder: number | null
  points: number
  playerName: string | null
}

interface Row {
  player_id: string
  week_number: number
  court_number: number | null
  finish_order: number | null
  points: number
  players: { name: string } | { name: string }[] | null
}

/** How long a loaded copy is reused when nothing has said the scores changed. */
export const SCORES_MAX_AGE_MS = 60_000

let cached: { at: number; promise: Promise<AttendedScore[]> } | null = null
let version = 0
const listeners = new Set<() => void>()

async function fetchAttended(): Promise<AttendedScore[]> {
  const { data, error } = await supabase
    .from('weekly_scores')
    .select('player_id, week_number, court_number, finish_order, points, players(name)')
    .eq('attended', true)
  if (error) throw error
  return ((data ?? []) as unknown as Row[]).map((r) => {
    const joined = Array.isArray(r.players) ? r.players[0] : r.players
    return {
      playerId: r.player_id,
      weekNumber: r.week_number,
      courtNumber: r.court_number,
      finishOrder: r.finish_order,
      points: r.points,
      playerName: joined?.name ?? null,
    }
  })
}

/**
 * Every attended score of the season, shared by the rank arrows, the weekly results and the
 * player stats so the table is downloaded once instead of three times. Calls made while a load
 * is running share it; a loaded copy is reused for SCORES_MAX_AGE_MS or until
 * invalidateScores(). A failed load is never kept.
 */
export function loadAttendedScores(): Promise<AttendedScore[]> {
  if (cached && Date.now() - cached.at < SCORES_MAX_AGE_MS) return cached.promise
  const entry = { at: Date.now(), promise: fetchAttended() }
  cached = entry
  entry.promise.catch(() => {
    if (cached === entry) cached = null
  })
  return entry.promise
}

/** Call when scores may have changed (a save, a realtime event). Subscribers reload. */
export function invalidateScores(): void {
  cached = null
  version += 1
  listeners.forEach((listener) => listener())
}

/** For useSyncExternalStore: bumps on every invalidateScores(). */
export const getScoresVersion = (): number => version

export function subscribeScores(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
