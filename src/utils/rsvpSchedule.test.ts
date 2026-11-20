import { describe, expect, it } from 'vitest'
import {
  CAPACITY,
  formatSessionDate,
  getPhase,
  getScheduleTimestamps,
  getSessionDate,
  isOpenSessionDate,
  getWaitlistPosition,
} from './rsvpSchedule'

// Toronto is UTC-5 in winter (EST) and UTC-4 in summer (EDT). 2026: DST starts Mar 8, ends Nov 1.
// Nov 25 2026 is a Wednesday (EST). Mar 11 2026 is a Wednesday (EDT). Mar 4 2026 is a Wednesday (EST).
const at = (iso: string) => new Date(iso)
const iso = (d: Date) => d.toISOString()

describe('getSessionDate', () => {
  it('returns the upcoming Wednesday from other days', () => {
    expect(getSessionDate(at('2026-11-19T15:00:00Z'))).toBe('2026-11-25') // Thursday
    expect(getSessionDate(at('2026-11-23T15:00:00Z'))).toBe('2026-11-25') // Monday
    expect(getSessionDate(at('2026-11-24T15:00:00Z'))).toBe('2026-11-25') // Tuesday
    expect(getSessionDate(at('2026-11-22T15:00:00Z'))).toBe('2026-11-25') // Sunday
  })

  it('returns today for every moment of a Wednesday before 10:00 PM', () => {
    expect(getSessionDate(at('2026-11-25T05:00:00Z'))).toBe('2026-11-25') // 12:00 AM
    expect(getSessionDate(at('2026-11-25T22:59:00Z'))).toBe('2026-11-25') // 5:59 PM
    expect(getSessionDate(at('2026-11-25T23:00:00Z'))).toBe('2026-11-25') // 6:00 PM
    expect(getSessionDate(at('2026-11-26T00:59:00Z'))).toBe('2026-11-25') // 7:59 PM
    expect(getSessionDate(at('2026-11-26T01:00:00Z'))).toBe('2026-11-25') // 8:00 PM
    expect(getSessionDate(at('2026-11-26T02:59:00Z'))).toBe('2026-11-25') // 9:59 PM
  })

  it('rolls to next week at 10:00 PM Wednesday', () => {
    expect(getSessionDate(at('2026-11-26T03:00:00Z'))).toBe('2026-12-02') // 10:00 PM
    expect(getSessionDate(at('2026-11-26T04:59:00Z'))).toBe('2026-12-02') // 11:59 PM
    expect(getSessionDate(at('2026-11-26T05:00:00Z'))).toBe('2026-12-02') // Thursday 12:00 AM
  })

  it('uses the Toronto calendar day, not the UTC one', () => {
    // 9:00 PM Tuesday in Toronto is already Wednesday in UTC, but it is still Tuesday there.
    expect(getSessionDate(at('2026-11-25T02:00:00Z'))).toBe('2026-11-25')
    // 11:30 PM Wednesday in Toronto is Thursday in UTC: past the live window, so next week.
    expect(getSessionDate(at('2026-11-26T04:30:00Z'))).toBe('2026-12-02')
  })

  it('rolls over month and year ends', () => {
    expect(getSessionDate(at('2026-12-30T15:00:00Z'))).toBe('2026-12-30') // Wed Dec 30, day of
    expect(getSessionDate(at('2026-12-31T15:00:00Z'))).toBe('2027-01-06') // Thu Dec 31
    expect(getSessionDate(at('2026-12-31T03:00:00Z'))).toBe('2027-01-06') // Wed 10:00 PM
  })

  it('is correct across the spring DST change (Mar 8 2026)', () => {
    expect(getSessionDate(at('2026-03-07T12:00:00Z'))).toBe('2026-03-11') // Sat, before
    expect(getSessionDate(at('2026-03-08T06:59:00Z'))).toBe('2026-03-11') // 1:59 AM EST
    expect(getSessionDate(at('2026-03-08T07:00:00Z'))).toBe('2026-03-11') // 3:00 AM EDT
    expect(getSessionDate(at('2026-03-05T03:00:00Z'))).toBe('2026-03-11') // Mar 4 10:00 PM EST rolls over
  })

  it('is correct across the fall DST change (Nov 1 2026)', () => {
    expect(getSessionDate(at('2026-11-01T05:30:00Z'))).toBe('2026-11-04') // 1:30 AM EDT
    expect(getSessionDate(at('2026-11-01T06:30:00Z'))).toBe('2026-11-04') // 1:30 AM EST (repeated hour)
    expect(getSessionDate(at('2026-10-29T12:00:00Z'))).toBe('2026-11-04') // Thu before
  })
})

describe('getScheduleTimestamps', () => {
  it('uses UTC-5 in winter', () => {
    const t = getScheduleTimestamps('2026-11-25')
    expect(iso(t.cutoffAt)).toBe('2026-11-25T23:00:00.000Z')
    expect(iso(t.liveStart)).toBe('2026-11-26T01:00:00.000Z')
    expect(iso(t.liveEnd)).toBe('2026-11-26T03:00:00.000Z')
  })

  it('uses UTC-4 in summer', () => {
    const t = getScheduleTimestamps('2026-07-01')
    expect(iso(t.cutoffAt)).toBe('2026-07-01T22:00:00.000Z')
    expect(iso(t.liveStart)).toBe('2026-07-02T00:00:00.000Z')
    expect(iso(t.liveEnd)).toBe('2026-07-02T02:00:00.000Z')
  })

  it('follows the spring change: Mar 4 is EST, Mar 11 is EDT', () => {
    expect(iso(getScheduleTimestamps('2026-03-04').cutoffAt)).toBe('2026-03-04T23:00:00.000Z')
    expect(iso(getScheduleTimestamps('2026-03-11').cutoffAt)).toBe('2026-03-11T22:00:00.000Z')
  })

  it('follows the fall change: Oct 28 is EDT, Nov 4 is EST', () => {
    expect(iso(getScheduleTimestamps('2026-10-28').cutoffAt)).toBe('2026-10-28T22:00:00.000Z')
    expect(iso(getScheduleTimestamps('2026-11-04').cutoffAt)).toBe('2026-11-04T23:00:00.000Z')
  })

  it('is always 6 PM, 8 PM and 10 PM Toronto time', () => {
    const fmt = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Toronto', hourCycle: 'h23', hour: 'numeric', minute: 'numeric' })
    for (const day of ['2026-03-04', '2026-03-11', '2026-10-28', '2026-11-04', '2027-03-10', '2027-03-17']) {
      const t = getScheduleTimestamps(day)
      expect([t.cutoffAt, t.liveStart, t.liveEnd].map((d) => fmt.format(d))).toEqual(['18:00', '20:00', '22:00'])
    }
  })

  it('rejects a malformed date', () => {
    expect(() => getScheduleTimestamps('11/25/2026')).toThrow(RangeError)
  })
})

describe('getPhase', () => {
  const phase = (iso: string, inCount = 0) => getPhase({ now: at(iso), counts: { in: inCount } })

  it('is open early in the week and on Wednesday before the cutoff', () => {
    expect(phase('2026-11-19T15:00:00Z')).toBe('open')
    expect(phase('2026-11-25T22:59:00Z')).toBe('open') // 5:59 PM
  })

  it('is locked from exactly 6:00 PM until 8:00 PM', () => {
    expect(phase('2026-11-25T23:00:00Z')).toBe('locked') // 6:00 PM
    expect(phase('2026-11-26T00:59:00Z')).toBe('locked') // 7:59 PM
  })

  it('is live from exactly 8:00 PM until 10:00 PM', () => {
    expect(phase('2026-11-26T01:00:00Z')).toBe('live') // 8:00 PM
    expect(phase('2026-11-26T02:59:00Z')).toBe('live') // 9:59 PM
  })

  it('opens the next session at exactly 10:00 PM', () => {
    expect(phase('2026-11-26T03:00:00Z')).toBe('open')
    expect(phase('2026-11-26T03:00:00Z', CAPACITY)).toBe('full') // next week's list still counts
  })

  it('is full only at capacity, and only before the cutoff', () => {
    expect(phase('2026-11-25T15:00:00Z', CAPACITY - 1)).toBe('open')
    expect(phase('2026-11-25T15:00:00Z', CAPACITY)).toBe('full')
    expect(phase('2026-11-25T15:00:00Z', CAPACITY + 5)).toBe('full')
    expect(phase('2026-11-25T23:00:00Z', CAPACITY)).toBe('locked')
    expect(phase('2026-11-26T01:00:00Z', CAPACITY)).toBe('live')
  })

  it('honours a custom capacity', () => {
    expect(getPhase({ now: at('2026-11-23T15:00:00Z'), counts: { in: 8 }, capacity: 8 })).toBe('full')
  })

  it('moves at the right instant on a DST-change week', () => {
    expect(phase('2026-03-11T21:59:00Z')).toBe('open') // 5:59 PM EDT
    expect(phase('2026-03-11T22:00:00Z')).toBe('locked') // 6:00 PM EDT
    expect(phase('2026-03-12T00:00:00Z')).toBe('live') // 8:00 PM EDT
  })
})

describe('getWaitlistPosition', () => {
  it('is null for everyone inside capacity', () => {
    expect(getWaitlistPosition(1)).toBeNull()
    expect(getWaitlistPosition(CAPACITY)).toBeNull()
  })

  it('counts from 1 past capacity', () => {
    expect(getWaitlistPosition(CAPACITY + 1)).toBe(1)
    expect(getWaitlistPosition(CAPACITY + 3)).toBe(3)
    expect(getWaitlistPosition(5, 4)).toBe(1)
  })
})

describe('isOpenSessionDate', () => {
  it('accepts this Wednesday through the end of that day, and next Wednesday', () => {
    expect(isOpenSessionDate('2026-11-25', at('2026-11-25T15:00:00Z'))).toBe(true) // the day itself
    expect(isOpenSessionDate('2026-11-25', at('2026-11-26T04:30:00Z'))).toBe(true) // 11:30 PM, still Wednesday in Toronto
    expect(isOpenSessionDate('2026-12-02', at('2026-11-25T15:00:00Z'))).toBe(true) // +7 days
    expect(isOpenSessionDate('2026-11-25', at('2026-11-20T15:00:00Z'))).toBe(true) // Friday before
  })

  it('refuses a run that has passed, one too far ahead, and any non-Wednesday', () => {
    expect(isOpenSessionDate('2026-11-25', at('2026-11-26T05:00:00Z'))).toBe(false) // Thursday 12:00 AM
    expect(isOpenSessionDate('2026-12-09', at('2026-11-25T15:00:00Z'))).toBe(false) // +14 days
    expect(isOpenSessionDate('2026-11-26', at('2026-11-25T15:00:00Z'))).toBe(false) // a Thursday
  })
})

describe('formatSessionDate', () => {
  it('formats as "Wed, Nov 25"', () => {
    expect(formatSessionDate('2026-11-25')).toBe('Wed, Nov 25')
    expect(formatSessionDate('2027-01-06')).toBe('Wed, Jan 6')
  })

  it('does not drift with the viewer time zone', () => {
    expect(formatSessionDate(getSessionDate(at('2026-11-26T04:30:00Z')))).toBe('Wed, Dec 2')
  })
})
