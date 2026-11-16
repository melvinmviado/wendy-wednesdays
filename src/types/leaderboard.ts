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
  points: number
}

export interface PlayerWeeklyEntryState {
  playerId: string
  playerName: string
  attended: boolean
  points: number
}
