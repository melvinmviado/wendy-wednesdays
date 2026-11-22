import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import { isSupabaseConfigured } from '../lib/supabase'
import { fetchWeeklyResults } from '../data/weeklyResults'
import { getScoresVersion, subscribeScores } from '../data/scores'
import type { WeeklyResult } from '../types/leaderboard'

export function useWeeklyResults() {
  const [results, setResults] = useState<WeeklyResult[]>([])
  const [loading, setLoading] = useState(isSupabaseConfigured)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!isSupabaseConfigured) return
    setLoading(true)
    setError(null)
    try {
      setResults(await fetchWeeklyResults())
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load weekly results')
    } finally {
      setLoading(false)
    }
  }, [])

  // Reload when scores are invalidated (a save, a realtime change); the shared cache makes the
  // first load after switching tabs free.
  const scoresVersion = useSyncExternalStore(subscribeScores, getScoresVersion)
  useEffect(() => {
    refresh()
  }, [refresh, scoresVersion])

  return { results, loading, error, refresh }
}
