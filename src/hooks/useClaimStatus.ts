import { useCallback, useEffect, useState } from 'react'
import { deriveClaimView, fetchMyClaim, fetchPlayerOwner, isClaimsUnavailable } from '../data/claims'
import type { ClaimView } from '../types/claims'
import { errorMessage } from '../utils/errorMessage'

export type ClaimStatusState =
  | { phase: 'loading' }
  | { phase: 'error'; message: string }
  | { phase: 'ready'; view: ClaimView }

/** Loads what the signed-in user can do about claiming one player. Reloads when the player changes. */
export function useClaimStatus(playerId: string, userId: string | null) {
  const [state, setState] = useState<ClaimStatusState>({ phase: 'loading' })
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    if (!userId) {
      setState({ phase: 'ready', view: { kind: 'hidden' } })
      return
    }
    let cancelled = false
    setState({ phase: 'loading' })
    Promise.all([fetchMyClaim(userId), fetchPlayerOwner(playerId)])
      .then(([my, ownerId]) => {
        if (!cancelled) setState({ phase: 'ready', view: deriveClaimView({ playerId, userId, ownerId, my }) })
      })
      .catch((e: unknown) => {
        if (cancelled) return
        // Migration not applied yet: stay out of the way instead of showing an error on every player.
        setState(
          isClaimsUnavailable(e)
            ? { phase: 'ready', view: { kind: 'hidden' } }
            : { phase: 'error', message: errorMessage(e, "Couldn't check your claim status.") },
        )
      })
    return () => {
      cancelled = true
    }
  }, [playerId, userId, nonce])

  const reload = useCallback(() => setNonce((n) => n + 1), [])
  return { state, reload }
}
