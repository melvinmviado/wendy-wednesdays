import type { WeeklyLogEntry } from './playerStats'

/** "Wed, Nov 5", or "Week 3" when the week has no recorded date. */
export function formatLogDate(playedOn: string | null, weekNumber: number): string {
  if (!playedOn) return `Week ${weekNumber}`
  // Local midnight so the calendar day doesn't shift with the viewer's timezone
  const date = new Date(`${playedOn}T00:00:00`)
  if (Number.isNaN(date.getTime())) return `Week ${weekNumber}` // malformed date: never show "Invalid Date"
  return date.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}

/** "Court 2 · Winner", "Court 2 · Runner-up", or "Court not recorded" for unplaced attendees. */
export function describeResult(entry: WeeklyLogEntry): string {
  if (entry.courtNumber === null) return 'Court not recorded'
  return entry.finish === 'Other' ? `Court ${entry.courtNumber}` : `Court ${entry.courtNumber} · ${entry.finish}`
}

export const newestFirst = (log: WeeklyLogEntry[]): WeeklyLogEntry[] =>
  [...log].sort((a, b) => b.weekNumber - a.weekNumber)
