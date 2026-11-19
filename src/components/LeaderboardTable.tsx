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
      return b.weeksPlayed - a.weeksPlayed || a.name.localeCompare(b.name)
    })
  }, [players])

  // Map to assign actual season rank based on total points
  const rankedPlayers = useMemo(() => {
    return sortedPlayers.map((player) => {
      // Competition ranking: ties share the rank of the first player with equal points
      const firstIndex = sortedPlayers.findIndex((p) => p.totalPoints === player.totalPoints)
      const count = sortedPlayers.filter((p) => p.totalPoints === player.totalPoints).length
      return { ...player, rank: firstIndex + 1, tied: count > 1 }
    })
  }, [sortedPlayers])

  // Filter based on search query if present
  const filteredPlayers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return rankedPlayers
    return rankedPlayers.filter((p) => p.name.toLowerCase().includes(q))
  }, [rankedPlayers, searchQuery])

  return (
    <div className="w-full overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950/90 backdrop-blur-md shadow-2xl shadow-black/60">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-zinc-800 bg-black text-xs font-bold uppercase tracking-wider text-zinc-400">
              <th scope="col" className="py-3.5 pl-3 sm:pl-5 pr-2 w-14 sm:w-20 text-center">
                Rank
              </th>
              <th scope="col" className="py-3.5 px-3 sm:px-4 font-bold text-white">
                Player Name
              </th>
              <th scope="col" className="py-3.5 px-2 sm:px-4 w-16 sm:w-28 text-center font-bold text-white">
                <span className="sm:inline hidden">Weeks Played</span>
                <span className="sm:hidden inline">Weeks</span>
              </th>
              <th scope="col" className="py-3.5 pl-2 pr-3 sm:pr-5 w-24 sm:w-32 text-right font-bold text-white">
                <span className="sm:inline hidden">Total Points</span>
                <span className="sm:hidden inline">Points</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-850">
            {filteredPlayers.length === 0 ? (
              <tr>
                <td colSpan={4} className="py-12 text-center text-zinc-500 text-sm">
                  No players found matching "{searchQuery}"
                </td>
              </tr>
            ) : (
              filteredPlayers.map((player) => {
                const isTop1 = player.totalPoints > 0 && player.rank === 1
                const isTop2 = player.totalPoints > 0 && player.rank === 2
                const isTop3 = player.totalPoints > 0 && player.rank === 3

                // Row backgrounds for top 3 vs normal
                let rowBg = 'hover:bg-zinc-900/60 transition-colors'
                if (isTop1) {
                  rowBg = 'bg-amber-500/[0.04] hover:bg-amber-500/[0.08] transition-colors'
                } else if (isTop2) {
                  rowBg = 'bg-white/[0.02] hover:bg-white/[0.05] transition-colors'
                } else if (isTop3) {
                  rowBg = 'bg-amber-700/[0.04] hover:bg-amber-700/[0.07] transition-colors'
                }

                return (
                  <tr key={player.id} className={rowBg}>
                    {/* 1. Rank */}
                    <td className="py-3 sm:py-3.5 pl-3 sm:pl-5 pr-2 text-center align-middle">
                      <div className="flex justify-center items-center">
                        <RankBadge rank={player.rank} points={player.totalPoints} tied={player.tied} />
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
                              ? 'bg-zinc-800 text-white border border-white/20'
                              : isTop3
                              ? 'bg-amber-700/20 text-amber-300 border border-amber-600/40'
                              : 'bg-zinc-900 text-zinc-300 border border-zinc-800'
                          }`}
                        >
                          {player.name.charAt(0)}
                        </div>
                        <span
                          className={`font-semibold truncate ${
                            isTop1
                              ? 'text-amber-100 font-bold'
                              : isTop2
                              ? 'text-white font-bold'
                              : isTop3
                              ? 'text-amber-200/95 font-bold'
                              : 'text-zinc-200'
                          }`}
                        >
                          {player.name}
                        </span>
                      </div>
                    </td>

                    {/* 3. Weeks Played */}
                    <td className="py-3 sm:py-3.5 px-2 sm:px-4 text-center align-middle font-medium text-zinc-400 text-xs sm:text-sm">
                      <span className="inline-block px-2.5 py-0.5 rounded-md bg-zinc-900 border border-zinc-800 font-mono text-zinc-300">
                        {player.weeksPlayed}
                      </span>
                    </td>

                    {/* 4. Total Points */}
                    <td className="py-3 sm:py-3.5 pl-2 pr-3 sm:pr-5 text-right align-middle font-mono font-bold text-sm sm:text-base">
                      <span
                        className={
                          isTop1
                            ? 'text-amber-400 font-black'
                            : isTop2
                            ? 'text-white font-black'
                            : isTop3
                            ? 'text-amber-300 font-black'
                            : 'text-zinc-200'
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
