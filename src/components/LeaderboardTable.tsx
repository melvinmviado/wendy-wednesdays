import React, { useMemo } from 'react'
import { PlayerScore } from '../types/leaderboard'
import { RankBadge } from './RankBadge'

interface LeaderboardTableProps {
  players: PlayerScore[]
  searchQuery?: string
}

export const LeaderboardTable: React.FC<LeaderboardTableProps> = ({
  players,
  searchQuery = '',
}) => {
  // Sort players by total season points descending
  const sortedPlayers = useMemo(() => {
    return [...players].sort((a, b) => {
      if (b.totalPoints !== a.totalPoints) {
        return b.totalPoints - a.totalPoints
      }
      // Tie breaker: more weeks played or alphabetical
      return b.weeksPlayed - a.weeksPlayed || a.name.localeCompare(b.name)
    })
  }, [players])

  // Map to assign actual season rank based on total points
  const rankedPlayers = useMemo(() => {
    return sortedPlayers.map((player, index) => ({
      ...player,
      rank: index + 1,
    }))
  }, [sortedPlayers])

  // Filter based on search query if present
  const filteredPlayers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return rankedPlayers
    return rankedPlayers.filter((p) => p.name.toLowerCase().includes(q))
  }, [rankedPlayers, searchQuery])

  return (
    <div className="w-full overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/60 backdrop-blur-md shadow-xl shadow-black/40">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-slate-800/80 bg-slate-950/80 text-xs font-semibold uppercase tracking-wider text-slate-400">
              <th scope="col" className="py-3.5 pl-3 sm:pl-5 pr-2 w-14 sm:w-20 text-center">
                Rank
              </th>
              <th scope="col" className="py-3.5 px-3 sm:px-4 font-semibold text-slate-300">
                Player Name
              </th>
              <th scope="col" className="py-3.5 px-2 sm:px-4 w-16 sm:w-28 text-center font-semibold text-slate-300">
                <span className="sm:inline hidden">Weeks Played</span>
                <span className="sm:hidden inline">Weeks</span>
              </th>
              <th scope="col" className="py-3.5 pl-2 pr-3 sm:pr-5 w-24 sm:w-32 text-right font-semibold text-slate-300">
                <span className="sm:inline hidden">Total Points</span>
                <span className="sm:hidden inline">Points</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {filteredPlayers.length === 0 ? (
              <tr>
                <td colSpan={4} className="py-12 text-center text-slate-500 text-sm">
                  No players found matching "{searchQuery}"
                </td>
              </tr>
            ) : (
              filteredPlayers.map((player) => {
                const isTop1 = player.rank === 1
                const isTop2 = player.rank === 2
                const isTop3 = player.rank === 3

                // Subtle celebratory row styling for top 3
                let rowBg = 'hover:bg-slate-800/40 transition-colors'
                if (isTop1) {
                  rowBg = 'bg-amber-500/[0.04] hover:bg-amber-500/[0.08] transition-colors'
                } else if (isTop2) {
                  rowBg = 'bg-slate-300/[0.03] hover:bg-slate-300/[0.06] transition-colors'
                } else if (isTop3) {
                  rowBg = 'bg-amber-700/[0.04] hover:bg-amber-700/[0.07] transition-colors'
                }

                return (
                  <tr key={player.id} className={rowBg}>
                    {/* 1. Rank */}
                    <td className="py-3 sm:py-3.5 pl-3 sm:pl-5 pr-2 text-center align-middle">
                      <div className="flex justify-center items-center">
                        <RankBadge rank={player.rank} />
                      </div>
                    </td>

                    {/* 2. Player Name */}
                    <td className="py-3 sm:py-3.5 px-3 sm:px-4 align-middle">
                      <div className="flex items-center gap-2.5 min-w-0">
                        {/* Initial avatar circle */}
                        <div
                          className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs shrink-0 select-none ${
                            isTop1
                              ? 'bg-amber-400/20 text-amber-300 border border-amber-400/40'
                              : isTop2
                              ? 'bg-slate-300/20 text-slate-200 border border-slate-300/40'
                              : isTop3
                              ? 'bg-amber-600/20 text-amber-300 border border-amber-600/40'
                              : 'bg-slate-800 text-slate-400 border border-slate-700/60'
                          }`}
                        >
                          {player.name.charAt(0)}
                        </div>
                        <span
                          className={`font-medium truncate ${
                            isTop1
                              ? 'text-amber-100 font-semibold'
                              : isTop2
                              ? 'text-slate-100 font-semibold'
                              : isTop3
                              ? 'text-amber-200/90 font-semibold'
                              : 'text-slate-200'
                          }`}
                        >
                          {player.name}
                        </span>
                      </div>
                    </td>

                    {/* 3. Weeks Played */}
                    <td className="py-3 sm:py-3.5 px-2 sm:px-4 text-center align-middle font-medium text-slate-400 text-xs sm:text-sm">
                      <span className="inline-block px-2 py-0.5 rounded-md bg-slate-800/80 border border-slate-700/50">
                        {player.weeksPlayed}
                      </span>
                    </td>

                    {/* 4. Total Points */}
                    <td className="py-3 sm:py-3.5 pl-2 pr-3 sm:pr-5 text-right align-middle font-mono font-bold text-sm sm:text-base">
                      <span
                        className={
                          isTop1
                            ? 'text-amber-400'
                            : isTop2
                            ? 'text-slate-200'
                            : isTop3
                            ? 'text-amber-300'
                            : 'text-slate-300'
                        }
                      >
                        {player.totalPoints.toLocaleString()}
                      </span>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
