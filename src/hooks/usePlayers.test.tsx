import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { REALTIME_DEBOUNCE_MS, usePlayers } from './usePlayers'
import { getScoresVersion } from '../data/scores'

type ViewRow = { id: string; name: string; weeks_played: number; total_points: number }
type ViewResult = { data: ViewRow[] | null; error: { message: string } | null }

// A scripted stand-in for Supabase: each season_leaderboard read is answered by the test.
const db = vi.hoisted(() => ({
  reads: [] as Array<(r: ViewResult) => void>,
  removed: 0,
  subscribed: 0,
  handlers: {} as Record<string, () => void>,
}))

vi.mock('../lib/supabase', () => {
  const channel = {
    on: (_e: string, filter: { table: string }, handler: () => void) => { db.handlers[filter.table] = handler; return channel },
    subscribe: () => { db.subscribed++; return channel },
  }
  return {
    isSupabaseConfigured: true,
    supabase: {
      from: () => ({
        select: () => ({ order: () => new Promise<ViewResult>((resolve) => db.reads.push(resolve)) }),
      }),
      channel: () => channel,
      removeChannel: () => { db.removed++ },
    },
  }
})

const row = (id: string, total = 0): ViewRow => ({ id, name: `Player ${id}`, weeks_played: 1, total_points: total })

beforeEach(() => {
  db.reads = []
  db.removed = 0
  db.subscribed = 0
  db.handlers = {}
  localStorage.clear()
})

describe('usePlayers (database configured)', () => {
  it('never shows the demo seed roster: starts empty and loading', () => {
    const { result } = renderHook(() => usePlayers(true))
    expect(result.current.players).toEqual([])
    expect(result.current.loadingDb).toBe(true)
    expect(result.current.loaded).toBe(false)
  })

  it('starts from the cached roster when there is one', () => {
    localStorage.setItem('wendy_leaderboard_players', JSON.stringify([{ id: 'c', name: 'Cached', weeksPlayed: 0, totalPoints: 0 }]))
    const { result } = renderHook(() => usePlayers(true))
    expect(result.current.players.map((p) => p.id)).toEqual(['c'])
  })

  it('an empty database replaces the cache with an empty roster', async () => {
    localStorage.setItem('wendy_leaderboard_players', JSON.stringify([{ id: 'c', name: 'Cached', weeksPlayed: 0, totalPoints: 0 }]))
    const { result } = renderHook(() => usePlayers(true))
    await waitFor(() => expect(db.reads.length).toBeGreaterThan(0))
    await act(async () => db.reads.forEach((resolve) => resolve({ data: [], error: null })))
    expect(result.current.players).toEqual([])
    expect(result.current.loaded).toBe(true)
    expect(result.current.loadingDb).toBe(false)
  })

  it('an older response that arrives last does not overwrite a newer one', async () => {
    const { result } = renderHook(() => usePlayers(true))
    await waitFor(() => expect(db.reads.length).toBeGreaterThan(0))
    const before = db.reads.length
    act(() => { void result.current.refresh() })
    await waitFor(() => expect(db.reads.length).toBe(before + 1))

    const newest = db.reads[db.reads.length - 1]
    await act(async () => newest({ data: [row('new', 5)], error: null }))
    expect(result.current.players.map((p) => p.id)).toEqual(['new'])

    // every older request now answers late, with stale data
    await act(async () => db.reads.slice(0, -1).forEach((resolve) => resolve({ data: [row('old')], error: null })))
    expect(result.current.players.map((p) => p.id)).toEqual(['new'])
    expect(result.current.loadingDb).toBe(false)
  })

  it('removes its realtime channel on unmount', async () => {
    const { unmount } = renderHook(() => usePlayers(true))
    await waitFor(() => expect(db.subscribed).toBeGreaterThan(0))
    unmount()
    expect(db.removed).toBe(db.subscribed)
  })

  it('a burst of realtime events (one per saved row) causes one reload, after it ends', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    try {
      renderHook(() => usePlayers(true))
      expect(db.subscribed).toBe(1)
      const before = db.reads.length
      const version = getScoresVersion()

      for (let i = 0; i < 12; i++) db.handlers.weekly_scores()
      db.handlers.players()
      await act(async () => { vi.advanceTimersByTime(REALTIME_DEBOUNCE_MS - 1) })
      expect(db.reads.length).toBe(before) // still inside the burst window

      await act(async () => { vi.advanceTimersByTime(1) })
      expect(db.reads.length).toBe(before + 1)
      expect(getScoresVersion()).toBe(version + 1) // rank arrows and results re-read the scores once
    } finally {
      vi.useRealTimers()
    }
  })

  it('player-only changes reload the roster without invalidating the scores', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    try {
      renderHook(() => usePlayers(true))
      const version = getScoresVersion()
      db.handlers.players()
      await act(async () => { vi.advanceTimersByTime(REALTIME_DEBOUNCE_MS) })
      expect(getScoresVersion()).toBe(version)
    } finally {
      vi.useRealTimers()
    }
  })
})
