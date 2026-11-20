import { datetimeLocalToUtcIso, localDateInZone, utcIsoToDatetimeLocal } from '../lib/datetime'
import type { EventSettings, EventSettingsInput } from '../lib/eventSettings'
import { isRsvpOpen } from './rsvpSchedule'

/** The form's text: datetime-local values read as wall-clock time in the event zone. */
export interface FormValues {
  /** Empty = RSVPs open right away. */
  open: string
  cutoff: string
  start: string
  end: string
  capacity: string
}

export type FieldName = keyof FormValues
export type FieldMessages = Partial<Record<FieldName, string>>

export interface FormCheck {
  /** Block saving. */
  errors: FieldMessages
  /** Worth a second look, but saving is allowed. */
  warnings: FieldMessages
  /** The values ready to send; null while there are errors. */
  input: EventSettingsInput | null
}

const HOUR_MS = 3_600_000

export function toFormValues(settings: EventSettings | null, timeZone: string): FormValues {
  if (!settings) return { open: '', cutoff: '', start: '', end: '', capacity: '24' }
  return {
    open: settings.rsvpOpenAt ? utcIsoToDatetimeLocal(settings.rsvpOpenAt, timeZone) : '',
    cutoff: utcIsoToDatetimeLocal(settings.rsvpCutoffAt, timeZone),
    start: utcIsoToDatetimeLocal(settings.eventStartAt, timeZone),
    end: utcIsoToDatetimeLocal(settings.eventEndAt, timeZone),
    capacity: String(settings.capacity),
  }
}

/** 0 = Sunday, for a "YYYY-MM-DD" calendar date. */
const weekdayOf = (date: string): number => {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay()
}

/**
 * Mirrors the table's rules (start < end, cutoff <= start, capacity 1-200) plus the Wednesday-only
 * rule the database enforces for now. Past dates only warn: an admin may be correcting a record or
 * deliberately closing RSVPs.
 */
export function checkForm(values: FormValues, timeZone: string, now: Date): FormCheck {
  const errors: FieldMessages = {}
  const warnings: FieldMessages = {}
  const at = {
    open: values.open.trim() ? datetimeLocalToUtcIso(values.open, timeZone) : null,
    cutoff: datetimeLocalToUtcIso(values.cutoff, timeZone),
    start: datetimeLocalToUtcIso(values.start, timeZone),
    end: datetimeLocalToUtcIso(values.end, timeZone),
  }
  for (const f of ['cutoff', 'start', 'end'] as const) {
    if (!at[f]) errors[f] = 'Enter a date and time.'
  }

  if (values.open.trim() && !at.open) errors.open = 'Enter a date and time, or clear it to open right away.'

  const ms = (iso: string | null) => (iso ? Date.parse(iso) : NaN)
  if (at.open && at.cutoff && ms(at.open) >= ms(at.cutoff)) errors.open = 'RSVPs must open before they close.'
  if (at.start && at.end && ms(at.start) >= ms(at.end)) errors.end = 'The event must end after it starts.'
  if (at.cutoff && at.start && ms(at.cutoff) > ms(at.start)) errors.cutoff = 'RSVPs must close at or before the event starts.'
  if (at.start && weekdayOf(localDateInZone(at.start, timeZone)) !== 3) {
    errors.start = 'For now the run has to be on a Wednesday.'
  }

  const cap = Number(values.capacity)
  if (values.capacity.trim() === '' || !Number.isInteger(cap) || cap < 1 || cap > 200) {
    errors.capacity = 'Use a whole number from 1 to 200.'
  }

  if (at.start && ms(at.start) < now.getTime() && !errors.start) warnings.start = 'This start time is in the past.'
  if (at.end && ms(at.end) < now.getTime() && !errors.end) warnings.end = 'This end time is in the past.'
  if (at.cutoff && ms(at.cutoff) < now.getTime() && !errors.cutoff) {
    warnings.cutoff = 'This cutoff is in the past, so RSVPs will be closed.'
  }

  const input =
    Object.keys(errors).length === 0 && at.cutoff && at.start && at.end
      ? { rsvpOpenAt: at.open, rsvpCutoffAt: at.cutoff, eventStartAt: at.start, eventEndAt: at.end, timezone: timeZone, capacity: cap }
      : null
  return { errors, warnings, input }
}

const pad = (n: number) => String(n).padStart(2, '0')

/** Adds days to a "YYYY-MM-DD" date with no time of day involved, so daylight saving cannot interfere. */
function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number)
  const r = new Date(Date.UTC(y, m - 1, d + days))
  return `${r.getUTCFullYear()}-${pad(r.getUTCMonth() + 1)}-${pad(r.getUTCDate())}`
}

/**
 * The next Wednesday run, 7:00 to 9:00 PM in the zone: the first Wednesday whose 7:00 PM start is
 * still ahead (so today, on a Wednesday afternoon).
 */
export function nextWednesdayRun(now: Date, timeZone: string): { start: string; end: string } {
  const today = localDateInZone(now, timeZone)
  let day = addDays(today, (3 - weekdayOf(today) + 7) % 7)
  const startMs = (d: string) => Date.parse(datetimeLocalToUtcIso(`${d}T19:00`, timeZone) ?? '')
  if (startMs(day) <= now.getTime()) day = addDays(day, 7)
  return { start: `${day}T19:00`, end: `${day}T21:00` }
}

/** The cutoff `hours` before the start, or null when the start is not filled in yet. */
export function cutoffBefore(start: string, hours: number, timeZone: string): string | null {
  const iso = datetimeLocalToUtcIso(start, timeZone)
  return iso ? utcIsoToDatetimeLocal(new Date(Date.parse(iso) - hours * HOUR_MS).toISOString(), timeZone) : null
}

/**
 * True when saving would close RSVPs that are open this moment: the current schedule still takes
 * RSVPs, and the new one would not. Uses the same rules the RSVP bar does.
 */
export function wouldCloseRsvpNow(now: Date, saved: EventSettings | null, next: EventSettingsInput): boolean {
  const nextSettings: EventSettings = { ...next, updatedAt: now.toISOString(), updatedBy: null }
  return isRsvpOpen(now, saved) && !isRsvpOpen(now, nextSettings)
}

/** True when the form differs from what is saved. */
export const isDirty = (a: FormValues, b: FormValues): boolean =>
  a.open !== b.open || a.cutoff !== b.cutoff || a.start !== b.start || a.end !== b.end || a.capacity.trim() !== b.capacity.trim()
