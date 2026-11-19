import React from 'react'
import { ResultTeam } from '../../types/leaderboard'
import { getTeamOverallRank } from '../../utils/scoring'

interface CourtResultCardProps {
  courtNumber: number
  teams: ResultTeam[]
}

const ordinal = (n: number) => {
  const teen = n % 100 >= 11 && n % 100 <= 13
  const suffix = teen ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th'
  return `${n}${suffix}`
}

const medal = (n: number) =>
  n === 1 ? 'bg-gold text-ground' : n === 2 ? 'bg-silver text-ground' : n === 3 ? 'bg-bronze text-ground' : 'bg-raised text-ink-soft'

// One court: its finishing teams stacked, each with partners listed one per line.
export const CourtResultCard: React.FC<CourtResultCardProps> = ({ courtNumber, teams }) => (
  <section aria-label={`Court ${courtNumber} results`} className="rounded-xl border border-line bg-surface overflow-hidden">
    <h3 className="px-4 py-2.5 border-b border-line bg-ground text-sm font-semibold text-ink-soft">
      Court {courtNumber}
    </h3>
    <ul className="divide-y divide-line">
      {teams.map((team) => {
        // Overall placement in the week, not just within this court
        const place = getTeamOverallRank(courtNumber, team.finishOrder === 1 ? 1 : 2)
        return (
        <li key={team.finishOrder} className="flex items-start gap-3 p-3 sm:p-4">
          <span
            className={`flex h-7 min-w-9 shrink-0 items-center justify-center rounded-md px-1.5 text-sm font-black tabular-nums ${medal(place)}`}
          >
            {ordinal(place)}
          </span>
          <ul className="flex-1 min-w-0 flex flex-col gap-1.5">
            {team.players.map((p) => (
              <li key={p.playerId} className="flex items-baseline justify-between gap-3 min-w-0">
                <span className="truncate font-semibold text-ink" title={p.name}>
                  {p.name}
                </span>
                <span className="shrink-0 tabular-nums font-black text-ink">
                  {p.points}
                  <span className="ml-1 text-sm font-semibold text-muted">pts</span>
                </span>
              </li>
            ))}
          </ul>
        </li>
        )
      })}
    </ul>
  </section>
)
