import { describe, expect, it } from 'vitest'
import type { CourtData, PlayerScore } from '../types/leaderboard'
import {
  buildCourtsFromRecords,
  buildEmptyCourt,
  buildSaveRecords,
  getCourtWarnings,
  getBenchPlayers,
  getSeatedPlayerIds,
  moveOrSwapPlayers,
  seatPlayer,
  unseatPlayer,
} from './weeklyEntry'

const pl = (id: string): PlayerScore => ({ id, name: `P${id}`, totalPoints: 0, weeksPlayed: 0 })
const seatAll = (ids: string[], start: CourtData[] = []) =>
  ids.reduce((courts, id) => seatPlayer(courts, pl(id)), start)

describe('seatPlayer', () => {
  it('creates court 1 when there are no courts', () => {
    const c = seatPlayer([], pl('1'))
    expect(c).toHaveLength(1)
    expect(c[0].slots[0]).toMatchObject({ playerId: '1', playerName: 'P1' })
  })

  it('fills slots in order, partners first, then appends a court when all are full', () => {
    const c = seatAll(['1', '2', '3', '4'])
    expect(c).toHaveLength(1)
    expect(c[0].slots.map((s) => s.playerId)).toEqual(['1', '2', '3', '4'])
    const c2 = seatPlayer(c, pl('5'))
    expect(c2).toHaveLength(2)
    expect(c2[1].courtNumber).toBe(2)
    expect(c2[1].slots[0].playerId).toBe('5')
  })

  it('honours a valid empty target slot and ignores a filled one', () => {
    const c = seatAll(['1'])
    expect(seatPlayer(c, pl('2'), 'c1-t2-p1')[0].slots[2].playerId).toBe('2')
    expect(seatPlayer(c, pl('2'), 'c1-t1-p1')[0].slots[1].playerId).toBe('2')
  })

  it('is a no-op for a player who is already seated', () => {
    const c = seatAll(['1'])
    expect(seatPlayer(c, pl('1'))).toBe(c)
  })

  it('does not mutate its input', () => {
    const c = seatAll(['1'])
    const snapshot = JSON.stringify(c)
    seatPlayer(c, pl('2'))
    expect(JSON.stringify(c)).toBe(snapshot)
  })
})

describe('unseatPlayer', () => {
  it('clears the slot and trims trailing empty courts, keeping the first', () => {
    const c = seatAll(['1', '2', '3', '4', '5'])
    const after = unseatPlayer(c, '5')
    expect(after).toHaveLength(1)
    expect(getSeatedPlayerIds(after).size).toBe(4)
    expect(unseatPlayer(seatAll(['1']), '1')).toHaveLength(1)
  })

  it('does not trim a middle court or a court that is not empty', () => {
    const c = seatAll(['1', '2', '3', '4', '5', '6'])
    expect(unseatPlayer(c, '1')).toHaveLength(2)
    expect(unseatPlayer(c, '5')).toHaveLength(2)
  })

  it('keeps a trailing empty court with edited points unless discard is requested', () => {
    const c = seatAll(['1', '2', '3', '4', '5'])
    c[1] = { ...c[1], firstPlacePoints: c[1].firstPlacePoints + 5 }
    expect(unseatPlayer(c, '5')).toHaveLength(2)
    expect(unseatPlayer(c, '5', { discardCustomPoints: true })).toHaveLength(1)
  })

  it('is safe for a player who is not seated', () => {
    const c = seatAll(['1'])
    expect(unseatPlayer(c, 'zzz')).toEqual(c)
  })
})

describe('getBenchPlayers', () => {
  it('returns roster players who are not seated', () => {
    const roster = ['1', '2', '3'].map(pl)
    const courts = seatAll(['2'])
    expect(getBenchPlayers(roster, courts).map((p) => p.id)).toEqual(['1', '3'])
    expect(getBenchPlayers(roster, [buildEmptyCourt(1)])).toHaveLength(3)
  })
})

describe('buildCourtsFromRecords', () => {
  const nameOf = (id: string) => `P${id}`
  const row = (playerId: string, courtNumber: number | null, finishOrder: number | null, points = 0) => ({
    playerId,
    courtNumber,
    finishOrder,
    points,
  })

  it('rebuilds placements, team points and court count from saved rows', () => {
    const { courts, unseatedCount } = buildCourtsFromRecords(
      [row('1', 1, 1, 10), row('2', 1, 1, 10), row('3', 1, 2, 9), row('4', 2, 1, 8)],
      nameOf
    )
    expect(unseatedCount).toBe(0)
    expect(courts).toHaveLength(2)
    expect(courts[0].slots.map((s) => s.playerId)).toEqual(['1', '2', '3', null])
    expect(courts[0]).toMatchObject({ firstPlacePoints: 10, secondPlacePoints: 9 })
    expect(courts[1].slots[0]).toMatchObject({ playerId: '4', playerName: 'P4', points: 8 })
  })

  it('seats attended-but-unplaced players in the next open slots and counts them', () => {
    const { courts, unseatedCount } = buildCourtsFromRecords(
      [row('1', 1, 1, 10), row('2', null, null), row('3', null, null)],
      nameOf
    )
    expect(unseatedCount).toBe(2)
    expect(courts[0].slots.map((s) => s.playerId)).toEqual(['1', '2', '3', null])
  })

  it('treats a third row in one team as unseated rather than dropping it', () => {
    const { courts, unseatedCount } = buildCourtsFromRecords(
      [row('1', 1, 1), row('2', 1, 1), row('3', 1, 1)],
      nameOf
    )
    expect(unseatedCount).toBe(1)
    expect(getSeatedPlayerIds(courts).size).toBe(3)
  })

  it('returns no courts for a week with no attended rows', () => {
    expect(buildCourtsFromRecords([], nameOf)).toEqual({ courts: [], unseatedCount: 0 })
  })
})

describe('getCourtWarnings', () => {
  it('flags empty and partial courts but not full ones', () => {
    const full = seatAll(['1', '2', '3', '4', '5'])
    expect(getCourtWarnings(full)).toEqual(['Court 2 has 1 of 4 players.'])
    expect(getCourtWarnings([buildEmptyCourt(1)])).toEqual(['Court 1 is empty.'])
    expect(getCourtWarnings(seatAll(['1', '2', '3', '4']))).toEqual([])
  })
})

describe('buildSaveRecords', () => {
  it('marks attended exactly for seated players and keeps court, team and points', () => {
    const courts = seatAll(['1', '2'])
    const recs = buildSaveRecords(courts, [{ id: '1' }, { id: '2' }, { id: '3' }], 4)
    expect(recs.filter((r) => r.attended).map((r) => r.player_id)).toEqual(['1', '2'])
    expect(recs[0]).toMatchObject({ court_number: 1, finish_order: 1, week_number: 4 })
    expect(recs.find((r) => r.player_id === '3')).toMatchObject({ attended: false, court_number: null, points: 0 })
  })

  it('un-attends removed players, including ones no longer on the roster', () => {
    const courts = seatAll(['1'])
    const recs = buildSaveRecords(courts, [{ id: '1' }], 2, ['1', 'gone'])
    expect(recs.map((r) => [r.player_id, r.attended])).toEqual([['1', true], ['gone', false]])
  })
})

describe('moveOrSwapPlayers', () => {
  it('swaps two seated players and leaves points with the slots', () => {
    const c = seatAll(['1', '2', '3', '4'])
    const after = moveOrSwapPlayers(c, 'c1-t1-p1', 'c1-t2-p1')
    expect(after[0].slots.map((s) => s.playerId)).toEqual(['3', '2', '1', '4'])
    expect(after[0].slots[0].points).toBe(c[0].slots[0].points)
  })

  it('moves a player into an empty slot and trims a court left empty', () => {
    const c = seatAll(['1', '2', '3', '4', '5'])
    const after = moveOrSwapPlayers(c, 'c2-t1-p1', 'c1-t1-p1') // target is filled: swap
    expect(after[1].slots[0].playerId).toBe('1')
    const c3 = seatAll(['1'])
    const moved = moveOrSwapPlayers(c3, 'c1-t1-p1', 'c1-t2-p2')
    expect(moved[0].slots.map((s) => s.playerId)).toEqual([null, null, null, '1'])
  })

  it('ignores an empty source, same slot and unknown slots', () => {
    const c = seatAll(['1'])
    expect(moveOrSwapPlayers(c, 'c1-t1-p2', 'c1-t1-p1')).toBe(c)
    expect(moveOrSwapPlayers(c, 'c1-t1-p1', 'c1-t1-p1')).toBe(c)
    expect(moveOrSwapPlayers(c, 'c1-t1-p1', 'nope')).toBe(c)
  })
})
