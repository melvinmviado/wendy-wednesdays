import { supabase, isSupabaseConfigured } from '../lib/supabase'
import type { PlayerAdminError, PlayerScore, Result } from '../types/leaderboard'
import { errorMessage } from '../utils/errorMessage'
import { isPlayerRole, type PlayerRole } from '../types/roles'
import { initialPlayers } from './leaderboardData'

export const PLAYERS_STORAGE_KEY = 'wendy_leaderboard_players'
const WEEKLY_STORAGE_PREFIX = 'wendy_weekly_scores_w'
const SEASON_WEEKS = 8

interface PlayerRow {
  id: string
  name: string
  weeks_played: number | null
  total_points: number | null
  archived_at: string | null
  updated_at: string | null
  avatar_url?: string | null // absent until the player_avatars migration is applied
  // Embedded select: PostgREST returns an object for this one-to-one relation (array tolerated).
  player_roles?: { role_key: string } | { role_key: string }[] | null
}

// Named columns (not *): players.user_id links a player to an auth account and the app never
// needs it here, so it is not sent to every visitor.
const PLAYER_SELECT = 'id, name, weeks_played, total_points, archived_at, updated_at, avatar_url, player_roles(role_key)'

function embeddedRole(row: PlayerRow): PlayerRole | null {
  const r = Array.isArray(row.player_roles) ? row.player_roles[0] : row.player_roles
  return r && isPlayerRole(r.role_key) ? r.role_key : null
}

/** Fields an admin may edit. Name only for now. */
export interface PlayerPatch {
  name?: string
}

export interface FetchPlayersOptions {
  includeArchived?: boolean
}

const toPlayer = (row: PlayerRow): PlayerScore => ({
  id: row.id,
  name: row.name,
  weeksPlayed: row.weeks_played ?? 0,
  totalPoints: row.total_points ?? 0,
  archivedAt: row.archived_at,
  avatarUrl: row.avatar_url ?? null,
  updatedAt: row.updated_at ?? undefined,
  role: embeddedRole(row),
})

const fail = (code: PlayerAdminError['code'], message: string): Result<never> => ({
  ok: false,
  error: { code, message },
})

const ok = <T>(data: T): Result<T> => ({ ok: true, data })

/** Maps anything thrown or returned by Supabase to one consistent error shape. */
export function toAdminError(e: unknown): PlayerAdminError {
  const code = typeof e === 'object' && e !== null && 'code' in e ? String((e as { code: unknown }).code) : ''
  if (code === '23505') {
    return { code: 'DUPLICATE_NAME', message: 'Another active player already has that name.' }
  }
  if (code === '23514') {
    return { code: 'INVALID_NAME', message: 'Player name cannot be blank.' }
  }
  if (code === '42501') {
    return { code: 'FORBIDDEN', message: 'You do not have permission to change players.' }
  }
  return { code: 'UNKNOWN', message: errorMessage(e, 'Something went wrong updating the player.') }
}

// ---- Demo mode (no Supabase): the roster lives in localStorage ----

function readLocal(): PlayerScore[] {
  try {
    const raw = localStorage.getItem(PLAYERS_STORAGE_KEY)
    // Nothing saved yet: the app is showing the seed roster, so admin actions must see it too
    return raw ? (JSON.parse(raw) as PlayerScore[]) : initialPlayers
  } catch {
    return []
  }
}

function writeLocal(players: PlayerScore[]): void {
  localStorage.setItem(PLAYERS_STORAGE_KEY, JSON.stringify(players))
}

/**
 * Saves the active roster to the demo-mode cache without losing archived players,
 * which the UI keeps out of its active list.
 */
export function persistActivePlayers(active: PlayerScore[]): void {
  writeLocal([...active, ...readLocal().filter((p) => p.archivedAt)])
}

const nameKey = (name: string) => name.trim().toLowerCase()

function localNameTaken(players: PlayerScore[], name: string, exceptId: string): boolean {
  const key = nameKey(name)
  return players.some((p) => p.id !== exceptId && !p.archivedAt && nameKey(p.name) === key)
}

function updateLocal(id: string, change: (p: PlayerScore) => PlayerScore): Result<PlayerScore> {
  const players = readLocal()
  const current = players.find((p) => p.id === id)
  if (!current) return fail('NOT_FOUND', 'Player not found.')
  const updated = { ...change(current), updatedAt: new Date().toISOString() }
  writeLocal(players.map((p) => (p.id === id ? updated : p)))
  return ok(updated)
}

// ---- Queries ----

/** Players from the table. Archived players are excluded unless `includeArchived` is set. */
export async function fetchPlayers(options: FetchPlayersOptions = {}): Promise<Result<PlayerScore[]>> {
  const { includeArchived = false } = options

  if (!isSupabaseConfigured) {
    const all = readLocal()
    return ok(includeArchived ? all : all.filter((p) => !p.archivedAt))
  }

  try {
    const run = (select: string) => {
      const query = supabase.from('players').select(select).order('total_points', { ascending: false })
      return includeArchived ? query : query.is('archived_at', null)
    }
    let { data, error } = await run(PLAYER_SELECT)
    // The roles migration may not be applied yet: fall back to a plain select instead of breaking the roster.
    if (error && (error.code === 'PGRST200' || error.code === '42P01')) ({ data, error } = await run('*'))
    if (error) return { ok: false, error: toAdminError(error) }
    return ok(((data ?? []) as unknown as PlayerRow[]).map(toPlayer))
  } catch (e: unknown) {
    return { ok: false, error: toAdminError(e) }
  }
}

interface StandingsRow {
  id: string
  name: string
  weeks_played: number | null
  total_points: number | null
  avatar_url?: string | null // resolved in the view; absent before the player_avatars migration
  role_key?: string | null // absent before the leaderboard_role migration
  is_claimed?: boolean | null // absent before the leaderboard_claimed migration
}

/**
 * The season standings from the database-computed season_leaderboard view (active players only),
 * falling back to the players table on a database where the view doesn't exist yet.
 */
export async function fetchStandings(): Promise<PlayerScore[]> {
  const { data, error } = await supabase.from('season_leaderboard').select('*').order('total_points', { ascending: false })
  if (!error && data) {
    return (data as StandingsRow[]).map((r) => ({
      id: r.id,
      name: r.name,
      weeksPlayed: r.weeks_played ?? 0,
      totalPoints: r.total_points ?? 0,
      avatarUrl: r.avatar_url ?? null,
      role: isPlayerRole(r.role_key) ? r.role_key : null,
      isClaimed: r.is_claimed === true,
    }))
  }
  const result = await fetchPlayers()
  if (!result.ok) throw new Error(result.error.message)
  return result.data
}

/**
 * Realtime: `onScores` for weekly_scores changes, `onRoster` for players and player_roles.
 * Returns the unsubscribe function.
 */
export function subscribeStandingsChanges(onScores: () => void, onRoster: () => void): () => void {
  const channel = supabase
    .channel('public:leaderboard_changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'weekly_scores' }, onScores)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'players' }, onRoster)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'player_roles' }, onRoster)
    .subscribe()
  return () => {
    void supabase.removeChannel(channel)
  }
}

/** How many attended weeks would be erased with this player (used by the delete confirmation). */
export async function getPlayerScoreCount(playerId: string): Promise<Result<number>> {
  if (!isSupabaseConfigured) {
    let weeks = 0
    for (let w = 1; w <= SEASON_WEEKS; w++) {
      const raw = localStorage.getItem(`${WEEKLY_STORAGE_PREFIX}${w}`)
      if (!raw) continue
      try {
        const rows = JSON.parse(raw) as { playerId: string; attended: boolean }[]
        if (rows.some((r) => r.playerId === playerId && r.attended)) weeks++
      } catch {
        // ignore corrupt entry
      }
    }
    return ok(weeks)
  }

  try {
    const { count, error } = await supabase
      .from('weekly_scores')
      .select('id', { count: 'exact', head: true })
      .eq('player_id', playerId)
      .eq('attended', true)
    if (error) return { ok: false, error: toAdminError(error) }
    return ok(count ?? 0)
  } catch (e: unknown) {
    return { ok: false, error: toAdminError(e) }
  }
}

// ---- Mutations ----

async function updateRow(id: string, fields: Record<string, unknown>): Promise<Result<PlayerScore>> {
  try {
    const { data, error } = await supabase.from('players').update(fields).eq('id', id).select().maybeSingle()
    if (error) return { ok: false, error: toAdminError(error) }
    // RLS or a missing id both surface as "no row came back"
    if (!data) return fail('NOT_FOUND', 'Player not found, or you do not have permission to change it.')
    return ok(toPlayer(data as PlayerRow))
  } catch (e: unknown) {
    return { ok: false, error: toAdminError(e) }
  }
}

/** Adds an active player with no history yet. The leaderboard view computes their totals from weekly scores. */
export async function createPlayer(name: string): Promise<Result<PlayerScore>> {
  const clean = name.trim()
  if (!clean) return fail('INVALID_NAME', 'Player name cannot be blank.')

  if (!isSupabaseConfigured) {
    const all = readLocal()
    if (localNameTaken(all, clean, '')) return fail('DUPLICATE_NAME', 'Another active player already has that name.')
    const player: PlayerScore = { id: Date.now().toString(), name: clean, weeksPlayed: 0, totalPoints: 0, archivedAt: null }
    writeLocal([player, ...all])
    return ok(player)
  }
  try {
    const { data, error } = await supabase
      .from('players')
      .insert({ name: clean }) // totals are computed by the database (always 0 for a new player)
      .select()
      .single()
    if (error) return { ok: false, error: toAdminError(error) }
    return ok(toPlayer(data as PlayerRow))
  } catch (e: unknown) {
    return { ok: false, error: toAdminError(e) }
  }
}

/** Edit admin-editable fields. Currently the name only. */
export async function updatePlayer(id: string, patch: PlayerPatch): Promise<Result<PlayerScore>> {
  const fields: Record<string, unknown> = {}

  if (patch.name !== undefined) {
    const name = patch.name.trim()
    if (!name) return fail('INVALID_NAME', 'Player name cannot be blank.')
    fields.name = name
  }
  if (Object.keys(fields).length === 0) return fail('UNKNOWN', 'Nothing to update.')

  if (!isSupabaseConfigured) {
    const name = typeof fields.name === 'string' ? fields.name : undefined
    if (name && localNameTaken(readLocal(), name, id)) {
      return fail('DUPLICATE_NAME', 'Another active player already has that name.')
    }
    return updateLocal(id, (p) => ({ ...p, ...(name ? { name } : {}) }))
  }
  return updateRow(id, fields)
}

export const renamePlayer = (id: string, name: string): Promise<Result<PlayerScore>> =>
  updatePlayer(id, { name })

/** Hides the player from the leaderboard and weekly roster. Their history is kept. */
export async function archivePlayer(id: string): Promise<Result<PlayerScore>> {
  if (!isSupabaseConfigured) {
    return updateLocal(id, (p) => ({ ...p, archivedAt: new Date().toISOString() }))
  }
  return updateRow(id, { archived_at: new Date().toISOString() })
}

/** Brings an archived player back. Fails with DUPLICATE_NAME if an active player took their name. */
export async function restorePlayer(id: string): Promise<Result<PlayerScore>> {
  if (!isSupabaseConfigured) {
    const current = readLocal().find((p) => p.id === id)
    if (current && localNameTaken(readLocal(), current.name, id)) {
      return fail('DUPLICATE_NAME', 'Another active player already has that name.')
    }
    return updateLocal(id, (p) => ({ ...p, archivedAt: null }))
  }
  return updateRow(id, { archived_at: null })
}

/** Permanently deletes the player. In Supabase their weekly_scores rows cascade. */
export async function deletePlayer(id: string): Promise<Result<void>> {
  if (!isSupabaseConfigured) {
    writeLocal(readLocal().filter((p) => p.id !== id))
    for (let w = 1; w <= SEASON_WEEKS; w++) {
      const key = `${WEEKLY_STORAGE_PREFIX}${w}`
      const raw = localStorage.getItem(key)
      if (!raw) continue
      try {
        const rows = JSON.parse(raw) as { playerId: string }[]
        localStorage.setItem(key, JSON.stringify(rows.filter((r) => r.playerId !== id)))
      } catch {
        // ignore corrupt entry
      }
    }
    return ok(undefined)
  }

  try {
    // select() so a silent RLS no-op is detectable
    const { data, error } = await supabase.from('players').delete().eq('id', id).select('id')
    if (error) return { ok: false, error: toAdminError(error) }
    if (!data || data.length === 0) {
      return fail('NOT_FOUND', 'Player not found, or you do not have permission to delete it.')
    }
    return ok(undefined)
  } catch (e: unknown) {
    return { ok: false, error: toAdminError(e) }
  }
}

/** Sets (or, with null, clears) a player's cosmetic role through the admin-only RPC. Surfaces the server's message. */
export async function setPlayerRole(playerId: string, role: PlayerRole | null): Promise<Result<null>> {
  if (!isSupabaseConfigured) {
    const res = updateLocal(playerId, (p) => ({ ...p, role }))
    return res.ok ? ok(null) : res
  }
  try {
    const { error } = await supabase.rpc('set_player_role', { p_player_id: playerId, p_role: role })
    if (error) {
      const code = error.code === '42501' ? 'FORBIDDEN' : error.code === 'P0002' ? 'NOT_FOUND' : 'UNKNOWN'
      return fail(code, errorMessage(error, 'Could not update the role.'))
    }
    return ok(null)
  } catch (e: unknown) {
    return fail('UNKNOWN', errorMessage(e, 'Could not update the role.'))
  }
}
