import React from 'react'
import { Calendar, Clock, Users } from 'lucide-react'
import { formatEventDateTime, formatEventRange, zoneGenericName } from '../../lib/datetime'
import type { EventSettings } from '../../lib/eventSettings'
import { CAPACITY, SESSION_TIME_ZONE } from '../../utils/rsvpSchedule'

/** What the database holds right now, in the event's own time zone. */
export const SavedSettingsSummary: React.FC<{ settings: EventSettings | null; now: Date }> = ({ settings, now }) => {
  if (!settings) {
    return (
      <section aria-labelledby="saved-heading" className="rounded-xl border border-line bg-surface p-4">
        <h2 id="saved-heading" className="text-sm font-bold text-ink">Currently saved</h2>
        <p className="mt-1 text-sm text-ink-soft">
          Nothing yet, so the default schedule applies: Wednesdays 8:00 to 10:00 PM, RSVPs close Tuesday 8:00 PM (24 hours before), {CAPACITY} players
          ({zoneGenericName(SESSION_TIME_ZONE)}).
        </p>
      </section>
    )
  }
  const over = now.getTime() >= Date.parse(settings.eventEndAt)
  const tz = settings.timezone
  return (
    <section aria-labelledby="saved-heading" className="rounded-xl border border-line bg-surface p-4">
      <h2 id="saved-heading" className="text-sm font-bold text-ink">Currently saved</h2>
      <dl className="mt-2 grid gap-2 text-sm text-ink-soft">
        <div className="flex items-start gap-2">
          <Calendar className="mt-0.5 h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
          <div><dt className="sr-only">Event</dt><dd>{formatEventRange(settings.eventStartAt, settings.eventEndAt, tz)}</dd></div>
        </div>
        <div className="flex items-start gap-2">
          <Clock className="mt-0.5 h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
          <div>
            <dt className="sr-only">RSVP opens</dt>
            <dd>{settings.rsvpOpenAt ? `RSVP opens ${formatEventDateTime(settings.rsvpOpenAt, tz)}` : 'RSVP opens right away'}</dd>
            <dt className="sr-only">RSVP closes</dt><dd>RSVP closes {formatEventDateTime(settings.rsvpCutoffAt, tz)}</dd></div>
        </div>
        <div className="flex items-start gap-2">
          <Users className="mt-0.5 h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
          <div><dt className="sr-only">Capacity</dt><dd>{settings.capacity} players • {zoneGenericName(tz, new Date(settings.eventStartAt))}</dd></div>
        </div>
      </dl>
      {over && (
        <p className="mt-2 text-xs text-muted">This event has ended, so the default weekly schedule applies until you save a new one.</p>
      )}
    </section>
  )
}
