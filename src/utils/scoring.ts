import type { ResultTeam } from '../types/leaderboard'

/**
 * Dynamic percentile / linear scaling system for Wendy Wednesdays:
 * Formula: points = base + PodiumBonus + round(MaxPool * ((N - Rank) / (N - 1)))
 * - base: 10 pts
 * - MaxPool: 10 pts distributed linearly from last to first place
 * - Podium Bonus: +5 for 1st, +3 for 2nd, +1 for 3rd
 */
export interface PointAllocationBreakdown {
  rank: number
  base: number
  podiumBonus: number
  linearPoints: number
  totalPoints: number
}

export function calculateDynamicPoints(
  rank: number,
  totalRanks: number
): PointAllocationBreakdown {
  const base = 10
  const maxPool = 10

  // Podium Bonus: +5 for 1st, +3 for 2nd, +1 for 3rd, 0 otherwise
  let podiumBonus = 0
  if (rank === 1) podiumBonus = 5
  else if (rank === 2) podiumBonus = 3
  else if (rank === 3) podiumBonus = 1

  // Linear distribution of MaxPool: (N - Rank) / (N - 1)
  let linearPoints = 0
  if (totalRanks <= 1) {
    linearPoints = maxPool
  } else {
    const ratio = Math.max(0, Math.min(1, (totalRanks - rank) / (totalRanks - 1)))
    linearPoints = Math.round(maxPool * ratio)
  }

  const totalPoints = base + podiumBonus + linearPoints

  return {
    rank,
    base,
    podiumBonus,
    linearPoints,
    totalPoints,
  }
}

/**
 * Calculates the overall finishing rank for a doubles team on a given court.
 * - Court 1 Winners = Rank 1
 * - Court 1 Runners-up = Rank 2
 * - Court 2 Winners = Rank 3
 * - Court 2 Runners-up = Rank 4
 * ...
 */
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

export function getTeamOverallRank(courtNumber: number, teamPlace: 1 | 2): number {
  return (courtNumber - 1) * 2 + teamPlace
}
