import { describe, expect, it } from 'vitest'
import { formatCountdown } from './rsvpCountdown'

const MIN = 60_000
describe('formatCountdown', () => {
  it('shows minutes, hours and days', () => {
    expect(formatCountdown(42 * MIN)).toBe('42 min')
    expect(formatCountdown(60 * MIN)).toBe('1h')
    expect(formatCountdown(195 * MIN)).toBe('3h 15m')
    expect(formatCountdown(26 * 60 * MIN)).toBe('1d 2h')
    expect(formatCountdown(2 * 1440 * MIN)).toBe('2d')
  })
  it('rounds up so it never shows zero before the deadline', () => {
    expect(formatCountdown(1)).toBe('1 min')
    expect(formatCountdown(59_000)).toBe('1 min')
    expect(formatCountdown(61_000)).toBe('2 min')
  })
  it('is empty once time is up', () => {
    expect(formatCountdown(0)).toBe('')
    expect(formatCountdown(-5)).toBe('')
    expect(formatCountdown(NaN)).toBe('')
  })
})
