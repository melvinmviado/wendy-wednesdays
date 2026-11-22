import { computePlayerStats, type PlayerStats, type PlayerWeek } from '../utils/playerStats'
import { loadAttendedScores } from './scores'
import { fetchWeeklyResults } from './weeklyResults'

/**
 * Weekly points, weekly log and career stats for one player, from the weekly archive. The
 * player's own weeks come from the same shared scores the results are built from, so opening a
 * stats dialog makes no extra score request when the leaderboard has already loaded them.
 */
export async function getPlayerStats(playerId: string): Promise<PlayerStats> {
  const [scores, results] = await Promise.all([loadAttendedScores(), fetchWeeklyResults()])
  const weeks: PlayerWeek[] = scores
    .filter((s) => s.playerId === playerId)
    .sort((a, b) => a.weekNumber - b.weekNumber)
    .map(({ weekNumber, courtNumber, finishOrder, points }) => ({ weekNumber, courtNumber, finishOrder, points }))
  return computePlayerStats(playerId, weeks, results)
}
