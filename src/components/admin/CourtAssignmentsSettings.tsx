import React, { useEffect, useState } from 'react'
import { AlertTriangle, Loader2 } from 'lucide-react'
import type { EventSettings } from '@/lib/eventSettings'
import { isSupabaseConfigured } from '@/lib/supabase'
import { useCourtSettings } from '@/hooks/useCourtSettings'
import { formatSessionDate, getScheduleTimestamps, getSessionDate, getSessionTimeZone } from '@/utils/rsvpSchedule'
import { CourtRangeForm } from './CourtRangeForm'
import { GenerateBoardSection } from './GenerateBoardSection'

interface CourtAssignmentsSettingsProps {
  eventSettings: EventSettings | null
  toast: (kind: 'success' | 'error', message: string) => void
}

/** Starting courts for the coming run: the court range, auto-publish, and "Generate now". */
export const CourtAssignmentsSettings: React.FC<CourtAssignmentsSettingsProps> = ({ eventSettings, toast }) => {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000) // the cutoff passing enables "Generate now"
    return () => clearInterval(id)
  }, [])

  const sessionDate = getSessionDate(now, eventSettings)
  const { cutoffAt } = getScheduleTimestamps(sessionDate, eventSettings)
  const { snapshot, loading, error, refetch, save, generate } = useCourtSettings(sessionDate)
  const settings = snapshot?.settings ?? null

  return (
    <section aria-labelledby="courts-heading" className="flex flex-col gap-3">
      <div>
        <h2 id="courts-heading" className="text-lg font-bold text-ink">Starting courts</h2>
        <p className="text-sm text-ink-soft">For the run on {formatSessionDate(sessionDate)}.</p>
      </div>

      {loading && (
        <p role="status" className="flex items-center gap-2 text-ink-soft">
          <Loader2 className="h-4 w-4 motion-safe:animate-spin" aria-hidden="true" /> Loading the court settings…
        </p>
      )}

      {error && (
        <div role="alert" className="flex items-start gap-3 rounded-xl border border-brand bg-brand-soft p-4 text-sm text-ink">
          <AlertTriangle className="h-5 w-5 shrink-0 text-brand-hover" aria-hidden="true" />
          <div className="flex-1">
            <p className="font-semibold">Couldn't load the court settings.</p>
            <p className="text-ink-soft">{error.message}</p>
          </div>
          <button type="button" onClick={() => void refetch()} className="min-h-11 cursor-pointer rounded-lg border border-line px-3 font-semibold hover:bg-raised">
            Try again
          </button>
        </div>
      )}

      {snapshot && (
        <>
          <CourtRangeForm
            key={`${sessionDate}|${settings?.sessionDate}|${settings?.top}|${settings?.bottom}|${settings?.autoPublish}`}
            settings={settings}
            inherited={snapshot.inherited}
            save={save}
            toast={toast}
          />
          <GenerateBoardSection
            meta={snapshot.meta}
            hasRange={!!settings}
            autoPublish={settings?.autoPublish ?? false}
            lockAt={cutoffAt}
            now={now}
            timeZone={getSessionTimeZone(sessionDate, eventSettings)}
            databaseReady={isSupabaseConfigured}
            generate={generate}
            toast={toast}
          />
        </>
      )}
    </section>
  )
}
