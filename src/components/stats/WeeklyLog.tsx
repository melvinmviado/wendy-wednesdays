import React from 'react'
import { ChevronRight } from 'lucide-react'
import type { WeeklyLogEntry } from '../../utils/playerStats'
import { describeResult, formatLogDate, newestFirst } from '../../utils/weeklyLog'

interface WeeklyLogProps {
  log: WeeklyLogEntry[]
  onSelectWeek?: (weekNumber: number) => void
}

const ROW = 'flex min-h-11 w-full items-center gap-3 rounded-xl border border-line bg-raised px-3 py-2 text-left'

// Attended weeks only, newest first. A simple list (not a table) so it never wraps awkwardly at 375px.
export const WeeklyLog: React.FC<WeeklyLogProps> = ({ log, onSelectWeek }) => {
  if (log.length === 0) {
    return <p className="rounded-xl border border-line bg-raised py-6 text-center text-sm text-muted">No weeks played yet</p>
  }

  return (
    <ul className="flex flex-col gap-2">
      {newestFirst(log).map((e) => {
        const date = formatLogDate(e.playedOn, e.weekNumber)
        const result = describeResult(e)
        const content = (
          <>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-bold text-ink">{date}</span>
              <span className="block text-xs text-muted">Week {e.weekNumber}</span>
            </span>
            <span className={`shrink-0 text-right text-sm font-semibold ${e.finish === 'Winner' ? 'text-gold' : 'text-ink-soft'}`}>
              {result}
            </span>
            {onSelectWeek && <ChevronRight className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />}
          </>
        )
        return (
          <li key={e.weekNumber}>
            {onSelectWeek ? (
              <button
                type="button"
                onClick={() => onSelectWeek(e.weekNumber)}
                aria-label={`Week ${e.weekNumber}, ${date}, ${result}. View week results`}
                className={`${ROW} cursor-pointer transition-colors hover:bg-surface focus-visible:outline-2 focus-visible:outline-brand-hover`}
              >
                {content}
              </button>
            ) : (
              <div className={ROW}>{content}</div>
            )}
          </li>
        )
      })}
    </ul>
  )
}
