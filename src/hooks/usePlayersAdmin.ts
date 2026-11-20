import { useCallback, useMemo, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { createPlayer } from '../data/players'
import type { PlayerScore, Result } from '../types/leaderboard'
import { usePlayerAdmin } from './usePlayerAdmin'
import { usePlayers } from './usePlayers'
import type { ToastApi } from './useToasts'

/**
 * Everything the admin Players page needs: the roster, rename / archive / restore / delete
 * (usePlayerAdmin), adding a player, and the search + "show archived" view of the list.
 */
export function usePlayersAdmin(toast: Pick<ToastApi, 'push'>) {
  const { isConfigured } = useAuth()
  const { players, setPlayers, loadingDb, dbError, refresh } = usePlayers(isConfigured)
  const admin = usePlayerAdmin({ enabled: true, players, setPlayers, toast, refresh })
  const [query, setQuery] = useState('')

  const add = useCallback(
    async (name: string): Promise<Result<PlayerScore>> => {
      const res = await createPlayer(name)
      if (res.ok) {
        setPlayers((list) => [res.data, ...list])
        toast.push('success', `${res.data.name} added.`)
        refresh()
      }
      return res
    },
    [setPlayers, toast, refresh],
  )

  const { showArchived, archived } = admin
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    const all = showArchived ? [...players, ...archived] : players
    const matched = q ? all.filter((p) => p.name.toLowerCase().includes(q)) : all
    return [...matched].sort((a, b) => a.name.localeCompare(b.name))
  }, [players, archived, showArchived, query])

  return { admin, rows, activeCount: players.length, loading: loadingDb, error: dbError, retry: refresh, add, query, setQuery }
}
