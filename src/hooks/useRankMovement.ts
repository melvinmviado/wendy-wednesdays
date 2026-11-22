import { useEffect, useState, useSyncExternalStore } from 'react'
import { isSupabaseConfigured } from '../lib/supabase'
import { getScoresVersion, loadAttendedScores, subscribeScores } from '../data/scores'
import type { PlayerScore } from '../types/leaderboard'
import { getRankMovement, type RankMovement } from '../utils/ranking'

const NONE: Map<string, RankMovement> = new Map()

/**
 * Rank movement (latest played week vs the one before) per player id. Empty when the database
 * isn't available, the fetch fails, or only one week has been played (no indicators in Week 1).
 * Scores come from the shared cache (src/data/scores.ts): a new roster array (every leaderboard
 * refresh) only recomputes, and the scores are re-read when they are invalidated.
 */
export function useRankMovement(players: PlayerScore[]): Map<string, RankMovement> {
  const [movement, setMovement] = useState(NONE)
  const scoresVersion = useSyncExternalStore(subscribeScores, getScoresVersion)

  useEffect(() => {
    if (!isSupabaseConfigured || players.length === 0) {
      setMovement(NONE)
      return
    }
    let cancelled = false
    loadAttendedScores()
      .then((rows) => {
        if (cancelled) return
        const scores = rows.map((r) => ({ playerId: r.playerId, weekNumber: r.weekNumber, attended: true, points: r.points }))
        const latest = Math.max(0, ...scores.map((s) => s.weekNumber))
        const hasHistory = scores.some((s) => s.weekNumber < latest)
        setMovement(hasHistory ? new Map(getRankMovement(players, scores).map((m) => [m.playerId, m])) : NONE)
      })
      .catch(() => {
        if (!cancelled) setMovement(NONE) // decorative: no arrows rather than an error
      })
    return () => {
      cancelled = true
    }
  }, [players, scoresVersion])

  return movement
}
