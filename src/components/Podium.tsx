import React from 'react'
import { Trophy, Medal, Award } from 'lucide-react'
import { PlayerScore } from '../types/leaderboard'

interface PodiumProps {
  topPlayers: PlayerScore[]
}

export const Podium: React.FC<PodiumProps> = ({ topPlayers }) => {
  const [first, second, third] = topPlayers

  if (!first) return null

  return (
    <div className="w-full grid grid-cols-3 gap-2 sm:gap-4 items-end pt-2 pb-1">
      {/* 2nd Place (Silver) */}
      {second ? (
        <div className="flex flex-col items-center">
          <div className="relative group w-full flex flex-col items-center p-3 sm:p-4 rounded-2xl border border-slate-700/60 bg-gradient-to-b from-slate-900/90 to-slate-950 text-center shadow-lg shadow-black/30">
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-gradient-to-br from-slate-200 via-slate-300 to-slate-400 text-slate-900 flex items-center justify-center font-black text-xs sm:text-sm mb-2 shadow-md shadow-slate-300/20 ring-2 ring-slate-200/80">
              <Medal className="w-4 h-4 sm:w-5 sm:h-5 fill-slate-900 text-slate-900" />
            </div>
            <span className="text-[10px] sm:text-xs font-semibold text-slate-400 uppercase tracking-wider">
              2nd Silver
            </span>
            <h4 className="text-xs sm:text-sm font-bold text-white mt-0.5 truncate w-full px-1">
              {second.name}
            </h4>
            <div className="mt-1 font-mono font-extrabold text-sm sm:text-base text-slate-200">
              {second.totalPoints.toLocaleString()}
            </div>
            <span className="text-[10px] sm:text-xs text-slate-400 mt-0.5">
              {second.weeksPlayed} wks
            </span>
          </div>
          <div className="w-full h-3 sm:h-5 bg-gradient-to-b from-slate-800 to-slate-900 rounded-b-xl border-x border-b border-slate-700/50 mt-1" />
        </div>
      ) : (
        <div />
      )}

      {/* 1st Place (Gold) - Elevated */}
      <div className="flex flex-col items-center -translate-y-2 sm:-translate-y-3">
        <div className="relative group w-full flex flex-col items-center p-3.5 sm:p-5 rounded-2xl border border-amber-500/50 bg-gradient-to-b from-amber-950/40 via-slate-900/90 to-slate-950 text-center shadow-xl shadow-amber-500/10 ring-1 ring-amber-400/40">
          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-gradient-to-br from-yellow-300 via-amber-400 to-amber-600 text-amber-950 flex items-center justify-center font-black text-sm sm:text-base mb-2 shadow-lg shadow-amber-500/30 ring-2 ring-amber-300">
            <Trophy className="w-5 h-5 sm:w-6 sm:h-6 fill-amber-950 text-amber-950" />
          </div>
          <span className="text-[10px] sm:text-xs font-bold text-amber-400 uppercase tracking-wider">
            1st Gold
          </span>
          <h4 className="text-xs sm:text-base font-extrabold text-white mt-0.5 truncate w-full px-1">
            {first.name}
          </h4>
          <div className="mt-1 font-mono font-black text-base sm:text-lg text-amber-300">
            {first.totalPoints.toLocaleString()}
          </div>
          <span className="text-[10px] sm:text-xs text-slate-400 mt-0.5">
            {first.weeksPlayed} wks
          </span>
        </div>
        <div className="w-full h-5 sm:h-8 bg-gradient-to-b from-amber-950/40 to-slate-900 rounded-b-xl border-x border-b border-amber-500/40 mt-1" />
      </div>

      {/* 3rd Place (Bronze) */}
      {third ? (
        <div className="flex flex-col items-center">
          <div className="relative group w-full flex flex-col items-center p-3 sm:p-4 rounded-2xl border border-amber-800/60 bg-gradient-to-b from-slate-900/90 to-slate-950 text-center shadow-lg shadow-black/30">
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-gradient-to-br from-amber-600 via-amber-700 to-amber-900 text-amber-100 flex items-center justify-center font-black text-xs sm:text-sm mb-2 shadow-md shadow-amber-800/30 ring-2 ring-amber-500/70">
              <Award className="w-4 h-4 sm:w-5 sm:h-5 fill-amber-200 text-amber-200" />
            </div>
            <span className="text-[10px] sm:text-xs font-semibold text-amber-400/90 uppercase tracking-wider">
              3rd Bronze
            </span>
            <h4 className="text-xs sm:text-sm font-bold text-white mt-0.5 truncate w-full px-1">
              {third.name}
            </h4>
            <div className="mt-1 font-mono font-extrabold text-sm sm:text-base text-amber-200">
              {third.totalPoints.toLocaleString()}
            </div>
            <span className="text-[10px] sm:text-xs text-slate-400 mt-0.5">
              {third.weeksPlayed} wks
            </span>
          </div>
          <div className="w-full h-2 sm:h-3 bg-gradient-to-b from-slate-800 to-slate-900 rounded-b-xl border-x border-b border-slate-700/50 mt-1" />
        </div>
      ) : (
        <div />
      )}
    </div>
  )
}
