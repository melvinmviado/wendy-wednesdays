import { PLAYERS_PER_COURT } from '@/lib/courtAssignment'
import type { PublicSeat } from '@/lib/publicCourtBoard'

// The public Court Board as plain data: courts in physical order, the signed-in player's place,
// the search filter, and the "Copy as text" message. No React, no I/O.

export interface PublicCourt {
  position: number
  /** The facility's court number. */
  number: number
  /** PLAYERS_PER_COURT long, by slot; null = an open seat. */
  seats: (PublicSeat | null)[]
}

export interface PublicView {
  /** Top court first. Courts nobody is on are not listed. */
  courts: PublicCourt[]
  alternates: PublicSeat[]
}

const bySeed = (a: PublicSeat, b: PublicSeat) => a.seedRank - b.seedRank

export function groupBoard(seats: PublicSeat[]): PublicView {
  const courts = new Map<number, PublicCourt>()
  const alternates: PublicSeat[] = []
  for (const s of [...seats].sort(bySeed)) {
    if (s.courtPosition === null || s.courtNumber === null || s.slot === null) {
      alternates.push(s)
      continue
    }
    let court = courts.get(s.courtPosition)
    if (!court) {
      court = { position: s.courtPosition, number: s.courtNumber, seats: Array.from({ length: PLAYERS_PER_COURT }, () => null) }
      courts.set(s.courtPosition, court)
    }
    if (s.slot >= 0 && s.slot < PLAYERS_PER_COURT && !court.seats[s.slot]) court.seats[s.slot] = s
    else alternates.push(s) // never hide a player
  }
  return { courts: [...courts.values()].sort((a, b) => a.position - b.position), alternates }
}

export type MyPlace =
  | { kind: 'court'; court: PublicCourt; partners: PublicSeat[] }
  | { kind: 'alternate'; seat: PublicSeat }
  | null

/** Where the signed-in player is tonight: their court and its other three, or the alternates. */
export function findMine(view: PublicView, playerId: string | null): MyPlace {
  if (!playerId) return null
  for (const court of view.courts) {
    if (court.seats.some((s) => s?.playerId === playerId)) {
      return { kind: 'court', court, partners: court.seats.filter((s): s is PublicSeat => !!s && s.playerId !== playerId) }
    }
  }
  const seat = view.alternates.find((s) => s.playerId === playerId)
  return seat ? { kind: 'alternate', seat } : null
}

const norm = (s: string) => s.toLocaleLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').trim()

/** Courts and alternates with a player whose name contains `query` (accents and case ignored). */
export function filterView(view: PublicView, query: string): { view: PublicView; matches: Set<string> } {
  const q = norm(query)
  if (!q) return { view, matches: new Set() }
  const hit = (s: PublicSeat | null) => !!s && norm(s.name).includes(q)
  const matches = new Set<string>()
  for (const s of [...view.courts.flatMap((c) => c.seats), ...view.alternates]) if (s && hit(s)) matches.add(s.playerId)
  return {
    view: { courts: view.courts.filter((c) => c.seats.some(hit)), alternates: view.alternates.filter(hit) },
    matches,
  }
}

/** For the group chat: a title line, one line per court, the alternates, and the link. */
export function boardAsText(view: PublicView, title: string, url: string): string {
  const lines = [title]
  for (const c of view.courts) lines.push(`Court ${c.number}: ${c.seats.map((s) => s?.name ?? '(open)').join(', ')}`)
  if (view.alternates.length) lines.push(`Sitting out: ${view.alternates.map((s) => s.name).join(', ')}`)
  lines.push(url)
  return lines.join('\n')
}
