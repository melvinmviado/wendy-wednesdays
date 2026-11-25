// GENERATED from src/lib/courtAssignment.ts by scripts/sync-functions-shared.mjs. Do not edit this copy:
// edit the source, then run `npm run sync:functions`.

// Starting courts: who starts the night on which court, from the season ranks and the RSVP list.
// Pure and framework-free (no React, no Supabase, no imports at all), so the app, the tests and a
// Supabase Edge Function (Deno) can run the same code. Deterministic: the same players give the
// same result in any input order.

export const PLAYERS_PER_COURT = 4

export type SitOutReason = 'remainder' | 'overflow'

export interface AssignmentPlayer {
  id: string
  /** Season rank, 1 = best. Tied players share a rank. null = unranked (no results yet). */
  rank: number | null
  /** When they RSVP'd: an ISO 8601 instant. Postgres microseconds are kept. */
  rsvpAt: string
}

export interface CourtGroup {
  /** 0 = top court. */
  courtPosition: number
  /** The facility's number for that court. */
  courtNumber: number
  /** Best seed first; the index is the slot (0-3). */
  playerIds: string[]
}

export interface SittingOut {
  playerId: string
  /** 'remainder': no foursome left to join. 'overflow': a full foursome with no court left for it. */
  reason: SitOutReason
}

export interface StartingAssignment {
  courts: CourtGroup[]
  /** Best seed first. */
  sittingOut: SittingOut[]
}

function assertCourtNumber(label: string, n: number): void {
  if (!Number.isSafeInteger(n) || n < 1) {
    throw new RangeError(`The ${label} court must be a whole number of 1 or more, got ${n}`)
  }
}

/**
 * The facility's court numbers from the top court down to the bottom one, in either direction:
 * (10, 4) -> [10, 9, ..., 4] and (4, 10) -> [4, 5, ..., 10]. Same rules as event_court_settings:
 * positive whole numbers, |top - bottom| + 1 courts.
 */
export function buildCourtOrder(top: number, bottom: number): number[] {
  assertCourtNumber('top', top)
  assertCourtNumber('bottom', bottom)
  const step = bottom >= top ? 1 : -1
  return Array.from({ length: Math.abs(bottom - top) + 1 }, (_, i) => top + i * step)
}

/** Microseconds since the epoch. Date.parse keeps only milliseconds; Postgres timestamps carry six digits. */
function rsvpMicros(player: AssignmentPlayer): number {
  const ms = Date.parse(player.rsvpAt)
  if (Number.isNaN(ms)) throw new RangeError(`Player ${player.id} has an unreadable rsvpAt: "${player.rsvpAt}"`)
  const fraction = /\.(\d+)/.exec(player.rsvpAt)?.[1] ?? ''
  return ms * 1000 + Number(fraction.slice(3, 6).padEnd(3, '0'))
}

/** Unranked after every ranked player. */
const compareRank = (a: number | null, b: number | null): number =>
  a === b ? 0 : a === null ? 1 : b === null ? -1 : a - b

/** Plain code-unit order: localeCompare would depend on the runtime's locale. */
const compareIds = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)

/** Players best seed first: rank ascending (unranked last), then earliest RSVP, then id. Throws on bad input. */
function seedOrder(players: AssignmentPlayer[]): AssignmentPlayer[] {
  const seen = new Set<string>()
  const keyed = players.map((player) => {
    if (typeof player.id !== 'string' || player.id === '') throw new RangeError('Every player needs an id')
    if (seen.has(player.id)) throw new RangeError(`Player ${player.id} is listed twice`)
    seen.add(player.id)
    if (player.rank !== null && (!Number.isSafeInteger(player.rank) || player.rank < 1)) {
      throw new RangeError(`Player ${player.id} has rank ${player.rank}; use a whole number from 1, or null`)
    }
    return { player, at: rsvpMicros(player) }
  })
  keyed.sort(
    (a, b) => compareRank(a.player.rank, b.player.rank) || a.at - b.at || compareIds(a.player.id, b.player.id)
  )
  return keyed.map((k) => k.player)
}

/**
 * Seeds the confirmed players onto courts, best first: the top four on the top court
 * (courtOrder[0]), the next four on the next, and so on. Only full courts of four are used.
 * The lowest seeds sit out: the last n % 4 as 'remainder', and any full foursomes above them
 * that ran out of courts as 'overflow' (so overflow always comes in fours).
 *
 * Seed rank (1-based) is the order of the result: every court's playerIds in court order,
 * then sittingOut.
 */
export function generateStartingAssignment(input: {
  players: AssignmentPlayer[]
  courtOrder: number[]
}): StartingAssignment {
  const { players, courtOrder } = input
  const seenCourts = new Set<number>()
  for (const n of courtOrder) {
    assertCourtNumber('listed', n)
    if (seenCourts.has(n)) throw new RangeError(`Court ${n} is listed twice`)
    seenCourts.add(n)
  }

  const seeded = seedOrder(players)
  const courtCount = Math.min(Math.floor(seeded.length / PLAYERS_PER_COURT), courtOrder.length)
  const courts = courtOrder.slice(0, courtCount).map((courtNumber, courtPosition) => ({
    courtPosition,
    courtNumber,
    playerIds: seeded
      .slice(courtPosition * PLAYERS_PER_COURT, (courtPosition + 1) * PLAYERS_PER_COURT)
      .map((p) => p.id),
  }))

  const rest = seeded.slice(courtCount * PLAYERS_PER_COURT)
  const overflowCount = rest.length - (seeded.length % PLAYERS_PER_COURT)
  const sittingOut = rest.map(
    (p, i): SittingOut => ({ playerId: p.id, reason: i < overflowCount ? 'overflow' : 'remainder' })
  )
  return { courts, sittingOut }
}
