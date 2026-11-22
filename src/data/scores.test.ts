import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getScoresVersion, invalidateScores, loadAttendedScores, SCORES_MAX_AGE_MS, subscribeScores } from './scores'
import { buildTeams, fetchWeeklyResults } from './weeklyResults'
import { getPlayerStats } from './getPlayerStats'

type Result = { data: unknown; error: unknown }

// Counts requests per table; each answer can be replaced by the test.
const db = vi.hoisted(() => ({
  calls: { weekly_scores: 0, weeks: 0 } as Record<string, number>,
  scores: (): Promise<Result> => Promise.resolve({ data: [], error: null }),
  weeks: (): Promise<Result> => Promise.resolve({ data: [], error: null }),
}))

vi.mock('../lib/supabase', () => ({
  isSupabaseConfigured: true,
  supabase: {
    from: (table: string) => ({
      select: () => {
        db.calls[table] = (db.calls[table] ?? 0) + 1
        return table === 'weekly_scores' ? { eq: () => db.scores() } : db.weeks()
      },
    }),
  },
}))

const row = (player: string, week: number, court: number, finish: number, points: number) => ({
  player_id: player, week_number: week, court_number: court, finish_order: finish, points, players: { name: `Name ${player}` },
})

beforeEach(() => {
  invalidateScores()
  db.calls = { weekly_scores: 0, weeks: 0 }
  db.scores = () => Promise.resolve({ data: [row('a', 1, 1, 1, 4), row('b', 1, 1, 1, 4), row('a', 2, 1, 2, 3)], error: null })
  db.weeks = () => Promise.resolve({ data: [{ week_number: 1, played_on: null, notes: 'n', podium_photo_url: null }], error: null })
})
afterEach(() => vi.useRealTimers())

describe('shared attended scores', () => {
  it('maps rows and joins the player name', async () => {
    const rows = await loadAttendedScores()
    expect(rows[0]).toEqual({ playerId: 'a', weekNumber: 1, courtNumber: 1, finishOrder: 1, points: 4, playerName: 'Name a' })
  })

  it('concurrent callers share one request, and a fresh copy is reused', async () => {
    await Promise.all([loadAttendedScores(), loadAttendedScores(), loadAttendedScores()])
    await loadAttendedScores()
    expect(db.calls.weekly_scores).toBe(1)
  })

  it('reloads after the copy is too old', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    await loadAttendedScores()
    vi.setSystemTime(Date.now() + SCORES_MAX_AGE_MS + 1)
    await loadAttendedScores()
    expect(db.calls.weekly_scores).toBe(2)
  })

  it('invalidating bumps the version, tells subscribers, and forces a reload', async () => {
    await loadAttendedScores()
    const seen = vi.fn()
    const unsubscribe = subscribeScores(seen)
    const before = getScoresVersion()
    invalidateScores()
    expect(getScoresVersion()).toBe(before + 1)
    expect(seen).toHaveBeenCalledTimes(1)
    await loadAttendedScores()
    expect(db.calls.weekly_scores).toBe(2)
    unsubscribe()
  })

  it('never keeps a failed load', async () => {
    db.scores = () => Promise.resolve({ data: null, error: { message: 'down' } })
    await expect(loadAttendedScores()).rejects.toMatchObject({ message: 'down' })
    db.scores = () => Promise.resolve({ data: [], error: null })
    await expect(loadAttendedScores()).resolves.toEqual([])
    expect(db.calls.weekly_scores).toBe(2)
  })
})

describe('weekly results and player stats', () => {
  it('buildTeams groups partners by court and place, in court order', () => {
    const teams = buildTeams([
      { playerId: 'c', weekNumber: 1, courtNumber: 2, finishOrder: 1, points: 2, playerName: 'C' },
      { playerId: 'a', weekNumber: 1, courtNumber: 1, finishOrder: 2, points: 3, playerName: null },
      { playerId: 'b', weekNumber: 1, courtNumber: 1, finishOrder: 2, points: 3, playerName: 'B' },
      { playerId: 'x', weekNumber: 1, courtNumber: null, finishOrder: null, points: 0, playerName: 'Legacy' },
    ])
    expect(teams.map((t) => [t.courtNumber, t.finishOrder, t.players.map((p) => p.name)])).toEqual([
      [1, 2, ['Unknown', 'B']],
      [2, 1, ['C']],
    ])
  })

  it('fetchWeeklyResults merges scores with week notes, oldest week first', async () => {
    const results = await fetchWeeklyResults()
    expect(results.map((r) => [r.weekNumber, r.attendeeCount, r.notes])).toEqual([[1, 2, 'n'], [2, 1, null]])
  })

  it('opening player stats after the results makes no extra score request', async () => {
    await fetchWeeklyResults()
    const stats = await getPlayerStats('a')
    expect(db.calls.weekly_scores).toBe(1)
    expect(stats).toBeTruthy()
  })
})
