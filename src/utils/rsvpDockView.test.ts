import { describe, expect, it } from 'vitest'
import { describeForScreenReader, getDockView, type DockInput } from './rsvpDockView'

const base: DockInput = {
  phase: 'open', loading: false, failed: false, sessionDate: '2026-11-25', inCount: 16, capacity: 24,
  waitlistCount: 0, myStatus: null, myWaitlistPosition: null,
}
const view = (over: Partial<DockInput> = {}) => getDockView({ ...base, ...over })

describe('getDockView', () => {
  it('is loading until the first read, and an error only once it has failed', () => {
    expect(view({ phase: null, sessionDate: null, capacity: null, loading: true })).toEqual({ kind: 'loading' })
    expect(view({ phase: null, sessionDate: null, capacity: null, loading: false, failed: true })).toEqual({ kind: 'error' })
    expect(view({ phase: null, sessionDate: null, capacity: null, loading: true, failed: true })).toEqual({ kind: 'loading' })
  })

  it('open: shows spots and offers I\'m In', () => {
    expect(view()).toEqual({ kind: 'open', line: 'Wed, Nov 25 • 16/24 spots' })
    expect(view({ myStatus: 'out' }).kind).toBe('open') // cancelled people can rejoin
  })

  it('confirmed: shows the headcount with Next Run', () => {
    expect(view({ myStatus: 'in', inCount: 18 })).toEqual({ kind: 'going', line: 'Next Run: Wed, Nov 25 • 18/24 In' })
  })

  it('full: offers the next waitlist number', () => {
    expect(view({ phase: 'full', inCount: 24 })).toEqual({ kind: 'full', line: 'Wed, Nov 25 • Full (24/24)', joinNumber: 1 })
    expect(view({ phase: 'full', inCount: 24, waitlistCount: 3 })).toMatchObject({ kind: 'full', joinNumber: 4 })
  })

  it('full and joined: shows the waitlist place', () => {
    expect(view({ phase: 'full', inCount: 24, waitlistCount: 2, myStatus: 'in', myWaitlistPosition: 2 })).toEqual({
      kind: 'waitlisted', line: 'Wed, Nov 25 • Full (24/24)', waitlistPosition: 2,
    })
  })

  it('a confirmed player stays "going" even when the run is full', () => {
    expect(view({ phase: 'full', inCount: 24, myStatus: 'in' }).kind).toBe('going')
  })

  it('locked: no action, headcount, and read-only status for those who are in', () => {
    expect(view({ phase: 'locked', inCount: 24 })).toEqual({
      kind: 'locked', line: 'RSVP closed • 24 playing', mine: null, waitlistPosition: null,
    })
    expect(view({ phase: 'locked', myStatus: 'in' })).toMatchObject({ kind: 'locked', mine: 'going' })
    expect(view({ phase: 'locked', myStatus: 'in', myWaitlistPosition: 3 })).toMatchObject({ mine: 'waitlist', waitlistPosition: 3 })
    expect(view({ phase: 'locked', myStatus: 'out' })).toMatchObject({ mine: null })
  })

  it('live: the banner, whatever your status', () => {
    expect(view({ phase: 'live' })).toEqual({ kind: 'live', line: "Live Run in Progress • View Tonight's Roster" })
    expect(view({ phase: 'live', myStatus: 'in' }).kind).toBe('live')
  })
})

describe('describeForScreenReader', () => {
  it('says what changed in plain words', () => {
    expect(describeForScreenReader(view(), 16, 24)).toBe('16 of 24 spots taken.')
    expect(describeForScreenReader(view({ myStatus: 'in' }), 17, 24)).toBe("You're going. 17 of 24 spots taken.")
    expect(describeForScreenReader(view({ phase: 'full', inCount: 24, waitlistCount: 1, myStatus: 'in', myWaitlistPosition: 1 }), 24, 24)).toBe("You're number 1 on the waitlist.")
    expect(describeForScreenReader(view({ phase: 'locked', myStatus: 'in' }), 24, 24)).toBe("RSVPs are closed. 24 playing. You're going.")
    expect(describeForScreenReader(view({ phase: 'live' }), 24, 24)).toBe('Live run in progress.')
    expect(describeForScreenReader({ kind: 'loading' }, 0, null)).toBe('')
  })
})
