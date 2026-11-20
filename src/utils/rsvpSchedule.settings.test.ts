import { describe, expect, it } from 'vitest'
import type { EventSettings } from '../lib/eventSettings'
import { getPhase, getScheduleTimestamps, getSessionDate, isRsvpOpen } from './rsvpSchedule'

const at = (iso: string) => new Date(iso)

// Toronto is UTC-5 in winter (EST). The weekly default is Wednesday: cutoff 6 PM, live 8-10 PM.
const base: EventSettings = {
  rsvpOpenAt: null,
  rsvpCutoffAt: '2026-11-25T20:00:00.000Z', // 3 PM, earlier than the default 6 PM
  eventStartAt: '2026-11-26T01:00:00.000Z', // Wed Nov 25, 8 PM
  eventEndAt: '2026-11-26T03:00:00.000Z', // 10 PM
  timezone: 'America/Toronto',
  capacity: 12,
  updatedAt: '2026-11-20T00:00:00.000Z',
  updatedBy: null,
}

describe('isRsvpOpen', () => {
  it('closes at exactly the admin cutoff, not the default one', () => {
    expect(isRsvpOpen(at('2026-11-25T19:59:59Z'), base)).toBe(true)
    expect(isRsvpOpen(at('2026-11-25T20:00:00Z'), base)).toBe(false) // the default rule would still be open
  })

  it('reopens for next week once the event is over', () => {
    expect(isRsvpOpen(at('2026-11-26T03:00:00Z'), base)).toBe(true)
  })

  it('falls back to the weekly rule when there is no settings row', () => {
    for (const none of [null, undefined]) {
      expect(isRsvpOpen(at('2026-11-25T22:59:00Z'), none)).toBe(true)
      expect(isRsvpOpen(at('2026-11-25T23:00:00Z'), none)).toBe(false) // 6:00 PM
    }
  })

  it('is open early in the week', () => {
    expect(isRsvpOpen(at('2026-11-19T15:00:00Z'), base)).toBe(true)
  })
})

describe('schedule following the settings', () => {
  // A moved run: Thursday Dec 3, cutoff 5 PM, 7-9 PM (EST).
  const moved: EventSettings = {
    ...base,
    rsvpOpenAt: null,
    rsvpCutoffAt: '2026-12-03T22:00:00.000Z',
    eventStartAt: '2026-12-04T00:00:00.000Z',
    eventEndAt: '2026-12-04T02:00:00.000Z',
  }

  it('uses the settings while they describe the current event', () => {
    expect(getSessionDate(at('2026-11-30T15:00:00Z'), moved)).toBe('2026-12-03')
    expect(getScheduleTimestamps('2026-12-03', moved).cutoffAt.toISOString()).toBe(moved.rsvpCutoffAt)
    expect(getPhase({ now: at('2026-12-03T21:59:00Z'), counts: { in: 0 }, settings: moved })).toBe('open')
    expect(getPhase({ now: at('2026-12-03T22:00:00Z'), counts: { in: 0 }, settings: moved })).toBe('locked')
    expect(getPhase({ now: at('2026-12-04T00:00:00Z'), counts: { in: 0 }, settings: moved })).toBe('live')
  })

  it('falls back to the weekly rule without a row, once the event is over, and when it is over a week away', () => {
    expect(getSessionDate(at('2026-11-19T15:00:00Z'), null)).toBe('2026-11-25')
    expect(getSessionDate(at('2026-12-04T02:00:00Z'), moved)).toBe('2026-12-09')
    expect(getSessionDate(at('2026-11-19T15:00:00Z'), moved)).toBe('2026-11-25')
  })

  it('does not apply the settings to a different date', () => {
    expect(getScheduleTimestamps('2026-12-09', moved).cutoffAt.toISOString()).toBe('2026-12-09T23:00:00.000Z')
  })

  it('ignores a row with unparseable dates', () => {
    expect(getSessionDate(at('2026-11-19T15:00:00Z'), { ...base, eventStartAt: 'junk' })).toBe('2026-11-25')
  })
})

describe('RSVP open time', () => {
  const withOpen: EventSettings = { ...base, rsvpOpenAt: '2026-11-23T14:00:00.000Z' } // Mon Nov 23, 9 AM EST
  const counts = { in: 3 }

  it('is "upcoming" and not open before the open time, then open, then locked', () => {
    const before = at('2026-11-23T13:59:00Z')
    expect(getPhase({ now: before, counts, settings: withOpen })).toBe('upcoming')
    expect(isRsvpOpen(before, withOpen)).toBe(false)
    const after = at('2026-11-23T14:00:00Z')
    expect(getPhase({ now: after, counts, settings: withOpen })).toBe('open')
    expect(isRsvpOpen(after, withOpen)).toBe(true)
    expect(getPhase({ now: at('2026-11-25T20:00:00Z'), counts, settings: withOpen })).toBe('locked')
  })

  it('has no open time by default, so nothing is "upcoming"', () => {
    expect(getScheduleTimestamps('2026-11-25', base).openAt).toBeNull()
    expect(getScheduleTimestamps('2026-12-02').openAt).toBeNull()
    expect(getPhase({ now: at('2026-11-19T15:00:00Z'), counts, settings: base })).toBe('open')
  })
})
