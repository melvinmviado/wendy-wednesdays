import { PlayerScore, WeeklyScoreRecord } from '../types/leaderboard'

export const initialPlayers: PlayerScore[] = [
  { id: '1', name: 'Wendy Mitchell', weeksPlayed: 5, totalPoints: 640 },
  { id: '2', name: 'Marcus Chen', weeksPlayed: 5, totalPoints: 585 },
  { id: '3', name: 'Sarah Jenkins', weeksPlayed: 4, totalPoints: 520 },
  { id: '4', name: 'Devon Vance', weeksPlayed: 5, totalPoints: 495 },
  { id: '5', name: 'Elena Rostova', weeksPlayed: 4, totalPoints: 430 },
  { id: '6', name: 'Jordan Hayes', weeksPlayed: 4, totalPoints: 395 },
  { id: '7', name: 'Aaliyah Patel', weeksPlayed: 3, totalPoints: 360 },
  { id: '8', name: 'Liam Gallagher', weeksPlayed: 3, totalPoints: 310 },
  { id: '9', name: 'Carlos Mendez', weeksPlayed: 3, totalPoints: 285 },
  { id: '10', name: 'Taylor Brooks', weeksPlayed: 2, totalPoints: 220 },
  { id: '11', name: 'Chloe Kim', weeksPlayed: 2, totalPoints: 190 },
  { id: '12', name: 'Noah Washington', weeksPlayed: 2, totalPoints: 160 },
]

// Seed initial weekly scores for demo mode
export const initialWeeklyScores: WeeklyScoreRecord[] = [
  // Week 1
  { playerId: '1', weekNumber: 1, attended: true, points: 130 },
  { playerId: '2', weekNumber: 1, attended: true, points: 120 },
  { playerId: '3', weekNumber: 1, attended: true, points: 110 },
  { playerId: '4', weekNumber: 1, attended: true, points: 95 },
  { playerId: '5', weekNumber: 1, attended: true, points: 100 },
  { playerId: '6', weekNumber: 1, attended: true, points: 90 },

  // Week 2
  { playerId: '1', weekNumber: 2, attended: true, points: 140 },
  { playerId: '2', weekNumber: 2, attended: true, points: 115 },
  { playerId: '3', weekNumber: 2, attended: true, points: 135 },
  { playerId: '4', weekNumber: 2, attended: true, points: 100 },
  { playerId: '7', weekNumber: 2, attended: true, points: 120 },
  { playerId: '8', weekNumber: 2, attended: true, points: 105 },

  // Week 3
  { playerId: '1', weekNumber: 3, attended: true, points: 125 },
  { playerId: '2', weekNumber: 3, attended: true, points: 120 },
  { playerId: '4', weekNumber: 3, attended: true, points: 100 },
  { playerId: '5', weekNumber: 3, attended: true, points: 110 },
  { playerId: '6', weekNumber: 3, attended: true, points: 105 },
  { playerId: '9', weekNumber: 3, attended: true, points: 95 },
]

export function computeLocalLeaderboard(
  players: { id: string; name: string }[],
  weeklyScores: WeeklyScoreRecord[]
): PlayerScore[] {
  return players
    .map((player) => {
      const playerScores = weeklyScores.filter(
        (ws) => ws.playerId === player.id && ws.attended
      )
      const weeksPlayed = new Set(playerScores.map((ws) => ws.weekNumber)).size
      const totalPoints = playerScores.reduce((sum, ws) => sum + ws.points, 0)
      return {
        id: player.id,
        name: player.name,
        weeksPlayed,
        totalPoints,
      }
    })
    .sort((a, b) => b.totalPoints - a.totalPoints || b.weeksPlayed - a.weeksPlayed)
}
