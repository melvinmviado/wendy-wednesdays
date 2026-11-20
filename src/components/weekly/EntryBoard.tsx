import React from 'react'
import { RefreshCw, Save, Trophy } from 'lucide-react'
import type { WeeklyEntry } from '../../hooks/useWeeklyEntry'
import { CourtsPanel } from './CourtsPanel'
import { RosterPanel } from './RosterPanel'
import { btnPrimary } from './styles'

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

// Single-screen weekly entry: courts on top (left on wide screens), roster/bench below (right),
// and a sticky save bar within thumb reach.
export const EntryBoard: React.FC<{ w: WeeklyEntry; rosterSize: number }> = ({ w, rosterSize }) => {
  const { selectedWeek, attendedCount, courtCount, saving, loadingWeek, handleSaveWeek } = w
  const summary = `${plural(attendedCount, 'player')}, ${plural(courtCount, 'court')}`

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
        <CourtsPanel w={w} />
        <div className="lg:sticky lg:top-[76px]">
          <RosterPanel w={w} rosterSize={rosterSize} />
        </div>
      </div>

      <div className="sticky bottom-[calc(var(--spacing-dock)+env(safe-area-inset-bottom)+1rem)] z-20 w-full pt-2">
        <div className="flex w-full flex-col items-center justify-between gap-3 rounded-xl border border-line bg-surface p-4 shadow-lg shadow-ground sm:flex-row">
          <p role="status" className="flex items-center gap-2 text-base text-ink-soft">
            <Trophy className="h-5 w-5 shrink-0 text-gold" />
            <span>
              <strong className="text-ink">Week {selectedWeek}</strong>: {summary}
            </span>
          </p>
          <button onClick={handleSaveWeek} disabled={saving || loadingWeek} className={`${btnPrimary} min-h-14 w-full sm:w-auto`}>
            {saving ? (
              <>
                <RefreshCw className="h-5 w-5 animate-spin" />
                <span>Saving Court Results...</span>
              </>
            ) : (
              <>
                <Save className="h-5 w-5" />
                <span>Save Week {selectedWeek} & Compute Leaderboard</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
