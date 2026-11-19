export type ClaimStatus = 'pending' | 'approved' | 'rejected'

/** One row of a person's own request history (they only ever see their own). */
export interface OwnClaimRequest {
  id: string
  playerId: string
  playerName: string
  status: ClaimStatus
  createdAt: string
}

/** What the signed-in user currently has: a linked player, and their most recent request. */
export interface MyClaim {
  linkedPlayer: { id: string; name: string } | null
  latest: OwnClaimRequest | null
}

/** A pending request as an admin sees it. */
export interface PendingClaim {
  id: string
  playerId: string
  playerName: string
  userId: string
  requesterName: string | null
  /** Address the requester signed up with. Unverified while email confirmation is off. Null only when the email migration is not applied yet. */
  requesterEmail: string | null
  message: string | null
  createdAt: string
}

/** A player that already has an account attached. */
export interface LinkedPlayer {
  playerId: string
  playerName: string
  userId: string
  userName: string | null
}

/**
 * What the claim box in a player's stats dialog should show, for the signed-in user.
 * `hidden` covers every case where there is nothing useful to offer (someone else's player,
 * you already have one, anonymous session, claims not set up in the database).
 */
export type ClaimView =
  | { kind: 'hidden' }
  | { kind: 'mine' }
  | { kind: 'pending-here' }
  | { kind: 'pending-elsewhere'; playerName: string }
  | { kind: 'declined-here' }
  | { kind: 'available' }
