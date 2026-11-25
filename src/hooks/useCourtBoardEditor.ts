import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { buildCourtOrder } from '@/lib/courtAssignment'
import { courtBoardApi, type BoardData, type CourtBoardApi } from '@/lib/courtBoard'
import { courtAssignmentsApi, type CourtAssignmentsApi, type CourtSettingsError } from '@/lib/courtSettings'
import { describeGenerated } from '@/utils/courtActivity'
import {
  applyEdit, boardIssues, buildBoardView, describeEdit, inverseEdit,
  type BoardEdit, type DropTarget, type PlayerRef, type Seat,
} from '@/utils/courtBoardModel'
import type { ToastApi } from './useToasts'
import { REALTIME_DEBOUNCE_MS } from './usePlayers'

interface Options {
  toast: ToastApi['push']
  api?: CourtBoardApi
  generate?: CourtAssignmentsApi['generate']
}

/**
 * The court assignment editor for one run. Every edit shows at once (optimistic) and is saved by
 * one RPC; saves go out one at a time, in the order they were made. A refresh (Realtime, focus)
 * that started before an edit finished is dropped, so it cannot undo the edit on screen. When
 * another admin edits, Realtime brings their change in; the database applies edits one at a
 * time, so the last write wins.
 */
export function useCourtBoardEditor(sessionDate: string, { toast, api = courtBoardApi, generate = courtAssignmentsApi.generate }: Options) {
  const [board, setBoard] = useState<BoardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<CourtSettingsError | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [pickerSeat, setPickerSeat] = useState<Seat | null>(null)
  const [publishing, setPublishing] = useState(false)
  const [regenerating, setRegenerating] = useState(false)

  const boardRef = useRef(board)
  boardRef.current = board
  const toastRef = useRef(toast)
  toastRef.current = toast
  const epoch = useRef(0)
  const pending = useRef(0)
  const queue = useRef<Promise<void>>(Promise.resolve())

  const refetch = useCallback(async (force = false) => {
    const startedIn = epoch.current
    const result = await api.load(sessionDate)
    setLoading(false)
    if (!force && (pending.current > 0 || startedIn !== epoch.current)) return
    if (result.ok) {
      setBoard(result.data)
      setError(null)
    } else {
      setError(result.error) // keep showing the last good board
    }
  }, [api, sessionDate])

  useEffect(() => {
    setLoading(true)
    setBoard(null)
    setSelectedId(null)
    void refetch(true)
  }, [refetch])

  // Realtime (one event per changed row: debounce a regeneration's burst), and coming back to the tab.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null
    const soon = () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => void refetch(), REALTIME_DEBOUNCE_MS)
    }
    const onVisible = () => document.visibilityState === 'visible' && soon()
    const unsubscribe = api.subscribe(sessionDate, soon)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      if (timer) clearTimeout(timer)
      unsubscribe()
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [api, sessionDate, refetch])

  const courtOrder = useMemo(() => (board ? buildCourtOrder(board.top, board.bottom) : []), [board?.top, board?.bottom])
  const view = useMemo(() => buildBoardView(board?.entries ?? [], courtOrder), [board?.entries, courtOrder])
  const issues = useMemo(() => boardIssues(board?.entries ?? [], view), [board?.entries, view])

  // A selected player someone else just took off the board is no longer selectable.
  useEffect(() => {
    if (selectedId && !board?.entries.some((e) => e.id === selectedId)) setSelectedId(null)
  }, [board, selectedId])

  /** Runs `save` after every earlier save, with refreshes held off until it is done. */
  const enqueue = useCallback((save: () => Promise<boolean>) => {
    pending.current += 1
    epoch.current += 1
    const run = queue.current.then(async () => {
      const saved = await save().catch(() => false)
      pending.current -= 1
      epoch.current += 1
      if (!saved) await refetch(true) // show what the server holds
      else if (pending.current === 0) await refetch()
    })
    queue.current = run
    return run
  }, [refetch])

  const edit = useCallback((change: BoardEdit, isUndo = false) => {
    const before = boardRef.current
    if (!before) return
    const entries = applyEdit(before.entries, change)
    if (entries === before.entries) return // nothing to do here (or a seat that is already taken)
    setBoard({ ...before, entries, manuallyEdited: true })
    const message = describeEdit(before.entries, change, buildCourtOrder(before.top, before.bottom))
    const undo = isUndo ? null : inverseEdit(before.entries, change)
    void enqueue(async () => {
      const result = await api.edit(sessionDate, change)
      if (!result.ok) {
        toastRef.current('error', result.error.message)
        return false
      }
      if (isUndo) toastRef.current('success', 'Undone.')
      else toastRef.current('success', message, undo ? { action: { label: 'Undo', onClick: () => edit(undo, true) }, durationMs: 8000 } : {})
      return true
    })
  }, [api, sessionDate, enqueue])

  const find = (id: string | null) => (id ? boardRef.current?.entries.find((e) => e.id === id) : undefined)

  /** Tap: select; tap the selected one again: deselect; tap another: swap (or reselect, if both sit out). */
  const tapPlayer = (id: string) => {
    const picked = find(selectedId)
    const target = find(id)
    if (!picked || !target) return setSelectedId(id)
    if (picked.id === id) return setSelectedId(null)
    if (!picked.seat && !target.seat) return setSelectedId(id)
    setSelectedId(null)
    edit({ kind: 'swap', a: picked.id, b: id })
  }

  /** An empty seat: move the selected player there, or (nobody selected) choose who fills it. */
  const tapSeat = (seat: Seat) => {
    const picked = find(selectedId)
    setSelectedId(null)
    if (picked) edit({ kind: 'move', player: picked, to: seat })
    else setPickerSeat(seat)
  }

  const removeSelected = () => {
    const picked = find(selectedId)
    setSelectedId(null)
    if (picked?.seat) edit({ kind: 'move', player: picked, to: null })
  }

  /** Off the board entirely (not even sitting out): for a player who is no longer coming. */
  const takeOffSelected = () => {
    const picked = find(selectedId)
    setSelectedId(null)
    if (picked) edit({ kind: 'drop', playerId: picked.id })
  }

  const fillSeat = (player: PlayerRef) => {
    const seat = pickerSeat
    setPickerSeat(null)
    if (seat) edit({ kind: 'move', player, to: seat })
  }

  const drop = (draggedId: string, target: DropTarget) => {
    const dragged = find(draggedId)
    setSelectedId(null)
    if (!dragged) return
    if (target.kind === 'player') {
      const other = find(target.id)
      if (other && other.id !== dragged.id && (dragged.seat || other.seat)) edit({ kind: 'swap', a: dragged.id, b: other.id })
    } else {
      edit({ kind: 'move', player: dragged, to: target.kind === 'seat' ? target.seat : null })
    }
  }

  const setPublished = (publish: boolean) => {
    const before = boardRef.current
    if (!before) return Promise.resolve()
    if (publish && issues.duplicates.length > 0) {
      toastRef.current('error', 'A player is on the board twice. Fix that before publishing.')
      return Promise.resolve()
    }
    setBoard({ ...before, state: publish ? 'published' : 'draft' })
    setPublishing(true)
    return enqueue(async () => {
      const result = await api.setPublished(sessionDate, publish)
      setPublishing(false)
      if (!result.ok) {
        toastRef.current('error', result.error.message)
        return false
      }
      toastRef.current('success', publish ? 'Published: players can see the courts now.' : 'Unpublished: only admins can see the board.')
      return true
    })
  }

  const regenerate = () => {
    setSelectedId(null)
    setRegenerating(true)
    // Hand edits are only replaced with force; the confirm dialog already warned about them.
    return enqueue(async () => {
      const result = await generate(sessionDate, !!boardRef.current?.manuallyEdited)
      setRegenerating(false)
      toastRef.current(result.ok ? 'success' : 'error', result.ok ? describeGenerated(result.data) : result.error.message)
      return false // reload either way: the whole board changed
    })
  }

  return {
    board, loading, error, view, courtOrder, issues,
    selectedId, pickerSeat, publishing, regenerating,
    refetch, tapPlayer, tapSeat, removeSelected, takeOffSelected, fillSeat, drop, setPublished, regenerate,
    closePicker: () => setPickerSeat(null),
    clearSelection: () => setSelectedId(null),
  }
}

export type CourtBoardEditor = ReturnType<typeof useCourtBoardEditor>
