import { useMemo } from 'react'
import type { PlayerScore } from '@/types/leaderboard'
import { WebsiteLogo } from '@/components/WebsiteLogo'

/** Title and the three headline numbers (players, leader's points, average points). */
export function SeasonHeader({ players }: { players: PlayerScore[] }) {
  const stats = useMemo(() => {
    const totalPlayers = players.length
    const topScore = players.reduce((max, p) => Math.max(max, p.totalPoints), 0)
    const totalPointsSum = players.reduce((acc, p) => acc + p.totalPoints, 0)
    const avgPoints = totalPlayers > 0 ? Math.round(totalPointsSum / totalPlayers) : 0
    return { totalPlayers, topScore, avgPoints }
  }, [players])

  return (
    <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-6">
      <div className="flex items-center gap-5 min-w-0">
        <WebsiteLogo size="xl" />
        <div className="min-w-0">
          <h1 className="text-4xl sm:text-5xl font-black tracking-tight text-ink [text-wrap:balance] wrap-break-word min-w-0">
            Wendy Wednesdays
          </h1>
          <p className="mt-2 text-ink-soft">2026 season standings, weeks 1 to 8</p>
        </div>
      </div>

      <dl className="flex gap-8 sm:text-right">
        <div>
          <dt className="text-sm text-muted">Players</dt>
          <dd className="text-3xl font-black tabular-nums text-ink">{stats.totalPlayers}</dd>
        </div>
        <div>
          <dt className="text-sm text-muted">Leader pts</dt>
          <dd className="text-3xl font-black tabular-nums text-brand-hover">{stats.topScore.toLocaleString()}</dd>
        </div>
        <div className="hidden sm:block">
          <dt className="text-sm text-muted">Avg pts</dt>
          <dd className="text-3xl font-black tabular-nums text-ink">{stats.avgPoints.toLocaleString()}</dd>
        </div>
      </dl>
    </header>
  )
}
