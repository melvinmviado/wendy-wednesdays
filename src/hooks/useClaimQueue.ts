import { useCallback, useEffect, useRef, useState } from 'react'
import {
  approveClaim,
  claimErrorMessage,
  fetchLinkedPlayers,
  fetchPendingClaims,
  isClaimsUnavailable,
  rejectClaim,
  unlinkPlayer,
} from '../data/claims'
import type { LinkedPlayer, PendingClaim } from '../types/claims'

/**
 * Admin side of claims: pending requests, linked players, and the three actions.
 * `enabled` should be true only for admins on a configured database.
 */
export function useClaimQueue(enabled: boolean) {
  const [requests, setRequests] = useState<PendingClaim[]>([])
  const [linked, setLinked] = useState<LinkedPlayer[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [unavailable, setUnavailable] = useState(false)
  const alive = useRef(true)

  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  const reload = useCallback(async () => {
    if (!enabled) return
    setLoading(true)
    setError(null)
    try {
      const [r, l] = await Promise.all([fetchPendingClaims(), fetchLinkedPlayers()])
      if (!alive.current) return
      setRequests(r)
      setLinked(l)
    } catch (e) {
      if (!alive.current) return
      if (isClaimsUnavailable(e)) setUnavailable(true)
      else setError(claimErrorMessage(e))
    } finally {
      if (alive.current) setLoading(false)
    }
  }, [enabled])

  useEffect(() => {
    void reload()
  }, [reload])

  const run = useCallback(
    async (id: string, action: () => Promise<void>) => {
      setBusyId(id)
      setActionError(null)
      try {
        await action()
      } catch (e) {
        if (alive.current) setActionError(claimErrorMessage(e))
      } finally {
        if (alive.current) setBusyId(null)
        await reload() // also corrects the list if someone else handled the request first
      }
    },
    [reload],
  )

  return {
    requests,
    linked,
    loading,
    error,
    actionError,
    busyId,
    unavailable,
    reload,
    approve: (id: string) => run(id, () => approveClaim(id)),
    reject: (id: string) => run(id, () => rejectClaim(id)),
    unlink: (playerId: string) => run(playerId, () => unlinkPlayer(playerId)),
  }
}

export type ClaimQueue = ReturnType<typeof useClaimQueue>
