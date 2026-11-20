import { useCallback, useState } from 'react'
import {
  ADMIN_ONLY_MESSAGE,
  RsvpError,
  type AdminGuestRemoveResult,
  type AdminGuestTarget,
  type RsvpApi,
  type RsvpResult,
  type RsvpRosterEntry,
  type RsvpServerState,
} from '../types/rsvp'
import { toRsvpError } from '../utils/rsvpErrors'
import { applyAdminAddGuest, applyAdminOptimistic, applyAdminOptimisticRoster, applyOptimisticRoster, applyAdminRemoveGuest, applyAdminRemoveGuestRoster } from '../utils/rsvpState'
import type { useRsvpSync } from './useRsvpSync'

type Sync = ReturnType<typeof useRsvpSync>

interface Args {
  api: RsvpApi
  sync: Sync
  /**
   * A UI hint from useIsAdmin(), used only to fail fast with a friendly error. The database
   * is what enforces it: admin_add_rsvp / admin_remove_rsvp raise 42501 for anyone else.
   */
  isAdmin: boolean
}

interface Target {
  id: string
  name: string
}

/**
 * Admin add / remove for any roster player on the run the admin is looking at.
 *
 * The run is always sent explicitly (the session date of the list on screen), never left for
 * the server to work out as "the next one". If the week rolls over while the page is open, a
 * tap on the old list therefore either lands on that old run (still open until the next day) or
 * is refused (BAD_REQUEST), and never silently edits the new run. A refusal re-reads the list.
 *
 * Admin Same shape as useRsvp's actions:
 * the screen updates at once, a failure rolls it back, and nothing throws. Both calls are
 * idempotent on the server, so a double-tap is harmless (and BUSY blocks it here anyway).
 */
export function useRsvpAdmin({ api, sync, isAdmin }: Args) {
  const { beginChange, isChanging, refresh, setServer, setRoster, serverRef, rosterRef } = sync
  const [adminBusy, setAdminBusy] = useState(false)
  const [adminError, setAdminError] = useState<RsvpError | null>(null)

  const run = useCallback(
    async <T>(
      optimistic: (server: RsvpServerState, roster: RsvpRosterEntry[]) => { server: RsvpServerState; roster: RsvpRosterEntry[] },
      call: (sessionDate: string) => Promise<T>,
    ): Promise<RsvpResult<T>> => {
      const fail = (error: RsvpError): RsvpResult<T> => {
        setAdminError(error)
        return { ok: false, error }
      }
      if (!isAdmin) return fail(new RsvpError('FORBIDDEN', { message: ADMIN_ONLY_MESSAGE }))
      if (isChanging()) return fail(new RsvpError('BUSY'))
      const sessionDate = serverRef.current?.sessionDate
      if (!sessionDate) return fail(new RsvpError('BAD_REQUEST')) // the list has not loaded: nothing to act on

      const before = { server: serverRef.current, roster: rosterRef.current }
      const end = beginChange()
      setAdminBusy(true)
      setAdminError(null)
      if (before.server) {
        const next = optimistic(before.server, before.roster)
        setServer(next.server)
        setRoster(next.roster)
      }
      try {
        const data = await call(sessionDate)
        end()
        setAdminBusy(false)
        await refresh(true) // swap the guess for the real positions
        return { ok: true, data }
      } catch (e) {
        end()
        setAdminBusy(false)
        setServer(before.server) // roll back
        setRoster(before.roster)
        const error = toRsvpError(e)
        if (error.code === 'BAD_REQUEST') void refresh(true) // the run we were showing is no longer open
        return fail(error)
      }
    },
    [isAdmin, isChanging, beginChange, refresh, setServer, setRoster, serverRef, rosterRef],
  )

  /** Puts a player on the displayed run's list (the waitlist if it is full). */
  const adminAddRsvp = useCallback(
    (player: Target) =>
      run(
        (server, roster) => ({ server: applyAdminOptimistic(server, 'in', roster, player.id), roster: applyAdminOptimisticRoster(roster, 'in', player.id, player.name) }),
        (sessionDate) => api.adminAddRsvp({ playerId: player.id, sessionDate }),
      ),
    [api, run],
  )

  /** Takes a player off the displayed run's list; everyone behind moves up. */
  const adminRemoveRsvp = useCallback(
    (player: Target) =>
      run(
        (server, roster) => ({ server: applyAdminOptimistic(server, 'out', roster, player.id), roster: applyAdminOptimisticRoster(roster, 'out', player.id, player.name) }),
        (sessionDate) => api.adminRemoveRsvp({ playerId: player.id, sessionDate }),
      ),
    [api, run],
  )

  /** Puts a named guest on the displayed run's list (the waitlist if it is full). */
  const adminAddGuest = useCallback(
    (name: string) =>
      run(
        (server, roster) => ({ server: applyAdminAddGuest(server, roster, name), roster: applyOptimisticRoster(roster, 'in', { kind: 'guest', name }) }),
        (sessionDate) => api.adminAddGuest({ name, sessionDate }),
      ),
    [api, run],
  )

  /** Deletes a guest by RSVP id (never by name); everyone behind moves up. Idempotent on the server. */
  const adminRemoveGuest = useCallback(
    (guest: AdminGuestTarget): Promise<RsvpResult<AdminGuestRemoveResult>> =>
      run(
        (server, roster) => ({ server: applyAdminRemoveGuest(server, roster, guest.id), roster: applyAdminRemoveGuestRoster(roster, guest.id) }),
        () => api.adminRemoveGuest(guest.id),
      ),
    [api, run],
  )

  const clearAdminError = useCallback(() => setAdminError(null), [])

  return { adminAddRsvp, adminRemoveRsvp, adminAddGuest, adminRemoveGuest, adminBusy, adminError, clearAdminError }
}
