import { beforeEach, describe, expect, it, vi } from 'vitest'

// A stand-in for the Supabase client that records each query and answers per table.
const calls: { table: string; select: string; eq: [string, unknown][] }[] = []
const answers: Record<string, { data: unknown; error: unknown }> = {}
const listeners: { event: string; table: string; filter?: string }[] = []

function query(table: string) {
  const call = { table, select: '', eq: [] as [string, unknown][] }
  calls.push(call)
  const q = {
    select: (cols: string) => ((call.select = cols), q),
    eq: (col: string, v: unknown) => (call.eq.push([col, v]), q),
    order: () => q,
    maybeSingle: () => q,
    then: (resolve: (v: unknown) => void) => resolve(answers[table]),
  }
  return q
}

vi.mock('@/lib/supabase', () => ({
  isSupabaseConfigured: true,
  supabase: {
    from: (t: string) => query(t),
    channel: () => {
      const ch = {
        on: (_k: string, o: { event: string; table: string; filter?: string }) => (listeners.push(o), ch),
        subscribe: () => ch,
      }
      return ch
    },
    removeChannel: vi.fn(),
  },
}))

const { supabasePublicBoardApi } = await import('./publicCourtBoard')

const row = { player_id: 'p1', name: 'Ann', avatar_url: null, court_position: 0, court_number: 10, slot: 0, seed_rank: 1, published_at: '2026-11-25T23:10:00Z' }

beforeEach(() => {
  calls.length = 0
  listeners.length = 0
})

describe('supabasePublicBoardApi', () => {
  it('reads only the public view, and only a published run, with no account fields', async () => {
    answers.court_assignment_board = { data: [row], error: null }
    const r = await supabasePublicBoardApi.load('2026-11-25')
    expect(r.ok && r.data?.seats).toEqual([
      { playerId: 'p1', name: 'Ann', avatarUrl: null, seedRank: 1, courtPosition: 0, courtNumber: 10, slot: 0 },
    ])
    expect(calls[0].table).toBe('court_assignment_board')
    expect(calls[0].eq).toEqual([['session_date', '2026-11-25'], ['state', 'published']])
    expect(calls[0].select).not.toMatch(/user_id|email|generated_by/)
  })

  it('tells "not published" from "published with nobody on it"', async () => {
    answers.court_assignment_board = { data: [], error: null }
    answers.event_assignment_meta = { data: null, error: null }
    expect(await supabasePublicBoardApi.load('2026-11-25')).toEqual({ ok: true, data: null })

    answers.event_assignment_meta = { data: { state: 'published', published_at: '2026-11-25T23:10:00Z' }, error: null }
    expect(await supabasePublicBoardApi.load('2026-11-25')).toEqual({
      ok: true, data: { sessionDate: '2026-11-25', publishedAt: '2026-11-25T23:10:00Z', seats: [] },
    })
    // Explicit columns: anon is not granted generated_by, so select=* would fail.
    expect(calls.at(-1)).toMatchObject({ table: 'event_assignment_meta', select: 'state, published_at' })
  })

  it('listens for deletes on every run (they carry no date), and for its own run otherwise', () => {
    supabasePublicBoardApi.subscribe('2026-11-25', () => {})
    expect(listeners).toEqual([
      { event: 'INSERT', schema: 'public', table: 'court_assignments', filter: 'session_date=eq.2026-11-25' },
      { event: 'UPDATE', schema: 'public', table: 'court_assignments', filter: 'session_date=eq.2026-11-25' },
      { event: 'DELETE', schema: 'public', table: 'court_assignments' },
      { event: '*', schema: 'public', table: 'event_assignment_meta', filter: 'session_date=eq.2026-11-25' },
    ])
  })
})
