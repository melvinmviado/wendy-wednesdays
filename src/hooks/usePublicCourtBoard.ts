import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import { isBoardPublished, publicBoardApi, type PublicBoard, type PublicBoardApi } from '@/lib/publicCourtBoard'
import type { CourtSettingsError } from '@/lib/courtSettings'
import { REALTIME_DEBOUNCE_MS } from './usePlayers'

/** Realtime cannot tell a signed-out visitor that a board was unpublished: this catches it. */
export const PUBLIC_POLL_MS = 60_000

/**
 * The published board for a run, kept live: Realtime for changes, a poll every minute while the
 * tab is visible (and on coming back to it) for unpublishing. `updatedAt` is when the page last
 * confirmed it shows what the server holds.
 */
export function usePublicCourtBoard(sessionDate: string, api: PublicBoardApi = publicBoardApi) {
  const [board, setBoard] = useState<PublicBoard | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<CourtSettingsError | null>(null)
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null)
  const [live, setLive] = useState(false)
  const seq = useRef(0)

  const refetch = useCallback(async () => {
    const mine = ++seq.current
    const result = await api.load(sessionDate)
    if (mine !== seq.current) return // a newer read is on its way
    if (result.ok) {
      setBoard(result.data)
      setError(null)
      setUpdatedAt(new Date())
    } else {
      setError(result.error) // keep showing the last good board
    }
    setLoading(false)
  }, [api, sessionDate])

  useEffect(() => {
    void refetch()
    let timer: ReturnType<typeof setTimeout> | null = null
    const soon = () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => void refetch(), REALTIME_DEBOUNCE_MS)
    }
    const visible = () => document.visibilityState === 'visible'
    const onVisible = () => visible() && soon()
    const poll = setInterval(() => visible() && void refetch(), PUBLIC_POLL_MS)
    const unsubscribe = api.subscribe(sessionDate, soon, setLive)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      if (timer) clearTimeout(timer)
      clearInterval(poll)
      unsubscribe()
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [api, sessionDate, refetch])

  return { board, loading, error, updatedAt, live, refetch }
}

/** Whether `sessionDate`'s board is published, rechecked every minute: for links to the board. */
export function useCourtsPublished(sessionDate: string | null, check: (d: string) => Promise<boolean> = isBoardPublished): boolean {
  const [published, setPublished] = useState(false)
  useEffect(() => {
    setPublished(false)
    if (!sessionDate) return
    let live = true
    const run = () => void check(sessionDate).then((p) => live && setPublished(p))
    run()
    const id = setInterval(() => document.visibilityState === 'visible' && run(), PUBLIC_POLL_MS)
    return () => {
      live = false
      clearInterval(id)
    }
  }, [sessionDate, check])
  return published
}

const PAUSE_MS = 4000

/**
 * TV mode: when the content is taller than the screen, scroll it slowly to the bottom, pause,
 * jump back to the top, pause, and again. With reduced motion, turn a page at a time instead.
 */
export function useAutoScroll(ref: RefObject<HTMLElement | null>, enabled = true) {
  useEffect(() => {
    const el = ref.current
    if (!enabled || !el) return
    const reduce = !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    let pauseUntil = Date.now() + PAUSE_MS
    let atEnd = false
    const id = setInterval(() => {
      if (el.scrollHeight <= el.clientHeight + 1 || Date.now() < pauseUntil) return
      if (atEnd) {
        el.scrollTop = 0
        atEnd = false
        pauseUntil = Date.now() + PAUSE_MS
        return
      }
      el.scrollTop += reduce ? Math.floor(el.clientHeight * 0.9) : 1
      if (reduce) pauseUntil = Date.now() + PAUSE_MS
      if (el.scrollTop + el.clientHeight >= el.scrollHeight - 1) {
        atEnd = true
        pauseUntil = Date.now() + PAUSE_MS
      }
    }, reduce ? 500 : 40)
    return () => clearInterval(id)
  }, [ref, enabled])
}
