import { describe, expect, it } from 'vitest'
import { fetchEventSettings, updateEventSettings, validateEventSettings, type EventSettingsInput } from './eventSettings'

const good: EventSettingsInput = {
  rsvpOpenAt: null,
  rsvpCutoffAt: '2026-11-25T23:00:00.000Z',
  eventStartAt: '2026-11-26T01:00:00.000Z',
  eventEndAt: '2026-11-26T03:00:00.000Z',
  timezone: 'America/Toronto',
  capacity: 24,
}

describe('validateEventSettings', () => {
  it('requires RSVPs to open before they close, and allows no open time', () => {
    expect(validateEventSettings({ ...good, rsvpOpenAt: '2026-11-24T14:00:00.000Z' })).toBeNull()
    expect(validateEventSettings({ ...good, rsvpOpenAt: good.rsvpCutoffAt })).toMatch(/open before/)
    expect(validateEventSettings({ ...good, rsvpOpenAt: '2026-11-26T00:00:00.000Z' })).toMatch(/open before/)
  })

  it('accepts the default schedule', () => expect(validateEventSettings(good)).toBeNull())
  it('allows the cutoff to equal the start', () => {
    expect(validateEventSettings({ ...good, rsvpCutoffAt: good.eventStartAt })).toBeNull()
  })
  it('mirrors the database checks', () => {
    expect(validateEventSettings({ ...good, eventEndAt: good.eventStartAt })).toMatch(/end after/)
    expect(validateEventSettings({ ...good, rsvpCutoffAt: '2026-11-26T01:01:00.000Z' })).toMatch(/at or before/)
    expect(validateEventSettings({ ...good, capacity: 0 })).toMatch(/Capacity/)
    expect(validateEventSettings({ ...good, capacity: 2.5 })).toMatch(/Capacity/)
    expect(validateEventSettings({ ...good, capacity: 201 })).toMatch(/Capacity/)
    expect(validateEventSettings({ ...good, timezone: 'Mars/Olympus' })).toMatch(/time zone/)
    expect(validateEventSettings({ ...good, eventStartAt: 'junk' })).toMatch(/valid date/)
  })
})

describe('without a database', () => {
  it('reads as "no settings" so callers use the built-in schedule', async () => {
    expect(await fetchEventSettings()).toEqual({ ok: true, data: null })
  })
  it('refuses to save, and rejects bad input first', async () => {
    expect((await updateEventSettings(good)).ok).toBe(false)
    const bad = await updateEventSettings({ ...good, capacity: 0 })
    expect(bad.ok === false && bad.error.code).toBe('INVALID')
  })
})
