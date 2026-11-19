import { describe, expect, it } from 'vitest'
import type { WeeklyLogEntry } from './playerStats'
import { describeResult, formatLogDate, newestFirst } from './weeklyLog'

const entry = (weekNumber: number, courtNumber: number | null, finish: WeeklyLogEntry['finish']): WeeklyLogEntry => ({
  weekNumber,
  playedOn: null,
  courtNumber,
  finish,
})

describe('weeklyLog helpers', () => {
  it('sorts newest week first without mutating the input', () => {
    const log = [entry(1, 1, 'Winner'), entry(5, 2, 'Runner-up'), entry(3, 1, 'Winner')]
    expect(newestFirst(log).map((e) => e.weekNumber)).toEqual([5, 3, 1])
    expect(log.map((e) => e.weekNumber)).toEqual([1, 5, 3])
  })

  it('falls back to the week number when there is no date', () => {
    expect(formatLogDate(null, 3)).toBe('Week 3')
  })

  it('falls back to the week number for a malformed date', () => {
    expect(formatLogDate('2026-01-56', 2)).toBe('Week 2')
    expect(formatLogDate('not a date', 5)).toBe('Week 5')
  })

  it('formats a date without shifting the calendar day', () => {
    expect(formatLogDate('2026-11-04', 1)).toContain('4')
    expect(formatLogDate('2026-11-04', 1)).not.toBe('Week 1')
  })

  it('describes placed and unplaced results', () => {
    expect(describeResult(entry(1, 2, 'Winner'))).toBe('Court 2 · Winner')
    expect(describeResult(entry(1, 1, 'Runner-up'))).toBe('Court 1 · Runner-up')
    expect(describeResult(entry(1, 3, 'Other'))).toBe('Court 3')
    expect(describeResult(entry(1, null, 'Other'))).toBe('Court not recorded')
  })
})
