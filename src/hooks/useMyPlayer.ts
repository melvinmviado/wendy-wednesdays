import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { fetchMyClaim } from '../data/claims'

export interface MyPlayer {
  id: string
  name: string
}

/**
 * The roster player linked to the signed-in account (players.user_id), or null: signed out,
 * demo mode, an anonymous session, nothing claimed yet, or the claims migration is missing.
 */
export function useMyPlayer(): MyPlayer | null {
  const { user, isConfigured } = useAuth()
  const userId = isConfigured && user && !user.is_anonymous ? user.id : null
  const [mine, setMine] = useState<MyPlayer | null>(null)

  useEffect(() => {
    if (!userId) {
      setMine(null)
      return
    }
    let cancelled = false
    fetchMyClaim(userId)
      .then((claim) => {
        if (!cancelled) setMine(claim.linkedPlayer)
      })
      .catch(() => {
        if (!cancelled) setMine(null)
      })
    return () => {
      cancelled = true
    }
  }, [userId])

  return mine
}
