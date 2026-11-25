import { PLAYERS_PER_COURT } from '@/lib/courtAssignment'

// The court assignment editor's board as plain data: building the view, applying an edit
// optimistically, the edit that undoes it, and the checks shown above the board. No React, no I/O.

/** A seat on a court: court_position (0 = top court) and slot (0-3). */
export interface Seat {
  courtPosition: number
  slot: number
}

export interface PlayerRef {
  id: string
  name: string
  avatarUrl: string | null
}

/** One player on the run's board. `seat` null = sitting out. */
export interface BoardEntry extends PlayerRef {
  seat: Seat | null
  seedRank: number
}

export interface BoardCourt {
  position: number
  /** The facility's court number. */
  number: number
  /** Always PLAYERS_PER_COURT long; null = an empty seat. */
  slots: (BoardEntry | null)[]
}

export interface BoardView {
  courts: BoardCourt[]
  tray: BoardEntry[]
}

/** The edits the server knows (lib/courtBoard.ts maps each to an RPC). */
export type BoardEdit =
  | { kind: 'swap'; a: string; b: string }
  /** To a seat, or to sitting out (`to` null). A player not on the board is added. */
  | { kind: 'move'; player: PlayerRef; to: Seat | null }
  /** Off the board entirely: only ever the undo of adding someone. */
  | { kind: 'drop'; playerId: string }

/** Where a dragged player was dropped (desktop drag and drop). */
export type DropTarget = { kind: 'player'; id: string } | { kind: 'seat'; seat: Seat } | { kind: 'tray' }

export const sameSeat = (a: Seat | null, b: Seat | null) =>
  a === b || (!!a && !!b && a.courtPosition === b.courtPosition && a.slot === b.slot)

const bySeed = (a: BoardEntry, b: BoardEntry) => a.seedRank - b.seedRank || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)

/** Courts in facility order (top first), each with its four seats, and the tray in seed order. */
export function buildBoardView(entries: BoardEntry[], courtOrder: number[]): BoardView {
  const courts: BoardCourt[] = courtOrder.map((number, position) => ({
    position,
    number,
    slots: Array.from({ length: PLAYERS_PER_COURT }, () => null),
  }))
  const tray: BoardEntry[] = []
  for (const e of [...entries].sort(bySeed)) {
    const court = e.seat ? courts[e.seat.courtPosition] : undefined
    if (e.seat && court && e.seat.slot >= 0 && e.seat.slot < PLAYERS_PER_COURT && court.slots[e.seat.slot] === null) {
      court.slots[e.seat.slot] = e
    } else {
      tray.push(e) // sitting out (or, defensively, a seat the view cannot show: never hidden)
    }
  }
  return { courts, tray }
}

export interface BoardIssues {
  /** Courts in use but not full: 1 to 3 players. An empty court is just not in use. */
  shortCourts: { number: number; count: number }[]
  /** Players on the board more than once. The database refuses this; the check is a backstop. */
  duplicates: PlayerRef[]
}

export function boardIssues(entries: BoardEntry[], view: BoardView): BoardIssues {
  const shortCourts = view.courts
    .map((c) => ({ number: c.number, count: c.slots.filter(Boolean).length }))
    .filter((c) => c.count > 0 && c.count < PLAYERS_PER_COURT)
  const seen = new Map<string, number>()
  for (const e of entries) seen.set(e.id, (seen.get(e.id) ?? 0) + 1)
  const duplicates = [...seen].filter(([, n]) => n > 1).map(([id]) => entries.find((e) => e.id === id)!)
  return { shortCourts, duplicates }
}

/**
 * The board after an edit, as the server will make it. Returns `entries` itself (same array)
 * when the edit cannot apply here (a player missing, a seat taken), so callers can skip it.
 */
export function applyEdit(entries: BoardEntry[], edit: BoardEdit): BoardEntry[] {
  if (edit.kind === 'swap') {
    const a = entries.find((e) => e.id === edit.a)
    const b = entries.find((e) => e.id === edit.b)
    if (!a || !b || a === b || (!a.seat && !b.seat)) return entries
    return entries.map((e) => (e === a ? { ...e, seat: b.seat } : e === b ? { ...e, seat: a.seat } : e))
  }
  if (edit.kind === 'drop') {
    return entries.some((e) => e.id === edit.playerId) ? entries.filter((e) => e.id !== edit.playerId) : entries
  }
  const current = entries.find((e) => e.id === edit.player.id)
  if (current && sameSeat(current.seat, edit.to)) return entries
  if (edit.to && entries.some((e) => e.id !== edit.player.id && sameSeat(e.seat, edit.to))) return entries
  if (current) return entries.map((e) => (e === current ? { ...e, seat: edit.to } : e))
  const seedRank = entries.reduce((max, e) => Math.max(max, e.seedRank), 0) + 1
  const { id, name, avatarUrl } = edit.player
  return [...entries, { id, name, avatarUrl, seat: edit.to, seedRank }]
}

/** The edit that puts `before` back, for Undo. Null when there is nothing to undo. */
export function inverseEdit(before: BoardEntry[], edit: BoardEdit): BoardEdit | null {
  if (edit.kind === 'swap') return edit
  const id = edit.kind === 'drop' ? edit.playerId : edit.player.id
  const was = before.find((e) => e.id === id)
  if (!was) return edit.kind === 'move' ? { kind: 'drop', playerId: id } : null
  return { kind: 'move', player: was, to: was.seat }
}

/** The toast after an edit: "Swapped Sam and Alex.", "Moved Sam to court 9.", ... */
export function describeEdit(before: BoardEntry[], edit: BoardEdit, courtOrder: number[]): string {
  const name = (id: string) => before.find((e) => e.id === id)?.name ?? 'That player'
  const court = (seat: Seat) => `court ${courtOrder[seat.courtPosition] ?? seat.courtPosition + 1}`
  if (edit.kind === 'swap') return `Swapped ${name(edit.a)} and ${name(edit.b)}.`
  if (edit.kind === 'drop') return `Took ${name(edit.playerId)} off the board.`
  const onBoard = before.some((e) => e.id === edit.player.id)
  if (!edit.to) return `${edit.player.name} is sitting out.`
  return `${onBoard ? 'Moved' : 'Added'} ${edit.player.name} to ${court(edit.to)}.`
}
