import { describe, expect, it } from 'vitest'
import type { ResultTeam, WeeklyResult } from '../types/leaderboard'
import { computePlayerStats, type PlayerWeek } from './playerStats'
import { getPodiumTeams } from './scoring'

const team = (courtNumber: number, finishOrder: number, ...ids: string[]): ResultTeam => ({
  courtNumber,
  finishOrder,
  players: ids.map((id) => ({ playerId: id, name: id, points: 0 })),
})

const week = (weekNumber: number, teams: ResultTeam[]): WeeklyResult => ({
  weekNumber,
  playedOn: `2026-01-${String(weekNumber).padStart(2, '0')}`,
  notes: null,
  podiumPhotoUrl: null,
  teams,
  attendeeCount: teams.length * 2,
})

const pw = (weekNumber: number, courtNumber: number | null, finishOrder: number | null, points: number): PlayerWeek => ({
  weekNumber, courtNumber, finishOrder, points,
})

// A full 3-court week with "me" placed on the given court/finish. Podium = 1st, 2nd and 3rd teams overall.
const fullWeek = (n: number, myCourt: number, myFinish: number) =>
  week(n, [
    team(1, 1, 'a', 'b'), team(1, 2, 'c', 'd'),
    team(2, 1, 'e', 'f'), team(2, 2, 'g', 'h'),
    team(3, 1, 'i', 'j'), team(3, 2, 'k', 'l'),
  ].map((t) => (t.courtNumber === myCourt && t.finishOrder === myFinish ? team(myCourt, myFinish, 'me', 'partner') : t)))

describe('getPodiumTeams', () => {
  it('returns the top three teams by overall rank', () => {
    expect(getPodiumTeams(fullWeek(1, 3, 1).teams).map((t) => [t.courtNumber, t.finishOrder])).toEqual([[1, 1], [1, 2], [2, 1]])
  })
  it('returns fewer than three for a small week', () => {
    expect(getPodiumTeams([team(1, 1, 'a', 'b')])).toHaveLength(1)
  })
})

describe('computePlayerStats', () => {
  it('handles a player who attended all 8 weeks', () => {
    const weeks = Array.from({ length: 8 }, (_, i) => pw(i + 1, 1, i % 2 === 0 ? 1 : 2, 20 + i))
    const results = weeks.map((w) => fullWeek(w.weekNumber, 1, w.finishOrder!))
    const s = computePlayerStats('me', weeks, results)
    expect(s.weeklyPoints).toEqual([20, 21, 22, 23, 24, 25, 26, 27])
    expect(s.weeklyLog).toHaveLength(8)
    expect(s.weeklyLog[0]).toEqual({ weekNumber: 1, playedOn: '2026-01-01', courtNumber: 1, finish: 'Winner' })
    expect(s.weeklyLog[1].finish).toBe('Runner-up')
    expect(s.career).toEqual({
      weeksPlayed: 8,
      bestCourtFinish: { courtNumber: 1, finish: 'Winner' },
      podiumCount: 8,
      avgPointsPerSession: 23.5,
    })
  })

  it('handles a player who attended 1 week', () => {
    const s = computePlayerStats('me', [pw(4, 2, 2, 17)], [fullWeek(4, 2, 2)])
    expect(s.weeklyPoints).toEqual([null, null, null, 17, null, null, null, null])
    expect(s.weeklyLog).toEqual([{ weekNumber: 4, playedOn: '2026-01-04', courtNumber: 2, finish: 'Runner-up' }])
    expect(s.career.weeksPlayed).toBe(1)
    expect(s.career.bestCourtFinish).toEqual({ courtNumber: 2, finish: 'Runner-up' })
    expect(s.career.podiumCount).toBe(0) // court 2 runners-up are 4th overall
    expect(s.career.avgPointsPerSession).toBe(17)
  })

  it('uses null, not 0, for weeks missed in the middle and averages attended weeks only', () => {
    const weeks = [pw(1, 2, 1, 22), pw(2, 3, 1, 15), pw(6, 1, 2, 18)]
    const results = [fullWeek(1, 2, 1), fullWeek(2, 3, 1), fullWeek(6, 1, 2)]
    const s = computePlayerStats('me', weeks, results)
    expect(s.weeklyPoints).toEqual([22, 15, null, null, null, 18, null, null])
    expect(s.weeklyLog.map((e) => e.weekNumber)).toEqual([1, 2, 6])
    expect(s.career.weeksPlayed).toBe(3)
    expect(s.career.avgPointsPerSession).toBe(18.3)
    expect(s.career.podiumCount).toBe(2) // week 1 (court 2 winners = 3rd) and week 6 (court 1 runners-up = 2nd)
    expect(s.career.bestCourtFinish).toEqual({ courtNumber: 1, finish: 'Runner-up' })
  })

  it('counts zero podiums for a player who never podiumed', () => {
    const s = computePlayerStats('me', [pw(1, 3, 1, 14), pw(2, 3, 2, 12)], [fullWeek(1, 3, 1), fullWeek(2, 3, 2)])
    expect(s.career.podiumCount).toBe(0)
    expect(s.career.bestCourtFinish).toEqual({ courtNumber: 3, finish: 'Winner' })
  })

  it('breaks best-court ties in favour of Winner over Runner-up', () => {
    const s = computePlayerStats('me', [pw(1, 2, 2, 10), pw(2, 2, 1, 10)], [fullWeek(1, 2, 2), fullWeek(2, 2, 1)])
    expect(s.career.bestCourtFinish).toEqual({ courtNumber: 2, finish: 'Winner' })
  })

  it('handles unplaced attendance and a player with no attended weeks', () => {
    const unplaced = computePlayerStats('me', [pw(3, null, null, 10)], [week(3, [])])
    expect(unplaced.weeklyLog).toEqual([{ weekNumber: 3, playedOn: '2026-01-03', courtNumber: null, finish: 'Other' }])
    expect(unplaced.career.bestCourtFinish).toBeNull()
    expect(unplaced.career.avgPointsPerSession).toBe(10)

    const none = computePlayerStats('me', [], [])
    expect(none.weeklyPoints).toEqual(Array(8).fill(null))
    expect(none.career).toEqual({ weeksPlayed: 0, bestCourtFinish: null, podiumCount: 0, avgPointsPerSession: null })
  })
})
