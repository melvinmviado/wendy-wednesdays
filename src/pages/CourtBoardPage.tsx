import { useEffect } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import { PublicCourtBoard } from '../components/courtboard/PublicCourtBoard'
import { TvCourtBoard } from '../components/courtboard/TvCourtBoard'
import { useMyPlayer } from '../hooks/useMyPlayer'
import { formatSessionDate } from '../utils/rsvpSchedule'

/** A run is identified by its date: /events/2026-11-25/courts. Anything that is not a Wednesday is not a run. */
export function runDateFrom(id: string | undefined): string | null {
  if (!id || !/^\d{4}-\d{2}-\d{2}$/.test(id)) return null
  const d = new Date(`${id}T12:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === id && d.getUTCDay() === 3 ? id : null
}

/** Public Court Board at /events/:id/courts; TV mode with ?tv=1. */
export function CourtBoardPage() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const me = useMyPlayer()
  const sessionDate = runDateFrom(id)
  const tv = params.get('tv') === '1'

  useEffect(() => {
    const previous = document.title
    document.title = sessionDate ? `Courts · ${formatSessionDate(sessionDate)} · Wendy Wednesdays` : 'Courts · Wendy Wednesdays'
    return () => {
      document.title = previous
    }
  }, [sessionDate])

  if (!sessionDate) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-3 bg-ground p-6 text-center text-ink">
        <h1 className="text-2xl font-black">No run on that date</h1>
        <p className="text-ink-soft">Court boards live at /events/YYYY-MM-DD/courts, for a Wednesday.</p>
        <Link to="/" className="font-semibold underline underline-offset-2">Back to the leaderboard</Link>
      </main>
    )
  }
  return tv ? <TvCourtBoard sessionDate={sessionDate} /> : <PublicCourtBoard sessionDate={sessionDate} myPlayerId={me?.id ?? null} />
}
