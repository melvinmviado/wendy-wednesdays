import React, { useEffect, useRef } from 'react'
import { Calendar, CalendarClock, Clock, Loader2, Save, TriangleAlert } from 'lucide-react'
import { zoneGenericName } from '../../lib/datetime'
import type { EventSettings, EventSettingsInput, EventSettingsResult } from '../../lib/eventSettings'
import { useEventSettingsForm } from '../../hooks/useEventSettingsForm'
import { DateTimeField } from './DateTimeField'
import { SavedSettingsSummary } from './SavedSettingsSummary'

interface EventSettingsPanelProps {
  settings: EventSettings | null
  update: (input: EventSettingsInput) => Promise<EventSettingsResult<EventSettings>>
  toast: (kind: 'success' | 'error', message: string) => void
}

const quiet =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-line bg-surface px-4 text-sm font-semibold text-ink hover:bg-raised disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-hover'

/** The RSVP / event schedule form. Rules live in utils/eventSettingsForm.ts; state in the hook. */
export const EventSettingsPanel: React.FC<EventSettingsPanelProps> = ({ settings, update, toast }) => {
  const f = useEventSettingsForm({ settings, update, toast })
  const confirmRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (f.confirming) confirmRef.current?.focus()
  }, [f.confirming])

  const field = (name: 'open' | 'cutoff' | 'start' | 'end') => ({
    value: f.values[name],
    onChange: (v: string) => f.setField(name, v),
    onBlur: () => f.blur(name),
    error: f.errorFor(name),
    warning: f.warningFor(name),
  })
  const zone = zoneGenericName(f.timeZone)

  return (
    <div className="flex flex-col gap-6">
      <SavedSettingsSummary settings={settings} now={new Date()} />

      <form onSubmit={(e) => { e.preventDefault(); f.submit() }} noValidate className="flex flex-col gap-5 rounded-xl border border-line bg-surface p-4 sm:p-6">
        <p className="text-sm text-ink-soft">
          All times are <span className="font-semibold text-ink">{zone}</span> ({f.timeZone}), whatever time zone you are in.
        </p>

        <div role="group" aria-label="Quick fill" className="flex flex-col gap-2 sm:flex-row">
          <button type="button" onClick={f.fillRun} className={quiet}>
            <CalendarClock className="h-4 w-4" aria-hidden="true" /> Next Wednesday 7:00 to 9:00 PM
          </button>
          <button type="button" onClick={f.fillCutoff} disabled={!f.canFillCutoff} className={quiet}>
            <Clock className="h-4 w-4" aria-hidden="true" /> Cutoff 24h before start
          </button>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <DateTimeField id="es-start" label="Event start" icon={Calendar} {...field('start')} />
          <DateTimeField id="es-end" label="Event end" icon={Calendar} {...field('end')} />
          <DateTimeField id="es-open" label="RSVP opens" icon={Clock} hint="Leave empty to open right away." {...field('open')} />
          <DateTimeField id="es-cutoff" label="RSVP cutoff" icon={Clock} hint="RSVPs lock at this moment." {...field('cutoff')} />
          <div className="flex flex-col gap-1.5">
            <label htmlFor="es-capacity" className="text-sm font-semibold text-ink">Player capacity</label>
            <input
              id="es-capacity"
              type="number"
              inputMode="numeric"
              min={1}
              max={200}
              value={f.values.capacity}
              onChange={(e) => f.setField('capacity', e.target.value)}
              onBlur={() => f.blur('capacity')}
              aria-invalid={f.errorFor('capacity') ? true : undefined}
              aria-describedby="es-capacity-msg"
              className="min-h-11 w-full rounded-lg border border-line bg-ground px-3 py-2 text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-hover"
            />
            <div id="es-capacity-msg" aria-live="polite">
              {f.errorFor('capacity') && <p className="text-sm text-brand-hover">{f.errorFor('capacity')}</p>}
            </div>
          </div>
        </div>

        <p role="status" aria-live="polite" className="sr-only">
          {f.submitted && f.errorCount > 0 ? `${f.errorCount} ${f.errorCount === 1 ? 'field needs' : 'fields need'} attention.` : ''}
        </p>

        {f.confirming && (
          <div role="alert" className="flex flex-col gap-3 rounded-lg border border-brand bg-brand-soft p-4 text-sm text-ink">
            <p className="flex items-start gap-2 font-semibold">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-brand-hover" aria-hidden="true" />
              RSVPs are open right now. Saving this will close them immediately.
            </p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <button ref={confirmRef} type="button" onClick={() => void f.confirmSave()} className="inline-flex min-h-11 cursor-pointer items-center justify-center rounded-lg bg-brand px-4 font-bold text-brand-ink hover:bg-brand-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink">
                Close RSVPs now
              </button>
              <button type="button" onClick={f.cancelConfirm} className={quiet}>Go back</button>
            </div>
          </div>
        )}

        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={f.reset} disabled={!f.dirty || f.saving} className={quiet}>Discard changes</button>
          <button
            type="submit"
            disabled={!f.dirty || f.saving || f.confirming}
            className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-lg bg-brand px-5 text-sm font-bold text-brand-ink hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            {f.saving ? <Loader2 className="h-4 w-4 motion-safe:animate-spin" aria-hidden="true" /> : <Save className="h-4 w-4" aria-hidden="true" />}
            {f.saving ? 'Saving…' : 'Save settings'}
          </button>
        </div>
      </form>
    </div>
  )
}
