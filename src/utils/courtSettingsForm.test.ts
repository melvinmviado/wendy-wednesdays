import { describe, expect, it } from 'vitest'
import { checkCourtForm, describeCourtOrder, MAX_COURTS } from './courtSettingsForm'

describe('checkCourtForm', () => {
  it('accepts numbering that counts down or up', () => {
    expect(checkCourtForm({ top: '10', bottom: '7' })).toEqual({ errors: {}, courtOrder: [10, 9, 8, 7] })
    expect(checkCourtForm({ top: ' 4 ', bottom: '6' })).toEqual({ errors: {}, courtOrder: [4, 5, 6] })
  })

  it('accepts a single court', () => {
    expect(checkCourtForm({ top: '5', bottom: '5' }).courtOrder).toEqual([5])
  })

  it.each([[''], ['0'], ['-3'], ['2.5'], ['ten']])('rejects %j as a court number', (bad) => {
    const r = checkCourtForm({ top: bad, bottom: '4' })
    expect(r.errors.top).toBe('Enter a court number of 1 or more.')
    expect(r.courtOrder).toBeNull()
  })

  it('flags both fields when both are wrong', () => {
    expect(Object.keys(checkCourtForm({ top: '', bottom: 'x' }).errors)).toEqual(['top', 'bottom'])
  })

  it(`refuses more than ${MAX_COURTS} courts as a likely typo`, () => {
    const r = checkCourtForm({ top: '1', bottom: '100' })
    expect(r.errors.bottom).toMatch(/100 courts/)
    expect(r.courtOrder).toBeNull()
  })
})

describe('describeCourtOrder', () => {
  it('lists the courts top to bottom', () => {
    expect(describeCourtOrder([10, 9, 8, 7])).toBe('4 courts: 10, 9, 8, 7 (top → bottom)')
  })

  it('says "1 court" for one', () => {
    expect(describeCourtOrder([5])).toBe('1 court: 5')
  })
})
