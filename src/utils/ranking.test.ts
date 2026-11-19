import { describe, expect, it } from 'vitest'
import type { PlayerScore } from '../types/leaderboard'
import { getRankMovement, getStandingsAsOfWeek, rankLabel, rankPlayers, rankSpoken } from './ranking'

const PLAYERS = [{ id: 'a', name: 'Amy' }, { id: 'b', name: 'Bob' }, { id: 'c', name: 'Cat' }]
const s = (playerId: string, weekNumber: number, points: number) => ({ playerId, weekNumber, attended: true, points })

const p = (id: string, name: string, totalPoints: number, weeksPlayed = 1): PlayerScore => ({ id, name, totalPoints, weeksPlayed })

describe('rankPlayers', () => {
  it('ranks by points descending', () => {
    const r = rankPlayers([p('1', 'A', 10), p('2', 'B', 30), p('3', 'C', 20)])
    expect(r.map((x) => [x.name, x.rank])).toEqual([['B', 1], ['C', 2], ['A', 3]])
    expect(r.every((x) => !x.tied)).toBe(true)
  })

  it('gives tied players the same rank and skips the next one', () => {
    const r = rankPlayers([p('1', 'A', 50), p('2', 'B', 40), p('3', 'C', 40), p('4', 'D', 10)])
    expect(r.map((x) => [x.name, x.rank, x.tied])).toEqual([
      ['A', 1, false],
      ['B', 2, true],
      ['C', 2, true],
      ['D', 4, false],
    ])
  })

  it('breaks ties in order by weeks played then name, without changing the shared rank', () => {
    const r = rankPlayers([p('1', 'Zed', 40, 2), p('2', 'Amy', 40, 2), p('3', 'Bob', 40, 3)])
    expect(r.map((x) => x.name)).toEqual(['Bob', 'Amy', 'Zed'])
    expect(r.every((x) => x.rank === 1 && x.tied)).toBe(true)
  })

  it('handles an empty list and a single player', () => {
    expect(rankPlayers([])).toEqual([])
    expect(rankPlayers([p('1', 'Solo', 0)])[0]).toMatchObject({ rank: 1, tied: false })
  })

  it('does not mutate its input', () => {
    const input = [p('1', 'A', 1), p('2', 'B', 2)]
    rankPlayers(input)
    expect(input.map((x) => x.name)).toEqual(['A', 'B'])
  })
})

describe('rank labels', () => {
  it('formats tied and untied ranks', () => {
    expect(rankLabel(2, true)).toBe('T2')
    expect(rankLabel(2, false)).toBe('2')
    expect(rankSpoken(2, true)).toBe('tied for rank 2')
    expect(rankSpoken(1, false)).toBe('rank 1')
  })
})

describe('getStandingsAsOfWeek', () => {
  it('uses only weeks up to the given week', () => {
    const r = getStandingsAsOfWeek(PLAYERS, [s('a', 1, 10), s('b', 1, 20), s('a', 2, 50)], 1)
    expect(r.map((x) => [x.id, x.totalPoints, x.rank])).toEqual([['b', 20, 1], ['a', 10, 2], ['c', 0, 3]])
  })

  it('ignores non-attended rows and applies the live tiebreakers', () => {
    const r = getStandingsAsOfWeek(PLAYERS, [s('a', 1, 10), s('b', 1, 5), s('b', 2, 5), { ...s('c', 1, 99), attended: false }], 2)
    expect(r.map((x) => x.id)).toEqual(['b', 'a', 'c']) // b and a tie on 10; b played more weeks
    expect(r[0]).toMatchObject({ rank: 1, tied: true })
    expect(r[1]).toMatchObject({ rank: 1, tied: true })
  })
})

describe('getRankMovement', () => {
  const by = (m: ReturnType<typeof getRankMovement>, id: string) => m.find((x) => x.playerId === id)!

  it('detects a jump up and a slip down', () => {
    const m = getRankMovement(PLAYERS, [s('a', 1, 30), s('b', 1, 20), s('c', 1, 10), s('c', 2, 50), s('a', 2, 5), s('b', 2, 5)])
    expect(by(m, 'c')).toEqual({ playerId: 'c', currentRank: 1, previousRank: 3, delta: 2, status: 'up' })
    expect(by(m, 'a')).toMatchObject({ currentRank: 2, previousRank: 1, delta: -1, status: 'down' })
  })

  it('reports no change', () => {
    const m = getRankMovement(PLAYERS, [s('a', 1, 30), s('b', 1, 20), s('c', 1, 10), s('a', 2, 5), s('b', 2, 5), s('c', 2, 5)])
    expect(m.every((x) => x.status === 'same' && x.delta === 0)).toBe(true)
  })

  it('marks a first-timer as new', () => {
    const m = getRankMovement(PLAYERS, [s('a', 1, 30), s('b', 1, 20), s('c', 2, 100)])
    expect(by(m, 'c')).toEqual({ playerId: 'c', currentRank: 1, previousRank: null, delta: null, status: 'new' })
  })

  it('gives a player who missed the latest week a real movement', () => {
    const m = getRankMovement(PLAYERS, [s('a', 1, 30), s('b', 1, 20), s('b', 2, 40), s('c', 2, 40)])
    expect(by(m, 'a')).toMatchObject({ previousRank: 1, currentRank: 3, delta: -2, status: 'down' })
  })

  it('compares shared ranks when players are tied', () => {
    // After week 1: a=20, b=20 (both rank 1), c=10 (rank 3). After week 2: c=30 rank 1, a,b=20 tied at 2.
    const m = getRankMovement(PLAYERS, [s('a', 1, 20), s('b', 1, 20), s('c', 1, 10), s('c', 2, 20)])
    expect(by(m, 'a')).toMatchObject({ previousRank: 1, currentRank: 2, delta: -1, status: 'down' })
    expect(by(m, 'b')).toMatchObject({ previousRank: 1, currentRank: 2, delta: -1 })
    expect(by(m, 'c')).toMatchObject({ previousRank: 3, currentRank: 1, delta: 2, status: 'up' })
  })

  it('has no arrows in a single-week season: attendees are new, the rest same', () => {
    const m = getRankMovement(PLAYERS, [s('a', 1, 30), s('b', 1, 20)])
    expect(by(m, 'a').status).toBe('new')
    expect(by(m, 'b').status).toBe('new')
    expect(by(m, 'c')).toMatchObject({ status: 'same', delta: 0 })
    expect(m.some((x) => x.status === 'up' || x.status === 'down')).toBe(false)
  })

  it('returns nothing when no week has been played', () => {
    expect(getRankMovement(PLAYERS, [])).toEqual([])
  })
})
