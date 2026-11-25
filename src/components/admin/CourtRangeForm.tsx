import React, { useState } from 'react'
import { LayoutGrid, Loader2, Save } from 'lucide-react'
import type { CourtResult, CourtSettings } from '@/lib/courtSettings'
import { checkCourtForm, describeCourtOrder, type CourtFormValues } from '@/utils/courtSettingsForm'
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
 * Top / bottom court numbers with a live preview, and "Auto-publish on generate". Remount it (key)
 * when the saved settings change: the fields start from them.
 */
export const CourtRangeForm: React.FC<CourtRangeFormProps> = ({ settings, inherited, save, toast }) => {
  const initial: CourtFormValues = { top: settings ? String(settings.top) : '', bottom: settings ? String(settings.bottom) : '' }
  const savedAutoPublish = settings?.autoPublish ?? false
  const [values, setValues] = useState(initial)
  const [autoPublish, setAutoPublish] = useState(savedAutoPublish)
  const [touched, setTouched] = useState({ top: false, bottom: false })
  const [submitted, setSubmitted] = useState(false)
  const [saving, setSaving] = useState(false)

  const check = checkCourtForm(values)
  const dirty = values.top !== initial.top || values.bottom !== initial.bottom || autoPublish !== savedAutoPublish
  const errorFor = (name: keyof CourtFormValues) => (touched[name] || submitted ? check.errors[name] : undefined)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitted(true)
    if (!check.courtOrder || saving) return
    setSaving(true)
    const result = await save({ top: Number(values.top.trim()), bottom: Number(values.bottom.trim()), autoPublish })
    setSaving(false)
    if (result.ok) toast('success', 'Court settings saved.')
    else toast('error', result.error.message)
  }

  const field = (name: keyof CourtFormValues, label: string) => (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={`cs-${name}`} className="text-sm font-semibold text-ink">{label}</label>
      <input
        id={`cs-${name}`}
        type="number"
        inputMode="numeric"
        min={1}
        step={1}
        value={values[name]}
        onChange={(e) => setValues((v) => ({ ...v, [name]: e.target.value }))}
        onBlur={() => setTouched((t) => ({ ...t, [name]: true }))}
        aria-invalid={errorFor(name) ? true : undefined}
        aria-describedby={`cs-${name}-msg`}
        className={inputClass}
      />
      <div id={`cs-${name}-msg`} aria-live="polite">
        {errorFor(name) && <p className="text-sm text-brand-hover">{errorFor(name)}</p>}
      </div>
    </div>
  )

  return (
    <form onSubmit={(e) => void submit(e)} noValidate className="flex flex-col gap-5 rounded-xl border border-line bg-surface p-4 sm:p-6">
      {inherited && settings && (
        <p className="text-sm text-ink-soft">
          No courts saved for this run yet. These are from {formatSessionDate(settings.sessionDate)}, and generating uses them.
        </p>
      )}
      <div className="grid gap-5 sm:grid-cols-2">
        {field('top', 'Top court number')}
        {field('bottom', 'Bottom court number')}
      </div>

      <p role="status" aria-live="polite" className="flex items-center gap-2 text-sm text-ink">
        <LayoutGrid className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
        {check.courtOrder ? describeCourtOrder(check.courtOrder) : 'Enter both court numbers to see the courts.'}
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
