import { useEffect, useState } from 'react'
import { supabase, isSupabaseConfigured } from '../lib/supabase'
import type { PlayerScore } from '../types/leaderboard'
import { getRankMovement, type RankMovement } from '../utils/ranking'

const NONE: Map<string, RankMovement> = new Map()

/**
 * Rank movement (latest played week vs the one before) per player id. Empty when the database
 * isn't available, the fetch fails, or only one week has been played (no indicators in Week 1).
 */
export function useRankMovement(players: PlayerScore[]): Map<string, RankMovement> {
  const [movement, setMovement] = useState(NONE)

  useEffect(() => {
    if (!isSupabaseConfigured || players.length === 0) {
      setMovement(NONE)
      return
    }
    let cancelled = false
    supabase
      .from('weekly_scores')
      .select('player_id, week_number, points, attended')
      .eq('attended', true)
      .then(({ data, error }) => {
        if (cancelled) return
        if (error || !data) return setMovement(NONE)
        const scores = data.map((r) => ({
          playerId: r.player_id as string,
          weekNumber: r.week_number as number,
          attended: true,
          points: r.points as number,
        }))
        const latest = Math.max(0, ...scores.map((s) => s.weekNumber))
        const hasHistory = scores.some((s) => s.weekNumber < latest)
        if (!hasHistory) return setMovement(NONE)
        setMovement(new Map(getRankMovement(players, scores).map((m) => [m.playerId, m])))
      })
    return () => {
      cancelled = true
    }
  }, [players])

  return movement
}
