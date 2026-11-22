import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ADMIN_ONLY_MESSAGE } from '../types/rsvp'
import { supabaseRsvpApi } from './rsvps'

// Records every RPC call; each answer is set by the test.
const rpc = vi.hoisted(() => ({
  calls: [] as Array<{ fn: string; args: Record<string, unknown> }>,
  answer: (): Promise<{ data: unknown; error: unknown }> => Promise.resolve({ data: null, error: null }),
}))

vi.mock('../lib/supabase', () => ({
  supabase: {
    rpc: (fn: string, args: Record<string, unknown>) => {
      rpc.calls.push({ fn, args })
      return rpc.answer()
    },
  },
}))

const stateRow = {
  session_date: '2026-11-25', capacity: 24, cutoff_at: '2026-11-25T23:00:00Z', live_start: '2026-11-26T01:00:00Z',
  live_end: '2026-11-26T03:00:00Z', server_now: '2026-11-25T15:00:00Z', in_count: 3, waitlist_count: 0,
  my_status: 'in', my_position: 2,
  my_rsvps: [{ rsvp_id: 'r1', player_id: 'p1', name: 'Ann', is_guest: false, status: 'in', position: 2 }],
}
const answer = (data: unknown, error: unknown = null) => { rpc.answer = () => Promise.resolve({ data, error }) }

beforeEach(() => {
  rpc.calls = []
  answer(null)
})

describe('supabaseRsvpApi', () => {
  it('getState accepts the row as an array or as an object', async () => {
    answer([stateRow])
    const a = await supabaseRsvpApi.getState('tok')
    answer(stateRow)
    const b = await supabaseRsvpApi.getState('tok')
    expect(a).toEqual(b)
    expect(a).toMatchObject({ sessionDate: '2026-11-25', capacity: 24, inCount: 3, myPosition: 2 })
    expect(a.cutoffAt).toBeInstanceOf(Date)
    expect(a.myRsvps).toEqual([{ rsvpId: 'r1', playerId: 'p1', name: 'Ann', isGuest: false, status: 'in', position: 2 }])
    expect(rpc.calls[0]).toEqual({ fn: 'get_rsvp_state', args: { p_session_date: null, p_device_token: 'tok' } })
  })

  it('getState with no row is an error, not a crash', async () => {
    answer([])
    await expect(supabaseRsvpApi.getState('tok')).rejects.toMatchObject({ code: 'UNKNOWN' })
  })

  it('setRsvp sends a player or a guest, never both', async () => {
    answer({ rsvp_id: 'r9', status: 'in', position: 4, waitlist_position: null })
    const res = await supabaseRsvpApi.setRsvp({ identity: { kind: 'player', playerId: 'p1', name: 'Ann' }, status: 'in', token: 't' })
    await supabaseRsvpApi.setRsvp({ identity: { kind: 'guest', name: 'Gus' }, status: 'out', token: 't' })
    expect(res).toEqual({ rsvpId: 'r9', status: 'in', position: 4, waitlistPosition: null })
    expect(rpc.calls.map((c) => c.args)).toEqual([
      { p_player_id: 'p1', p_guest_name: null, p_device_token: 't', p_status: 'in', p_session_date: null },
      { p_player_id: null, p_guest_name: 'Gus', p_device_token: 't', p_status: 'out', p_session_date: null },
    ])
  })

  it('maps set_rsvp refusals to friendly errors', async () => {
    answer(null, { code: 'RV011', message: 'raw' })
    await expect(supabaseRsvpApi.setRsvp({ identity: { kind: 'guest', name: 'Gus' }, status: 'in', token: 't' }))
      .rejects.toMatchObject({ code: 'ADDED_BY_ORGANIZER' })
  })

  it('admin calls: RV003 means the player is unavailable, 42501 means not an admin', async () => {
    answer(null, { code: 'RV003', message: 'x' })
    await expect(supabaseRsvpApi.adminAddRsvp({ playerId: 'p1' })).rejects.toMatchObject({ code: 'PLAYER_UNAVAILABLE' })
    answer(null, { code: '42501', message: 'x' })
    await expect(supabaseRsvpApi.adminRemoveRsvp({ playerId: 'p1' })).rejects.toMatchObject({ code: 'FORBIDDEN', message: ADMIN_ONLY_MESSAGE })
    answer(null, { code: '42501', message: 'x' })
    await expect(supabaseRsvpApi.adminRemoveGuest('g1')).rejects.toMatchObject({ code: 'FORBIDDEN', message: ADMIN_ONLY_MESSAGE })
  })

  it('admin calls map their result rows', async () => {
    answer({ rsvp_id: 'r2', session_date: '2026-11-25', status: 'in', changed: true, position: 1 })
    await expect(supabaseRsvpApi.adminAddGuest({ name: 'Gus' })).resolves.toEqual({
      rsvpId: 'r2', sessionDate: '2026-11-25', status: 'in', changed: true, position: 1, waitlistPosition: null,
    })
    expect(rpc.calls[0]).toEqual({ fn: 'admin_add_guest_rsvp', args: { p_guest_name: 'Gus', p_session_date: null } })

    answer({ rsvp_id: 'r2', session_date: '2026-11-25', name: 'Gus B', changed: true })
    await expect(supabaseRsvpApi.adminRenameGuest('r2', 'Gus B')).resolves.toEqual({ rsvpId: 'r2', sessionDate: '2026-11-25', name: 'Gus B', changed: true })
  })

  it('a network failure becomes a NETWORK error', async () => {
    rpc.answer = () => Promise.reject(new TypeError('Failed to fetch'))
    await expect(supabaseRsvpApi.getRoster()).rejects.toMatchObject({ code: 'NETWORK' })
  })
})
