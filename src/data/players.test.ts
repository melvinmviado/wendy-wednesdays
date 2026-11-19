import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ configured: true, calls: [] as string[], result: {} as { data?: unknown; error?: unknown } }))

// A chainable, awaitable stand-in for the Supabase query builder that records each call.
vi.mock('../lib/supabase', () => {
  const builder = (): unknown =>
    new Proxy(
      {},
      {
        get: (_t, prop: string) => {
          if (prop === 'then') return (resolve: (v: unknown) => void) => resolve(state.result)
          return (...args: unknown[]) => {
            state.calls.push(`${prop}(${args.map((a) => JSON.stringify(a)).join(',')})`)
            return builder()
          }
        },
      }
    )
  return {
    get isSupabaseConfigured() {
      return state.configured
    },
    supabase: { from: (t: string) => (state.calls.push(`from(${t})`), builder()) },
  }
})

import {
  archivePlayer,
  deletePlayer,
  fetchPlayers,
  PLAYERS_STORAGE_KEY,
  renamePlayer,
  restorePlayer,
  toAdminError,
} from './players'

const row = (over: Record<string, unknown> = {}) => ({
  id: 'p1',
  name: 'Ann',
  weeks_played: 2,
  total_points: 40,
  archived_at: null,
  updated_at: '2026-11-19T00:00:00Z',
  ...over,
})

beforeEach(() => {
  state.configured = true
  state.calls = []
  state.result = {}
  localStorage.clear()
})

describe('fetchPlayers (Supabase)', () => {
  it('excludes archived players by default', async () => {
    state.result = { data: [row()] }
    const res = await fetchPlayers()
    expect(state.calls).toContain('is("archived_at",null)')
    expect(res).toMatchObject({ ok: true, data: [{ id: 'p1', name: 'Ann', totalPoints: 40 }] })
  })

  it('includes archived players when asked', async () => {
    state.result = { data: [row({ archived_at: '2026-11-01T00:00:00Z' })] }
    const res = await fetchPlayers({ includeArchived: true })
    expect(state.calls.some((c) => c.startsWith('is('))).toBe(false)
    expect(res.ok && res.data[0].archivedAt).toBe('2026-11-01T00:00:00Z')
  })

  it('returns a typed error instead of throwing', async () => {
    state.result = { error: { code: '42501', message: 'denied' } }
    const res = await fetchPlayers()
    expect(res).toEqual({ ok: false, error: { code: 'FORBIDDEN', message: expect.any(String) } })
  })
})

describe('mutations (Supabase)', () => {
  it('rejects a blank rename without touching the database', async () => {
    const res = await renamePlayer('p1', '   ')
    expect(res).toMatchObject({ ok: false, error: { code: 'INVALID_NAME' } })
    expect(state.calls).toEqual([])
  })

  it('trims the name and maps the row', async () => {
    state.result = { data: row({ name: 'Anna' }) }
    const res = await renamePlayer('p1', '  Anna ')
    expect(state.calls).toContain('update({"name":"Anna"})')
    expect(res).toMatchObject({ ok: true, data: { name: 'Anna' } })
  })

  it('maps a unique violation to DUPLICATE_NAME', async () => {
    state.result = { error: { code: '23505', message: 'duplicate key' } }
    expect(await renamePlayer('p1', 'Bob')).toMatchObject({ ok: false, error: { code: 'DUPLICATE_NAME' } })
    expect(await restorePlayer('p1')).toMatchObject({ ok: false, error: { code: 'DUPLICATE_NAME' } })
  })

  it('reports NOT_FOUND when no row comes back', async () => {
    state.result = { data: null }
    expect(await archivePlayer('p1')).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } })
    expect(await deletePlayer('p1')).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } })
  })

  it('deletes when a row was removed', async () => {
    state.result = { data: [{ id: 'p1' }] }
    expect(await deletePlayer('p1')).toEqual({ ok: true, data: undefined })
  })
})

describe('demo mode (localStorage)', () => {
  const seed = () =>
    localStorage.setItem(
      PLAYERS_STORAGE_KEY,
      JSON.stringify([
        { id: '1', name: 'Ann', weeksPlayed: 1, totalPoints: 10 },
        { id: '2', name: 'Bob', weeksPlayed: 1, totalPoints: 5 },
      ])
    )

  beforeEach(() => {
    state.configured = false
    seed()
  })

  it('archives, hides by default, and restores', async () => {
    await archivePlayer('1')
    expect(await fetchPlayers()).toMatchObject({ ok: true, data: [{ id: '2' }] })
    const all = await fetchPlayers({ includeArchived: true })
    expect(all.ok && all.data).toHaveLength(2)
    await restorePlayer('1')
    const active = await fetchPlayers()
    expect(active.ok && active.data).toHaveLength(2)
  })

  it('rejects a case-insensitive duplicate rename', async () => {
    expect(await renamePlayer('2', ' ann ')).toMatchObject({ ok: false, error: { code: 'DUPLICATE_NAME' } })
  })

  it('blocks restoring into a taken name', async () => {
    await archivePlayer('1')
    await renamePlayer('2', 'Ann')
    expect(await restorePlayer('1')).toMatchObject({ ok: false, error: { code: 'DUPLICATE_NAME' } })
  })

  it('deletes the player and their weekly rows', async () => {
    localStorage.setItem('wendy_weekly_scores_w1', JSON.stringify([{ playerId: '1' }, { playerId: '2' }]))
    await deletePlayer('1')
    const left = await fetchPlayers({ includeArchived: true })
    expect(left.ok && left.data.map((p) => p.id)).toEqual(['2'])
    expect(JSON.parse(localStorage.getItem('wendy_weekly_scores_w1') ?? '[]')).toEqual([{ playerId: '2' }])
  })
})

describe('toAdminError', () => {
  it('falls back to UNKNOWN with the original message', () => {
    expect(toAdminError(new Error('boom'))).toEqual({ code: 'UNKNOWN', message: 'boom' })
  })
})
