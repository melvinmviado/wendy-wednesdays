import type { PlayerRole } from './roles'

export interface PlayerScore {
  id: string
  name: string
  weeksPlayed: number
  totalPoints: number
  archivedAt?: string | null // ISO timestamp; null/undefined = active
  avatarUrl?: string | null // linked profile photo, else players.avatar_url; null = show initials
  updatedAt?: string
  role?: PlayerRole | null // cosmetic label; null/undefined = none
  isClaimed?: boolean // linked to a real account (Verified badge); false/undefined = guest entry
}

// ---- Player admin ----

export type PlayerAdminErrorCode = 'DUPLICATE_NAME' | 'INVALID_NAME' | 'NOT_FOUND' | 'FORBIDDEN' | 'UNKNOWN'

export interface PlayerAdminError {
  code: PlayerAdminErrorCode
  message: string
}

export type Result<T> = { ok: true; data: T } | { ok: false; error: PlayerAdminError }

export interface WeeklyScoreRecord {
  id?: string
  playerId: string
  weekNumber: number
  attended: boolean
  courtNumber?: number
  finishOrder?: number // 1 for 1st place team (winners), 2 for 2nd place team (runners-up)
  points: number
}

export interface CourtPlayerSlot {
  slotId: string // Unique identifier e.g. "c1-t1-p1"
  teamPlace: 1 | 2 // 1 for 1st place team, 2 for 2nd place team
  playerIndex: 1 | 2 // 1 for Partner 1, 2 for Partner 2
  playerId: string | null
  playerName: string | null
  points: number
}

export interface CourtData {
  courtNumber: number
  firstPlacePoints: number
  secondPlacePoints: number
  slots: CourtPlayerSlot[] // Exactly 4 player slots (2 in 1st place, 2 in 2nd place)
}

// ---- Weekly Results archive ----

export interface WeekMeta {
  weekNumber: number
  playedOn: string | null
  notes: string | null
  podiumPhotoUrl: string | null
}

export interface ResultPlayer {
  playerId: string
  name: string
  points: number
}

// A doubles team, inferred from rows sharing week + court + finish order
export interface ResultTeam {
  courtNumber: number
  finishOrder: number
  players: ResultPlayer[]
}

export interface WeeklyResult extends WeekMeta {
  teams: ResultTeam[] // sorted by court, then finish order
  attendeeCount: number
}
