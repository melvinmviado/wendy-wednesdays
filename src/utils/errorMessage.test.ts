import { describe, expect, it } from 'vitest'
import { errorMessage } from './errorMessage'

describe('errorMessage', () => {
  it('reads Error, plain-object (Postgrest) and string errors', () => {
    expect(errorMessage(new Error('boom'), 'x')).toBe('boom')
    expect(errorMessage({ message: 'permission denied', code: '42501' }, 'x')).toBe('permission denied')
    expect(errorMessage('offline', 'x')).toBe('offline')
  })

  it('falls back for unknown values', () => {
    expect(errorMessage(null, 'fallback')).toBe('fallback')
    expect(errorMessage({ message: 42 }, 'fallback')).toBe('fallback')
    expect(errorMessage(new Error(''), 'fallback')).toBe('fallback')
  })
})
