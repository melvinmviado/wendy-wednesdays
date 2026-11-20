import { normalizeName } from './rsvpState'

/** Matches the database: guest names are 2 to 40 characters. */
export const GUEST_NAME_MIN = 2
export const GUEST_NAME_MAX = 40

/** Trim and collapse inner whitespace, as the server stores it. */
export const cleanGuestName = (name: string) => name.trim().replace(/\s+/g, ' ')

interface Named {
  id: string
  name: string
}

/**
 * Error message for a guest's new name, or null if it is fine. The server re-checks every rule
 * (and is the authority); this gives instant feedback. `players` is the active roster, `guests`
 * the other guests on the list. `selfId` is the guest being renamed, so keeping or re-casing
 * their own name is allowed.
 */
export function validateGuestName(name: string, players: Named[], guests: Named[], selfId: string): string | null {
  const clean = cleanGuestName(name)
  if (!clean) return 'Enter a name.'
  if (clean.length < GUEST_NAME_MIN) return `Use at least ${GUEST_NAME_MIN} characters.`
  if (clean.length > GUEST_NAME_MAX) return `Keep the name to ${GUEST_NAME_MAX} characters or fewer.`
  if (/[\u0000-\u001f\u007f]/.test(clean)) return 'Remove special characters from the name.'
  const key = normalizeName(clean)
  const player = players.find((p) => normalizeName(p.name) === key)
  if (player) return `"${player.name}" is already a player.`
  if (guests.some((g) => g.id !== selfId && normalizeName(g.name) === key)) return 'Another guest on the list already has that name.'
  return null
}
