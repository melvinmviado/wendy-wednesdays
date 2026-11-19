import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({ insert: vi.fn(), rpc: vi.fn(), pendingRows: vi.fn() }))

vi.mock('../lib/supabase', () => ({
  isSupabaseConfigured: true,
  supabase: {
    // insert(...) for submitClaim; select().eq().order() for the no-email fallback; select().in() for names
    from: (table: string) => ({
      insert: m.insert,
      select: () =>
        table === 'profiles'
          ? { in: () => Promise.resolve({ data: [{ id: 'u2', display_name: 'Ada L' }], error: null }) }
          : { eq: () => ({ order: () => m.pendingRows() }) },
    }),
    rpc: m.rpc,
  },
}))

import { approveClaim, claimErrorMessage, deriveClaimView, fetchPendingClaims, isClaimsUnavailable, rejectClaim, submitClaim, unlinkPlayer } from './claims'
import type { MyClaim } from '../types/claims'

const none: MyClaim = { linkedPlayer: null, latest: null }
const req = (status: 'pending' | 'rejected' | 'approved', playerId = 'p1') => ({
  id: 'r1',
  playerId,
  playerName: playerId === 'p1' ? 'Ada' : 'Grace',
  status,
  createdAt: '2026-01-01T00:00:00Z',
})
const view = (over: Partial<Parameters<typeof deriveClaimView>[0]> = {}) =>
  deriveClaimView({ playerId: 'p1', userId: 'u1', ownerId: null, my: none, ...over })

describe('deriveClaimView', () => {
  it('offers a claim on a free player when you have nothing', () => {
    expect(view()).toEqual({ kind: 'available' })
  })
  it('recognises your own player', () => {
    expect(view({ ownerId: 'u1' })).toEqual({ kind: 'mine' })
  })
  it('hides the box on someone else\'s player', () => {
    expect(view({ ownerId: 'u2' })).toEqual({ kind: 'hidden' })
  })
  it('hides the box when you already have a player', () => {
    expect(view({ my: { linkedPlayer: { id: 'p9', name: 'Me' }, latest: null } })).toEqual({ kind: 'hidden' })
  })
  it('shows a pending request on this player, or on another one', () => {
    expect(view({ my: { linkedPlayer: null, latest: req('pending') } })).toEqual({ kind: 'pending-here' })
    expect(view({ my: { linkedPlayer: null, latest: req('pending', 'p2') } })).toEqual({ kind: 'pending-elsewhere', playerName: 'Grace' })
  })
  it('lets you ask again after a decline on this player, but not mention declines on others', () => {
    expect(view({ my: { linkedPlayer: null, latest: req('rejected') } })).toEqual({ kind: 'declined-here' })
    expect(view({ my: { linkedPlayer: null, latest: req('rejected', 'p2') } })).toEqual({ kind: 'available' })
  })
})

describe('claimErrorMessage', () => {
  it('explains each database refusal in plain words', () => {
    expect(claimErrorMessage({ code: '23505', message: 'duplicate key ... "claim_requests_one_pending_per_player"' })).toMatch(/already asked to claim this player/)
    expect(claimErrorMessage({ code: '23505', message: 'duplicate key ... "claim_requests_one_pending_per_user"' })).toMatch(/already have a pending request/)
    expect(claimErrorMessage({ code: '42501', message: 'new row violates row-level security policy' })).toMatch(/already be claimed/)
    expect(claimErrorMessage({ code: '42501', message: 'Admins only' })).toBe('Only admins can do that.')
    expect(claimErrorMessage({ code: '55000', message: 'Player is already claimed' })).toBe('Player is already claimed')
    expect(claimErrorMessage({ code: 'P0002', message: 'x' })).toMatch(/no longer exists/)
    expect(claimErrorMessage(new Error('boom'))).toBe('boom')
  })
})

describe('isClaimsUnavailable', () => {
  it('detects a database without the claims migration', () => {
    expect(isClaimsUnavailable({ code: 'PGRST205' })).toBe(true)
    expect(isClaimsUnavailable({ code: '42P01' })).toBe(true)
    expect(isClaimsUnavailable({ code: '42501' })).toBe(false)
    expect(isClaimsUnavailable(new Error('network'))).toBe(false)
  })
})

describe('writes', () => {
  beforeEach(() => {
    m.insert.mockReset().mockResolvedValue({ error: null })
    m.rpc.mockReset().mockResolvedValue({ error: null })
  })
  it('submitClaim trims the message and sends null when blank', async () => {
    await submitClaim('p1', 'u1', '  hello  ')
    expect(m.insert).toHaveBeenLastCalledWith({ player_id: 'p1', user_id: 'u1', message: 'hello' })
    await submitClaim('p1', 'u1', '   ')
    expect(m.insert).toHaveBeenLastCalledWith({ player_id: 'p1', user_id: 'u1', message: null })
  })
  it('submitClaim throws what the database returned', async () => {
    m.insert.mockResolvedValue({ error: { code: '23505', message: 'dup' } })
    await expect(submitClaim('p1', 'u1', '')).rejects.toMatchObject({ code: '23505' })
  })
  it('calls the three admin functions with the right arguments', async () => {
    await approveClaim('r1')
    await rejectClaim('r2')
    await unlinkPlayer('p3')
    expect(m.rpc.mock.calls).toEqual([
      ['approve_claim_request', { p_request_id: 'r1' }],
      ['reject_claim_request', { p_request_id: 'r2' }],
      ['unlink_player', { p_player_id: 'p3' }],
    ])
  })
  it('an admin function error is thrown, not swallowed', async () => {
    m.rpc.mockResolvedValue({ error: { code: '42501', message: 'Admins only' } })
    await expect(approveClaim('r1')).rejects.toMatchObject({ code: '42501' })
  })
})

describe('fetchPendingClaims', () => {
  const row = { request_id: 'r1', player_id: 'p1', player_name: 'Ada', user_id: 'u2', email: 'ada@example.com', display_name: 'Ada L', message: 'hi', created_at: '2026-01-01T00:00:00Z' }
  beforeEach(() => {
    m.rpc.mockReset()
    m.pendingRows.mockReset()
  })

  it('reads requests with emails from the admin-only function', async () => {
    m.rpc.mockResolvedValue({ data: [row], error: null })
    expect(await fetchPendingClaims()).toEqual([
      { id: 'r1', playerId: 'p1', playerName: 'Ada', userId: 'u2', requesterName: 'Ada L', requesterEmail: 'ada@example.com', message: 'hi', createdAt: '2026-01-01T00:00:00Z' },
    ])
    expect(m.rpc).toHaveBeenCalledWith('admin_pending_claims')
  })

  it('surfaces a refusal instead of falling back', async () => {
    m.rpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'Admins only' } })
    await expect(fetchPendingClaims()).rejects.toMatchObject({ code: '42501' })
    expect(m.pendingRows).not.toHaveBeenCalled()
  })

  it('falls back to the tables, without emails, when the function is not installed yet', async () => {
    m.rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'function not found' } })
    m.pendingRows.mockResolvedValue({
      data: [{ id: 'r1', player_id: 'p1', user_id: 'u2', message: null, created_at: 'x', players: { name: 'Ada' } }],
      error: null,
    })
    const [first] = await fetchPendingClaims()
    expect(first).toMatchObject({ id: 'r1', playerName: 'Ada', requesterName: 'Ada L', requesterEmail: null })
  })
})
