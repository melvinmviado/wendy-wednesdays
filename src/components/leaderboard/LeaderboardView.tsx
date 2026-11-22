import { useState } from 'react'
import type { PlayerScore } from '@/types/leaderboard'
import type { RankMovement } from '@/utils/ranking'
import { ClaimSection } from '@/components/claims/ClaimSection'
import { LeaderboardTable } from '@/components/LeaderboardTable'
import { PlayerStatsModal, type SelectedPlayer } from '@/components/PlayerStatsModal'
import { LeaderboardToolbar } from '@/components/leaderboard/LeaderboardToolbar'
import { SeasonHeader } from '@/components/leaderboard/SeasonHeader'
import { StandingsStatus } from '@/components/leaderboard/StandingsStatus'

interface LeaderboardViewProps {
  players: PlayerScore[]
  movement: Map<string, RankMovement>
  loading: boolean
  loaded: boolean
  error: string | null
  isAdmin: boolean
  isConfigured: boolean
  /** Signed-in users who can claim see the claim box; everyone else (configured) gets a sign-in prompt. */
  canClaim: boolean
  onRefresh: () => void
  /** Demo mode only. Returns true when the data was reset (the admin confirmed). */
  onResetDemo: () => boolean
  onRecordWeek: () => void
  onOpenWeek: (week: number) => void
  onSignIn: () => void
}

/** The leaderboard tab: season header, search and actions, the standings and the player stats dialog. */
export function LeaderboardView(p: LeaderboardViewProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [statsPlayer, setStatsPlayer] = useState<SelectedPlayer | null>(null)

  return (
    <div className="flex flex-col gap-8">
      <SeasonHeader players={p.players} />

      <p className="text-ink-soft max-w-prose">
        Official season leaderboard ranked by total points. Database-computed from weekly attendance & scores.
      </p>

      <LeaderboardToolbar
        searchQuery={searchQuery}
        onSearch={setSearchQuery}
        isAdmin={p.isAdmin}
        isConfigured={p.isConfigured}
        refreshing={p.loading}
        onRecordWeek={p.onRecordWeek}
        onRefresh={p.onRefresh}
        onResetDemo={() => {
          if (p.onResetDemo()) setSearchQuery('')
        }}
      />

      <StandingsStatus
        loading={p.loading}
        loaded={p.loaded}
        error={p.error}
        playerCount={p.players.length}
        isAdmin={p.isAdmin}
        onRetry={p.onRefresh}
      />

      {p.players.length > 0 && (
        <section aria-label="Season Standings Table">
          <LeaderboardTable players={p.players} searchQuery={searchQuery} onSelectPlayer={setStatsPlayer} movement={p.movement} />
          <PlayerStatsModal
            selected={statsPlayer}
            onClose={() => setStatsPlayer(null)}
            onSelectWeek={p.onOpenWeek}
            renderExtra={(player) => <ClaimSection playerId={player.id} playerName={player.name} />}
            onSignIn={
              p.isConfigured && !p.canClaim
                ? () => {
                    setStatsPlayer(null)
                    p.onSignIn()
                  }
                : undefined
            }
          />
        </section>
      )}
    </div>
  )
}
