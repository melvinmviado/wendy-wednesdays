export const MAX_PLAYER_NAME_LENGTH = 40

/**
 * Returns an error message for an invalid player name, or null if it is fine.
 * `others` is every other ACTIVE player; the unique index in the database enforces the same rule.
 */
export function validatePlayerName(name: string, others: { id: string; name: string }[], selfId: string): string | null {
  const trimmed = name.trim()
  if (!trimmed) return 'Enter a name.'
  if (trimmed.length > MAX_PLAYER_NAME_LENGTH) {
    return `Keep the name to ${MAX_PLAYER_NAME_LENGTH} characters or fewer.`
  }
  const key = trimmed.toLowerCase()
  if (others.some((p) => p.id !== selfId && p.name.trim().toLowerCase() === key)) {
    return `A player named "${trimmed}" already exists.`
  }
  return null
}
