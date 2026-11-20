import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { RsvpApi, RsvpError, RsvpRosterEntry, RsvpServerState } from '../types/rsvp'
import { toRsvpError } from '../utils/rsvpErrors'
import type { EventSettings } from '../lib/eventSettings'
import { getSessionDate } from '../utils/rsvpSchedule'

export const RSVP_POLL_MS = 30_000

/**
 * Keeps server state and the roster fresh, and a clock corrected to the server's.
 *
 * Refreshes every 30s while the tab is visible and whenever it becomes visible again. This
 * polls rather than using Realtime: the rsvps table is sealed (no SELECT for anon, because it
 * holds device tokens), so postgres_changes cannot reach the browser. The same tick moves the
 * clock, which is what flips the phase at 6:00, 8:00 and 10:00 PM without a reload.
 */
export function useRsvpSync(api: RsvpApi, token: string,
  pollMs: number = RSVP_POLL_MS,
  settings: EventSettings | null = null,
) {
  const [server, setServer] = useState<RsvpServerState | null>(null)
  const [roster, setRoster] = useState<RsvpRosterEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<RsvpError | null>(null)
  const [offset, setOffset] = useState(0) // server clock minus this device's clock, in ms
  const [tick, setTick] = useState(() => Date.now())

  // Held in a ref so a caller passing a new api object each render cannot restart the polling.
  const apiRef = useRef(api)
  apiRef.current = api

  const serverRef = useRef(server)
  const rosterRef = useRef(roster)
  serverRef.current = server
  rosterRef.current = roster
  // A read that began before a change finished could land after it and undo it on screen.
  // Any change bumps the epoch; a read from an older epoch (or during a change) is dropped.
  const epoch = useRef(0)
  const pending = useRef(0)

  const refresh = useCallback(
    async (force = false) => {
      const startedIn = epoch.current
      const t0 = Date.now()
      try {
        const [state, list] = await Promise.all([apiRef.current.getState(token), apiRef.current.getRoster()])
        const t1 = Date.now()
        if (!force && (pending.current > 0 || startedIn !== epoch.current)) return
        setOffset(state.serverNow.getTime() - (t0 + t1) / 2) // assume the reply took equal time each way
        setTick(t1)
        setServer(state)
        setRoster(list)
        setError(null)
      } catch (e) {
        setError(toRsvpError(e)) // keep showing the last good data
      } finally {
        setLoading(false)
      }
    },
    [token],
  )

  /** Call before an optimistic change. The returned function ends it. */
  const beginChange = useCallback(() => {
    pending.current += 1
    epoch.current += 1
    return () => {
      pending.current -= 1
      epoch.current += 1
    }
  }, [])
  const isChanging = useCallback(() => pending.current > 0, [])

  const unavailable = error?.code === 'UNAVAILABLE'

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    if (unavailable) return
    const step = () => {
      setTick(Date.now())
      if (document.visibilityState === 'visible') void refresh()
    }
    const id = setInterval(step, pollMs)
    const onVisible = () => {
      if (document.visibilityState === 'visible') step()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [refresh, pollMs, unavailable])

  const now = useMemo(() => new Date(tick + offset), [tick, offset])
  // Past 10 PM the session rolls over: what we hold is last week's until the next read lands.
  const stale = server !== null && getSessionDate(now, settings) !== server.sessionDate
  useEffect(() => {
    if (stale) void refresh()
  }, [stale, refresh])

  return {
    server, roster, setServer, setRoster, serverRef, rosterRef,
    loading, error, unavailable, now, stale, refresh, beginChange, isChanging,
  }
}
