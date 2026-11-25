import { useSearchParams } from 'react-router'
import { Loader2 } from 'lucide-react'
import { CourtBoardEditor } from '../../components/courts/CourtBoardEditor'
import { useEventSettings } from '../../hooks/useEventSettings'
import { formatSessionDate, getSessionDate, getSessionTimeZone } from '../../utils/rsvpSchedule'
import { useAdminContext } from './adminContext'

/** "?date=2026-11-25" opens another run; anything that is not a Wednesday is ignored. */
function askedDate(value: string | null): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const d = new Date(`${value}T12:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.getUTCDay() === 3 ? value : null
}

/** Court assignments: edit, publish and review the starting courts of the coming run. */
export function AdminCourtsPage() {
  const { toasts } = useAdminContext()
  const { settings, loading } = useEventSettings()
  const [params] = useSearchParams()

  if (loading) {
    return (
      <p role="status" className="flex items-center gap-2 text-ink-soft">
        <Loader2 className="h-4 w-4 motion-safe:animate-spin" aria-hidden="true" /> Loading…
      </p>
    )
  }
  // Wait for the event settings: they decide which run is "the coming run".
  const sessionDate = askedDate(params.get('date')) ?? getSessionDate(new Date(), settings)
  return (
    <section aria-labelledby="courts-run" className="flex flex-col gap-3">
      <h2 id="courts-run" className="text-lg font-bold text-ink">Run on {formatSessionDate(sessionDate)}</h2>
      <CourtBoardEditor key={sessionDate} sessionDate={sessionDate} timeZone={getSessionTimeZone(sessionDate, settings)} toast={toasts.push} />
    </section>
  )
}
