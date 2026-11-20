import { useCallback, useState } from 'react'
import { setPlayerRole } from '../data/players'
import type { PlayerScore } from '../types/leaderboard'
import { roleInfo, type PlayerRole } from '../types/roles'
import type { ToastApi } from './useToasts'

interface Args {
  toast: Pick<ToastApi, 'push'>
  /** Called after a successful save: refetch the players list and any profile built from it. */
  onChanged: () => void
}

/** Assign or clear one player's role. Exposes saving + the server's real error message. */
export function useSetPlayerRole({ toast, onChanged }: Args) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const setRole = useCallback(
    async (player: PlayerScore, role: PlayerRole | null): Promise<boolean> => {
      setSaving(true)
      setError(null)
      const res = await setPlayerRole(player.id, role)
      setSaving(false)
      if (!res.ok) {
        setError(res.error.message) // shown inline by the caller
        return false
      }
      toast.push('success', role ? `${player.name} is now ${roleInfo(role).label}.` : `Cleared ${player.name}'s role.`)
      onChanged()
      return true
    },
    [toast, onChanged],
  )

  const reset = useCallback(() => setError(null), [])
  return { setRole, saving, error, reset }
}
