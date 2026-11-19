import type { PlayerScore } from '../types/leaderboard'

export type RankedPlayer = PlayerScore & { rank: number; tied: boolean }

/**
 * Sorts by season points (then weeks played, then name) and assigns competition ranks:
 * players with equal points share the rank of the first of them, and the next rank is skipped.
 */
export function rankPlayers(players: PlayerScore[]): RankedPlayer[] {
  const sorted = [...players].sort(
    (a, b) => b.totalPoints - a.totalPoints || b.weeksPlayed - a.weeksPlayed || a.name.localeCompare(b.name)
  )
  return sorted.map((player) => {
    const firstIndex = sorted.findIndex((p) => p.totalPoints === player.totalPoints)
    const count = sorted.filter((p) => p.totalPoints === player.totalPoints).length
    return { ...player, rank: firstIndex + 1, tied: count > 1 }
  })
}

/** "T2" for a tied rank, "2" otherwise. */
export const rankLabel = (rank: number, tied: boolean) => (tied ? `T${rank}` : `${rank}`)

/** Spoken form for screen readers: "rank 2" or "tied for rank 2". */
export const rankSpoken = (rank: number, tied: boolean) => (tied ? `tied for rank ${rank}` : `rank ${rank}`)
