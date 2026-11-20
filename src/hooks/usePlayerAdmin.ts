import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from 'react'
import type { PlayerScore, Result } from '../types/leaderboard'
import { archivePlayer, deletePlayer, fetchPlayers, renamePlayer, restorePlayer } from '../data/players'
import type { ToastApi } from './useToasts'

export interface PlayerDialog {
  kind: 'rename' | 'archive' | 'delete' | 'role'
  player: PlayerScore
}

interface Args {
  enabled: boolean // only admins load archived players
  players: PlayerScore[]
  setPlayers: Dispatch<SetStateAction<PlayerScore[]>>
  toast: Pick<ToastApi, 'push'>
  /** Re-sync the active leaderboard from the server after a change. */
  refresh: () => void
}

/**
 * Rename / archive / restore / delete with optimistic updates. Each action updates the lists
 * immediately, calls the data layer, and restores the previous lists if the server refuses.
 */
export function usePlayerAdmin({ enabled, players, setPlayers, toast, refresh }: Args) {
  const [archived, setArchived] = useState<PlayerScore[]>([])
  const [archivedLoading, setArchivedLoading] = useState(false)
  const [archivedError, setArchivedError] = useState<string | null>(null)
  const [showArchived, setShowArchived] = useState(false)
  const [pendingIds, setPendingIds] = useState<ReadonlySet<string>>(new Set())
  const [dialog, setDialog] = useState<PlayerDialog | null>(null)

  const loadArchived = useCallback(async () => {
    setArchivedLoading(true)
    setArchivedError(null)
    const res = await fetchPlayers({ includeArchived: true })
    if (res.ok) setArchived(res.data.filter((p) => p.archivedAt))
    else setArchivedError(res.error.message)
    setArchivedLoading(false)
  }, [])

  useEffect(() => {
    if (enabled) void loadArchived()
    else {
      setArchived([])
      setShowArchived(false)
    }
  }, [enabled, loadArchived])

  /** Runs `call` with `apply` shown immediately; undoes `apply` if the call fails. */
  const optimistic = async <T,>(id: string, apply: () => void, call: () => Promise<Result<T>>): Promise<Result<T>> => {
    const before = { players, archived }
    setPendingIds((s) => new Set(s).add(id))
    apply()
    const res = await call()
    if (!res.ok) {
      setPlayers(before.players)
      setArchived(before.archived)
    }
    setPendingIds((s) => {
      const next = new Set(s)
      next.delete(id)
      return next
    })
    return res
  }

  const finish = (res: Result<unknown>, success: string): boolean => {
    if (res.ok) {
      toast.push('success', success)
      refresh()
    } else {
      toast.push('error', res.error.message)
    }
    return res.ok
  }

  /** Returns the result so the rename form can show server errors inline instead of a toast. */
  const rename = async (player: PlayerScore, name: string): Promise<Result<PlayerScore>> => {
    const res = await optimistic(
      player.id,
      () => {
        setPlayers((list) => list.map((p) => (p.id === player.id ? { ...p, name } : p)))
        setArchived((list) => list.map((p) => (p.id === player.id ? { ...p, name } : p)))
      },
      () => renamePlayer(player.id, name)
    )
    if (res.ok) {
      toast.push('success', `Renamed to ${name}.`)
      refresh()
    }
    return res
  }

  const archive = async (player: PlayerScore): Promise<boolean> => {
    const res = await optimistic(
      player.id,
      () => {
        setPlayers((list) => list.filter((p) => p.id !== player.id))
        setArchived((list) => [{ ...player, archivedAt: new Date().toISOString() }, ...list])
      },
      () => archivePlayer(player.id)
    )
    return finish(res, `${player.name} archived.`)
  }

  const restore = async (player: PlayerScore): Promise<boolean> => {
    const res = await optimistic(
      player.id,
      () => {
        setArchived((list) => list.filter((p) => p.id !== player.id))
        setPlayers((list) => [...list, { ...player, archivedAt: null }])
      },
      () => restorePlayer(player.id)
    )
    return finish(res, `${player.name} restored.`)
  }

  const remove = async (player: PlayerScore): Promise<boolean> => {
    const res = await optimistic(
      player.id,
      () => {
        setPlayers((list) => list.filter((p) => p.id !== player.id))
        setArchived((list) => list.filter((p) => p.id !== player.id))
      },
      () => deletePlayer(player.id)
    )
    return finish(res, `${player.name} deleted.`)
  }

  return {
    archived,
    archivedLoading,
    archivedError,
    loadArchived,
    showArchived,
    toggleArchived: () => setShowArchived((v) => !v),
    pendingIds,
    dialog,
    openDialog: (kind: PlayerDialog['kind'], player: PlayerScore) => setDialog({ kind, player }),
    closeDialog: () => setDialog(null),
    rename,
    archive,
    restore,
    remove,
    activePlayers: players,
  }
}

export type PlayerAdmin = ReturnType<typeof usePlayerAdmin>
