import type { CourtData, PlayerScore } from '../types/leaderboard'
import { getTeamOverallRank } from './scoring'

/**
 * Default points, as published on the Rules page (src/content/rules.ts): the 2nd place team on the
 * bottom court gets 1 point and every place above gets 1 more. With 6 courts: Court 6 runners-up 1,
 * Court 6 winners 2, Court 5 runners-up 3, ... Court 1 winners 12. Both partners share the points.
 * The defaults depend on how many courts are in play, so they are rebalanced when that changes.
 */
export const getDefaultTeamPoints = (courtNum: number, teamPlace: 1 | 2, courtCount: number): number =>
  Math.max(1, 2 * courtCount - getTeamOverallRank(courtNum, teamPlace) + 1)

const getCourtDefaultPoints = (courtNum: number, courtCount: number) => ({
  first: getDefaultTeamPoints(courtNum, 1, courtCount),
  second: getDefaultTeamPoints(courtNum, 2, courtCount),
})

const withTeamPoints = (c: CourtData, first: number, second: number): CourtData => ({
  ...c,
  firstPlacePoints: first,
  secondPlacePoints: second,
  slots: c.slots.map((s) => ({ ...s, points: s.teamPlace === 1 ? first : second })),
})

/**
 * After the number of courts changes from `previousCount`, move every court that is still on its
 * default points to the defaults for the new count. Courts whose points were edited keep them.
 */
export function rebalanceDefaultPoints(courts: CourtData[], previousCount: number): CourtData[] {
  if (courts.length === previousCount) return courts
  return courts.map((c) => {
    if (hasCustomPoints(c, previousCount)) return c
    const { first, second } = getCourtDefaultPoints(c.courtNumber, courts.length)
    return withTeamPoints(c, first, second)
  })
}

/**
 * A blank court: 2 slots for the 1st place team, 2 for the 2nd place team. `courtCount` is how many
 * courts are in play including this one (it sets the default points).
 */
export function buildEmptyCourt(courtNum: number, courtCount: number = courtNum): CourtData {
  const { first, second } = getCourtDefaultPoints(courtNum, courtCount)
  const slot = (teamPlace: 1 | 2, playerIndex: 1 | 2, points: number) => ({
    slotId: `c${courtNum}-t${teamPlace}-p${playerIndex}`,
    teamPlace,
    playerIndex,
    playerId: null,
    playerName: null,
    points,
  })
  return {
    courtNumber: courtNum,
    firstPlacePoints: first,
    secondPlacePoints: second,
    slots: [slot(1, 1, first), slot(1, 2, first), slot(2, 1, second), slot(2, 2, second)],
  }
}

export const getSeatedPlayerIds = (courts: CourtData[]): Set<string> => {
  const ids = new Set<string>()
  for (const c of courts) for (const s of c.slots) if (s.playerId) ids.add(s.playerId)
  return ids
}

/** Roster players not seated on any court (attendance is implied by being seated). */
export const getBenchPlayers = (roster: PlayerScore[], courts: CourtData[]): PlayerScore[] => {
  const seated = getSeatedPlayerIds(courts)
  return roster.filter((p) => !seated.has(p.id))
}

/**
 * Seat a player. Uses `targetSlotId` if it names an empty slot, otherwise the first empty slot
 * in court/slot order, appending a new court when every slot is full. No-op if already seated.
 */
export function seatPlayer(
  courts: CourtData[],
  player: Pick<PlayerScore, 'id' | 'name'>,
  targetSlotId?: string | null
): CourtData[] {
  if (getSeatedPlayerIds(courts).has(player.id)) return courts

  let next = courts
  let slotId: string | null = null
  const isEmpty = (id: string) =>
    courts.some((c) => c.slots.some((s) => s.slotId === id && !s.playerId))

  if (targetSlotId && isEmpty(targetSlotId)) {
    slotId = targetSlotId
  } else {
    for (const c of courts) {
      const open = c.slots.find((s) => !s.playerId)
      if (open) {
        slotId = open.slotId
        break
      }
    }
  }

  if (!slotId) {
    const fresh = buildEmptyCourt(courts.length + 1, courts.length + 1)
    next = rebalanceDefaultPoints([...courts, fresh], courts.length)
    slotId = fresh.slots[0].slotId
  }

  return next.map((c) => ({
    ...c,
    slots: c.slots.map((s) =>
      s.slotId === slotId ? { ...s, playerId: player.id, playerName: player.name } : s
    ),
  }))
}

/** True when a court's team points differ from the defaults for `courtCount` courts. */
const hasCustomPoints = (c: CourtData, courtCount: number): boolean => {
  const { first, second } = getCourtDefaultPoints(c.courtNumber, courtCount)
  return c.firstPlacePoints !== first || c.secondPlacePoints !== second
}

/**
 * Clear a player's slot, then trim trailing fully-empty courts (always keeping the first).
 * A trailing empty court whose points were edited is kept, so entered data is never dropped
 * silently; the caller can opt in with `discardCustomPoints` after confirming with the admin.
 */
export function unseatPlayer(
  courts: CourtData[],
  playerId: string,
  options: { discardCustomPoints?: boolean } = {}
): CourtData[] {
  const cleared = courts.map((c) => ({
    ...c,
    slots: c.slots.map((s) => (s.playerId === playerId ? { ...s, playerId: null, playerName: null } : s)),
  }))

  return trimTrailingCourts(cleared, options.discardCustomPoints)
}

/** Drop trailing fully-empty courts (keeping court 1), except ones with edited points. */
function trimTrailingCourts(courts: CourtData[], discardCustomPoints = false): CourtData[] {
  const isTrimmable = (c: CourtData) =>
    c.slots.every((s) => !s.playerId) && (discardCustomPoints || !hasCustomPoints(c, courts.length))

  let end = courts.length
  while (end > 1 && isTrimmable(courts[end - 1])) end--
  return end === courts.length ? courts : rebalanceDefaultPoints(courts.slice(0, end), courts.length)
}

/**
 * Swap the players in two slots, or move a player into an empty slot. Points stay with the
 * slot (team), so players take the points of the slot they land in.
 */
export function moveOrSwapPlayers(courts: CourtData[], fromSlotId: string, toSlotId: string): CourtData[] {
  if (fromSlotId === toSlotId) return courts
  const slots = courts.flatMap((c) => c.slots)
  const from = slots.find((s) => s.slotId === fromSlotId)
  const to = slots.find((s) => s.slotId === toSlotId)
  if (!from?.playerId || !to) return courts

  const moved = courts.map((c) => ({
    ...c,
    slots: c.slots.map((s) => {
      if (s.slotId === fromSlotId) return { ...s, playerId: to.playerId, playerName: to.playerName }
      if (s.slotId === toSlotId) return { ...s, playerId: from.playerId, playerName: from.playerName }
      return s
    }),
  }))
  return to.playerId ? moved : trimTrailingCourts(moved)
}

/** One saved attended row, as stored in weekly_scores (or the demo localStorage copy). */
export interface SavedPlacement {
  playerId: string
  courtNumber?: number | null
  finishOrder?: number | null
  points: number
}

/**
 * Rebuild courts from a week's saved ATTENDED rows. Players who attended but have no usable
 * placement (legacy rows with no court, or a third row in one team) are seated in the next open
 * slots and counted in `unseatedCount` so the UI can ask the admin to verify.
 */
export function buildCourtsFromRecords(
  rows: SavedPlacement[],
  nameOf: (playerId: string) => string
): { courts: CourtData[]; unseatedCount: number } {
  const teams = new Map<string, SavedPlacement[]>()
  const leftovers: SavedPlacement[] = []

  for (const r of rows) {
    const placeable = !!r.courtNumber && (r.finishOrder === 1 || r.finishOrder === 2)
    if (!placeable) {
      leftovers.push(r)
      continue
    }
    const key = `${r.courtNumber}-${r.finishOrder}`
    const team = teams.get(key) ?? []
    if (team.length >= 2) leftovers.push(r)
    else teams.set(key, [...team, r])
  }

  const maxCourt = Math.max(0, ...[...teams.values()].map((t) => t[0].courtNumber as number))
  let courts = Array.from({ length: maxCourt }, (_, i) => buildEmptyCourt(i + 1, maxCourt))

  for (const [key, team] of teams) {
    const [courtNum, place] = key.split('-').map(Number)
    const points = team[0].points
    courts = courts.map((c) => {
      if (c.courtNumber !== courtNum) return c
      const base = place === 1 ? 0 : 2
      return {
        ...c,
        firstPlacePoints: place === 1 ? points : c.firstPlacePoints,
        secondPlacePoints: place === 2 ? points : c.secondPlacePoints,
        slots: c.slots.map((s, idx) => {
          if (s.teamPlace !== place) return s
          const member = team[idx - base]
          return {
            ...s,
            points,
            playerId: member ? member.playerId : null,
            playerName: member ? nameOf(member.playerId) : null,
          }
        }),
      }
    })
  }

  for (const r of leftovers) {
    courts = seatPlayer(courts, { id: r.playerId, name: nameOf(r.playerId) })
  }
  return { courts, unseatedCount: leftovers.length }
}

/** Human-readable warnings for courts that are not full (saving is still allowed). */
export function getCourtWarnings(courts: CourtData[]): string[] {
  const warnings: string[] = []
  for (const c of courts) {
    const n = c.slots.filter((s) => s.playerId).length
    if (n === 0) warnings.push(`Court ${c.courtNumber} is empty.`)
    else if (n < 4) warnings.push(`Court ${c.courtNumber} has ${n} of 4 players.`)
  }
  return warnings
}

export interface WeeklyScoreWrite {
  player_id: string
  week_number: number
  attended: boolean
  court_number: number | null
  finish_order: number | null
  points: number
}

/**
 * Rows to upsert for a week. attended = true exactly for seated players. Every other roster
 * player, and anyone saved earlier this week who is no longer seated and no longer on the
 * roster (e.g. archived), is written as not attended so their stats stay correct.
 */
export function buildSaveRecords(
  courts: CourtData[],
  roster: Pick<PlayerScore, 'id'>[],
  week: number,
  previouslySavedIds: Iterable<string> = []
): WeeklyScoreWrite[] {
  const records: WeeklyScoreWrite[] = []
  const seated = getSeatedPlayerIds(courts)
  const absent = (player_id: string): WeeklyScoreWrite => ({
    player_id,
    week_number: week,
    attended: false,
    court_number: null,
    finish_order: null,
    points: 0,
  })

  for (const c of courts) {
    for (const s of c.slots) {
      if (!s.playerId) continue
      records.push({
        player_id: s.playerId,
        week_number: week,
        attended: true,
        court_number: c.courtNumber,
        finish_order: s.teamPlace,
        points: s.points,
      })
    }
  }

  const written = new Set(seated)
  for (const p of roster) {
    if (!written.has(p.id)) {
      records.push(absent(p.id))
      written.add(p.id)
    }
  }
  for (const id of previouslySavedIds) {
    if (!written.has(id)) {
      records.push(absent(id))
      written.add(id)
    }
  }
  return records
}
