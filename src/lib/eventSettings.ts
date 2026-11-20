import { isSupabaseConfigured, supabase } from './supabase'
import { isValidTimeZone } from './datetime'
import { errorMessage } from '../utils/errorMessage'

/** The single event_settings row. Instants are UTC ISO strings; show them in `timezone`. */
export interface EventSettings {
  /** When RSVPs open (UTC ISO). Null = open right away. */
  rsvpOpenAt: string | null
  rsvpCutoffAt: string
  eventStartAt: string
  eventEndAt: string
  timezone: string
  capacity: number
  updatedAt: string
  updatedBy: string | null
}

/** What an admin edits. updatedAt / updatedBy are stamped by the database. */
export type EventSettingsInput = Pick<
  EventSettings,
  'rsvpOpenAt' | 'rsvpCutoffAt' | 'eventStartAt' | 'eventEndAt' | 'timezone' | 'capacity'
>

export interface EventSettingsError {
  code: 'FORBIDDEN' | 'INVALID' | 'NOT_FOUND' | 'NETWORK' | 'UNKNOWN'
  message: string
}

export type EventSettingsResult<T> = { ok: true; data: T } | { ok: false; error: EventSettingsError }

interface EventSettingsRow {
  rsvp_open_at?: string | null // absent until the rsvp_open_at migration is applied
  rsvp_cutoff_at: string
  event_start_at: string
  event_end_at: string
  timezone: string
  capacity: number
  updated_at: string
  updated_by: string | null
}

const toSettings = (r: EventSettingsRow): EventSettings => ({
  rsvpOpenAt: r.rsvp_open_at ?? null,
  rsvpCutoffAt: r.rsvp_cutoff_at,
  eventStartAt: r.event_start_at,
  eventEndAt: r.event_end_at,
  timezone: r.timezone,
  capacity: r.capacity,
  updatedAt: r.updated_at,
  updatedBy: r.updated_by,
})

const ok = <T>(data: T): EventSettingsResult<T> => ({ ok: true, data })
const fail = (code: EventSettingsError['code'], message: string): EventSettingsResult<never> => ({
  ok: false,
  error: { code, message },
})

/** Mirrors the table's CHECK constraints so an obvious mistake never needs a round trip. Null = fine. */
export function validateEventSettings(input: EventSettingsInput): string | null {
  const cutoff = Date.parse(input.rsvpCutoffAt)
  const start = Date.parse(input.eventStartAt)
  const end = Date.parse(input.eventEndAt)
  if ([cutoff, start, end].some(Number.isNaN)) return 'Enter a valid date and time for each field.'
  if (start >= end) return 'The event must end after it starts.'
  if (input.rsvpOpenAt !== null) {
    const open = Date.parse(input.rsvpOpenAt)
    if (Number.isNaN(open)) return 'Enter a valid date and time for each field.'
    if (open >= cutoff) return 'RSVPs must open before they close.'
  }
  if (cutoff > start) return 'RSVPs must close at or before the event starts.'
  if (!Number.isInteger(input.capacity) || input.capacity < 1 || input.capacity > 200) {
    return 'Capacity must be a whole number from 1 to 200.'
  }
  if (!isValidTimeZone(input.timezone)) return 'Unknown time zone.'
  return null
}

function toError(e: unknown): EventSettingsError {
  const code = typeof e === 'object' && e !== null && 'code' in e ? String((e as { code: unknown }).code) : ''
  if (code === '42501') return { code: 'FORBIDDEN', message: 'Only admins can change the event settings.' }
  if (code === '23514' || code === '22023') {
    return { code: 'INVALID', message: errorMessage(e, 'Those settings are not allowed.') }
  }
  if (e instanceof TypeError) return { code: 'NETWORK', message: "Can't reach the server. Check your connection." }
  return { code: 'UNKNOWN', message: errorMessage(e, 'Something went wrong saving the settings.') }
}

// 42P01 / PGRST205: the table is not there yet (migration not applied). Treated as "no settings".
const isMissingTable = (e: { code?: string }) => e.code === '42P01' || e.code === 'PGRST205'

/**
 * Reads the settings row. Resolves to ok(null) when there is no row, no database, or the migration
 * has not been applied, so callers fall back to the built-in weekly schedule.
 */
export async function fetchEventSettings(): Promise<EventSettingsResult<EventSettings | null>> {
  if (!isSupabaseConfigured) return ok(null)
  try {
    const { data, error } = await supabase.from('event_settings').select('*').eq('id', 1).maybeSingle()
    if (error) return isMissingTable(error) ? ok(null) : fail(toError(error).code, toError(error).message)
    return ok(data ? toSettings(data as EventSettingsRow) : null)
  } catch (e) {
    const err = toError(e)
    return fail(err.code, err.message)
  }
}

const NOT_UPDATED_MESSAGE =
  'No settings were saved. The settings row may be missing, or your account may not be allowed to change it.'

/**
 * Saves the settings (admins only, enforced by RLS). Updates the single row (id = 1); it never
 * writes `id`, which the database does not let clients update. Does not create a missing row.
 */
export async function updateEventSettings(input: EventSettingsInput): Promise<EventSettingsResult<EventSettings>> {
  const problem = validateEventSettings(input)
  if (problem) return fail('INVALID', problem)
  if (!isSupabaseConfigured) return fail('UNKNOWN', 'Connect Supabase to change the event settings.')
  try {
    const { data, error } = await supabase
      .from('event_settings')
      .update({
        rsvp_open_at: input.rsvpOpenAt,
        rsvp_cutoff_at: input.rsvpCutoffAt,
        event_start_at: input.eventStartAt,
        event_end_at: input.eventEndAt,
        timezone: input.timezone,
        capacity: input.capacity,
      })
      .eq('id', 1)
      .select('*')
      .maybeSingle()
    if (error) {
      const err = toError(error)
      return fail(err.code, err.message)
    }
    // RLS hides rows from a non-admin's UPDATE instead of erroring, so 0 rows is not an "Only admins" case.
    if (!data) return fail('NOT_FOUND', NOT_UPDATED_MESSAGE)
    return ok(toSettings(data as EventSettingsRow))
  } catch (e) {
    const err = toError(e)
    return fail(err.code, err.message)
  }
}
