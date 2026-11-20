import React from 'react'
import { Clock } from 'lucide-react'
import { formatEventDateTime, formatEventRange } from '../../lib/datetime'
import type { EventSettings } from '../../lib/eventSettings'
import { formatCountdown } from '../../utils/rsvpCountdown'
import { getScheduleTimestamps, getSessionTimeZone } from '../../utils/rsvpSchedule'

interface RsvpScheduleInfoProps {
  sessionDate: string | null
  /** The server-corrected clock, which the RSVP hook advances on its own poll. */
  now: Date
  /** The admin's settings, or null to show the built-in weekly schedule. */
  settings: EventSettings | null
}

/**
 * When the run is and when RSVPs close, always in the event's own time zone with its label
 * ("EST"), so a player travelling or in another zone reads the same times as everyone else.
 */
export const RsvpScheduleInfo: React.FC<RsvpScheduleInfoProps> = ({ sessionDate, now, settings }) => {
  if (!sessionDate) return null
  const { openAt, cutoffAt, liveStart, liveEnd } = getScheduleTimestamps(sessionDate, settings)
  const timeZone = getSessionTimeZone(sessionDate, settings)
  const closed = now >= cutoffAt
  const notYetOpen = !closed && openAt !== null && now < openAt

  return (
    <div className="flex flex-col gap-1 border-b border-line px-4 py-3 text-sm text-ink-soft">
      <p>{formatEventRange(liveStart.toISOString(), liveEnd.toISOString(), timeZone)}</p>
      {notYetOpen && openAt && (
        <p className="flex flex-wrap items-center gap-x-1.5">
          <Clock className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
          <span>RSVPs open {formatEventDateTime(openAt.toISOString(), timeZone)}</span>
          <span className="font-semibold text-ink">(in {formatCountdown(openAt.getTime() - now.getTime())})</span>
        </p>
      )}
      {closed ? (
        <p role="status" className="font-semibold text-ink">RSVP closed</p>
      ) : (
        <p className="flex flex-wrap items-center gap-x-1.5">
          <Clock className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
          <span>RSVP closes {formatEventDateTime(cutoffAt.toISOString(), timeZone)}</span>
          <span className="font-semibold text-ink">(in {formatCountdown(cutoffAt.getTime() - now.getTime())})</span>
        </p>
      )}
    </div>
  )
}
