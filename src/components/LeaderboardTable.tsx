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
    <div className="w-full overflow-hidden rounded-xl border border-line bg-surface">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left text-base">
          <thead>
            <tr className="border-b border-line bg-ground text-sm text-ink-soft">
              <th scope="col" className="py-3.5 pl-3 sm:pl-5 pr-2 w-14 sm:w-20 text-center font-semibold">
                Rank
              </th>
              <th scope="col" className="py-3.5 px-3 sm:px-4 font-semibold text-ink">
                Player Name
              </th>
              <th scope="col" className="py-3.5 px-2 sm:px-4 w-16 sm:w-28 text-center font-semibold text-ink">
                <span className="sm:inline hidden">Weeks Played</span>
                <span className="sm:hidden inline">Weeks</span>
              </th>
              <th scope="col" className="py-3.5 pl-2 pr-3 sm:pr-5 w-24 sm:w-32 text-right font-semibold text-ink">
                <span className="sm:inline hidden">Total Points</span>
                <span className="sm:hidden inline">Points</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {filteredPlayers.length === 0 ? (
              <tr>
                <td colSpan={4} className="py-12 text-center text-muted">
                  No players found matching "{searchQuery}"
                </td>
              </tr>
            ) : (
              filteredPlayers.map((player) => {
                const isTop1 = player.totalPoints > 0 && player.rank === 1
                const isTop2 = player.totalPoints > 0 && player.rank === 2
                const isTop3 = player.totalPoints > 0 && player.rank === 3

                // Podium rows carry a tinted wash and a coloured name and score
                const tone = isTop1
                  ? { row: 'bg-gold/10 hover:bg-gold/15', ink: 'text-gold' }
                  : isTop2
                  ? { row: 'bg-silver/10 hover:bg-silver/15', ink: 'text-silver' }
                  : isTop3
                  ? { row: 'bg-bronze/10 hover:bg-bronze/15', ink: 'text-bronze' }
                  : { row: 'hover:bg-raised', ink: 'text-ink' }
                const podium = isTop1 || isTop2 || isTop3

                return (
                  <tr key={player.id} className={`transition-colors ${tone.row}`}>
                    <td className="py-3 sm:py-3.5 pl-3 sm:pl-5 pr-2 text-center align-middle">
                      <div className="flex justify-center items-center">
                        <RankBadge rank={player.rank} points={player.totalPoints} tied={player.tied} />
                      </div>
                    </td>

                    <td className="py-3 sm:py-3.5 px-3 sm:px-4 align-middle">
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          aria-hidden="true"
                          className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm shrink-0 select-none bg-raised ${tone.ink}`}
                        >
                          {player.name.charAt(0)}
                        </div>
                        <span className={`truncate ${podium ? `font-bold ${tone.ink}` : 'font-semibold text-ink'}`}>
                          {player.name}
                        </span>
                      </div>
                    </td>

                    <td className="py-3 sm:py-3.5 px-2 sm:px-4 text-center align-middle tabular-nums text-ink-soft">
                      {player.weeksPlayed}
                    </td>

                    <td className="py-3 sm:py-3.5 pl-2 pr-3 sm:pr-5 text-right align-middle tabular-nums text-lg font-black">
                      <span className={tone.ink}>{player.totalPoints.toLocaleString()}</span>
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
