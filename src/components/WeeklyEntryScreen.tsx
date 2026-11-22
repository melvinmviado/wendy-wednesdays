import React, { useState } from 'react'
import { CheckCircle2, AlertCircle, ArrowLeft, HelpCircle } from 'lucide-react'
import { PlayerScore } from '../types/leaderboard'
import { useWeeklyEntry } from '../hooks/useWeeklyEntry'
import { SaveResultModal } from './SaveResultModal'
import { EntryBoard } from './weekly/EntryBoard'
import { HelpModal } from './weekly/HelpModal'
import { btnGhost } from './weekly/styles'

interface WeeklyEntryScreenProps {
  roster: PlayerScore[]
  onBackToLeaderboard: () => void
  onLeaderboardUpdated: () => void
  onAddNewPlayerToRoster: (newPlayer: PlayerScore) => void
}

const WEEKS = [1, 2, 3, 4, 5, 6, 7, 8]

export const WeeklyEntryScreen: React.FC<WeeklyEntryScreenProps> = ({
  roster,
  onBackToLeaderboard,
  onLeaderboardUpdated,
  onAddNewPlayerToRoster,
}) => {
  const w = useWeeklyEntry({ roster, onLeaderboardUpdated, onAddNewPlayerToRoster })
  const [helpOpen, setHelpOpen] = useState(false)
  const {
    selectedWeek,
    selectWeek,
    saving,
    loadFailed,
    retryLoad,
    saveResult,
    setSaveResult,
    saveSuccessMsg,
    errorMsg,
    handleSaveWeek,
    legacyPlacedCount,
    dismissLegacyNotice,
  } = w

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4">
        <button onClick={onBackToLeaderboard} className={btnGhost}>
          <ArrowLeft className="h-4 w-4" />
          <span>Leaderboard</span>
        </button>
        <h2 className="text-lg font-bold text-ink">Doubles Court Cards (2 Teams / Court)</h2>
        <button onClick={() => setHelpOpen(true)} className={`${btnGhost} min-h-11`}>
          <HelpCircle className="h-4 w-4" />
          <span>How it works</span>
        </button>
      </header>

      <section className="flex flex-col gap-3" aria-labelledby="week-label">
        <div className="flex items-baseline justify-between gap-3">
          <h3 id="week-label" className="text-base font-semibold text-ink-soft">
            Select Week (1 to 8)
          </h3>
          <span className="text-base font-bold text-ink tabular-nums">Active: Week {selectedWeek}</span>
        </div>
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
          {WEEKS.map((week) => {
            const isSelected = selectedWeek === week
            return (
              <button
                key={week}
                aria-pressed={isSelected}
                disabled={saving}
                onClick={() => selectWeek(week)}
                className={`rounded-lg border px-2 py-3 text-base font-bold transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-60 ${
                  isSelected
                    ? 'border-brand bg-brand text-brand-ink'
                    : 'border-line bg-surface text-ink-soft hover:bg-raised hover:text-ink'
                }`}
              >
                <span>Week {week}</span>
              </button>
            )
          })}
        </div>
      </section>

      {saveSuccessMsg && (
        <div role="status" className="flex items-center justify-between gap-3 rounded-lg border border-ok/50 bg-surface p-3.5 text-base text-ink">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 shrink-0 text-ok" />
            <span>{saveSuccessMsg}</span>
          </div>
          <button onClick={onBackToLeaderboard} className="shrink-0 font-bold text-ink underline hover:text-brand-hover cursor-pointer">
            View Standings
          </button>
        </div>
      )}

      {legacyPlacedCount > 0 && (
        <div role="status" className="flex items-center justify-between gap-3 rounded-lg border border-gold/60 bg-surface p-3.5 text-base text-ink">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 shrink-0 text-gold" />
            <span>
              {legacyPlacedCount} {legacyPlacedCount === 1 ? 'player was' : 'players were'} attended but unseated;
              they've been placed on courts, please verify.
            </span>
          </div>
          <button onClick={dismissLegacyNotice} className="shrink-0 font-bold text-ink underline hover:text-brand-hover cursor-pointer">
            Dismiss
          </button>
        </div>
      )}

      {errorMsg && (
        <div role="alert" className="flex items-center gap-2 rounded-lg border border-brand bg-brand-soft p-3.5 text-base text-ink">
          <AlertCircle className="h-5 w-5 shrink-0 text-brand-hover" />
          <span className="flex-1">{errorMsg}</span>
          {loadFailed && (
            <button onClick={() => void retryLoad()} className="shrink-0 font-bold text-ink underline hover:text-brand-hover cursor-pointer">
              Retry
            </button>
          )}
        </div>
      )}

      <EntryBoard w={w} rosterSize={roster.length} />

      <HelpModal open={helpOpen} onClose={() => setHelpOpen(false)} />

      <SaveResultModal
        result={saveResult}
        weekNumber={selectedWeek}
        onClose={() => setSaveResult(null)}
        onViewStandings={onBackToLeaderboard}
        onRetry={() => {
          setSaveResult(null)
          handleSaveWeek()
        }}
      />
    </div>
  )
}
