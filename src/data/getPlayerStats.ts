import { supabase } from '../lib/supabase'
import { computePlayerStats, type PlayerStats, type PlayerWeek } from '../utils/playerStats'
import { fetchWeeklyResults } from './weeklyResults'

async function fetchPlayerWeeks(playerId: string): Promise<PlayerWeek[]> {
  const { data, error } = await supabase
    .from('weekly_scores')
    .select('week_number, court_number, finish_order, points')
    .eq('player_id', playerId)
    .eq('attended', true)
    .order('week_number')
  if (error) throw error
  return (data ?? []).map((r) => ({
    weekNumber: r.week_number,
    courtNumber: r.court_number,
    finishOrder: r.finish_order,
    points: r.points,
  }))
}

/** Weekly points, weekly log and career stats for one player, from the weekly archive. */
export async function getPlayerStats(playerId: string): Promise<PlayerStats> {
  const [weeks, results] = await Promise.all([fetchPlayerWeeks(playerId), fetchWeeklyResults()])
  return computePlayerStats(playerId, weeks, results)
}
