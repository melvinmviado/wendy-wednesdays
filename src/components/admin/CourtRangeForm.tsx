import React, { useState } from 'react'
import { LayoutGrid, Loader2, Save } from 'lucide-react'
import type { CourtResult, CourtSettings } from '@/lib/courtSettings'
import { checkCourtNumbers, describeCourtOrder, formatCourtNumbers } from '@/utils/courtSettingsForm'
import { formatSessionDate } from '@/utils/rsvpSchedule'

export type SaveCourtSettings = (input: Omit<CourtSettings, 'sessionDate'>) => Promise<CourtResult<CourtSettings>>

interface CourtRangeFormProps {
  /** The run's saved settings, or the latest earlier run's when `inherited`. */
  settings: CourtSettings | null
  inherited: boolean
  save: SaveCourtSettings
  toast: (kind: 'success' | 'error', message: string) => void
}

const inputClass =
  'min-h-11 w-full rounded-lg border border-line bg-ground px-3 py-2 text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-hover'

/**
 * The facility's court numbers, top court first ("10, 9, 8, 7, 3, 2"), with a live preview, and
 * "Auto-publish on generate". Remount it (key) when the saved settings change: the fields start from them.
 */
export const CourtRangeForm: React.FC<CourtRangeFormProps> = ({ settings, inherited, save, toast }) => {
  const initial = settings ? formatCourtNumbers(settings.courtNumbers) : ''
  const savedAutoPublish = settings?.autoPublish ?? false
  const [text, setText] = useState(initial)
  const [autoPublish, setAutoPublish] = useState(savedAutoPublish)
  const [touched, setTouched] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [saving, setSaving] = useState(false)

  const check = checkCourtNumbers(text)
  // Retyping the same courts ("10,9" for "10, 9") is not a change.
  const changed = !settings || !check.courtOrder || check.courtOrder.join(',') !== settings.courtNumbers.join(',')
  const dirty = changed || autoPublish !== savedAutoPublish
  const error = touched || submitted ? check.error : null

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitted(true)
    if (!check.courtOrder || saving) return
    setSaving(true)
    const result = await save({ courtNumbers: check.courtOrder, autoPublish })
    setSaving(false)
    if (result.ok) toast('success', 'Court settings saved.')
    else toast('error', result.error.message)
  }

  return (
    <form onSubmit={(e) => void submit(e)} noValidate className="flex flex-col gap-5 rounded-xl border border-line bg-surface p-4 sm:p-6">
      {inherited && settings && (
        <p className="text-sm text-ink-soft">
          No courts saved for this run yet. These are from {formatSessionDate(settings.sessionDate)}, and generating uses them.
        </p>
      )}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="cs-courts" className="text-sm font-semibold text-ink">Court numbers, top court first</label>
        <p id="cs-courts-help" className="text-sm text-ink-soft">
          Separate them with commas, like 10, 9, 8, 7, 3, 2. A run of courts can be written as 10-7.
        </p>
        <input
          id="cs-courts"
          type="text"
          autoComplete="off"
          spellCheck={false}
          placeholder="10, 9, 8, 7, 3, 2"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => setTouched(true)}
          aria-invalid={error ? true : undefined}
          aria-describedby="cs-courts-help cs-courts-msg"
          className={inputClass}
        />
        <div id="cs-courts-msg" aria-live="polite">
          {error && <p className="text-sm text-brand-hover">{error}</p>}
        </div>
      </div>

      <p role="status" aria-live="polite" className="flex items-center gap-2 text-sm text-ink">
        <LayoutGrid className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
        {check.courtOrder ? describeCourtOrder(check.courtOrder) : 'Enter the court numbers to see the courts.'}
      </p>

      <label className="flex cursor-pointer items-start gap-3 text-sm">
        <input
          type="checkbox"
          checked={autoPublish}
          onChange={(e) => setAutoPublish(e.target.checked)}
          className="mt-0.5 h-5 w-5 shrink-0 cursor-pointer accent-brand"
        />
        <span>
          <span className="font-semibold text-ink">Auto-publish on generate</span>
          <span className="block text-ink-soft">
            Off: a new board is a draft only admins see until it is published. On: players see it as soon as it is
            generated. Later runs keep this choice.
          </span>
        </span>
      </label>

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={!dirty || saving}
          className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-lg bg-brand px-5 text-sm font-bold text-brand-ink hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        >
          {saving ? <Loader2 className="h-4 w-4 motion-safe:animate-spin" aria-hidden="true" /> : <Save className="h-4 w-4" aria-hidden="true" />}
          {saving ? 'Saving…' : 'Save courts'}
        </button>
      </div>
    </form>
  )
}
