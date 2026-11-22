import { useCallback, useEffect, useRef, useState } from 'react'
import { initialPlayers } from '../data/leaderboardData'
import { fetchStandings, persistActivePlayers, subscribeStandingsChanges } from '../data/players'
import { invalidateScores } from '../data/scores'
import type { PlayerScore } from '../types/leaderboard'

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
      apply(await fetchStandings())
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
      const unsubscribe = subscribeStandingsChanges(() => schedule(true), () => schedule())

      return () => {
        if (timer) clearTimeout(timer)
        unsubscribe()
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
