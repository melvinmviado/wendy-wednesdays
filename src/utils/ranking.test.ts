import { describe, expect, it } from 'vitest'
import type { PlayerScore } from '../types/leaderboard'
import { rankLabel, rankPlayers, rankSpoken } from './ranking'

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
