import { describe, expect, it } from 'vitest'
import { checkCourtNumbers, describeCourtOrder, formatCourtNumbers, MAX_COURTS } from './courtSettingsForm'

describe('checkCourtNumbers', () => {
  it("accepts the facility's courts with a gap, in the order typed", () => {
    expect(checkCourtNumbers('10, 9, 8, 7, 3, 2')).toEqual({ error: null, courtOrder: [10, 9, 8, 7, 3, 2] })
  })

  it('accepts commas, spaces or both, and ignores extra separators', () => {
    expect(checkCourtNumbers(' 10 9,8 ,, 7 ').courtOrder).toEqual([10, 9, 8, 7])
  })

  it('expands a run of courts in either direction', () => {
    expect(checkCourtNumbers('10-7, 3, 2').courtOrder).toEqual([10, 9, 8, 7, 3, 2])
    expect(checkCourtNumbers('4 – 6').courtOrder).toEqual([4, 5, 6])
  })

  it('accepts a single court', () => {
    expect(checkCourtNumbers('5').courtOrder).toEqual([5])
  })

  it.each([
    ['', 'Enter the court numbers, top court first.'],
    ['10, 0', 'Court numbers start at 1.'],
    ['10, 2.5', '"2.5" isn\'t a court number. Use whole numbers, like 10, 9, 8, 7, 3, 2.'],
    ['ten', '"ten" isn\'t a court number. Use whole numbers, like 10, 9, 8, 7, 3, 2.'],
    ['10, 9, 10', 'Court 10 is listed twice.'],
    ['10-7, 8', 'Court 8 is listed twice.'],
    ['100000', 'Court numbers go up to 9999.'],
  ])('refuses %j', (text, error) => {
    expect(checkCourtNumbers(text)).toEqual({ error, courtOrder: null })
  })

  it(`refuses more than ${MAX_COURTS} courts as a likely typo`, () => {
    expect(checkCourtNumbers('1-100').error).toMatch(/100 courts/)
    expect(checkCourtNumbers('1-40, 41-60').error).toMatch(/60 courts/)
  })
})

describe('formatCourtNumbers / describeCourtOrder', () => {
  it('shows a saved list as it would be typed', () => {
    expect(formatCourtNumbers([10, 9, 8, 7, 3, 2])).toBe('10, 9, 8, 7, 3, 2')
  })

  it('lists the courts top to bottom', () => {
    expect(describeCourtOrder([10, 9, 8, 7, 3, 2])).toBe('6 courts: 10, 9, 8, 7, 3, 2 (top → bottom)')
  })

  it('says "1 court" for one', () => {
    expect(describeCourtOrder([5])).toBe('1 court: 5')
  })
})
