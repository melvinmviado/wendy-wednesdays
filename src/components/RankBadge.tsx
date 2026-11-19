import React from 'react'
import { Trophy, Medal, Award } from 'lucide-react'

interface RankBadgeProps {
  points: number
  rank: number
  tied?: boolean
}

export const RankBadge: React.FC<RankBadgeProps> = ({ rank, points, tied = false }) => {
  const label = tied ? `T${rank}` : `${rank}`

  if (rank === 1 && points > 0) {
    return (
      <div
        className="inline-flex items-center justify-center gap-1 min-w-[2.25rem] h-9 px-2 rounded-xl bg-gradient-to-br from-yellow-300 via-amber-400 to-amber-600 text-amber-950 font-black shadow-md shadow-amber-500/25 ring-1 ring-amber-300/80"
        title="1st Place - Gold"
      >
        <Trophy className="w-3.5 h-3.5 fill-amber-950 text-amber-950 shrink-0" />
        <span className="text-sm font-black tracking-tight">{label}</span>
      </div>
    )
  }

  if (rank === 2 && points > 0) {
    return (
      <div
        className="inline-flex items-center justify-center gap-1 min-w-[2.25rem] h-9 px-2 rounded-xl bg-gradient-to-br from-slate-100 via-slate-300 to-slate-400 text-slate-900 font-black shadow-md shadow-slate-400/20 ring-1 ring-slate-200/90"
        title="2nd Place - Silver"
      >
        <Medal className="w-3.5 h-3.5 fill-slate-900 text-slate-900 shrink-0" />
        <span className="text-sm font-black tracking-tight">{label}</span>
      </div>
    )
  }

  if (rank === 3 && points > 0) {
    return (
      <div
        className="inline-flex items-center justify-center gap-1 min-w-[2.25rem] h-9 px-2 rounded-xl bg-gradient-to-br from-amber-600 via-amber-700 to-amber-900 text-amber-100 font-black shadow-md shadow-amber-800/25 ring-1 ring-amber-500/60"
        title="3rd Place - Bronze"
      >
        <Award className="w-3.5 h-3.5 fill-amber-200 text-amber-200 shrink-0" />
        <span className="text-sm font-black tracking-tight">{label}</span>
      </div>
    )
  }

  return (
    <div
      className="inline-flex items-center justify-center min-w-[2.25rem] h-9 px-2 rounded-xl bg-slate-900 text-slate-400 font-semibold text-sm border border-slate-800"
      title={`Rank ${rank}`}
    >
      <span>{label}</span>
    </div>
  )
}
