import { describe, expect, it } from 'vitest'
import { MAX_PLAYER_NAME_LENGTH, validatePlayerName } from './playerName'

const others = [
  { id: '1', name: 'Ann Lee' },
  { id: '2', name: 'Bob' },
]

describe('validatePlayerName', () => {
  it('accepts a fresh name', () => {
    expect(validatePlayerName('  Cara ', others, '3')).toBeNull()
  })

  it('rejects empty and whitespace-only names', () => {
    expect(validatePlayerName('   ', others, '3')).toMatch(/enter a name/i)
  })

  it('rejects names over the limit', () => {
    expect(validatePlayerName('x'.repeat(MAX_PLAYER_NAME_LENGTH + 1), others, '3')).toMatch(/characters/)
    expect(validatePlayerName('x'.repeat(MAX_PLAYER_NAME_LENGTH), others, '3')).toBeNull()
  })

  it('rejects case-insensitive duplicates of other players', () => {
    expect(validatePlayerName(' ann lee', others, '3')).toMatch(/already exists/)
  })

  it('allows keeping or re-casing your own name', () => {
    expect(validatePlayerName('ANN LEE', others, '1')).toBeNull()
  })
})
