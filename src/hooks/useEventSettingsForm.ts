import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { EventSettings, EventSettingsInput, EventSettingsResult } from '../lib/eventSettings'
import { SESSION_TIME_ZONE } from '../utils/rsvpSchedule'
import {
  checkForm,
  cutoffBefore,
  isDirty,
  nextWednesdayRun,
  toFormValues,
  wouldCloseRsvpNow,
  type FieldName,
  type FormValues,
} from '../utils/eventSettingsForm'

interface Options {
  settings: EventSettings | null
  update: (input: EventSettingsInput) => Promise<EventSettingsResult<EventSettings>>
  toast: (kind: 'success' | 'error', message: string) => void
}

/** State and rules for the admin event-settings form. The components only draw it. */
export function useEventSettingsForm({ settings, update, toast }: Options) {
  const timeZone = settings?.timezone ?? SESSION_TIME_ZONE
  const saved = useMemo(() => toFormValues(settings, timeZone), [settings, timeZone])
  const [values, setValues] = useState<FormValues>(saved)
  const [touched, setTouched] = useState<Partial<Record<FieldName, boolean>>>({})
  const [submitted, setSubmitted] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [saving, setSaving] = useState(false)
  const [now, setNow] = useState(() => new Date())

  // Keep "in the past" warnings honest while the page sits open.
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(id)
  }, [])

  // Adopt what the database holds when it first loads or changes, unless the admin is mid-edit.
  const lastSaved = useRef(saved)
  useEffect(() => {
    if (!isDirty(values, lastSaved.current)) setValues(saved)
    lastSaved.current = saved
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only a change in the saved values should re-sync
  }, [saved])

  const check = useMemo(() => checkForm(values, timeZone, now), [values, timeZone, now])
  const dirty = isDirty(values, saved)

  const setField = useCallback((name: FieldName, value: string) => {
    setValues((v) => ({ ...v, [name]: value }))
    setConfirming(false) // what was being confirmed no longer matches the form
  }, [])
  const blur = useCallback((name: FieldName) => setTouched((t) => ({ ...t, [name]: true })), [])
  const reset = useCallback(() => {
    setValues(saved)
    setTouched({})
    setSubmitted(false)
    setConfirming(false)
  }, [saved])

  const fillRun = useCallback(() => {
    const run = nextWednesdayRun(new Date(), timeZone)
    setValues((v) => ({ ...v, start: run.start, end: run.end }))
    setConfirming(false)
  }, [timeZone])
  const cutoffFill = cutoffBefore(values.start, 24, timeZone)
  const fillCutoff = useCallback(() => {
    if (cutoffFill) setField('cutoff', cutoffFill)
  }, [cutoffFill, setField])

  const save = useCallback(async () => {
    if (!check.input) return
    setConfirming(false)
    setSaving(true)
    const result = await update(check.input)
    setSaving(false)
    if (result.ok) {
      setSubmitted(false)
      setTouched({})
      toast('success', 'Event settings saved.')
    } else {
      toast('error', result.error.message)
    }
  }, [check.input, update, toast])

  /** Validates, asks first if this would close RSVPs right now, otherwise saves. */
  const submit = useCallback(() => {
    setSubmitted(true)
    if (!check.input || saving) return
    if (wouldCloseRsvpNow(new Date(), settings, check.input)) setConfirming(true)
    else void save()
  }, [check.input, saving, settings, save])

  const visible = (name: FieldName) => submitted || touched[name]
  const errorCount = Object.keys(check.errors).length

  return {
    timeZone, values, dirty, saving, confirming, submitted, errorCount,
    errorFor: (name: FieldName) => (visible(name) ? check.errors[name] : undefined),
    warningFor: (name: FieldName) => (check.warnings[name] && !check.errors[name] ? check.warnings[name] : undefined),
    setField, blur, reset, fillRun, fillCutoff, canFillCutoff: cutoffFill !== null,
    submit, confirmSave: save, cancelConfirm: () => setConfirming(false),
  }
}
