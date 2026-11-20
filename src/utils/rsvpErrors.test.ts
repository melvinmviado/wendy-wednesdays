import { describe, expect, it } from 'vitest'
import { RsvpError } from '../types/rsvp'
import { toRsvpError } from './rsvpErrors'

const ID = '0b9f6f7e-3c1a-4a55-9a41-2f0d5e0a1b11'

describe('toRsvpError', () => {
  it.each([
    ['RV001', 'CUTOFF_PASSED'],
    ['RV002', 'TOKEN_MISMATCH'],
    ['RV003', 'NAME_CLAIMED'],
    ['RV004', 'INVALID_NAME'],
    ['RV006', 'RATE_LIMITED'],
    ['RV007', 'BAD_REQUEST'],
    ['RV008', 'BAD_REQUEST'],
    ['42501', 'FORBIDDEN'],
    ['PGRST202', 'UNAVAILABLE'],
  ])('maps %s to %s', (sqlstate, code) => {
    expect(toRsvpError({ code: sqlstate, message: 'raw db text' }).code).toBe(code)
  })

  it('never shows the raw database message', () => {
    expect(toRsvpError({ code: 'RV001', message: 'RSVPs for this session are closed' }).message).not.toMatch(/session/)
  })

  it('reads the "did you mean" player from the hint and detail', () => {
    const e = toRsvpError({ code: 'RV005', hint: 'Did you mean Wendy Mitchell?', details: ID })
    expect(e.code).toBe('NAME_EXISTS_SUGGESTION')
    expect(e.suggestion).toEqual({ playerId: ID, name: 'Wendy Mitchell' })
    expect(e.message).toContain('Wendy Mitchell')
  })

  it('still reports a name clash when the suggestion is unreadable', () => {
    const e = toRsvpError({ code: 'RV005', hint: 'something else', details: 'not-a-uuid' })
    expect(e.code).toBe('NAME_EXISTS_SUGGESTION')
    expect(e.suggestion).toBeUndefined()
  })

  it('detects a network failure', () => {
    expect(toRsvpError(new TypeError('Failed to fetch')).code).toBe('NETWORK')
    expect(toRsvpError({ message: 'TypeError: NetworkError when attempting to fetch resource.' }).code).toBe('NETWORK')
  })

  it('passes an RsvpError through and falls back to UNKNOWN', () => {
    const own = new RsvpError('BUSY')
    expect(toRsvpError(own)).toBe(own)
    expect(toRsvpError('boom').code).toBe('UNKNOWN')
    expect(toRsvpError(null).code).toBe('UNKNOWN')
  })
})
