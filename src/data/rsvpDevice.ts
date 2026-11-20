import type { RsvpIdentity } from '../types/rsvp'

// "Who am I on this device": a random token (what the server binds an RSVP to) and the name
// the person last RSVP'd as. Both live in localStorage. Storage can be blocked or full, so every
// access is guarded and the token falls back to the page's lifetime.

const TOKEN_KEY = 'wendy_rsvp_device_token'
const IDENTITY_KEY = 'wendy_rsvp_identity'
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{16,128}$/ // what set_rsvp accepts

let memoryToken: string | null = null

function makeToken(): string {
  const c = globalThis.crypto
  if (c?.randomUUID) return c.randomUUID() // secure contexts only (https or localhost)
  if (c?.getRandomValues) {
    return Array.from(c.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('')
  }
  return Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('')
}

/** This device's token: stored one if valid, else a fresh one that is saved when storage allows. */
export function getDeviceToken(): string {
  try {
    const stored = localStorage.getItem(TOKEN_KEY)
    if (stored && TOKEN_PATTERN.test(stored)) return stored
  } catch {
    // unreadable storage: use the in-memory token below
  }
  if (memoryToken) return memoryToken
  const fresh = makeToken()
  memoryToken = fresh
  try {
    localStorage.setItem(TOKEN_KEY, fresh)
  } catch {
    // not persisted: this device will look new next visit
  }
  return fresh
}

export function loadIdentity(): RsvpIdentity | null {
  try {
    const raw = localStorage.getItem(IDENTITY_KEY)
    if (!raw) return null
    const v = JSON.parse(raw) as Partial<{ kind: string; playerId: unknown; name: unknown }>
    if (typeof v.name !== 'string' || v.name === '') return null
    if (v.kind === 'guest') return { kind: 'guest', name: v.name }
    if (v.kind === 'player' && typeof v.playerId === 'string' && v.playerId !== '') {
      return { kind: 'player', playerId: v.playerId, name: v.name }
    }
  } catch {
    // unreadable or malformed: treat as not remembered
  }
  return null
}

export function saveIdentity(identity: RsvpIdentity | null): void {
  try {
    if (identity) localStorage.setItem(IDENTITY_KEY, JSON.stringify(identity))
    else localStorage.removeItem(IDENTITY_KEY)
  } catch {
    // storage full or blocked: the in-memory state still works for this page load
  }
}

/** Test helper: forget the in-memory fallback token. */
export function resetDeviceMemory(): void {
  memoryToken = null
}
