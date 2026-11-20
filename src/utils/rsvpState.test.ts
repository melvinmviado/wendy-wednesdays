import { describe, expect, it } from 'vitest'
import type { MyRsvp, RsvpIdentity, RsvpRosterEntry, RsvpServerState } from '../types/rsvp'
import { applyOptimistic, applyOptimisticRoster, matchesIdentity, reconcileGuestIdentity, sameIdentity, splitCounts } from './rsvpState'

const state = (over: Partial<RsvpServerState> = {}): RsvpServerState => ({
  sessionDate: '2026-11-25', capacity: 4, cutoffAt: new Date(0), liveStart: new Date(0), liveEnd: new Date(0), serverNow: new Date(0),
  inCount: 3, waitlistCount: 0, myStatus: null, myPosition: null, myRsvps: [], ...over,
})
const ann: RsvpIdentity = { kind: 'player', playerId: 'a', name: 'Ann' }
const gus: RsvpIdentity = { kind: 'guest', name: '  Gus   Guest ' }

const entry = (name: string, status: 'in' | 'out', position: number | null): RsvpRosterEntry =>
  ({ rsvpId: name, name, avatarUrl: null, playerId: name.toLowerCase(), isGuest: false, status, position })

describe('splitCounts', () => {
  it('caps confirmed at capacity', () => {
    expect(splitCounts(3, 4)).toEqual({ inCount: 3, waitlistCount: 0 })
    expect(splitCounts(4, 4)).toEqual({ inCount: 4, waitlistCount: 0 })
    expect(splitCounts(6, 4)).toEqual({ inCount: 4, waitlistCount: 2 })
  })
})

describe('identity matching', () => {
  it('matches players by id and guests by normalised name', () => {
    expect(matchesIdentity({ playerId: 'a', name: 'x', isGuest: false }, ann)).toBe(true)
    expect(matchesIdentity({ playerId: null, name: 'Gus Guest', isGuest: true }, gus)).toBe(true)
    expect(matchesIdentity({ playerId: null, name: 'Gus Guest', isGuest: true }, ann)).toBe(false)
    expect(sameIdentity(ann, { ...ann, name: 'Renamed' })).toBe(true)
    expect(sameIdentity(ann, gus)).toBe(false)
    expect(sameIdentity(null, null)).toBe(true)
    expect(sameIdentity(ann, null)).toBe(false)
  })
})

describe('applyOptimistic', () => {
  it('joining with room goes to the back and is confirmed', () => {
    expect(applyOptimistic(state(), 'in', ann)).toMatchObject({ inCount: 4, waitlistCount: 0, myStatus: 'in', myPosition: 4 })
  })

  it('joining a full session is a waitlist spot', () => {
    expect(applyOptimistic(state({ inCount: 4, waitlistCount: 1 }), 'in', ann)).toMatchObject({
      inCount: 4,
      waitlistCount: 2,
      myPosition: 6,
    })
  })

  it('cancelling frees a place', () => {
    const joined = applyOptimistic(state({ inCount: 4, waitlistCount: 1 }), 'in', ann)
    expect(applyOptimistic(joined, 'out', ann)).toMatchObject({ inCount: 4, waitlistCount: 1, myStatus: 'out', myPosition: null })
  })

  it("cancelling something never RSVP'd changes nothing", () => {
    const s = state()
    expect(applyOptimistic(s, 'out', ann)).toBe(s)
  })

  it('rejoining after cancelling goes to the back of the line', () => {
    const s = state({ myRsvps: [{ rsvpId: 'r', playerId: 'a', name: 'Ann', isGuest: false, status: 'out', position: null }] })
    expect(applyOptimistic(s, 'in', ann)).toMatchObject({ myStatus: 'in', myPosition: 4, inCount: 4 })
  })

  it('does not double count someone who is already in', () => {
    const s = state({ myRsvps: [{ rsvpId: 'r', playerId: 'a', name: 'Ann', isGuest: false, status: 'in', position: 2 }] })
    expect(applyOptimistic(s, 'in', ann)).toMatchObject({ inCount: 3, myPosition: 2 })
  })

  it('names a new guest with the cleaned-up name', () => {
    expect(applyOptimistic(state(), 'in', gus).myRsvps[0]).toMatchObject({ name: 'Gus   Guest'.replace(/\s+/g, ' '), isGuest: true })
  })
})

describe('applyOptimisticRoster', () => {
  const roster = [entry('Ann', 'in', 1), entry('Bo', 'in', 2), entry('Cy', 'in', 3), entry('Di', 'out', null)]
  const summary = (list: RsvpRosterEntry[]) => list.map((e) => [e.name, e.status, e.position])

  it('adds a new person at the back, ahead of the cancelled', () => {
    const r = applyOptimisticRoster(roster, 'in', { kind: 'player', playerId: 'ed', name: 'Ed' })
    expect(summary(r)).toEqual([['Ann', 'in', 1], ['Bo', 'in', 2], ['Cy', 'in', 3], ['Ed', 'in', 4], ['Di', 'out', null]])
  })

  it('cancelling shifts everyone behind up', () => {
    const r = applyOptimisticRoster(roster, 'out', { kind: 'player', playerId: 'ann', name: 'Ann' })
    expect(summary(r)).toEqual([['Bo', 'in', 1], ['Cy', 'in', 2], ['Ann', 'out', null], ['Di', 'out', null]])
  })

  it('a cancelled person rejoining goes last among those in', () => {
    const r = applyOptimisticRoster(roster, 'in', { kind: 'player', playerId: 'di', name: 'Di' })
    expect(summary(r)).toEqual([['Ann', 'in', 1], ['Bo', 'in', 2], ['Cy', 'in', 3], ['Di', 'in', 4]])
  })

  it('leaves the list alone for a no-op', () => {
    expect(applyOptimisticRoster(roster, 'in', { kind: 'player', playerId: 'ann', name: 'Ann' })).toBe(roster)
    expect(applyOptimisticRoster(roster, 'out', { kind: 'player', playerId: 'zz', name: 'Zed' })).toBe(roster)
  })
})

describe('reconcileGuestIdentity', () => {
  const row = (name: string, isGuest = true): MyRsvp => ({ rsvpId: name, playerId: isGuest ? null : 'p1', name, isGuest, status: 'in', position: 1 })
  const jon: RsvpIdentity = { kind: 'guest', name: 'Jon' }

  it('adopts the renamed guest row', () => {
    expect(reconcileGuestIdentity(jon, [row('John')])).toEqual({ kind: 'guest', name: 'John' })
  })
  it('leaves a matching name, a player identity and no identity alone', () => {
    expect(reconcileGuestIdentity(jon, [row(' jon ')])).toBeNull()
    expect(reconcileGuestIdentity({ kind: 'player', playerId: 'p1', name: 'Pat' }, [row('John')])).toBeNull()
    expect(reconcileGuestIdentity(null, [row('John')])).toBeNull()
  })
  it('does nothing when it is ambiguous or there is no guest row', () => {
    expect(reconcileGuestIdentity(jon, [row('John'), row('Ann')])).toBeNull()
    expect(reconcileGuestIdentity(jon, [row('Pat', false)])).toBeNull()
    expect(reconcileGuestIdentity(jon, [])).toBeNull()
  })
})
