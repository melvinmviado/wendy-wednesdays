import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { EventSettings } from '../lib/eventSettings'
import { rsvpApi } from '../data/rsvpApi'
import { getDeviceToken, loadIdentity, saveIdentity } from '../data/rsvpDevice'
import {
  RsvpError,
  type RsvpApi,
  type RsvpIdentity,
  type RsvpResult,
  type RsvpStatus,
  type SetRsvpResult,
} from '../types/rsvp'
import { toRsvpError } from '../utils/rsvpErrors'
import { getPhase, getWaitlistPosition, type RsvpPhase } from '../utils/rsvpSchedule'
import { applyOptimistic, applyOptimisticRoster, reconcileGuestIdentity, sameIdentity } from '../utils/rsvpState'
import { useRsvpAdmin } from './useRsvpAdmin'
import { useRsvpSync } from './useRsvpSync'

interface UseRsvpOptions {
  /** The signed-in user's claimed player. When set they can only RSVP as this player. */
  claimedPlayer?: { id: string; name: string } | null
  api?: RsvpApi
  pollMs?: number
  /** From useIsAdmin(). Only enables the admin actions; the database enforces the role. */
  isAdmin?: boolean
  /** From useEventSettings(). Null (no row) keeps the built-in Wednesday schedule. */
  settings?: EventSettings | null
}

/**
 * Weekly RSVP: server state, a server-corrected clock, the phase, and the three actions.
 * Actions apply the result on screen at once and roll back if the server refuses. They never
 * throw: they resolve to { ok, data | error } with a typed RsvpError.
 */
export function useRsvp({ claimedPlayer = null, api = rsvpApi, pollMs, isAdmin = false, settings = null }: UseRsvpOptions = {}) {
  const token = useMemo(getDeviceToken, [])
  const sync = useRsvpSync(api, token, pollMs, settings)
  const { server, roster, now, stale, beginChange, isChanging, refresh, setServer, setRoster, serverRef, rosterRef } = sync
  const admin = useRsvpAdmin({ api, sync, isAdmin })
  const [remembered, setRemembered] = useState<RsvpIdentity | null>(loadIdentity)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<RsvpError | null>(null)

  const claimed = useMemo<RsvpIdentity | null>(
    () => (claimedPlayer ? { kind: 'player', playerId: claimedPlayer.id, name: claimedPlayer.name } : null),
    [claimedPlayer],
  )
  const identity = claimed ?? remembered

  // An admin may have renamed this device's guest: follow the row's current name, never the old one.
  const myRsvps = server?.myRsvps
  useEffect(() => {
    if (!myRsvps) return
    const next = reconcileGuestIdentity(remembered, myRsvps)
    if (!next) return
    saveIdentity(next)
    setRemembered(next)
  }, [myRsvps, remembered])

  // null until the first read lands, and while a stale (last week's) read is being replaced
  const phase: RsvpPhase | null = useMemo(
    () => (server && !stale ? getPhase({ now, counts: { in: server.inCount }, capacity: server.capacity, settings }) : null),
    [server, stale, now, settings],
  )

  const forgetIdentity = useCallback(() => {
    saveIdentity(null)
    setRemembered(null)
  }, [])

  /** Why a change cannot start right now, if it cannot. Checked before anything moves on screen. */
  const blocker = useCallback(
    (who: RsvpIdentity | null): RsvpError | null => {
      if (!who) return new RsvpError('NO_IDENTITY')
      if (isChanging()) return new RsvpError('BUSY')
      if (phase === 'upcoming') return new RsvpError('NOT_OPEN_YET')
      if (phase === 'locked' || phase === 'live') return new RsvpError('CUTOFF_PASSED')
      return null
    },
    [phase, isChanging],
  )

  const change = useCallback(
    async (status: RsvpStatus, target?: RsvpIdentity): Promise<RsvpResult<SetRsvpResult>> => {
      const fail = (error: RsvpError): RsvpResult<SetRsvpResult> => {
        setActionError(error)
        return { ok: false, error }
      }
      const who = claimed ?? target ?? remembered
      const blocked = blocker(who)
      if (blocked || !who) return fail(blocked ?? new RsvpError('NO_IDENTITY'))

      const before = { server: serverRef.current, roster: rosterRef.current }
      const end = beginChange()
      setBusy(true)
      setActionError(null)
      if (before.server) {
        setServer(applyOptimistic(before.server, status, who))
        setRoster(applyOptimisticRoster(before.roster, status, who))
      }
      try {
        const data = await api.setRsvp({ identity: who, status, token })
        if (!claimed) {
          saveIdentity(who)
          setRemembered(who)
        }
        end()
        setBusy(false)
        await refresh(true) // swap the guess for the real positions
        return { ok: true, data }
      } catch (e) {
        const error = toRsvpError(e)
        end()
        setBusy(false)
        setServer(before.server) // roll back
        setRoster(before.roster)
        if ((error.code === 'TOKEN_MISMATCH' || error.code === 'NAME_CLAIMED') && sameIdentity(remembered, who)) {
          forgetIdentity() // that name is not ours to change from here
        }
        if (error.code === 'CUTOFF_PASSED') void refresh(true) // our clock or phase was behind the server's
        return fail(error)
      }
    },
    [api, token, claimed, remembered, blocker, beginChange, refresh, forgetIdentity, setServer, setRoster, serverRef, rosterRef],
  )

  // A cancel waiting out its undo window. The screen already shows it; the server hears nothing
  // until the window closes, so undoing keeps your place in line (rejoining would not).
  const waiting = useRef<{ commit: () => Promise<void> } | null>(null)

  /**
   * Cancels on screen now and tells the server after `delayMs`. Returns `undo`, which puts
   * everything back if called first. `onSettled` reports the server's answer (a failure rolls back).
   */
  const cancelWithUndo = useCallback(
    (opts: { delayMs?: number; onSettled?: (r: RsvpResult<SetRsvpResult>) => void } = {}): RsvpResult<{ undo: () => boolean }> => {
      const who = claimed ?? remembered
      const blocked = blocker(who)
      if (blocked || !who) {
        const error = blocked ?? new RsvpError('NO_IDENTITY')
        setActionError(error)
        return { ok: false, error }
      }
      const before = { server: serverRef.current, roster: rosterRef.current }
      const end = beginChange()
      if (before.server) {
        setServer(applyOptimistic(before.server, 'out', who))
        setRoster(applyOptimisticRoster(before.roster, 'out', who))
      }
      const restore = () => {
        if (before.server) setServer(before.server)
        setRoster(before.roster)
      }
      let settled = false
      const commit = async () => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        waiting.current = null
        try {
          const data = await api.setRsvp({ identity: who, status: 'out', token })
          end()
          await refresh(true)
          opts.onSettled?.({ ok: true, data })
        } catch (e) {
          end()
          restore()
          const error = toRsvpError(e)
          setActionError(error)
          opts.onSettled?.({ ok: false, error })
        }
      }
      const timer = setTimeout(() => void commit(), opts.delayMs ?? 5000)
      waiting.current = { commit }
      const undo = () => {
        if (settled) return false
        settled = true
        clearTimeout(timer)
        waiting.current = null
        end()
        restore()
        void refresh()
        return true
      }
      return { ok: true, data: { undo } }
    },
    [api, token, claimed, remembered, blocker, beginChange, refresh, setServer, setRoster, serverRef, rosterRef],
  )

  // Leaving the page inside the window: send the cancel now rather than lose it.
  useEffect(() => {
    const flush = () => {
      if (document.visibilityState === 'hidden') void waiting.current?.commit()
    }
    document.addEventListener('visibilitychange', flush)
    window.addEventListener('pagehide', flush)
    return () => {
      document.removeEventListener('visibilitychange', flush)
      window.removeEventListener('pagehide', flush)
    }
  }, [])

  const setIn = useCallback((target?: RsvpIdentity) => change('in', target), [change])
  const cancel = useCallback(() => change('out'), [change])
  /** Same call as setIn: the queue is derived, so being past capacity IS being on the waitlist. */
  const joinWaitlist = setIn

  const clearActionError = useCallback(() => setActionError(null), [])
  const myStatus = server?.myStatus ?? null
  const myPosition = server?.myPosition ?? null

  return {
    loading: sync.loading,
    error: sync.error,
    unavailable: sync.unavailable,
    busy,
    actionError,
    clearActionError,
    phase,
    now,
    sessionDate: server?.sessionDate ?? null,
    capacity: server?.capacity ?? null,
    cutoffAt: server?.cutoffAt ?? null,
    liveStart: server?.liveStart ?? null,
    liveEnd: server?.liveEnd ?? null,
    inCount: server?.inCount ?? 0,
    waitlistCount: server?.waitlistCount ?? 0,
    myStatus,
    myPosition,
    myWaitlistPosition: server && myStatus === 'in' && myPosition ? getWaitlistPosition(myPosition, server.capacity) : null,
    roster,
    identity,
    forgetIdentity,
    setIn,
    cancel,
    cancelWithUndo,
    joinWaitlist,
    refresh: sync.refresh,
    ...admin,
  }
}
