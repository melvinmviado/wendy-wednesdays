import React from 'react'
import { CheckCircle2, AlertCircle, ArrowLeft } from 'lucide-react'
import { PlayerScore } from '../types/leaderboard'
import { useWeeklyEntry } from '../hooks/useWeeklyEntry'
import { SaveResultModal } from './SaveResultModal'
import { CheckinStage } from './weekly/CheckinStage'
import { CourtsStage } from './weekly/CourtsStage'
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
  const {
    selectedWeek,
    setSelectedWeek,
    stage,
    setStage,
    saveResult,
    setSaveResult,
    saveSuccessMsg,
    errorMsg,
    handleProceedToCourts,
    handleSaveWeek,
    courts,
    checkedInCount,
  } = w

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4">
        <button onClick={onBackToLeaderboard} className={btnGhost}>
          <ArrowLeft className="h-4 w-4" />
          <span>Leaderboard</span>
        </button>
        <h2 className="text-lg font-bold text-ink">Doubles Court Cards (2 Teams / Court)</h2>
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
                onClick={() => {
                  setSelectedWeek(week)
                  setSaveResult(null)
                  setStage('checkin')
                }}
                className={`rounded-lg border px-2 py-3 text-base font-bold transition-colors cursor-pointer ${
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

      <nav aria-label="Entry stage" className="grid grid-cols-2 border-b border-line">
        {[
          { id: 'checkin' as const, n: 1, label: `Check-in (${checkedInCount})`, go: () => setStage('checkin') },
          { id: 'courts' as const, n: 2, label: `Court Cards (${courts.length} Courts)`, go: handleProceedToCourts },
        ].map((t) => (
          <button
            key={t.id}
            onClick={t.go}
            aria-current={stage === t.id ? 'step' : undefined}
            className={`-mb-px flex items-center justify-center gap-2 border-b-2 px-3 py-3 text-base font-semibold transition-colors cursor-pointer ${
              stage === t.id
                ? 'border-brand-hover text-ink'
                : 'border-transparent text-muted hover:text-ink'
            }`}
          >
            <span
              className={`flex h-6 w-6 items-center justify-center rounded-full text-sm tabular-nums ${
                stage === t.id ? 'bg-brand text-brand-ink' : 'bg-raised text-ink-soft'
              }`}
            >
              {t.n}
            </span>
            <span>{t.label}</span>
          </button>
        ))}
      </nav>

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

      {errorMsg && (
        <div role="alert" className="flex items-center gap-2 rounded-lg border border-brand bg-brand-soft p-3.5 text-base text-ink">
          <AlertCircle className="h-5 w-5 shrink-0 text-brand-hover" />
          <span>{errorMsg}</span>
        </div>
      )}

      {stage === 'checkin' && <CheckinStage w={w} roster={roster} />}
      {stage === 'courts' && <CourtsStage w={w} />}

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
