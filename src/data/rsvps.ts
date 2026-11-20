import { supabase } from '../lib/supabase'
import {
  ADMIN_ONLY_MESSAGE,
  RsvpError,
  type AdminAddGuestArgs,
  type AdminGuestRemoveResult,
  type AdminRsvpArgs,
  type AdminRsvpResult,
  type MyRsvp,
  type RsvpApi,
  type RsvpRosterEntry,
  type RsvpServerState,
  type RsvpStatus,
  type SetRsvpResult,
} from '../types/rsvp'
import { toRsvpError } from '../utils/rsvpErrors'

// Supabase side of the RSVP API: thin wrappers over the RPCs in 20261124000000_rsvps.sql.
// The table itself is sealed, so these functions are the only way in.

interface MyRow {
  rsvp_id: string
  player_id: string | null
  name: string
  is_guest: boolean
  status: RsvpStatus
  position: number | null
}

interface StateRow {
  session_date: string
  capacity: number
  cutoff_at: string
  live_start: string
  live_end: string
  server_now: string
  in_count: number
  waitlist_count: number
  my_status: RsvpStatus | null
  my_position: number | null
  my_rsvps: MyRow[] | null
}

interface RosterRow {
  rsvp_id: string
  name: string
  avatar_url: string | null
  player_id: string | null
  is_guest: boolean
  status: RsvpStatus
  position: number | null
}

interface SetResultRow {
  rsvp_id: string | null
  status: RsvpStatus | null
  position: number | null
  waitlist_position: number | null
}

interface AdminResultRow {
  rsvp_id: string | null
  session_date: string
  status: RsvpStatus | null
  changed: boolean
  position?: number | null
  waitlist_position?: number | null
}

const mapAdminResult = (r: AdminResultRow | null): AdminRsvpResult => {
  if (!r) throw new RsvpError('UNKNOWN')
  return {
    rsvpId: r.rsvp_id,
    sessionDate: r.session_date,
    status: r.status,
    changed: r.changed,
    position: r.position ?? null,
    waitlistPosition: r.waitlist_position ?? null,
  }
}

/** For the admin functions RV003 means "archived or missing player" (not "claimed name") and 42501 means "not an admin". */
async function callAdmin(run: () => PromiseLike<{ data: AdminResultRow | null; error: unknown }>): Promise<AdminRsvpResult> {
  try {
    return mapAdminResult(await call<AdminResultRow>(run))
  } catch (e) {
    const err = toRsvpError(e)
    if (err.code === 'NAME_CLAIMED') throw new RsvpError('PLAYER_UNAVAILABLE')
    if (err.code === 'FORBIDDEN') throw new RsvpError('FORBIDDEN', { message: ADMIN_ONLY_MESSAGE }) // 42501 here means not an admin
    throw err
  }
}

interface GuestRemoveRow {
  rsvp_id: string
  session_date: string | null
  changed: boolean
}

/** admin_remove_guest_rsvp: 42501 means not an admin, 55000 means the id is a player's RSVP. */
async function callAdminGuest(run: () => PromiseLike<{ data: GuestRemoveRow | null; error: unknown }>): Promise<AdminGuestRemoveResult> {
  try {
    const r = await call<GuestRemoveRow>(run)
    if (!r) throw new RsvpError('UNKNOWN')
    return { rsvpId: r.rsvp_id, sessionDate: r.session_date, changed: r.changed }
  } catch (e) {
    const err = toRsvpError(e)
    if (err.code === 'FORBIDDEN') throw new RsvpError('FORBIDDEN', { message: ADMIN_ONLY_MESSAGE })
    throw err
  }
}

const mapMine = (r: MyRow): MyRsvp => ({
  rsvpId: r.rsvp_id,
  playerId: r.player_id,
  name: r.name,
  isGuest: r.is_guest,
  status: r.status,
  position: r.position,
})

export const mapState = (r: StateRow): RsvpServerState => ({
  sessionDate: r.session_date,
  capacity: r.capacity,
  cutoffAt: new Date(r.cutoff_at),
  liveStart: new Date(r.live_start),
  liveEnd: new Date(r.live_end),
  serverNow: new Date(r.server_now),
  inCount: r.in_count,
  waitlistCount: r.waitlist_count,
  myStatus: r.my_status,
  myPosition: r.my_position,
  myRsvps: (r.my_rsvps ?? []).map(mapMine),
})

export const mapRoster = (r: RosterRow): RsvpRosterEntry => ({
  rsvpId: r.rsvp_id,
  name: r.name,
  avatarUrl: r.avatar_url,
  playerId: r.player_id,
  isGuest: r.is_guest,
  status: r.status,
  position: r.position,
})

/** Runs an RPC and folds returned and thrown failures into one RsvpError. */
async function call<T>(run: () => PromiseLike<{ data: T | null; error: unknown }>): Promise<T | null> {
  try {
    const { data, error } = await run()
    if (error) throw toRsvpError(error)
    return data
  } catch (e) {
    throw toRsvpError(e)
  }
}

export const supabaseRsvpApi: RsvpApi = {
  async getState(token) {
    const data = await call<StateRow[] | StateRow>(() =>
      supabase.rpc('get_rsvp_state', { p_session_date: null, p_device_token: token }),
    )
    const row = Array.isArray(data) ? data[0] : data
    if (!row) throw new RsvpError('UNKNOWN')
    return mapState(row)
  },

  async getRoster() {
    const data = await call<RosterRow[]>(() => supabase.rpc('get_rsvp_roster', { p_session_date: null }))
    return (data ?? []).map(mapRoster)
  },

  async setRsvp({ identity, status, token }) {
    const data = await call<SetResultRow>(() =>
      supabase.rpc('set_rsvp', {
        p_player_id: identity.kind === 'player' ? identity.playerId : null,
        p_guest_name: identity.kind === 'guest' ? identity.name : null,
        p_device_token: token,
        p_status: status,
        p_session_date: null,
      }),
    )
    const result: SetRsvpResult = {
      rsvpId: data?.rsvp_id ?? null,
      status: data?.status ?? null,
      position: data?.position ?? null,
      waitlistPosition: data?.waitlist_position ?? null,
    }
    return result
  },

  adminAddRsvp({ playerId, sessionDate = null }: AdminRsvpArgs) {
    return callAdmin(() => supabase.rpc('admin_add_rsvp', { p_player_id: playerId, p_session_date: sessionDate }))
  },

  adminRemoveRsvp({ playerId, sessionDate = null }: AdminRsvpArgs) {
    return callAdmin(() => supabase.rpc('admin_remove_rsvp', { p_player_id: playerId, p_session_date: sessionDate }))
  },

  adminAddGuest({ name, sessionDate = null }: AdminAddGuestArgs) {
    return callAdmin(() => supabase.rpc('admin_add_guest_rsvp', { p_guest_name: name, p_session_date: sessionDate }))
  },

  adminRemoveGuest(guestId) {
    return callAdminGuest(() => supabase.rpc('admin_remove_guest_rsvp', { p_rsvp_id: guestId }))
  },
}
