import { describe, expect, it } from 'vitest'
import { cleanGuestName, GUEST_NAME_MAX, validateGuestName } from './guestName'

const players = [{ id: 'p1', name: 'Wendy Mitchell' }]
const guests = [{ id: 'g1', name: 'Jon Smith' }, { id: 'g2', name: 'Riley Park' }]
const check = (name: string, selfId = 'g1') => validateGuestName(name, players, guests, selfId)

describe('cleanGuestName', () => {
  it('trims and collapses whitespace', () => expect(cleanGuestName('  Jon   Smith ')).toBe('Jon Smith'))
})

describe('validateGuestName', () => {
  it('accepts a normal name, and keeping or re-casing your own', () => {
    expect(check('John Smith')).toBeNull()
    expect(check('Jon Smith')).toBeNull()
    expect(check('JON SMITH')).toBeNull()
  })
  it('rejects empty and whitespace-only names', () => {
    expect(check('')).toBe('Enter a name.')
    expect(check('   ')).toBe('Enter a name.')
  })
  it('enforces 2 to 40 characters after cleaning', () => {
    expect(check('J')).toMatch(/at least 2/)
    expect(check('x'.repeat(GUEST_NAME_MAX))).toBeNull()
    expect(check('x'.repeat(GUEST_NAME_MAX + 1))).toMatch(/40/)
    expect(check(`  ${'x'.repeat(GUEST_NAME_MAX)}  `)).toBeNull()
  })
  it('rejects control characters', () => expect(check('Jo\u0007n')).toMatch(/special/))
  it('rejects an active player name, ignoring case and spacing', () => {
    expect(check('wendy   mitchell')).toBe('"Wendy Mitchell" is already a player.')
  })
  it('rejects another guest name, ignoring case and spacing', () => {
    expect(check(' riley  PARK ')).toMatch(/Another guest/)
  })
})
