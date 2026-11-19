import { useCallback, useEffect, useState } from 'react'
import { isSupabaseConfigured } from '../lib/supabase'
import { getPlayerStats } from '../data/getPlayerStats'
import type { PlayerStats } from '../utils/playerStats'
import { errorMessage } from '../utils/errorMessage'

/** Loads stats for one player; pass null while no player is selected. */
export function usePlayerStats(playerId: string | null) {
  const [stats, setStats] = useState<PlayerStats | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    setStats(null)
    setError(null)
    if (!playerId || !isSupabaseConfigured) {
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    getPlayerStats(playerId)
      .then((s) => !cancelled && setStats(s))
      .catch((e: unknown) => !cancelled && setError(errorMessage(e, 'Failed to load stats')))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [playerId, attempt])

  const retry = useCallback(() => setAttempt((n) => n + 1), [])
  return { stats, loading, error, retry, available: isSupabaseConfigured }
}
