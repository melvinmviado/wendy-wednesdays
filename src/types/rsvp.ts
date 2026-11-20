export type RsvpStatus = 'in' | 'out'

/** Who an RSVP is for: a roster player, or a named guest. */
export type RsvpIdentity =
  | { kind: 'player'; playerId: string; name: string }
  | { kind: 'guest'; name: string }

/** One of the caller's own RSVPs for the session (a device can hold a few). */
export interface MyRsvp {
  rsvpId: string
  playerId: string | null
  name: string
  isGuest: boolean
  status: RsvpStatus
  /** Place in line among everyone who is in. Above capacity is the waitlist. Null when out. */
  position: number | null
}

/** What get_rsvp_state returns, with timestamps parsed. */
export interface RsvpServerState {
  sessionDate: string // YYYY-MM-DD, Toronto
  capacity: number
  cutoffAt: Date
  liveStart: Date
  liveEnd: Date
  serverNow: Date
  inCount: number // confirmed, never above capacity
  waitlistCount: number
  myStatus: RsvpStatus | null
  myPosition: number | null
  myRsvps: MyRsvp[]
}

/** A row of get_rsvp_roster: names and photos only. */
export interface RsvpRosterEntry {
  rsvpId: string
  name: string
  avatarUrl: string | null
  playerId: string | null
  isGuest: boolean
  status: RsvpStatus
  position: number | null
}

export interface SetRsvpResult {
  rsvpId: string | null // null when cancelling something that was never RSVP'd
  status: RsvpStatus | null
  position: number | null
  waitlistPosition: number | null
}

/** What admin_add_rsvp / admin_remove_rsvp return. `changed` is false when the call was a no-op. */
export interface AdminRsvpResult {
  rsvpId: string | null // null when removing a player who never had a row
  sessionDate: string // YYYY-MM-DD, Toronto
  status: RsvpStatus | null
  changed: boolean
  /** Place in line after an add. Null for a removal. */
  position: number | null
  waitlistPosition: number | null
}

/** What admin_remove_guest_rsvp returns. `changed` is false when the guest was already gone. */
export interface AdminGuestRemoveResult {
  rsvpId: string
  sessionDate: string | null // YYYY-MM-DD, Toronto; null when the row no longer existed
  changed: boolean
}

/** What admin_rename_guest_rsvp returns. `changed` is false when the name was already that. */
export interface AdminGuestRenameResult {
  rsvpId: string
  sessionDate: string // YYYY-MM-DD, Toronto
  name: string // as the server stored it (trimmed, spaces collapsed)
  changed: boolean
}

/** Admin target: a roster player and, optionally, a session (null = the current run). */
export interface AdminRsvpArgs {
  playerId: string
  sessionDate?: string | null
}

/** Shown when the database (or the UI hint) refuses an admin-only change. */
export const ADMIN_ONLY_MESSAGE = 'Only admins can change the list.'

/** A roster player an admin acts on. */
export interface AdminRsvpTarget {
  id: string
  name: string
}

/** Admin target for adding a guest: a name and, optionally, a session (null = the current run). */
export interface AdminAddGuestArgs {
  name: string
  sessionDate?: string | null
}

/** A guest an admin removes. `id` is the stable RSVP id (RsvpRosterEntry.rsvpId), never the name. */
export interface AdminGuestTarget {
  id: string
  name: string
}

/** What the weekly list sheet needs to offer admin controls. Absent for everyone but admins. */
export interface RsvpAdminActions {
  /** True while any admin change is in flight: every admin button is disabled. */
  busy: boolean
  add: (player: AdminRsvpTarget) => Promise<RsvpResult<AdminRsvpResult>>
  remove: (player: AdminRsvpTarget) => Promise<RsvpResult<AdminRsvpResult>>
  /** Puts a named guest on the list (the waitlist if it is full). Idempotent. */
  addGuest: (name: string) => Promise<RsvpResult<AdminRsvpResult>>
  /** Deletes a guest by RSVP id. Idempotent. */
  removeGuest: (guest: AdminGuestTarget) => Promise<RsvpResult<AdminGuestRemoveResult>>
  /** Renames a guest by RSVP id. Keeps their place in line. */
  renameGuest: (guest: AdminGuestTarget, name: string) => Promise<RsvpResult<AdminGuestRenameResult>>
}

export type RsvpErrorCode =
  | 'CUTOFF_PASSED'
  | 'NOT_OPEN_YET'
  | 'NAME_CLAIMED'
  | 'TOKEN_MISMATCH'
  | 'NAME_EXISTS_SUGGESTION'
  | 'NAME_ON_LIST' // admin rename: another guest on this list already has that name
  | 'GUEST_GONE' // admin rename: the guest is no longer on the list
  | 'NO_IDENTITY'
  | 'RATE_LIMITED'
  | 'INVALID_NAME'
  | 'BAD_REQUEST'
  | 'FORBIDDEN'
  | 'PLAYER_UNAVAILABLE' // admin add: the player is archived or no longer exists
  | 'BUSY'
  | 'UNAVAILABLE' // the RSVP migration is not applied
  | 'NETWORK'
  | 'UNKNOWN'

const MESSAGES: Record<RsvpErrorCode, string> = {
  NOT_OPEN_YET: "RSVPs haven't opened yet. Check back at the open time.",
  CUTOFF_PASSED: 'RSVPs are closed for this week. Ask an admin if you still need a spot.',
  NAME_CLAIMED: 'That name belongs to a signed-in player. Sign in to RSVP as them.',
  TOKEN_MISMATCH: "That spot was set from another device, so it can't be changed here.",
  NAME_EXISTS_SUGGESTION: 'That name is already on the player list.',
  NAME_ON_LIST: 'Another guest on the list already has that name.',
  GUEST_GONE: 'That guest is no longer on the list.',
  NO_IDENTITY: 'Pick your name first.',
  RATE_LIMITED: 'Too many RSVPs from this device. Ask an admin for help.',
  INVALID_NAME: 'Use 2 to 40 characters for your name.',
  BAD_REQUEST: "That RSVP couldn't be made. Refresh and try again.",
  FORBIDDEN: 'You can only RSVP as your own player.',
  PLAYER_UNAVAILABLE: "That player isn't available. They may have been archived or removed.",
  BUSY: 'Hang on, your last change is still saving.',
  UNAVAILABLE: "RSVPs aren't set up yet.",
  NETWORK: "Can't reach the server. Check your connection and try again.",
  UNKNOWN: 'Something went wrong. Please try again.',
}

/** A failure with a stable code to branch on and a friendly message that is safe to show. */
export class RsvpError extends Error {
  readonly code: RsvpErrorCode
  /** For NAME_EXISTS_SUGGESTION: the existing player the typed name matches. */
  readonly suggestion?: { playerId: string; name: string }

  constructor(code: RsvpErrorCode, opts: { message?: string; suggestion?: { playerId: string; name: string } } = {}) {
    super(opts.message ?? MESSAGES[code])
    this.name = 'RsvpError'
    this.code = code
    this.suggestion = opts.suggestion
  }
}

export type RsvpResult<T> = { ok: true; data: T } | { ok: false; error: RsvpError }

/** The two implementations (Supabase and demo) share this, so the hook cannot tell them apart. */
export interface RsvpApi {
  getState(token: string): Promise<RsvpServerState>
  getRoster(): Promise<RsvpRosterEntry[]>
  setRsvp(args: { identity: RsvpIdentity; status: RsvpStatus; token: string }): Promise<SetRsvpResult>
  /** Admin only (enforced by the database): put any roster player on the list. Idempotent. */
  adminAddRsvp(args: AdminRsvpArgs): Promise<AdminRsvpResult>
  /** Admin only (enforced by the database): take any roster player off the list. Idempotent. */
  adminRemoveRsvp(args: AdminRsvpArgs): Promise<AdminRsvpResult>
  /** Admin only (enforced by the database): put a named guest on the list. Idempotent. */
  adminAddGuest(args: AdminAddGuestArgs): Promise<AdminRsvpResult>
  /** Admin only (enforced by the database): delete a guest by its RSVP id. Idempotent. */
  adminRemoveGuest(guestId: string): Promise<AdminGuestRemoveResult>
  /** Admin only (enforced by the database): rename a guest by its RSVP id. Idempotent. */
  adminRenameGuest(guestId: string, name: string): Promise<AdminGuestRenameResult>
}

