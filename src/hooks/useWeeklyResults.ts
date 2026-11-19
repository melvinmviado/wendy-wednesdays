import { useCallback, useEffect, useState } from 'react'
import { isSupabaseConfigured } from '../lib/supabase'
import { fetchWeeklyResults } from '../data/weeklyResults'
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

  useEffect(() => {
    refresh()
  }, [refresh])

  return { results, loading, error, refresh }
}
