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

/** Put `item` back at `index` (or drop the id if it wasn't in the list), leaving every other entry as it is now. */
function putBack(list: PlayerScore[], id: string, item: PlayerScore | undefined, index: number): PlayerScore[] {
  const rest = list.filter((p) => p.id !== id)
  if (!item) return rest
  const at = Math.min(index, rest.length)
  return [...rest.slice(0, at), item, ...rest.slice(at)]
}

/**
 * Rename / archive / restore / delete with optimistic updates. Each action updates the lists
 * immediately, calls the data layer, and if the server refuses, puts back only that player as
 * it was. Other actions that finished meanwhile, and refreshes, are kept.
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
    const activeIndex = players.findIndex((p) => p.id === id)
    const archivedIndex = archived.findIndex((p) => p.id === id)
    const wasActive = players[activeIndex]
    const wasArchived = archived[archivedIndex]
    setPendingIds((s) => new Set(s).add(id))
    apply()
    const res = await call()
    if (!res.ok) {
      setPlayers((list) => putBack(list, id, wasActive, activeIndex))
      setArchived((list) => putBack(list, id, wasArchived, archivedIndex))
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
