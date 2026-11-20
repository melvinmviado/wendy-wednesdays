import { initialPlayers } from './leaderboardData'
import { PLAYERS_STORAGE_KEY } from './players'
import type { PlayerScore } from '../types/leaderboard'
import {
  RsvpError,
  type AdminAddGuestArgs,
  type AdminGuestRemoveResult,
  type AdminRsvpArgs,
  type AdminRsvpResult,
  type MyRsvp,
  type RsvpApi,
  type RsvpRosterEntry,
  type RsvpServerState,
  type RsvpStatus,
  type SetRsvpResult,
} from '../types/rsvp'
import { CAPACITY, getScheduleTimestamps, getSessionDate, getWaitlistPosition, isOpenSessionDate } from '../utils/rsvpSchedule'
import { normalizeName, splitCounts } from '../utils/rsvpState'

// Demo mode (no Supabase): the same rules as the SQL functions, kept in memory. Nothing
// is persisted, so a reload starts the week over with the seeded list.

const MAX_PER_DEVICE = 3
const MAX_GUESTS = 8
const SEED_GUESTS = ['Riley Park', 'Jamie Ortiz']

interface Row {
  id: string
  playerId: string | null
  name: string
  token: string | null
  status: RsvpStatus
  queuedAt: number
}

export interface DemoRsvpOptions {
  now?: () => Date
  capacity?: number
  /** How many roster players start out as "in" (default 9). */
  seedPlayers?: number
  /** The roster to RSVP against. Defaults to the demo leaderboard roster. */
  players?: () => Pick<PlayerScore, 'id' | 'name'>[]
}

function demoRoster(): Pick<PlayerScore, 'id' | 'name'>[] {
  try {
    const raw = localStorage.getItem(PLAYERS_STORAGE_KEY)
    if (raw) return (JSON.parse(raw) as PlayerScore[]).filter((p) => !p.archivedAt)
  } catch {
    // fall through to the seed roster
  }
  return initialPlayers
}

export function createDemoRsvpApi(options: DemoRsvpOptions = {}): RsvpApi {
  const now = options.now ?? (() => new Date())
  const capacity = options.capacity ?? CAPACITY
  const seedPlayers = options.seedPlayers ?? 9
  const players = options.players ?? demoRoster
  const sessions = new Map<string, Row[]>()
  let seq = 0

  // Each session date gets its own list, seeded on first use, so the weekly rollover just works.
  const rowsFor = (date: string): Row[] => {
    let rows = sessions.get(date)
    if (!rows) {
      const seeded = players().slice(0, seedPlayers).map((p) => ({ playerId: p.id, name: p.name }))
      rows = [...seeded, ...SEED_GUESTS.map((name) => ({ playerId: null, name }))].map((p) => ({
        id: `demo-${seq}`,
        ...p,
        token: null, // unbound: the first device to tap a name takes it, like the real thing
        status: 'in' as const,
        queuedAt: seq++,
      }))
      sessions.set(date, rows)
    }
    return rows
  }

  /** The run an admin write targets. An explicit date that is no longer open is refused, as the server does (RV007). */
  const openDate = (sessionDate: string | null | undefined): string => {
    if (!sessionDate) return getSessionDate(now())
    if (!isOpenSessionDate(sessionDate, now())) throw new RsvpError('BAD_REQUEST')
    return sessionDate
  }

  const queue = (rows: Row[]) => {
    const positions = new Map<string, number>()
    rows
      .filter((r) => r.status === 'in')
      .sort((a, b) => a.queuedAt - b.queuedAt)
      .forEach((r, i) => positions.set(r.id, i + 1))
    return positions
  }

  const toMine = (r: Row, q: Map<string, number>): MyRsvp => ({
    rsvpId: r.id,
    playerId: r.playerId,
    name: r.name,
    isGuest: r.playerId === null,
    status: r.status,
    position: q.get(r.id) ?? null,
  })

  return {
    async getState(token): Promise<RsvpServerState> {
      const t = now()
      const sessionDate = getSessionDate(t)
      const rows = rowsFor(sessionDate)
      const q = queue(rows)
      const mine = rows.filter((r) => r.token === token).sort((a, b) => a.queuedAt - b.queuedAt).map((r) => toMine(r, q))
      return {
        sessionDate,
        capacity,
        ...getScheduleTimestamps(sessionDate),
        serverNow: t,
        ...splitCounts(q.size, capacity),
        myStatus: mine[0]?.status ?? null,
        myPosition: mine[0]?.position ?? null,
        myRsvps: mine,
      }
    },

    async getRoster(): Promise<RsvpRosterEntry[]> {
      const rows = rowsFor(getSessionDate(now()))
      const q = queue(rows)
      return rows
        .map((r) => ({
          rsvpId: r.id,
          name: r.name,
          avatarUrl: null,
          playerId: r.playerId,
          isGuest: r.playerId === null,
          status: r.status,
          position: q.get(r.id) ?? null,
        }))
        .sort((a, b) => (a.status === b.status ? (a.position ?? 0) - (b.position ?? 0) : a.status === 'in' ? -1 : 1))
    },

    async setRsvp({ identity, status, token }): Promise<SetRsvpResult> {
      const t = now()
      const sessionDate = getSessionDate(t)
      if (t >= getScheduleTimestamps(sessionDate).cutoffAt) throw new RsvpError('CUTOFF_PASSED')
      const rows = rowsFor(sessionDate)

      let row: Row | undefined
      let guestName = ''
      if (identity.kind === 'player') {
        if (!players().some((p) => p.id === identity.playerId)) throw new RsvpError('NAME_CLAIMED')
        row = rows.find((r) => r.playerId === identity.playerId)
      } else {
        guestName = identity.name.trim().replace(/\s+/g, ' ')
        if (guestName.length < 2 || guestName.length > 40 || /[\u0000-\u001f\u007f]/.test(guestName)) {
          throw new RsvpError('INVALID_NAME')
        }
        const match = players().find((p) => normalizeName(p.name) === normalizeName(guestName))
        if (match) {
          throw new RsvpError('NAME_EXISTS_SUGGESTION', {
            message: `That name is already a player. Did you mean ${match.name}?`,
            suggestion: { playerId: match.id, name: match.name },
          })
        }
        row = rows.find((r) => r.playerId === null && normalizeName(r.name) === normalizeName(guestName))
      }

      if (row && row.token !== null && row.token !== token) throw new RsvpError('TOKEN_MISMATCH')

      if (!row) {
        if (status === 'out') return { rsvpId: null, status: null, position: null, waitlistPosition: null }
        if (rows.filter((r) => r.token === token).length >= MAX_PER_DEVICE) throw new RsvpError('RATE_LIMITED')
        if (identity.kind === 'guest' && rows.filter((r) => r.playerId === null && r.status === 'in').length >= MAX_GUESTS) {
          throw new RsvpError('RATE_LIMITED')
        }
        row = {
          id: `demo-${seq}`,
          playerId: identity.kind === 'player' ? identity.playerId : null,
          name: identity.kind === 'player' ? identity.name : guestName,
          token,
          status: 'in',
          queuedAt: seq++,
        }
        rows.push(row)
      } else {
        row.token ??= token
        if (row.status !== status) {
          row.status = status
          if (status === 'in') row.queuedAt = seq++ // rejoining goes to the back of the line
        }
      }

      const position = queue(rows).get(row.id) ?? null
      return { rsvpId: row.id, status: row.status, position, waitlistPosition: position === null ? null : getWaitlistPosition(position, capacity) }
    },

    // Admin calls skip the cutoff, device tokens and caps, as the SQL functions do. Demo mode has
    // no real admin check; the UI only offers these to the demo admin.
    async adminAddRsvp({ playerId, sessionDate }: AdminRsvpArgs): Promise<AdminRsvpResult> {
      const date = openDate(sessionDate)
      const player = players().find((p) => p.id === playerId)
      if (!player) throw new RsvpError('PLAYER_UNAVAILABLE')
      const rows = rowsFor(date)
      let row = rows.find((r) => r.playerId === playerId)
      let changed = false
      if (!row) {
        row = { id: `demo-${seq}`, playerId, name: player.name, token: null, status: 'in', queuedAt: seq++ }
        rows.push(row)
        changed = true
      } else if (row.status === 'out') {
        row.status = 'in'
        row.queuedAt = seq++ // back of the line, like a rejoin
        changed = true
      }
      const position = queue(rows).get(row.id) ?? null
      return {
        rsvpId: row.id,
        sessionDate: date,
        status: row.status,
        changed,
        position,
        waitlistPosition: position === null ? null : getWaitlistPosition(position, capacity),
      }
    },

    async adminRemoveRsvp({ playerId, sessionDate }: AdminRsvpArgs): Promise<AdminRsvpResult> {
      const date = openDate(sessionDate)
      const row = rowsFor(date).find((r) => r.playerId === playerId)
      const changed = row?.status === 'in'
      if (row && changed) row.status = 'out'
      return { rsvpId: row?.id ?? null, sessionDate: date, status: row?.status ?? null, changed, position: null, waitlistPosition: null }
    },

    // Same name rules as set_rsvp; admins skip the guest cap. An unbound row, like the SQL's.
    async adminAddGuest({ name, sessionDate }: AdminAddGuestArgs): Promise<AdminRsvpResult> {
      const date = openDate(sessionDate)
      const guestName = name.trim().replace(/\s+/g, ' ')
      if (guestName.length < 2 || guestName.length > 40 || /[\u0000-\u001f\u007f]/.test(guestName)) throw new RsvpError('INVALID_NAME')
      const match = players().find((p) => normalizeName(p.name) === normalizeName(guestName))
      if (match) {
        throw new RsvpError('NAME_EXISTS_SUGGESTION', {
          message: `That name is already a player. Did you mean ${match.name}?`,
          suggestion: { playerId: match.id, name: match.name },
        })
      }
      const rows = rowsFor(date)
      let row = rows.find((r) => r.playerId === null && normalizeName(r.name) === normalizeName(guestName))
      let changed = false
      if (!row) {
        row = { id: `demo-${seq}`, playerId: null, name: guestName, token: null, status: 'in', queuedAt: seq++ }
        rows.push(row)
        changed = true
      } else if (row.status === 'out') {
        row.status = 'in'
        row.queuedAt = seq++
        changed = true
      }
      const position = queue(rows).get(row.id) ?? null
      return {
        rsvpId: row.id,
        sessionDate: date,
        status: row.status,
        changed,
        position,
        waitlistPosition: position === null ? null : getWaitlistPosition(position, capacity),
      }
    },

    // Deletes the row (not 'out'), as admin_remove_guest_rsvp does. Unknown id: success, nothing changed.
    async adminRemoveGuest(guestId: string): Promise<AdminGuestRemoveResult> {
      for (const [date, rows] of sessions) {
        const i = rows.findIndex((r) => r.id === guestId)
        if (i < 0) continue
        if (rows[i].playerId !== null) throw new RsvpError('BAD_REQUEST') // a player's RSVP, not a guest's
        if (!isOpenSessionDate(date, now())) throw new RsvpError('BAD_REQUEST')
        rows.splice(i, 1)
        return { rsvpId: guestId, sessionDate: date, changed: true }
      }
      return { rsvpId: guestId, sessionDate: null, changed: false }
    },
  }
}
