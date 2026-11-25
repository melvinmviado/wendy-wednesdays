import { useCallback, useEffect, useRef, useState } from 'react'
import {
  courtAssignmentsApi,
  type CourtAssignmentsApi,
  type CourtResult,
  type CourtSettings,
  type CourtSettingsError,
  type CourtSettingsSnapshot,
  type GenerateSummary,
} from '@/lib/courtSettings'

/**
 * Court settings and board status for one run, with save and "Generate now". Both actions reload
 * the snapshot afterwards, so the panel shows what the database holds (a failed generate may still
 * have turned guests into players, or filled in the run's court numbers).
 */
export function useCourtSettings(sessionDate: string, api: CourtAssignmentsApi = courtAssignmentsApi) {
  const [snapshot, setSnapshot] = useState<CourtSettingsSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<CourtSettingsError | null>(null)
  const latest = useRef(0) // a slower, older read must not overwrite a newer one

  const refetch = useCallback(async () => {
    const mine = ++latest.current
    const result = await api.load(sessionDate)
    if (mine !== latest.current) return
    if (result.ok) {
      setSnapshot(result.data)
      setError(null)
    } else {
      setError(result.error) // keep showing the last good snapshot
    }
    setLoading(false)
  }, [api, sessionDate])

  useEffect(() => {
    setLoading(true)
    setSnapshot(null)
    void refetch()
  }, [refetch])

  const save = useCallback(
    async (input: Omit<CourtSettings, 'sessionDate'>): Promise<CourtResult<CourtSettings>> => {
      const result = await api.save({ ...input, sessionDate })
      if (result.ok) await refetch()
      return result
    },
    [api, refetch, sessionDate],
  )

  const generate = useCallback(
    async (force: boolean): Promise<CourtResult<GenerateSummary>> => {
      const result = await api.generate(sessionDate, force)
      await refetch()
      return result
    },
    [api, refetch, sessionDate],
  )

  return { snapshot, loading, error, refetch, save, generate }
}
