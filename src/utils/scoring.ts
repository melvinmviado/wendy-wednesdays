import type { ResultTeam } from '../types/leaderboard'

// Default points per team are in weeklyEntry.ts (getDefaultTeamPoints), following the Rules page.

/**
 * The week's podium: the top three teams overall (1st/2nd place team on each court only).
 * A small week may return fewer than three.
 */
export function getPodiumTeams(teams: ResultTeam[]): ResultTeam[] {
  const rankOf = (t: ResultTeam) => getTeamOverallRank(t.courtNumber, t.finishOrder === 1 ? 1 : 2)
  return [...teams]
    .sort((a, b) => rankOf(a) - rankOf(b))
    .filter((t) => t.finishOrder <= 2)
    .slice(0, 3)
}

/**
 * The overall finishing rank of a doubles team: Court 1 winners = 1, Court 1 runners-up = 2,
 * Court 2 winners = 3, Court 2 runners-up = 4, ...
 */
export function getTeamOverallRank(courtNumber: number, teamPlace: 1 | 2): number {
  return (courtNumber - 1) * 2 + teamPlace
}
