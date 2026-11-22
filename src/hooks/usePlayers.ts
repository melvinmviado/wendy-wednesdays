import { useCallback, useEffect, useRef, useState } from 'react'
import { initialPlayers } from '../data/leaderboardData'
import { fetchPlayers, persistActivePlayers } from '../data/players'
import { invalidateScores } from '../data/scores'
import { supabase } from '../lib/supabase'
import type { PlayerScore } from '../types/leaderboard'
import { isPlayerRole } from '../types/roles'

const CACHE_KEY = 'wendy_leaderboard_players'
/** Realtime sends one event per changed row: saving a week is a burst. Reload once after it. */
export const REALTIME_DEBOUNCE_MS = 500

/**
 * The season roster: cached in localStorage, loaded from the season_leaderboard view (falling back
 * to the players table), and kept fresh by a realtime subscription. Shared by the leaderboard and
 * the admin weekly-results page.
 *
 * With a database, the seed roster is never shown: the first paint uses the cache (or nothing),
 * and the database's answer, even an empty one, replaces it. `loaded` turns true after the first
 * successful load. Overlapping refreshes are numbered, and only the newest one may write state.
 */
export function usePlayers(isConfigured: boolean) {
  const [players, setPlayers] = useState<PlayerScore[]>(() => {
    const saved = localStorage.getItem(CACHE_KEY)
    if (saved) {
      try {
        return (JSON.parse(saved) as PlayerScore[]).filter((p) => !p.archivedAt)
      } catch {
        // fall through to the default below
      }
    }
    return isConfigured ? [] : initialPlayers
  })
  const [loadingDb, setLoadingDb] = useState(isConfigured)
  const [loaded, setLoaded] = useState(!isConfigured)
  const [dbError, setDbError] = useState<string | null>(null)
  const seqRef = useRef(0)

  // Fetch players from database (prioritizing the computed season_leaderboard view)
  const refresh = useCallback(async () => {
    if (!isConfigured) return

    const seq = ++seqRef.current
    const current = () => seq === seqRef.current
    const apply = (list: PlayerScore[]) => {
      if (!current()) return
      setPlayers(list)
      setLoaded(true)
      localStorage.setItem(CACHE_KEY, JSON.stringify(list))
    }
    setLoadingDb(true)
    setDbError(null)

    try {
      // 1. Try querying the database-computed view
      const { data: viewData, error: viewError } = await supabase
        .from('season_leaderboard')
        .select('*')
        .order('total_points', { ascending: false })

      if (!viewError && viewData) {
        const mapped: PlayerScore[] = viewData.map((item) => ({
          id: item.id,
          name: item.name,
          weeksPlayed: item.weeks_played ?? 0,
          totalPoints: item.total_points ?? 0,
          avatarUrl: item.avatar_url ?? null, // resolved in the view; missing before the migration
          role: isPlayerRole(item.role_key) ? item.role_key : null, // absent until the role view migration
          isClaimed: item.is_claimed === true, // absent until the claimed view migration
        }))
        apply(mapped)
        return
      }

      // 2. Fallback to direct players table if view is not yet created (archived players excluded)
      const result = await fetchPlayers()
      if (!result.ok) throw new Error(result.error.message)

      apply(result.data)
    } catch (err: unknown) {
      if (!current()) return
      const msg = err instanceof Error ? err.message : 'Failed to fetch from database'
      setDbError(msg)
    } finally {
      if (current()) setLoadingDb(false)
    }
  }, [isConfigured])

  // Load on mount and setup real-time subscriptions
  useEffect(() => {
    if (isConfigured) {
      refresh()

      // Realtime: one event per changed row, so a saved week of N scores is N events. Reload
      // once, REALTIME_DEBOUNCE_MS after the last one.
      let timer: ReturnType<typeof setTimeout> | null = null
      let scoresChanged = false
      const schedule = (scores = false) => {
        scoresChanged ||= scores
        if (timer) clearTimeout(timer)
        timer = setTimeout(() => {
          timer = null
          if (scoresChanged) invalidateScores() // rank arrows and results re-read the scores
          scoresChanged = false
          void refresh()
        }, REALTIME_DEBOUNCE_MS)
      }
      const channel = supabase
        .channel('public:leaderboard_changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'weekly_scores' }, () => schedule(true))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'players' }, () => schedule())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'player_roles' }, () => schedule())
        .subscribe()

      return () => {
        if (timer) clearTimeout(timer)
        supabase.removeChannel(channel)
      }
    }
  }, [isConfigured, refresh])

  const addPlayer = useCallback((newPlayer: PlayerScore) => {
    setPlayers((prev) => {
      const updated = [newPlayer, ...prev]
      persistActivePlayers(updated)
      return updated
    })
  }, [])

  return { players, setPlayers, loadingDb, loaded, dbError, refresh, addPlayer }
}
