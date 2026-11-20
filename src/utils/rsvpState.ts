import type { RsvpIdentity, RsvpRosterEntry, RsvpServerState, RsvpStatus, MyRsvp } from '../types/rsvp'

// Pure helpers for optimistic updates. They mirror what the server will do (positions are
// derived from order, cancelling shifts everyone behind), so the screen does not jump when
// the real answer arrives.

export const normalizeName = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase()

interface Who {
  playerId: string | null
  name: string
  isGuest: boolean
}

/** True when a row is the person the identity describes. */
export function matchesIdentity(row: Who, identity: RsvpIdentity): boolean {
  return identity.kind === 'player'
    ? row.playerId === identity.playerId
    : row.isGuest && normalizeName(row.name) === normalizeName(identity.name)
}

export function sameIdentity(a: RsvpIdentity | null, b: RsvpIdentity | null): boolean {
  if (!a || !b) return a === b
  if (a.kind === 'player') return b.kind === 'player' && a.playerId === b.playerId
  return b.kind === 'guest' && normalizeName(a.name) === normalizeName(b.name)
}

/**
 * A device remembers the guest name it RSVP'd as. If an admin renamed that guest, the name no
 * longer matches any of this device's rows and the old name would create a duplicate. When the
 * device holds exactly one guest row and the remembered name matches none of them, returns the
 * identity to adopt (that row's current name); otherwise null.
 */
export function reconcileGuestIdentity(remembered: RsvpIdentity | null, mine: MyRsvp[]): RsvpIdentity | null {
  if (remembered?.kind !== 'guest') return null
  const guests = mine.filter((r) => r.isGuest)
  if (guests.length !== 1 || guests.some((g) => normalizeName(g.name) === normalizeName(remembered.name))) return null
  return { kind: 'guest', name: guests[0].name }
}

/** Confirmed vs waitlisted, for a number of people who are in. */
export function splitCounts(total: number, capacity: number): { inCount: number; waitlistCount: number } {
  return { inCount: Math.min(total, capacity), waitlistCount: Math.max(total - capacity, 0) }
}

const whoFor = (identity: RsvpIdentity): Who =>
  identity.kind === 'player'
    ? { playerId: identity.playerId, name: identity.name, isGuest: false }
    : { playerId: null, name: identity.name.trim().replace(/\s+/g, ' '), isGuest: true } // as the server stores it

/** The server state as it will look once this change lands. */
export function applyOptimistic(state: RsvpServerState, status: RsvpStatus, identity: RsvpIdentity): RsvpServerState {
  const total = state.inCount + state.waitlistCount
  const mine = state.myRsvps.find((r) => matchesIdentity(r, identity))
  if (!mine && status === 'out') return state // cancelling something never RSVP'd is a no-op on the server

  const wasIn = mine?.status === 'in'
  const nextTotal = status === 'in' ? (wasIn ? total : total + 1) : wasIn ? total - 1 : total
  const position = status === 'in' ? (wasIn ? (mine?.position ?? total) : total + 1) : null // joining or rejoining goes to the back
  const entry: MyRsvp = { rsvpId: mine?.rsvpId ?? 'pending', ...whoFor(identity), name: mine?.name ?? whoFor(identity).name, status, position }
  const myRsvps = mine ? state.myRsvps.map((r) => (r === mine ? entry : r)) : [...state.myRsvps, entry]
  return { ...state, ...splitCounts(nextTotal, state.capacity), myRsvps, myStatus: status, myPosition: position }
}

const sortRoster = (list: RsvpRosterEntry[]) =>
  [...list].sort((a, b) => {
    if (a.status !== b.status) return a.status === 'in' ? -1 : 1
    return (a.position ?? Infinity) - (b.position ?? Infinity)
  })

/**
 * An admin adding or removing someone else. Only the head counts change: the admin's own
 * myRsvps / myStatus describe their own player and are left alone. Whether the change is a
 * no-op is read from the roster, as the server decides it from the row.
 */
export function applyAdminOptimistic(
  state: RsvpServerState,
  status: RsvpStatus,
  roster: RsvpRosterEntry[],
  playerId: string,
): RsvpServerState {
  const wasIn = roster.some((e) => e.playerId === playerId && e.status === 'in')
  if (wasIn === (status === 'in')) return state
  const total = state.inCount + state.waitlistCount + (status === 'in' ? 1 : -1)
  return { ...state, ...splitCounts(total, state.capacity) }
}

/** Counts after an admin adds a guest. A guest who is already in changes nothing. */
export function applyAdminAddGuest(state: RsvpServerState, roster: RsvpRosterEntry[], name: string): RsvpServerState {
  const id: RsvpIdentity = { kind: 'guest', name }
  if (roster.some((e) => e.status === 'in' && matchesIdentity(e, id))) return state
  return { ...state, ...splitCounts(state.inCount + state.waitlistCount + 1, state.capacity) }
}

/** Counts after an admin deletes a guest. A guest who was already out changes nothing. */
export function applyAdminRemoveGuest(state: RsvpServerState, roster: RsvpRosterEntry[], rsvpId: string): RsvpServerState {
  if (!roster.some((e) => e.rsvpId === rsvpId && e.isGuest && e.status === 'in')) return state
  return { ...state, ...splitCounts(state.inCount + state.waitlistCount - 1, state.capacity) }
}

/** The roster once that guest is gone: the row disappears and everyone behind moves up one place. */
export function applyAdminRemoveGuestRoster(roster: RsvpRosterEntry[], rsvpId: string): RsvpRosterEntry[] {
  const gone = roster.find((e) => e.rsvpId === rsvpId && e.isGuest)
  if (!gone) return roster
  const old = gone.status === 'in' ? (gone.position ?? Infinity) : Infinity
  return roster
    .filter((e) => e !== gone)
    .map((e) => (e.status === 'in' && e.position !== null && e.position > old ? { ...e, position: e.position - 1 } : e))
}

/** The roster once a guest is renamed. Only the name changes: position, status and counts stay. */
export function applyAdminRenameGuestRoster(roster: RsvpRosterEntry[], rsvpId: string, name: string): RsvpRosterEntry[] {
  return roster.map((e) => (e.rsvpId === rsvpId && e.isGuest ? { ...e, name } : e))
}

/** The roster once an admin's add or remove of a roster player lands. `name` is shown for a new row. */
export function applyAdminOptimisticRoster(
  roster: RsvpRosterEntry[],
  status: RsvpStatus,
  playerId: string,
  name: string,
): RsvpRosterEntry[] {
  return applyOptimisticRoster(roster, status, { kind: 'player', playerId, name })
}

/** The roster list as it will look once this change lands. */
export function applyOptimisticRoster(
  roster: RsvpRosterEntry[],
  status: RsvpStatus,
  identity: RsvpIdentity,
): RsvpRosterEntry[] {
  const mine = roster.find((e) => matchesIdentity(e, identity))
  if (status === 'in') {
    if (mine?.status === 'in') return roster
    const inCount = roster.filter((e) => e.status === 'in').length
    const who = whoFor(identity)
    const entry: RsvpRosterEntry = mine
      ? { ...mine, status: 'in', position: inCount + 1 }
      : { rsvpId: 'pending', name: who.name, avatarUrl: null, playerId: who.playerId, isGuest: who.isGuest, status: 'in', position: inCount + 1 }
    return sortRoster(mine ? roster.map((e) => (e === mine ? entry : e)) : [...roster, entry])
  }
  if (!mine || mine.status === 'out') return roster
  const old = mine.position ?? Infinity
  return sortRoster(
    roster.map((e) => {
      if (e === mine) return { ...e, status: 'out' as const, position: null }
      return e.status === 'in' && e.position !== null && e.position > old ? { ...e, position: e.position - 1 } : e
    }),
  )
}
