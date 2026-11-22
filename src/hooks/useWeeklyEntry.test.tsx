import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { PlayerScore } from '../types/leaderboard'
import { useWeeklyEntry } from './useWeeklyEntry'

type Row = { player_id: string; attended: boolean; court_number: number | null; finish_order: number | null; points: number }
type LoadResult = { data: Row[] | null; error: { message: string } | null }

// A scripted stand-in for the Supabase client: each week load and each insert is answered by the test.
const db = vi.hoisted(() => ({
  load: (_week: number): Promise<LoadResult> => Promise.resolve({ data: [], error: null }),
  insert: (): Promise<{ data: unknown; error: unknown }> => Promise.resolve({ data: null, error: null }),
  upserts: [] as Array<Array<{ player_id: string; week_number: number; attended: boolean }>>,
}))

vi.mock('../lib/supabase', () => ({
  isSupabaseConfigured: true,
  supabase: {
    from: () => ({
      select: () => ({ eq: (_col: string, week: number) => db.load(week) }),
      upsert: (rows: (typeof db.upserts)[number]) => {
        db.upserts.push(rows)
        return Promise.resolve({ error: null })
      },
      insert: () => ({ select: () => ({ single: () => db.insert() }) }),
    }),
  },
}))

const roster: PlayerScore[] = Array.from({ length: 6 }, (_, i) => ({ id: `p${i + 1}`, name: `P${i + 1}`, weeksPlayed: 0, totalPoints: 0 }))
const seated = (ids: string[]): Row[] =>
  ids.map((id, i) => ({ player_id: id, attended: true, court_number: 1, finish_order: i < 2 ? 1 : 2, points: i < 2 ? 2 : 1 }))

/** A promise the test resolves by hand, to hold a load in flight. */
function deferred<T>() {
  let resolve!: (v: T) => void
  const promise = new Promise<T>((r) => { resolve = r })
  return { promise, resolve }
}

const setup = () => {
  const onLeaderboardUpdated = vi.fn()
  const onAddNewPlayerToRoster = vi.fn()
  const hook = renderHook(() => useWeeklyEntry({ roster, onLeaderboardUpdated, onAddNewPlayerToRoster }))
  return { ...hook, onLeaderboardUpdated, onAddNewPlayerToRoster }
}
type Hook = ReturnType<typeof setup>['result']
const seatedIds = (r: Hook) => [...r.current.attendedPlayerIds].sort()
const submit = { preventDefault() {} } as React.FormEvent

let confirmSpy: ReturnType<typeof vi.spyOn>
beforeEach(() => {
  db.upserts = []
  db.load = (week) => Promise.resolve({ data: week === 1 ? seated(['p1', 'p2', 'p3', 'p4']) : [], error: null })
  db.insert = () => Promise.resolve({ data: null, error: null })
  confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
})
afterEach(() => confirmSpy.mockRestore())

describe('useWeeklyEntry', () => {
  it('loads the saved seating for the active week', async () => {
    const { result } = setup()
    await waitFor(() => expect(seatedIds(result)).toEqual(['p1', 'p2', 'p3', 'p4']))
    expect(result.current.isDirty).toBe(false)
    expect(result.current.loadFailed).toBe(false)
  })

  it('a failed load clears the previous week and blocks Save, so it cannot overwrite this week', async () => {
    const { result } = setup()
    await waitFor(() => expect(result.current.attendedCount).toBe(4))

    db.load = () => Promise.resolve({ data: null, error: { message: 'network down' } })
    act(() => result.current.selectWeek(2))
    await waitFor(() => expect(result.current.loadFailed).toBe(true))

    expect(result.current.selectedWeek).toBe(2)
    expect(result.current.attendedCount).toBe(0) // week 1's players are gone from the screen
    expect(result.current.errorMsg).toContain("Couldn't load Week 2")

    await act(() => result.current.handleSaveWeek())
    expect(db.upserts).toHaveLength(0) // nothing written

    // Retry recovers and re-enables saving
    db.load = () => Promise.resolve({ data: seated(['p5', 'p6']), error: null })
    await act(() => result.current.retryLoad())
    expect(result.current.loadFailed).toBe(false)
    expect(seatedIds(result)).toEqual(['p5', 'p6'])
  })

  it('a slow load for an earlier week never replaces a later one (sequence guard)', async () => {
    const slow = deferred<LoadResult>()
    const { result } = setup()
    await waitFor(() => expect(result.current.attendedCount).toBe(4))

    db.load = (week) => (week === 2 ? slow.promise : Promise.resolve({ data: seated(['p6']), error: null }))
    act(() => result.current.selectWeek(2))
    act(() => result.current.selectWeek(3))
    await waitFor(() => expect(seatedIds(result)).toEqual(['p6']))

    await act(async () => slow.resolve({ data: seated(['p1', 'p2']), error: null }))
    expect(result.current.selectedWeek).toBe(3)
    expect(seatedIds(result)).toEqual(['p6'])
  })

  it('asks before switching weeks with unsaved seating, and stays put if the admin cancels', async () => {
    const { result } = setup()
    await waitFor(() => expect(result.current.attendedCount).toBe(4))

    act(() => result.current.handleBenchPlayerTap(roster[4]))
    expect(result.current.isDirty).toBe(true)

    confirmSpy.mockReturnValue(false)
    act(() => result.current.selectWeek(2))
    expect(confirmSpy).toHaveBeenCalledWith(expect.stringContaining('unsaved changes'))
    expect(result.current.selectedWeek).toBe(1)
    expect(result.current.attendedCount).toBe(5)
  })

  it('cannot switch weeks while a save is running', async () => {
    const { result } = setup()
    await waitFor(() => expect(result.current.attendedCount).toBe(4))

    let save!: Promise<void>
    act(() => { save = result.current.handleSaveWeek() })
    expect(result.current.saving).toBe(true)
    act(() => result.current.selectWeek(2))
    expect(result.current.selectedWeek).toBe(1)
    await act(() => save)
    expect(result.current.isDirty).toBe(false)
  })

  it('a player removed from a court is saved as absent for that week', async () => {
    const { result } = setup()
    await waitFor(() => expect(result.current.attendedCount).toBe(4))

    const slot = result.current.courts[0].slots.find((s) => s.playerId === 'p2')!
    act(() => result.current.handleRemoveFromSlot(slot.slotId))
    await act(() => result.current.handleSaveWeek())

    expect(db.upserts).toHaveLength(1)
    const rows = db.upserts[0]
    expect(rows.every((r) => r.week_number === 1)).toBe(true)
    expect(rows.find((r) => r.player_id === 'p2')).toMatchObject({ attended: false })
    expect(rows.filter((r) => r.attended).map((r) => r.player_id).sort()).toEqual(['p1', 'p3', 'p4'])
  })

  it('quick add shows the friendly duplicate-name error and seats nobody', async () => {
    const { result, onAddNewPlayerToRoster } = setup()
    await waitFor(() => expect(result.current.attendedCount).toBe(4))

    db.insert = () => Promise.resolve({ data: null, error: { code: '23505', message: 'duplicate key value' } })
    act(() => result.current.setNewPlayerName('P1'))
    await act(() => result.current.handleQuickAddPlayer(submit))

    expect(result.current.errorMsg).toBe('Another active player already has that name.')
    expect(onAddNewPlayerToRoster).not.toHaveBeenCalled()
    expect(result.current.attendedCount).toBe(4)
  })

  it('quick add creates the player with zero totals and seats them', async () => {
    const { result, onAddNewPlayerToRoster } = setup()
    await waitFor(() => expect(result.current.attendedCount).toBe(4))

    db.insert = () => Promise.resolve({ data: { id: 'new-1', name: 'Zed', weeks_played: 0, total_points: 0 }, error: null })
    act(() => result.current.setNewPlayerName('Zed'))
    await act(() => result.current.handleQuickAddPlayer(submit))

    expect(onAddNewPlayerToRoster).toHaveBeenCalledWith(expect.objectContaining({ id: 'new-1', weeksPlayed: 0, totalPoints: 0 }))
    expect(result.current.attendedPlayerIds.has('new-1')).toBe(true)
  })
})
