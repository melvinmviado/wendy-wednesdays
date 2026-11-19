import React from 'react'
import { Trophy, Medal, Award } from 'lucide-react'

interface RankBadgeProps {
  points: number
  rank: number
  tied?: boolean
}

const BASE = 'inline-flex items-center justify-center gap-1 min-w-[2.25rem] h-9 px-2 rounded-lg text-sm tabular-nums'

export const RankBadge: React.FC<RankBadgeProps> = ({ rank, points, tied = false }) => {
  const label = tied ? `T${rank}` : `${rank}`

  if (rank === 1 && points > 0) {
    return (
      <div className={`${BASE} bg-gold text-ground font-black`} title="1st Place - Gold">
        <Trophy className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        <span>{label}</span>
      </div>
    )
  }

  if (rank === 2 && points > 0) {
    return (
      <div className={`${BASE} bg-silver text-ground font-black`} title="2nd Place - Silver">
        <Medal className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        <span>{label}</span>
      </div>
    )
  }

  if (rank === 3 && points > 0) {
    return (
      <div className={`${BASE} bg-bronze text-ground font-black`} title="3rd Place - Bronze">
        <Award className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        <span>{label}</span>
      </div>
    )
  }

  return (
    <div className={`${BASE} bg-raised text-ink-soft font-semibold`} title={`Rank ${rank}`}>
      <span>{label}</span>
    </div>
  )
}
