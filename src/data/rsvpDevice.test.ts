import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getDeviceToken, loadIdentity, resetDeviceMemory, saveIdentity } from './rsvpDevice'

const PATTERN = /^[A-Za-z0-9_-]{16,128}$/

describe('rsvpDevice', () => {
  beforeEach(() => {
    localStorage.clear()
    resetDeviceMemory()
  })
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('creates a valid token once and then keeps returning it', () => {
    const first = getDeviceToken()
    expect(first).toMatch(PATTERN)
    expect(getDeviceToken()).toBe(first)
    expect(localStorage.getItem('wendy_rsvp_device_token')).toBe(first)
  })

  it('replaces a stored token the server would refuse', () => {
    localStorage.setItem('wendy_rsvp_device_token', 'short')
    expect(getDeviceToken()).toMatch(PATTERN)
  })

  it('still works, for the page lifetime, when storage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    const t = getDeviceToken()
    expect(t).toMatch(PATTERN)
    expect(getDeviceToken()).toBe(t)
    expect(() => saveIdentity({ kind: 'guest', name: 'Gus' })).not.toThrow()
    expect(loadIdentity()).toBeNull()
  })

  it('falls back when randomUUID is missing (insecure context)', () => {
    vi.stubGlobal('crypto', { getRandomValues: (a: Uint8Array) => a.fill(7) })
    expect(getDeviceToken()).toMatch(PATTERN)
  })

  it('remembers a player or a guest, and forgets on null', () => {
    saveIdentity({ kind: 'player', playerId: 'p1', name: 'Ann' })
    expect(loadIdentity()).toEqual({ kind: 'player', playerId: 'p1', name: 'Ann' })
    saveIdentity({ kind: 'guest', name: 'Gus' })
    expect(loadIdentity()).toEqual({ kind: 'guest', name: 'Gus' })
    saveIdentity(null)
    expect(loadIdentity()).toBeNull()
  })

  it('ignores malformed stored identities', () => {
    for (const bad of ['{', '"x"', '{"kind":"player","name":"A"}', '{"kind":"guest","name":""}', '{"kind":"zzz","name":"A"}']) {
      localStorage.setItem('wendy_rsvp_identity', bad)
      expect(loadIdentity()).toBeNull()
    }
  })
})
