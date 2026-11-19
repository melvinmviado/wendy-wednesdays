import type { PlayerStats } from '../utils/playerStats'

const nulls = (): (number | null)[] => Array(8).fill(null)

export const fullSeason: PlayerStats = {
  playerId: 'full',
  weeklyPoints: [20, 24, 18, 27, 22, 25, 21, 26],
  weeklyLog: Array.from({ length: 8 }, (_, i) => ({
    weekNumber: i + 1,
    playedOn: new Date(Date.UTC(2026, 0, 7 + i * 7)).toISOString().slice(0, 10),
    courtNumber: i % 3 === 0 ? 1 : 2,
    finish: i % 2 === 0 ? ('Winner' as const) : ('Runner-up' as const),
  })),
  career: { weeksPlayed: 8, bestCourtFinish: { courtNumber: 1, finish: 'Winner' }, podiumCount: 5, avgPointsPerSession: 22.9 },
}

export const oneWeek: PlayerStats = {
  playerId: 'one',
  weeklyPoints: [null, null, null, 17, null, null, null, null],
  weeklyLog: [{ weekNumber: 4, playedOn: '2026-01-28', courtNumber: 3, finish: 'Runner-up' }],
  career: { weeksPlayed: 1, bestCourtFinish: { courtNumber: 3, finish: 'Runner-up' }, podiumCount: 0, avgPointsPerSession: 17 },
}

export const withGaps: PlayerStats = {
  playerId: 'gaps',
  weeklyPoints: [22, 15, null, null, 18, 20, null, 24],
  weeklyLog: [1, 2, 5, 6, 8].map((w, i) => ({
    weekNumber: w,
    playedOn: new Date(Date.UTC(2026, 0, w * 7)).toISOString().slice(0, 10),
    courtNumber: 2,
    finish: i % 2 === 0 ? ('Winner' as const) : ('Runner-up' as const),
  })),
  career: { weeksPlayed: 5, bestCourtFinish: { courtNumber: 2, finish: 'Winner' }, podiumCount: 0, avgPointsPerSession: 19.8 },
}

export const neverPlayed: PlayerStats = {
  playerId: 'none',
  weeklyPoints: nulls(),
  weeklyLog: [],
  career: { weeksPlayed: 0, bestCourtFinish: null, podiumCount: 0, avgPointsPerSession: null },
}
