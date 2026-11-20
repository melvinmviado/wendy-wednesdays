import { describe, expect, it } from 'vitest'
import type { EventSettings } from '../lib/eventSettings'
import { checkForm, cutoffBefore, isDirty, nextWednesdayRun, toFormValues, wouldCloseRsvpNow } from './eventSettingsForm'

const TZ = 'America/Toronto' // EST (UTC-5) in winter, EDT (UTC-4) from Mar 8 to Nov 1 2026
const at = (iso: string) => new Date(iso)
const NOW = at('2026-11-20T15:00:00Z') // Friday

const good = { open: '', cutoff: '2026-11-25T18:00', start: '2026-11-25T20:00', end: '2026-11-25T22:00', capacity: '24' }

describe('checkForm', () => {
  it('treats RSVP open as optional and checks it opens before it closes', () => {
    const open = checkForm({ ...good, open: '2026-11-23T09:00' }, TZ, NOW)
    expect(open.errors).toEqual({})
    expect(open.input?.rsvpOpenAt).toBe('2026-11-23T14:00:00.000Z')
    expect(checkForm({ ...good, open: good.cutoff }, TZ, NOW).errors.open).toMatch(/open before/)
    expect(checkForm({ ...good, open: '2026-11-26T09:00' }, TZ, NOW).errors.open).toMatch(/open before/)
    expect(checkForm({ ...good, open: 'nope' }, TZ, NOW).errors.open).toBeDefined()
  })

  it('accepts the default schedule and returns UTC values', () => {
    const r = checkForm(good, TZ, NOW)
    expect(r.errors).toEqual({})
    expect(r.warnings).toEqual({})
    expect(r.input).toEqual({
      rsvpOpenAt: null,
      rsvpCutoffAt: '2026-11-25T23:00:00.000Z',
      eventStartAt: '2026-11-26T01:00:00.000Z',
      eventEndAt: '2026-11-26T03:00:00.000Z',
      timezone: TZ,
      capacity: 24,
    })
  })

  it('mirrors the database checks', () => {
    expect(checkForm({ ...good, end: good.start }, TZ, NOW).errors.end).toMatch(/after it starts/)
    expect(checkForm({ ...good, end: '2026-11-25T19:00' }, TZ, NOW).errors.end).toBeDefined()
    expect(checkForm({ ...good, cutoff: '2026-11-25T20:01' }, TZ, NOW).errors.cutoff).toMatch(/at or before/)
    expect(checkForm({ ...good, cutoff: good.start }, TZ, NOW).errors.cutoff).toBeUndefined() // equal is allowed
  })

  it('requires every date, and a whole-number capacity from 1 to 200', () => {
    expect(checkForm({ ...good, cutoff: '' }, TZ, NOW).errors.cutoff).toBeDefined()
    for (const capacity of ['', '0', '201', '2.5', 'abc']) {
      expect(checkForm({ ...good, capacity }, TZ, NOW).errors.capacity).toBeDefined()
    }
    expect(checkForm({ ...good, capacity: '200' }, TZ, NOW).errors.capacity).toBeUndefined()
  })

  it('mirrors the Wednesday-only rule', () => {
    const thursday = { ...good, cutoff: '2026-11-26T18:00', start: '2026-11-26T20:00', end: '2026-11-26T22:00' }
    expect(checkForm(thursday, TZ, NOW).errors.start).toMatch(/Wednesday/)
  })

  it('judges the weekday in the event zone, not UTC', () => {
    // 9 PM Wednesday Toronto is already Thursday in UTC: still a Wednesday here.
    const late = { ...good, start: '2026-11-25T21:00', end: '2026-11-25T23:00' }
    expect(checkForm(late, TZ, NOW).errors.start).toBeUndefined()
  })

  it('warns about past dates without blocking', () => {
    const r = checkForm(good, TZ, at('2026-11-26T05:00:00Z'))
    expect(r.errors).toEqual({})
    expect(r.input).not.toBeNull()
    expect(r.warnings.cutoff).toMatch(/closed/)
    expect(r.warnings.start).toBeDefined()
    expect(r.warnings.end).toBeDefined()
  })

  it('gives no input while there are errors', () => {
    expect(checkForm({ ...good, capacity: '0' }, TZ, NOW).input).toBeNull()
  })
})

describe('quick fill', () => {
  it('picks the upcoming Wednesday 7:00 to 9:00 PM', () => {
    expect(nextWednesdayRun(NOW, TZ)).toEqual({ start: '2026-11-25T19:00', end: '2026-11-25T21:00' })
  })
  it('uses today on a Wednesday before 7 PM', () => {
    expect(nextWednesdayRun(at('2026-11-25T20:00:00Z'), TZ).start).toBe('2026-11-25T19:00') // 3 PM EST
  })
  it('goes to next week once 7 PM has arrived', () => {
    expect(nextWednesdayRun(at('2026-11-26T00:00:00Z'), TZ).start).toBe('2026-12-02T19:00')
  })
  it('uses the zone calendar day, so late Tuesday night UTC-wise is still Tuesday', () => {
    expect(nextWednesdayRun(at('2026-11-25T03:00:00Z'), TZ).start).toBe('2026-11-25T19:00') // Tue 10 PM EST
  })
  it('lands on the right wall time across a daylight saving change', () => {
    // Mar 8 2026 clocks go forward; the next Wednesday is Mar 11 (EDT).
    const run = nextWednesdayRun(at('2026-03-07T15:00:00Z'), TZ)
    expect(run).toEqual({ start: '2026-03-11T19:00', end: '2026-03-11T21:00' })
    expect(checkForm({ open: '', cutoff: '2026-03-10T19:00', ...run, capacity: '24' }, TZ, at('2026-03-07T15:00:00Z')).input?.eventStartAt)
      .toBe('2026-03-11T23:00:00.000Z')
  })

  it('puts the cutoff 24 real hours before the start', () => {
    expect(cutoffBefore('2026-11-25T19:00', 24, TZ)).toBe('2026-11-24T19:00')
    // Clocks go forward on Sunday Mar 8: 24 real hours before Monday 7 PM EDT is Sunday 7 PM EDT.
    expect(cutoffBefore('2026-03-09T19:00', 24, TZ)).toBe('2026-03-08T19:00')
    expect(cutoffBefore('2026-03-08T12:00', 24, TZ)).toBe('2026-03-07T11:00') // 23 wall-clock hours earlier
    expect(cutoffBefore('', 24, TZ)).toBeNull()
  })
})

describe('wouldCloseRsvpNow', () => {
  const saved: EventSettings = {
    rsvpOpenAt: null,
    rsvpCutoffAt: '2026-11-25T23:00:00.000Z',
    eventStartAt: '2026-11-26T01:00:00.000Z',
    eventEndAt: '2026-11-26T03:00:00.000Z',
    timezone: TZ,
    capacity: 24,
    updatedAt: '2026-11-20T00:00:00.000Z',
    updatedBy: null,
  }
  const next = (rsvpCutoffAt: string) => ({
    rsvpOpenAt: null, rsvpCutoffAt, eventStartAt: saved.eventStartAt, eventEndAt: saved.eventEndAt, timezone: TZ, capacity: 24,
  })

  it('is true when the new cutoff has already passed and RSVPs are open', () => {
    expect(wouldCloseRsvpNow(at('2026-11-25T19:00:00Z'), saved, next('2026-11-25T18:00:00.000Z'))).toBe(true)
  })
  it('is false when the new cutoff is still ahead, or RSVPs were already closed', () => {
    expect(wouldCloseRsvpNow(at('2026-11-25T19:00:00Z'), saved, next('2026-11-25T21:00:00.000Z'))).toBe(false)
    expect(wouldCloseRsvpNow(at('2026-11-25T23:30:00Z'), saved, next('2026-11-25T18:00:00.000Z'))).toBe(false)
  })
  it('compares against the built-in schedule when nothing is saved', () => {
    expect(wouldCloseRsvpNow(at('2026-11-25T19:00:00Z'), null, next('2026-11-25T18:00:00.000Z'))).toBe(true)
  })
})

describe('form values', () => {
  it('shows saved UTC instants as wall-clock time in the zone', () => {
    const saved: EventSettings = {
      rsvpOpenAt: null, rsvpCutoffAt: '2026-11-25T23:00:00.000Z', eventStartAt: '2026-11-26T01:00:00.000Z',
      eventEndAt: '2026-11-26T03:00:00.000Z', timezone: TZ, capacity: 12, updatedAt: '', updatedBy: null,
    }
    expect(toFormValues(saved, TZ)).toEqual({ open: '', cutoff: '2026-11-25T18:00', start: '2026-11-25T20:00', end: '2026-11-25T22:00', capacity: '12' })
    expect(toFormValues(null, TZ).capacity).toBe('24')
  })
  it('detects edits', () => {
    expect(isDirty(good, { ...good })).toBe(false)
    expect(isDirty(good, { ...good, capacity: '25' })).toBe(true)
  })
})
