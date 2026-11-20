/** Cosmetic player labels. NOT permissions: admin access is separate (see utils/authRole.ts). */
export const PLAYER_ROLES = [
  { key: 'developer', label: 'Developer', badge: 'border-ok/50 text-ok' },
  { key: 'organizer', label: 'Organizer', badge: 'border-gold/50 text-gold' },
] as const

export type PlayerRole = (typeof PLAYER_ROLES)[number]['key']

export function isPlayerRole(value: unknown): value is PlayerRole {
  return PLAYER_ROLES.some((r) => r.key === value)
}

export function roleInfo(key: PlayerRole): (typeof PLAYER_ROLES)[number] {
  return PLAYER_ROLES.find((r) => r.key === key) ?? PLAYER_ROLES[0]
}
