import React from 'react'
import { Trophy, Medal, Award } from 'lucide-react'
import { ResultTeam } from '../../types/leaderboard'
import { getPodiumTeams } from '../../utils/scoring'

interface PodiumPairsProps {
  teams: ResultTeam[]
}

const TONES = [
  { badge: 'bg-gold text-ground', row: 'bg-gold/10', Icon: Trophy, label: '1st place' },
  { badge: 'bg-silver text-ground', row: 'bg-silver/10', Icon: Medal, label: '2nd place' },
  { badge: 'bg-bronze text-ground', row: 'bg-bronze/10', Icon: Award, label: '3rd place' },
]

// The week's top three pairs overall. Shows only the pairs that exist (a small week may have fewer than 3).
export const PodiumPairs: React.FC<PodiumPairsProps> = ({ teams }) => {
  const podium = getPodiumTeams(teams)

  if (podium.length === 0) return null

  return (
    <section aria-label="Podium pairs" className="rounded-xl border border-line bg-surface overflow-hidden">
      <h3 className="px-4 py-2.5 border-b border-line bg-ground text-sm font-semibold text-ink-soft">Podium</h3>
      <ol className="divide-y divide-line">
        {podium.map((team, i) => {
          const { badge, row, Icon, label } = TONES[i]
          return (
            <li key={`${team.courtNumber}-${team.finishOrder}`} className={`flex items-start gap-3 p-3 sm:p-4 ${row}`}>
              <span
                title={label}
                className={`inline-flex h-9 min-w-9 shrink-0 items-center justify-center gap-1 rounded-lg px-2 text-sm font-black tabular-nums ${badge}`}
              >
                <Icon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                <span>{i + 1}</span>
              </span>
              <div className="flex-1 min-w-0">
                <ul className="flex flex-col gap-0.5">
                  {team.players.map((p) => (
                    <li key={p.playerId} className="truncate font-bold text-ink" title={p.name}>
                      {p.name}
                    </li>
                  ))}
                </ul>
              </div>
              <span className="shrink-0 text-sm text-muted">Court {team.courtNumber}</span>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
