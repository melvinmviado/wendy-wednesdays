import { supabase, isSupabaseConfigured } from '@/lib/supabase'
import type { PlayerScore, WeeklyScoreRecord } from '@/types/leaderboard'
import type { SavedPlacement, WeeklyScoreWrite } from '@/utils/weeklyEntry'
import { persistActivePlayers } from '@/data/players'
import { invalidateScores } from '@/data/scores'

// Reads and writes for the admin weekly-entry screen, against Supabase or (demo mode) localStorage.

const SEASON_WEEKS = 8
const demoKey = (week: number) => `wendy_weekly_scores_w${week}`

function readDemoWeek(week: number): WeeklyScoreRecord[] {
  const saved = localStorage.getItem(demoKey(week))
  if (!saved) return []
  try {
    return JSON.parse(saved) as WeeklyScoreRecord[]
  } catch {
    return []
  }
}

/** The ATTENDED rows saved for a week, with their court placement. */
export async function loadWeekPlacements(week: number): Promise<SavedPlacement[]> {
  if (!isSupabaseConfigured) return readDemoWeek(week).filter((s) => s.attended)

  const { data, error } = await supabase
    .from('weekly_scores')
    .select('player_id, attended, court_number, finish_order, points')
    .eq('week_number', week)
  if (error) throw error
  return (data ?? [])
    .filter((row) => row.attended)
    .map((row) => ({
      playerId: row.player_id,
      courtNumber: row.court_number,
      finishOrder: row.finish_order,
      points: row.points,
    }))
}

/**
 * Upserts a week's rows (one per player, attended or not). With a database the totals are then
 * recomputed there; in demo mode they are recomputed here from every stored week.
 */
export async function saveWeekScores(records: WeeklyScoreWrite[], week: number, roster: PlayerScore[]): Promise<void> {
  if (isSupabaseConfigured) {
    const { error } = await supabase.from('weekly_scores').upsert(records, { onConflict: 'player_id,week_number' })
    if (error) throw error
    invalidateScores()
    return
  }

  const local: WeeklyScoreRecord[] = records.map((r) => ({
    playerId: r.player_id,
    weekNumber: r.week_number,
    attended: r.attended,
    courtNumber: r.court_number ?? undefined,
    finishOrder: r.finish_order ?? undefined,
    points: r.points,
  }))
  localStorage.setItem(demoKey(week), JSON.stringify(local))

  const all: WeeklyScoreRecord[] = []
  for (let w = 1; w <= SEASON_WEEKS; w++) all.push(...readDemoWeek(w))
  persistActivePlayers(
    roster.map((p) => {
      const mine = all.filter((s) => s.playerId === p.id && s.attended)
      return {
        ...p,
        weeksPlayed: new Set(mine.map((s) => s.weekNumber)).size,
        totalPoints: mine.reduce((sum, s) => sum + s.points, 0),
      }
    })
  )
}
