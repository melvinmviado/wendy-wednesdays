import { describe, expect, it } from 'vitest'
import {
  datetimeLocalToUtcIso,
  formatEventDateTime,
  formatEventRange,
  isValidTimeZone,
  localDateInZone,
  utcIsoToDatetimeLocal,
} from './datetime'

const TZ = 'America/Toronto' // EST (UTC-5) in winter, EDT (UTC-4) from Mar 8 to Nov 1 2026

describe('utcIsoToDatetimeLocal', () => {
  it('reads an instant as wall-clock time in the zone', () => {
    expect(utcIsoToDatetimeLocal('2026-11-25T23:00:00.000Z', TZ)).toBe('2026-11-25T18:00') // EST
    expect(utcIsoToDatetimeLocal('2026-07-15T22:00:00.000Z', TZ)).toBe('2026-07-15T18:00') // EDT
  })
  it('uses the zone calendar day, not the UTC one', () => {
    expect(utcIsoToDatetimeLocal('2026-11-26T03:30:00.000Z', TZ)).toBe('2026-11-25T22:30')
  })
  it('does not render midnight as hour 24', () => {
    expect(utcIsoToDatetimeLocal('2026-11-25T05:00:00.000Z', TZ)).toBe('2026-11-25T00:00')
  })
  it('returns an empty string for junk', () => {
    expect(utcIsoToDatetimeLocal('nope', TZ)).toBe('')
  })
})

describe('datetimeLocalToUtcIso', () => {
  it('converts winter and summer wall time with the right offset', () => {
    expect(datetimeLocalToUtcIso('2026-11-25T18:00', TZ)).toBe('2026-11-25T23:00:00.000Z')
    expect(datetimeLocalToUtcIso('2026-07-15T18:00', TZ)).toBe('2026-07-15T22:00:00.000Z')
  })
  it('lands on the right side of the spring and autumn changes', () => {
    expect(datetimeLocalToUtcIso('2026-03-08T01:59', TZ)).toBe('2026-03-08T06:59:00.000Z') // EST
    expect(datetimeLocalToUtcIso('2026-03-08T03:00', TZ)).toBe('2026-03-08T07:00:00.000Z') // EDT
    expect(datetimeLocalToUtcIso('2026-11-01T00:30', TZ)).toBe('2026-11-01T04:30:00.000Z') // EDT
    expect(datetimeLocalToUtcIso('2026-11-01T02:00', TZ)).toBe('2026-11-01T07:00:00.000Z') // EST
  })
  it('resolves a time that does not exist (spring forward) to just after the gap', () => {
    expect(datetimeLocalToUtcIso('2026-03-08T02:30', TZ)).toBe('2026-03-08T07:30:00.000Z') // 3:30 AM EDT
  })
  it('resolves a time that happens twice (fall back) to its first occurrence', () => {
    expect(datetimeLocalToUtcIso('2026-11-01T01:30', TZ)).toBe('2026-11-01T05:30:00.000Z') // EDT
  })
  it('works for zones ahead of UTC and with half-hour offsets', () => {
    expect(datetimeLocalToUtcIso('2026-11-25T18:00', 'Asia/Kolkata')).toBe('2026-11-25T12:30:00.000Z')
    expect(datetimeLocalToUtcIso('2026-11-25T08:00', 'Australia/Sydney')).toBe('2026-11-24T21:00:00.000Z')
  })
  it('rejects values that are not real times', () => {
    for (const bad of ['', '2026-02-30T10:00', '2026-11-25T24:00', '2026-11-25', '2026-13-01T10:00', 'x']) {
      expect(datetimeLocalToUtcIso(bad, TZ)).toBeNull()
    }
  })
  it('round-trips every hour of both change days', () => {
    for (const day of ['2026-03-08', '2026-11-01']) {
      for (let h = 0; h < 24; h++) {
        const local = `${day}T${String(h).padStart(2, '0')}:00`
        const iso = datetimeLocalToUtcIso(local, TZ)!
        // only the skipped hour may come back different (02:00 on Mar 8 becomes 03:00)
        if (!(day === '2026-03-08' && h === 2)) expect(utcIsoToDatetimeLocal(iso, TZ)).toBe(local)
      }
    }
  })
})

describe('formatEventDateTime / localDateInZone / isValidTimeZone', () => {
  it('formats in the event zone with its abbreviation', () => {
    expect(formatEventDateTime('2026-11-25T23:00:00.000Z', TZ)).toBe('Wed, Nov 25, 6:00 PM EST')
    expect(formatEventDateTime('2026-07-15T22:00:00.000Z', TZ)).toBe('Wed, Jul 15, 6:00 PM EDT')
    expect(formatEventDateTime('2026-11-25T23:00:00.000Z', TZ, { withZoneName: false })).toBe('Wed, Nov 25, 6:00 PM')
    expect(formatEventDateTime('bad', TZ)).toBe('')
  })
  it('gives the calendar date in the zone', () => {
    expect(localDateInZone('2026-11-26T03:30:00.000Z', TZ)).toBe('2026-11-25')
    expect(localDateInZone('nope', TZ)).toBe('')
  })
  it('checks zone names', () => {
    expect(isValidTimeZone(TZ)).toBe(true)
    expect(isValidTimeZone('Mars/Olympus')).toBe(false)
  })
})

describe('formatEventRange', () => {
  it('shows one date and one zone label for a same-day event', () => {
    expect(formatEventRange('2026-11-26T01:00:00.000Z', '2026-11-26T03:00:00.000Z', TZ)).toBe(
      'Wed, Nov 25, 8:00 PM – 10:00 PM EST',
    )
    expect(formatEventRange('2026-07-16T00:00:00.000Z', '2026-07-16T02:00:00.000Z', TZ)).toBe(
      'Wed, Jul 15, 8:00 PM – 10:00 PM EDT',
    )
  })
  it('is the same for a viewer anywhere: it only depends on the zone argument', () => {
    expect(formatEventRange('2026-11-26T01:00:00.000Z', '2026-11-26T03:00:00.000Z', 'Asia/Tokyo')).toContain('Thu, Nov 26')
  })
  it('gives each end its own date when it crosses midnight', () => {
    expect(formatEventRange('2026-11-26T04:00:00.000Z', '2026-11-26T06:00:00.000Z', TZ)).toBe(
      'Wed, Nov 25, 11:00 PM – Thu, Nov 26, 1:00 AM EST',
    )
  })
  it('is empty for junk', () => expect(formatEventRange('x', 'y', TZ)).toBe(''))
})
