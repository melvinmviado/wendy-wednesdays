import React, { useId, type RefObject } from 'react'
import { X, Loader2 } from 'lucide-react'
import type { PlayerStats } from '../utils/playerStats'
import { RankBadge } from './RankBadge'
import { RankMovement } from './RankMovement'
import { SeasonSparkline } from './stats/SeasonSparkline'
import { CareerTiles } from './stats/CareerTiles'
import { WeeklyLog } from './stats/WeeklyLog'
import type { SelectedPlayer } from './PlayerStatsModal'

export interface PlayerStatsState {
  stats: PlayerStats | null
  loading: boolean
  error: string | null
  available: boolean // false when the database isn't configured
}

interface PlayerStatsDialogProps {
  selected: SelectedPlayer
  state: PlayerStatsState
  panelRef?: RefObject<HTMLDivElement | null>
  leaving?: boolean // playing the exit transition
  onRetry: () => void
  onClose: () => void
  onSelectWeek?: (weekNumber: number) => void
}

const Section: React.FC<{ id: string; title: string; children: React.ReactNode }> = ({ id, title, children }) => (
  <section aria-labelledby={id} className="flex flex-col gap-2">
    <h3 id={id} className="text-sm font-semibold text-ink-soft">
      {title}
    </h3>
    {children}
  </section>
)

// Presentational: bottom sheet on mobile, centered dialog from sm up. Data and behaviour live in PlayerStatsModal.
export const PlayerStatsDialog: React.FC<PlayerStatsDialogProps> = ({
  selected,
  state,
  panelRef,
  leaving = false,
  onRetry,
  onClose,
  onSelectWeek,
}) => {
  const titleId = useId()
  const { player, rank, tied, movement } = selected
  const { stats, loading, error, available } = state

  return (
    <div
      className={`fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-ground/90 sm:p-4 ${
        leaving ? 'pointer-events-none motion-safe:animate-backdrop-out' : 'motion-safe:animate-backdrop-in'
      }`}
      onClick={onClose}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className={`flex w-full max-h-[90dvh] flex-col overflow-hidden rounded-t-2xl border border-line bg-surface outline-none sm:max-w-lg sm:max-h-[85dvh] sm:rounded-2xl ${
          leaving
            ? 'motion-safe:animate-sheet-down sm:motion-safe:animate-dialog-out'
            : 'motion-safe:animate-sheet-up sm:motion-safe:animate-dialog-in'
        }`}
      >
        <header className="flex items-center gap-3 border-b border-line p-4">
          <RankBadge rank={rank} points={player.totalPoints} tied={tied} />
          <RankMovement movement={movement} />
          <h2
            id={titleId}
            title={player.name}
            className="min-w-0 flex-1 text-lg font-black leading-snug text-ink line-clamp-2 [overflow-wrap:anywhere]"
          >
            {player.name}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 rounded-lg p-2 text-ink-soft hover:bg-raised hover:text-ink transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-4 pb-[max(1rem,env(safe-area-inset-bottom))]" aria-live="polite">
          {loading ? (
            <div role="status" className="flex items-center justify-center gap-2 py-12 text-muted">
              <Loader2 className="w-5 h-5 motion-safe:animate-spin" aria-hidden="true" />
              <span>Loading stats...</span>
            </div>
          ) : error ? (
            <div role="alert" className="flex flex-col items-center gap-3 py-10 text-center">
              <p className="text-sm font-semibold text-ink">Couldn't load stats</p>
              <p className="text-sm text-brand-hover [overflow-wrap:anywhere]">{error}</p>
              <button
                type="button"
                onClick={onRetry}
                className="rounded-xl bg-brand px-4 py-2 text-sm font-bold text-brand-ink hover:bg-brand-hover cursor-pointer"
              >
                Try again
              </button>
            </div>
          ) : !available ? (
            <p className="py-10 text-center text-sm text-muted">Player stats need a database connection.</p>
          ) : stats ? (
            <div className="flex flex-col gap-5">
              <Section id={`${titleId}-trajectory`} title="Season trajectory">
                <SeasonSparkline points={stats.weeklyPoints} />
              </Section>
              <Section id={`${titleId}-career`} title="Career">
                <CareerTiles career={stats.career} />
              </Section>
              <Section id={`${titleId}-log`} title="Weekly log">
                <WeeklyLog
                  log={stats.weeklyLog}
                  onSelectWeek={
                    onSelectWeek
                      ? (week) => {
                          onClose()
                          onSelectWeek(week)
                        }
                      : undefined
                  }
                />
              </Section>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
