import React, { useMemo } from 'react'
import { PlayerScore } from '../types/leaderboard'
import { Avatar } from './Avatar'
import { RankBadge } from './RankBadge'
import type { SelectedPlayer } from './PlayerStatsModal'
import { rankPlayers, rankSpoken, type RankMovement as Movement } from '../utils/ranking'
import { RankMovement } from './RankMovement'

interface LeaderboardTableProps {
  players: PlayerScore[]
  searchQuery?: string
  onSelectPlayer?: (selected: SelectedPlayer) => void
  movement?: Map<string, Movement>
  /** Admin-only row actions (e.g. a menu). When given, adds a trailing actions column. */
  renderActions?: (player: PlayerScore) => React.ReactNode
}

export const LeaderboardTable: React.FC<LeaderboardTableProps> = ({
  players,
  searchQuery = '',
  onSelectPlayer,
  movement,
  renderActions,
}) => {
  // Sorted by season points, with competition ranks (ties share a rank)
  const rankedPlayers = useMemo(() => rankPlayers(players), [players])

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
              <th scope="col" className="py-3.5 pl-2 pr-3 sm:pr-5 w-24 sm:w-32 text-right font-semibold text-ink">
                <span className="sm:inline hidden">Total Points</span>
                <span className="sm:hidden inline">Points</span>
              </th>
              {renderActions && (
                <th scope="col" className="py-3.5 pr-3 sm:pr-4 w-12">
                  <span className="sr-only">Actions</span>
                </th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {filteredPlayers.length === 0 ? (
              <tr>
                <td colSpan={renderActions ? 4 : 3} className="py-12 text-center text-muted">
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
                // Players with no points yet get no indicator
                const move = player.totalPoints > 0 ? movement?.get(player.id) : undefined
                const select = () => onSelectPlayer?.({ player, rank: player.rank, tied: player.tied, movement: move })

                return (
                  <tr
                    key={player.id}
                    tabIndex={0}
                    aria-label={`${player.name}, ${rankSpoken(player.rank, player.tied)}. Open player stats`}
                    onClick={select}
                    onKeyDown={(e) => {
                      if (e.target !== e.currentTarget) return
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        select()
                      }
                    }}
                    className={`cursor-pointer transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-hover ${tone.row}`}
                  >
                    <td className="py-3 sm:py-3.5 pl-3 sm:pl-5 pr-2 text-center align-middle">
                      <div className="flex justify-center items-center">
                        <RankBadge rank={player.rank} points={player.totalPoints} tied={player.tied} />
                      </div>
                    </td>

                    <td className="py-3 sm:py-3.5 px-3 sm:px-4 align-middle">
                      <div className="flex items-center gap-3 min-w-0">
                        <Avatar name={player.name} avatarUrl={player.avatarUrl} size={36} fallbackClassName={`bg-raised ${tone.ink}`} />
                        <span className={`truncate ${podium ? `font-bold ${tone.ink}` : 'font-semibold text-ink'}`}>
                          {player.name}
                        </span>
                        <RankMovement movement={move} />
                      </div>
                    </td>

                    <td className="py-3 sm:py-3.5 pl-2 pr-3 sm:pr-5 text-right align-middle tabular-nums text-lg font-black">
                      <span className={tone.ink}>{player.totalPoints.toLocaleString()}</span>
                    </td>

                    {renderActions && (
                      <td className="py-3 sm:py-3.5 pr-3 sm:pr-4 text-right align-middle" onClick={(e) => e.stopPropagation()}>
                        {renderActions(player)}
                      </td>
                    )}
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
