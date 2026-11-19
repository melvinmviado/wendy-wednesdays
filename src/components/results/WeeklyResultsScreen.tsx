import React, { useMemo, useState } from 'react'
import { AlertTriangle, Loader2 } from 'lucide-react'
import { useWeeklyResults } from '../../hooks/useWeeklyResults'
import { isSupabaseConfigured } from '../../lib/supabase'
import { ResultTeam, WeeklyResult } from '../../types/leaderboard'
import { CourtResultCard } from './CourtResultCard'
import { PodiumPairs } from './PodiumPairs'
import { WeekPhoto } from './WeekPhoto'
import { WeekPillBar } from './WeekPillBar'

interface WeeklyResultsScreenProps {
  isAdmin: boolean
  initialWeek?: number | null // week to open first, e.g. when jumping in from a player's weekly log
}

const formatDate = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })

const todayIso = () => {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

// A week is shown once it has scores, or has a date that is today or earlier.
// Weeks that are dated in the future, or have neither scores nor a date, stay hidden.
const isWeekVisible = (w: WeeklyResult, today: string) =>
  w.playedOn !== null && w.playedOn > today ? false : w.attendeeCount > 0 || w.playedOn !== null

const groupByCourt = (teams: ResultTeam[]) => {
  const map = new Map<number, ResultTeam[]>()
  teams.forEach((t) => map.set(t.courtNumber, [...(map.get(t.courtNumber) ?? []), t]))
  return [...map.entries()]
}

const message = 'rounded-xl border border-line bg-surface p-6 text-center text-muted'

export const WeeklyResultsScreen: React.FC<WeeklyResultsScreenProps> = ({ isAdmin, initialWeek = null }) => {
  const { results, loading, error, refresh } = useWeeklyResults()
  const [selected, setSelected] = useState<number | null>(initialWeek)

  const visible = useMemo(() => {
    const today = todayIso()
    return results.filter((w) => isWeekVisible(w, today))
  }, [results])

  // Fall back to the latest visible week when nothing (or a now-hidden week) is selected
  const week = visible.find((w) => w.weekNumber === selected) ?? visible[visible.length - 1]
  const courts = useMemo(() => (week ? groupByCourt(week.teams) : []), [week])

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h2 className="text-3xl font-black tracking-tight text-ink">Weekly Results</h2>
        <p className="mt-2 text-ink-soft">Court finishes and points for each week.</p>
      </header>

      {error && (
        <div role="alert" className="p-4 rounded-xl bg-brand-soft border border-brand text-sm text-ink flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-brand-hover shrink-0" aria-hidden="true" />
          <p className="font-semibold min-w-0 wrap-break-word">{error}</p>
        </div>
      )}

      {!isSupabaseConfigured ? (
        <p className={message}>Weekly results need a connected database.</p>
      ) : loading && results.length === 0 ? (
        <p role="status" className={`${message} flex items-center justify-center gap-2`}>
          <Loader2 className="w-4 h-4 motion-safe:animate-spin" aria-hidden="true" />
          Loading results
        </p>
      ) : !week ? (
        <p className={message}>No weeks have been played yet. Results will appear here after the first week.</p>
      ) : (
        <>
          <WeekPillBar weeks={visible.map((w) => w.weekNumber)} selected={week.weekNumber} onSelect={setSelected} />

          <div className="flex flex-col gap-4">
            <div className="min-w-0">
              <h3 className="text-xl font-black text-ink">Week {week.weekNumber}</h3>
              <p className="text-sm text-muted">
                {[
                  week.playedOn ? formatDate(week.playedOn) : null,
                  `${week.attendeeCount} ${week.attendeeCount === 1 ? 'Player' : 'Players'}`,
                  `${courts.length} ${courts.length === 1 ? 'Court' : 'Courts'}`,
                ]
                  .filter(Boolean)
                  .join(' • ')}
              </p>
            </div>

            <WeekPhoto
              weekNumber={week.weekNumber}
              photoUrl={week.podiumPhotoUrl}
              isAdmin={isAdmin}
              onChanged={refresh}
            />

            {week.notes && <p className="text-ink-soft wrap-break-word">{week.notes}</p>}

            <PodiumPairs teams={week.teams} />

            {courts.length === 0 ? (
              <p className={message}>No court results were recorded for this week.</p>
            ) : (
              courts.map(([courtNumber, teams]) => (
                <CourtResultCard key={courtNumber} courtNumber={courtNumber} teams={teams} />
              ))
            )}
          </div>
        </>
      )}
    </div>
  )
}
