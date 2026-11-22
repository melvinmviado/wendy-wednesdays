import { RsvpError } from '../types/rsvp'

interface ErrorLike {
  code?: unknown
  message?: unknown
  hint?: unknown
  details?: unknown
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const NETWORK_TEXT = /failed to fetch|networkerror|network request failed|load failed/i

/**
 * Turns anything a Supabase call can throw or return into an RsvpError. The RV00x SQLSTATEs are
 * the ones raised by set_rsvp (20261124000000_rsvps.sql); RV005 carries the "did you mean"
 * player in HINT ("Did you mean <name>?") and DETAIL (the player id).
 */
export function toRsvpError(e: unknown): RsvpError {
  if (e instanceof RsvpError) return e
  const o: ErrorLike = typeof e === 'object' && e !== null ? (e as ErrorLike) : {}
  const code = typeof o.code === 'string' ? o.code : ''
  const message = typeof o.message === 'string' ? o.message : ''

  switch (code) {
    case 'RV001':
      return new RsvpError('CUTOFF_PASSED')
    case 'RV009':
      return new RsvpError('NOT_OPEN_YET')
    case 'RV002':
      return new RsvpError('TOKEN_MISMATCH')
    case 'RV003':
      return new RsvpError('NAME_CLAIMED')
    case 'RV004':
      return new RsvpError('INVALID_NAME')
    case 'RV005': {
      const name = typeof o.hint === 'string' ? /^Did you mean (.+)\?$/.exec(o.hint)?.[1] : undefined
      const playerId = typeof o.details === 'string' && UUID.test(o.details) ? o.details : undefined
      if (!name || !playerId) return new RsvpError('NAME_EXISTS_SUGGESTION')
      return new RsvpError('NAME_EXISTS_SUGGESTION', {
        message: `That name is already a player. Did you mean ${name}?`,
        suggestion: { playerId, name },
      })
    }
    case 'RV010':
      return new RsvpError('NAME_ON_LIST')
    case 'P0002': // admin rename / convert: the row is gone
      return new RsvpError('GUEST_GONE')
    case 'RV006':
      return new RsvpError('RATE_LIMITED')
    case 'RV011': // 20261204000000_rsvp_abuse_limits.sql
      return new RsvpError('ADDED_BY_ORGANIZER')
    case 'RV012':
      return new RsvpError('RATE_LIMITED', { message: 'Too many RSVPs from this network. Ask an admin for help.' })
    case 'RV007':
    case 'RV008':
      return new RsvpError('BAD_REQUEST')
    case '55000': // admin guest removal pointed at a player's RSVP
      return new RsvpError('BAD_REQUEST')
    case '42501':
      return new RsvpError('FORBIDDEN')
    case 'PGRST202': // function not found: the migration has not been applied
    case '42883':
      return new RsvpError('UNAVAILABLE')
  }
  if (e instanceof TypeError || NETWORK_TEXT.test(message)) return new RsvpError('NETWORK')
  return new RsvpError('UNKNOWN')
}
