export interface PlayerScore {
  id: string
  name: string
  weeksPlayed: number
  totalPoints: number
}

export interface WeeklyScoreRecord {
  id?: string
  playerId: string
  weekNumber: number
  attended: boolean
  courtNumber?: number
  finishOrder?: number
  points: number
}

export interface CourtSlot {
  finishOrder: number // 1 (1st), 2 (2nd), 3 (3rd), 4 (4th)
  playerId: string | null
  playerName: string | null
  points: number
}

export interface CourtData {
  courtNumber: number
  slots: CourtSlot[]
}
