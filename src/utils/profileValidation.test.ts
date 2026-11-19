import { describe, expect, it } from 'vitest'
import { validateAvatarBlob, validateAvatarFile, validateDisplayName } from './profileValidation'

describe('validateDisplayName', () => {
  it('rejects blank and whitespace-only names', () => {
    expect(validateDisplayName('')).toMatch(/enter/i)
    expect(validateDisplayName('   ')).toMatch(/enter/i)
  })
  it('accepts 1 to 60 characters, trimmed', () => {
    expect(validateDisplayName(' A ')).toBeNull()
    expect(validateDisplayName('x'.repeat(60))).toBeNull()
  })
  it('rejects more than 60', () => expect(validateDisplayName('x'.repeat(61))).toMatch(/60/))
})

describe('validateAvatarFile', () => {
  it.each(['image/jpeg', 'image/png', 'image/webp'])('accepts %s', (type) => {
    expect(validateAvatarFile({ type, size: 1000 })).toBeNull()
  })
  it.each(['image/svg+xml', 'image/gif', 'application/pdf', ''])('rejects type "%s"', (type) => {
    expect(validateAvatarFile({ type, size: 1000 })).toMatch(/JPEG, PNG or WebP/)
  })
  it('rejects files over 5 MB', () => {
    expect(validateAvatarFile({ type: 'image/png', size: 5 * 1024 * 1024 + 1 })).toMatch(/5 MB/)
    expect(validateAvatarFile({ type: 'image/png', size: 5 * 1024 * 1024 })).toBeNull()
  })
})

describe('validateAvatarBlob', () => {
  it('enforces the 2 MB bucket limit', () => {
    expect(validateAvatarBlob({ size: 2 * 1024 * 1024 })).toBeNull()
    expect(validateAvatarBlob({ size: 2 * 1024 * 1024 + 1 })).toMatch(/too large/i)
  })
})
