import { useCallback, useEffect, useState } from 'react'
import { initialPlayers } from '../data/leaderboardData'
import { fetchPlayers, persistActivePlayers } from '../data/players'
import { supabase } from '../lib/supabase'
import type { PlayerScore } from '../types/leaderboard'
import { isPlayerRole } from '../types/roles'

/**
 * The season roster: cached in localStorage, loaded from the season_leaderboard view (falling back
 * to the players table), and kept fresh by a realtime subscription. Shared by the leaderboard and
 * the admin weekly-results page.
 */
export function usePlayers(isConfigured: boolean) {
  const [players, setPlayers] = useState<PlayerScore[]>(() => {
    const saved = localStorage.getItem('wendy_leaderboard_players')
    if (saved) {
      try {
        return (JSON.parse(saved) as PlayerScore[]).filter((p) => !p.archivedAt)
      } catch {
        // fallback
      }
    }
    return initialPlayers
  })
  const [loadingDb, setLoadingDb] = useState(false)
  const [dbError, setDbError] = useState<string | null>(null)

  // Fetch players from database (prioritizing the computed season_leaderboard view)
  const refresh = useCallback(async () => {
    if (!isConfigured) return

    setLoadingDb(true)
    setDbError(null)

    try {
      // 1. Try querying the database-computed view
      const { data: viewData, error: viewError } = await supabase
        .from('season_leaderboard')
        .select('*')
        .order('total_points', { ascending: false })

      if (!viewError && viewData && viewData.length > 0) {
        const mapped: PlayerScore[] = viewData.map((item) => ({
          id: item.id,
          name: item.name,
          weeksPlayed: item.weeks_played ?? 0,
          totalPoints: item.total_points ?? 0,
          avatarUrl: item.avatar_url ?? null, // resolved in the view; missing before the migration
          role: isPlayerRole(item.role_key) ? item.role_key : null, // absent until the role view migration
        }))
        setPlayers(mapped)
        localStorage.setItem('wendy_leaderboard_players', JSON.stringify(mapped))
        return
      }

      // 2. Fallback to direct players table if view is not yet created (archived players excluded)
      const result = await fetchPlayers()
      if (!result.ok) throw new Error(result.error.message)

      if (result.data.length > 0) {
        setPlayers(result.data)
        localStorage.setItem('wendy_leaderboard_players', JSON.stringify(result.data))
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to fetch from database'
      setDbError(msg)
    } finally {
      setLoadingDb(false)
    }
  }, [isConfigured])

  // Load on mount and setup real-time subscriptions
  useEffect(() => {
    if (isConfigured) {
      refresh()

      // Subscribe to real-time changes on both weekly_scores and players
      const channel = supabase
        .channel('public:leaderboard_changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'weekly_scores' }, () => {
          refresh()
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'players' }, () => {
          refresh()
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'player_roles' }, () => {
          refresh()
        })
        .subscribe()

      return () => {
        supabase.removeChannel(channel)
      }
    }
  }, [isConfigured, refresh])

  const addPlayer = (newPlayer: PlayerScore) => {
    const updated = [newPlayer, ...players]
    setPlayers(updated)
    persistActivePlayers(updated)
  }

  return { players, setPlayers, loadingDb, dbError, refresh, addPlayer }
}
