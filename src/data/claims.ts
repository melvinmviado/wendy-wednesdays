import { supabase } from '../lib/supabase'
import type { ClaimView, LinkedPlayer, MyClaim, OwnClaimRequest, PendingClaim } from '../types/claims'
import { errorMessage } from '../utils/errorMessage'

export const MAX_CLAIM_MESSAGE = 500

interface ErrorLike {
  code?: string
  message?: string
}
const asErr = (e: unknown): ErrorLike => (typeof e === 'object' && e !== null ? (e as ErrorLike) : {})

/** True when the claims migration has not been applied (missing table/column), so the feature should stay hidden. */
export function isClaimsUnavailable(e: unknown): boolean {
  // PGRST205 / 42P01: table missing. PGRST204 / 42703: players.user_id column missing.
  const { code } = asErr(e)
  return code === 'PGRST205' || code === '42P01' || code === 'PGRST204' || code === '42703'
}

/** Friendly text for anything the claim tables or functions can throw. */
export function claimErrorMessage(e: unknown): string {
  const { code, message = '' } = asErr(e)
  if (code === '23505') {
    return message.includes('per_player')
      ? 'Someone has already asked to claim this player. An admin needs to review that request first.'
      : 'You already have a pending request. Wait for an admin to review it.'
  }
  // The insert policy rejects: player already claimed or archived, you already have a player, or an anonymous session.
  if (code === '42501' && /row-level security/i.test(message)) {
    return "This request can't be made: the player may already be claimed, or your account already has a player."
  }
  if (code === '42501') return 'Only admins can do that.'
  if (code === 'P0002') return 'That request no longer exists. Refresh and try again.'
  if (code === '55000') return message || 'That request has already been handled.'
  if (code === '23514') return `Keep the message under ${MAX_CLAIM_MESSAGE} characters.`
  return errorMessage(e, 'Something went wrong. Please try again.')
}

// ---- Signed-in user ----

interface OwnRequestRow {
  id: string
  player_id: string
  status: OwnClaimRequest['status']
  created_at: string
  players: { name: string } | { name: string }[] | null
}

const nameOf = (p: OwnRequestRow['players']): string => (Array.isArray(p) ? p[0]?.name : p?.name) ?? 'this player'

/** The caller's linked player and most recent request. RLS only ever returns the caller's own rows. */
export async function fetchMyClaim(userId: string): Promise<MyClaim> {
  const [linked, latest] = await Promise.all([
    supabase.from('players').select('id, name').eq('user_id', userId).maybeSingle(),
    supabase
      .from('player_claim_requests')
      .select('id, player_id, status, created_at, players(name)')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])
  if (linked.error) throw linked.error
  if (latest.error) throw latest.error
  const row = latest.data as OwnRequestRow | null
  return {
    linkedPlayer: linked.data ? { id: linked.data.id as string, name: linked.data.name as string } : null,
    latest: row
      ? { id: row.id, playerId: row.player_id, playerName: nameOf(row.players), status: row.status, createdAt: row.created_at }
      : null,
  }
}

/** Who (if anyone) owns this player. Players are publicly readable. */
export async function fetchPlayerOwner(playerId: string): Promise<string | null> {
  const { data, error } = await supabase.from('players').select('user_id').eq('id', playerId).maybeSingle()
  if (error) throw error
  return (data?.user_id as string | null | undefined) ?? null
}

export async function submitClaim(playerId: string, userId: string, message: string): Promise<void> {
  const trimmed = message.trim()
  const { error } = await supabase
    .from('player_claim_requests')
    .insert({ player_id: playerId, user_id: userId, message: trimmed === '' ? null : trimmed })
  if (error) throw error
}

/** Pure: what the claim box shows. Kept separate so every branch is easy to test. */
export function deriveClaimView(args: {
  playerId: string
  userId: string
  ownerId: string | null
  my: MyClaim
}): ClaimView {
  const { playerId, userId, ownerId, my } = args
  if (ownerId === userId) return { kind: 'mine' }
  if (ownerId !== null || my.linkedPlayer) return { kind: 'hidden' }
  const last = my.latest
  if (last?.status === 'pending') {
    return last.playerId === playerId ? { kind: 'pending-here' } : { kind: 'pending-elsewhere', playerName: last.playerName }
  }
  if (last?.status === 'rejected' && last.playerId === playerId) return { kind: 'declined-here' }
  return { kind: 'available' }
}

// ---- Admin ----

interface PendingRow {
  id: string
  player_id: string
  user_id: string
  message: string | null
  created_at: string
  players: { name: string } | { name: string }[] | null
}

const displayNames = async (ids: string[]): Promise<Map<string, string | null>> => {
  const names = new Map<string, string | null>()
  if (ids.length === 0) return names
  const { data, error } = await supabase.from('profiles').select('id, display_name').in('id', ids)
  if (error) throw error
  for (const r of data ?? []) names.set(r.id as string, (r.display_name as string | null) ?? null)
  return names
}

interface AdminClaimRow {
  request_id: string
  player_id: string
  player_name: string
  user_id: string
  email: string | null
  display_name: string | null
  message: string | null
  created_at: string
}

/**
 * Pending requests with the requester's email, from the admin-only SQL function
 * admin_pending_claims() (20261123000000_claim_request_emails.sql). Falls back to the plain
 * tables, without emails, if that migration has not been applied yet.
 */
export async function fetchPendingClaims(): Promise<PendingClaim[]> {
  const { data, error } = await supabase.rpc('admin_pending_claims')
  if (!error) {
    return ((data ?? []) as AdminClaimRow[]).map((r) => ({
      id: r.request_id,
      playerId: r.player_id,
      playerName: r.player_name,
      userId: r.user_id,
      requesterName: r.display_name,
      requesterEmail: r.email,
      message: r.message,
      createdAt: r.created_at,
    }))
  }
  if (asErr(error).code !== 'PGRST202') throw error // anything but "function not found"
  return fetchPendingClaimsWithoutEmail()
}

async function fetchPendingClaimsWithoutEmail(): Promise<PendingClaim[]> {
  const { data, error } = await supabase
    .from('player_claim_requests')
    .select('id, player_id, user_id, message, created_at, players(name)')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
  if (error) throw error
  const rows = (data ?? []) as PendingRow[]
  const names = await displayNames([...new Set(rows.map((r) => r.user_id))])
  return rows.map((r) => ({
    id: r.id,
    playerId: r.player_id,
    playerName: nameOf(r.players),
    userId: r.user_id,
    requesterName: names.get(r.user_id) ?? null,
    requesterEmail: null,
    message: r.message,
    createdAt: r.created_at,
  }))
}

export async function fetchLinkedPlayers(): Promise<LinkedPlayer[]> {
  const { data, error } = await supabase
    .from('players')
    .select('id, name, user_id')
    .not('user_id', 'is', null)
    .order('name', { ascending: true })
  if (error) throw error
  const rows = (data ?? []) as { id: string; name: string; user_id: string }[]
  const names = await displayNames([...new Set(rows.map((r) => r.user_id))])
  return rows.map((r) => ({ playerId: r.id, playerName: r.name, userId: r.user_id, userName: names.get(r.user_id) ?? null }))
}

const rpc = async (fn: string, args: Record<string, string>): Promise<void> => {
  const { error } = await supabase.rpc(fn, args)
  if (error) throw error
}

export const approveClaim = (requestId: string) => rpc('approve_claim_request', { p_request_id: requestId })
export const rejectClaim = (requestId: string) => rpc('reject_claim_request', { p_request_id: requestId })
export const unlinkPlayer = (playerId: string) => rpc('unlink_player', { p_player_id: playerId })
