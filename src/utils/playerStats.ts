import type { WeeklyResult } from '../types/leaderboard'
import { getPodiumTeams } from './scoring'

export const SEASON_WEEKS = 8

// One attended week for one player, as stored in weekly_scores
export interface PlayerWeek {
  weekNumber: number
  courtNumber: number | null
  finishOrder: number | null
  points: number
}

export type Finish = 'Winner' | 'Runner-up' | 'Other'

export interface WeeklyLogEntry {
  weekNumber: number
  playedOn: string | null
  courtNumber: number | null // null if checked in but not placed on a court
  finish: Finish
}

export interface PlayerCareer {
  weeksPlayed: number
  bestCourtFinish: { courtNumber: number; finish: 'Winner' | 'Runner-up' } | null
  podiumCount: number
  avgPointsPerSession: number | null // attended weeks only, 1 decimal; null if never attended
}

export interface PlayerStats {
  playerId: string
  weeklyPoints: (number | null)[] // index 0 = week 1 ... index 7 = week 8; null = did not attend
  weeklyLog: WeeklyLogEntry[]
  career: PlayerCareer
}

const toFinish = (finishOrder: number | null): Finish =>
  finishOrder === 1 ? 'Winner' : finishOrder === 2 ? 'Runner-up' : 'Other'

/**
 * Pure stats derivation. `weeks` are the player's attended weekly_scores rows; `results`
 * are the archive weeks, used for dates and the shared podium logic (getPodiumTeams).
 */
export function computePlayerStats(
  playerId: string,
  weeks: PlayerWeek[],
  results: WeeklyResult[]
): PlayerStats {
  const byWeek = new Map(weeks.map((w) => [w.weekNumber, w]))
  const resultByWeek = new Map(results.map((w) => [w.weekNumber, w]))

  const weeklyPoints = Array.from({ length: SEASON_WEEKS }, (_, i) => byWeek.get(i + 1)?.points ?? null)

  const attended = [...byWeek.values()].sort((a, b) => a.weekNumber - b.weekNumber)
  const weeklyLog: WeeklyLogEntry[] = attended.map((w) => {
    const placed = w.courtNumber != null && w.finishOrder != null
    return {
      weekNumber: w.weekNumber,
      playedOn: resultByWeek.get(w.weekNumber)?.playedOn ?? null,
      courtNumber: placed ? w.courtNumber : null,
      finish: placed ? toFinish(w.finishOrder) : 'Other',
    }
  })

  // Best court finish: lowest court number; Winner beats Runner-up on the same court.
  let best: PlayerCareer['bestCourtFinish'] = null
  for (const e of weeklyLog) {
    if (e.courtNumber == null || e.finish === 'Other') continue
    const better =
      !best ||
      e.courtNumber < best.courtNumber ||
      (e.courtNumber === best.courtNumber && e.finish === 'Winner' && best.finish === 'Runner-up')
    if (better) best = { courtNumber: e.courtNumber, finish: e.finish }
  }

  const podiumCount = attended.filter((w) =>
    getPodiumTeams(resultByWeek.get(w.weekNumber)?.teams ?? []).some((t) =>
      t.players.some((p) => p.playerId === playerId)
    )
  ).length

  const total = attended.reduce((sum, w) => sum + w.points, 0)
  const avg = attended.length === 0 ? null : Math.round((total / attended.length) * 10) / 10

  return {
    playerId,
    weeklyPoints,
    weeklyLog,
    career: {
      weeksPlayed: attended.length,
      bestCourtFinish: best,
      podiumCount,
      avgPointsPerSession: avg,
    },
  }
}
