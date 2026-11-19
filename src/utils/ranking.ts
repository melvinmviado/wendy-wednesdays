import type { PlayerScore, WeeklyScoreRecord } from '../types/leaderboard'

export type RankedPlayer = PlayerScore & { rank: number; tied: boolean }

/** The one ordering rule: points desc, then weeks played desc, then name A-Z. */
export const compareScores = (a: PlayerScore, b: PlayerScore) =>
  b.totalPoints - a.totalPoints || b.weeksPlayed - a.weeksPlayed || a.name.localeCompare(b.name)

/**
 * Sorts by season points (then weeks played, then name) and assigns competition ranks:
 * players with equal points share the rank of the first of them, and the next rank is skipped.
 */
export function rankPlayers(players: PlayerScore[]): RankedPlayer[] {
  const sorted = [...players].sort(compareScores)
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

type ScoreRow = Pick<WeeklyScoreRecord, 'playerId' | 'weekNumber' | 'attended' | 'points'>

/**
 * Cumulative standings using only weeks 1..weekNumber (attended rows only), ranked with the
 * same rules as the live leaderboard. Every player is included, with 0 points if none yet.
 */
export function getStandingsAsOfWeek(
  players: { id: string; name: string }[],
  scores: ScoreRow[],
  weekNumber: number
): RankedPlayer[] {
  const counted = scores.filter((s) => s.attended && s.weekNumber <= weekNumber)
  return rankPlayers(
    players.map((pl) => {
      const mine = counted.filter((s) => s.playerId === pl.id)
      return {
        id: pl.id,
        name: pl.name,
        weeksPlayed: new Set(mine.map((s) => s.weekNumber)).size,
        totalPoints: mine.reduce((sum, s) => sum + s.points, 0),
      }
    })
  )
}

export type MovementStatus = 'up' | 'down' | 'same' | 'new'

export interface RankMovement {
  playerId: string
  currentRank: number
  previousRank: number | null // null when status is 'new'
  delta: number | null // previousRank - currentRank; positive = moved up; null when 'new'
  status: MovementStatus
}

/**
 * Compares standings after the latest played week with standings after the week before it.
 * 'new' = attended the latest week and has no attendance before it. A player who skipped the
 * latest week keeps a real movement value, since others may have passed them. Players with no
 * attendance at all are 'same'. Returns [] when no week has been played.
 */
export function getRankMovement(
  players: { id: string; name: string }[],
  scores: ScoreRow[]
): RankMovement[] {
  const attended = scores.filter((s) => s.attended)
  if (attended.length === 0) return []
  const latest = Math.max(...attended.map((s) => s.weekNumber))

  const anyHistory = attended.some((s) => s.weekNumber < latest)

  const current = new Map(getStandingsAsOfWeek(players, scores, latest).map((p) => [p.id, p]))
  const previous = new Map(getStandingsAsOfWeek(players, scores, latest - 1).map((p) => [p.id, p]))

  return players.map((pl) => {
    const currentRank = current.get(pl.id)!.rank
    const hadEarlier = attended.some((s) => s.playerId === pl.id && s.weekNumber < latest)
    const playedLatest = attended.some((s) => s.playerId === pl.id && s.weekNumber === latest)

    if (!hadEarlier && playedLatest) {
      return { playerId: pl.id, currentRank, previousRank: null, delta: null, status: 'new' as const }
    }
    // Single-week season (nobody has history) or a player with no attendance: nothing to compare
    if (!anyHistory || !hadEarlier) {
      return { playerId: pl.id, currentRank, previousRank: currentRank, delta: 0, status: 'same' as const }
    }
    const previousRank = previous.get(pl.id)!.rank
    const delta = previousRank - currentRank
    const status: MovementStatus = delta > 0 ? 'up' : delta < 0 ? 'down' : 'same'
    return { playerId: pl.id, currentRank, previousRank, delta, status }
  })
}
