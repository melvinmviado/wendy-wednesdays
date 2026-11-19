import { describe, expect, it } from 'vitest'
import type { CourtData, PlayerScore } from '../types/leaderboard'
import {
  buildCourtsFromRecords,
  buildSaveRecords,
  getCourtWarnings,
  getSeatedPlayerIds,
  moveOrSwapPlayers,
  seatPlayer,
  unseatPlayer,
} from './weeklyEntry'

const roster = (n: number): PlayerScore[] =>
  Array.from({ length: n }, (_, i) => ({ id: `${i + 1}`, name: `P${i + 1}`, totalPoints: 0, weeksPlayed: 0 }))
const seatRoster = (players: PlayerScore[], start: CourtData[] = []) =>
  players.reduce((c, p) => seatPlayer(c, p), start)
const attended = (courts: CourtData[], players: PlayerScore[], week = 1) =>
  buildSaveRecords(courts, players, week).filter((r) => r.attended)

describe('weekly entry scenarios', () => {
  it('12 players: 3 full courts with default points 10/9, 8/7, 6/5 and no warnings', () => {
    const r = roster(12)
    const courts = seatRoster(r)
    expect(courts).toHaveLength(3)
    expect(getCourtWarnings(courts)).toEqual([])
    const recs = attended(courts, r)
    expect(recs).toHaveLength(12)
    expect(recs.map((x) => x.points)).toEqual([10, 10, 9, 9, 8, 8, 7, 7, 6, 6, 5, 5])
    expect(recs.map((x) => x.finish_order)).toEqual([1, 1, 2, 2, 1, 1, 2, 2, 1, 1, 2, 2])
  })

  it('13 players: a 4th court with one player, warned about but still saved', () => {
    const r = roster(13)
    const courts = seatRoster(r)
    expect(courts).toHaveLength(4)
    expect(getCourtWarnings(courts)).toEqual(['Court 4 has 1 of 4 players.'])
    expect(attended(courts, r)).toHaveLength(13)
  })

  it('5 players: 2 courts, the second holding one player', () => {
    const courts = seatRoster(roster(5))
    expect(courts).toHaveLength(2)
    expect(getCourtWarnings(courts)).toEqual(['Court 2 has 1 of 4 players.'])
  })

  it('removing a seated player after points were entered keeps the points and marks them absent', () => {
    const r = roster(5)
    const courts = seatRoster(r).map((c) =>
      c.courtNumber === 2
        ? { ...c, firstPlacePoints: 20, slots: c.slots.map((s) => (s.teamPlace === 1 ? { ...s, points: 20 } : s)) }
        : c
    )
    const after = unseatPlayer(courts, '5')
    expect(after).toHaveLength(2) // court 2 is kept: its points were edited
    expect(after[1].firstPlacePoints).toBe(20)
    const recs = buildSaveRecords(after, r, 1)
    expect(recs.find((x) => x.player_id === '5')).toMatchObject({ attended: false, points: 0, court_number: null })
    expect(recs.filter((x) => x.attended)).toHaveLength(4)
    // removing someone from a middle court never drops a court
    expect(unseatPlayer(seatRoster(roster(9)), '1')).toHaveLength(3)
  })

  it('swapping across courts exchanges players while points stay with the slots', () => {
    const courts = seatRoster(roster(8))
    const after = moveOrSwapPlayers(courts, 'c1-t1-p1', 'c2-t2-p2')
    expect(after[0].slots[0]).toMatchObject({ playerId: '8', points: 10 })
    expect(after[1].slots[3]).toMatchObject({ playerId: '1', points: 7 })
    expect(getSeatedPlayerIds(after).size).toBe(8)
  })

  it('editing a saved week: remove one, add one, and exactly those rows change', () => {
    const r = roster(6)
    const saved = attended(seatRoster(r.slice(0, 4)), r)
    const { courts, unseatedCount } = buildCourtsFromRecords(
      saved.map((x) => ({
        playerId: x.player_id,
        courtNumber: x.court_number,
        finishOrder: x.finish_order,
        points: x.points,
      })),
      (id) => `P${id}`
    )
    expect(unseatedCount).toBe(0)
    const edited = seatPlayer(unseatPlayer(courts, '2'), r[4])
    const recs = buildSaveRecords(edited, r, 1, saved.map((x) => x.player_id))
    const byId = Object.fromEntries(recs.map((x) => [x.player_id, x.attended]))
    expect(byId).toEqual({ '1': true, '5': true, '3': true, '4': true, '2': false, '6': false })
  })

  it('legacy week: attended rows with no court are seated and counted for the notice', () => {
    const { courts, unseatedCount } = buildCourtsFromRecords(
      [
        { playerId: '1', courtNumber: 1, finishOrder: 1, points: 10 },
        { playerId: '2', courtNumber: null, finishOrder: null, points: 0 },
        { playerId: '3', courtNumber: null, finishOrder: null, points: 0 },
      ],
      (id) => `P${id}`
    )
    expect(unseatedCount).toBe(2)
    expect(getSeatedPlayerIds(courts)).toEqual(new Set(['1', '2', '3']))
  })

  it('quick-add seats the new player in the next open slot, adding a court when all are full', () => {
    const after = seatPlayer(seatRoster(roster(4)), { id: 'new', name: 'Newbie' })
    expect(after).toHaveLength(2)
    expect(after[1].slots[0]).toMatchObject({ playerId: 'new', playerName: 'Newbie' })
  })
})

describe('parity with the previous save logic', () => {
  type Row = { player_id: string; attended: boolean; court_number: number | null; finish_order: number | null; points: number }
  const absent = (id: string): Row => ({ player_id: id, attended: false, court_number: null, finish_order: null, points: 0 })

  // The previous handleSaveWeek row logic, reproduced as a reference.
  const oldRecords = (courts: CourtData[], checkedIn: Set<string>, players: PlayerScore[]): Row[] => {
    const out: Row[] = []
    const placed = new Set<string>()
    courts.forEach((c) =>
      c.slots.forEach((s) => {
        if (!s.playerId) return
        placed.add(s.playerId)
        out.push({ player_id: s.playerId, attended: true, court_number: c.courtNumber, finish_order: s.teamPlace, points: s.points })
      })
    )
    players
      .filter((p) => checkedIn.has(p.id) && !placed.has(p.id))
      .forEach((p) => out.push({ ...absent(p.id), attended: true }))
    players.filter((p) => !checkedIn.has(p.id)).forEach((p) => out.push(absent(p.id)))
    return out
  }
  const sorted = (rows: Row[]) => [...rows].sort((a, b) => Number(a.player_id) - Number(b.player_id))
  const current = (courts: CourtData[], players: PlayerScore[]): Row[] =>
    buildSaveRecords(courts, players, 1).map((r) => ({
      player_id: r.player_id,
      attended: r.attended,
      court_number: r.court_number,
      finish_order: r.finish_order,
      points: r.points,
    }))

  it.each([4, 5, 12, 13])('writes identical rows for %i players when every checked-in player is seated', (n) => {
    const r = roster(n)
    const courts = seatRoster(r)
    const old = oldRecords(courts, new Set(r.map((p) => p.id)), r)
    expect(sorted(current(courts, r))).toEqual(sorted(old))
  })

  it('writes identical rows when only some of the roster attended', () => {
    const r = roster(10)
    const some = r.slice(0, 6)
    const courts = seatRoster(some)
    const old = oldRecords(courts, new Set(some.map((p) => p.id)), r)
    expect(sorted(current(courts, r))).toEqual(sorted(old))
  })

  it('differs only for the retired "attended but benched" state', () => {
    const r = roster(6)
    const courts = seatRoster(r.slice(0, 4))
    const old = oldRecords(courts, new Set(r.map((p) => p.id)), r) // players 5 and 6 benched
    const now = current(courts, r)
    expect(old.filter((x) => x.attended)).toHaveLength(6)
    expect(now.filter((x) => x.attended)).toHaveLength(4)
    expect(sorted(now).filter((x) => x.attended)).toEqual(sorted(old).filter((x) => x.attended && x.court_number !== null))
  })
})
