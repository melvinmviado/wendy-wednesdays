// Pure scheduling rules for the weekly RSVP. Every wall-clock rule is evaluated in the club's
// time zone with Intl, so it is correct for viewers anywhere and across daylight saving changes.

import { localDateInZone } from '../lib/datetime'
import type { EventSettings } from '../lib/eventSettings'

export const SESSION_TIME_ZONE = 'America/Toronto'
export const CAPACITY = 24
export const SESSION_WEEKDAY = 3 // Wednesday, with Sunday = 0
export const CUTOFF_TIME = { hour: 18, minute: 0 } as const // RSVPs lock
export const LIVE_START_TIME = { hour: 20, minute: 0 } as const
export const LIVE_END_TIME = { hour: 22, minute: 0 } as const // after this the next session takes over

export type RsvpPhase = 'upcoming' | 'open' | 'full' | 'locked' | 'live'

export interface ScheduleTimestamps {
  /** When RSVPs open; null = already open (the built-in weekly rule has no open time). */
  openAt: Date | null
  cutoffAt: Date
  liveStart: Date
  liveEnd: Date
}

interface WallClock {
  year: number
  month: number // 1-12
  day: number
  hour: number
  minute: number
  weekday: number // Sunday = 0
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const partsFormat = new Intl.DateTimeFormat('en-US', {
  timeZone: SESSION_TIME_ZONE,
  hourCycle: 'h23',
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: 'numeric',
  minute: 'numeric',
  weekday: 'short',
})

/** The wall-clock reading in the club's time zone at an instant. */
function wallClock(instant: Date): WallClock {
  const p: Record<string, string> = {}
  for (const part of partsFormat.formatToParts(instant)) p[part.type] = part.value
  return {
    year: Number(p.year),
    month: Number(p.month),
    day: Number(p.day),
    hour: Number(p.hour),
    minute: Number(p.minute),
    weekday: WEEKDAYS.indexOf(p.weekday),
  }
}

/** Milliseconds the club's zone is ahead of UTC at an instant (negative in Toronto). */
function zoneOffsetMs(instant: Date): number {
  const w = wallClock(instant)
  const asUtc = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute)
  return asUtc - Math.floor(instant.getTime() / 60000) * 60000
}

/** The UTC instant at which the club's wall clock reads this date and time. */
function zonedToUtc(year: number, month: number, day: number, hour: number, minute: number): Date {
  const naive = Date.UTC(year, month - 1, day, hour, minute)
  let result = naive - zoneOffsetMs(new Date(naive))
  // The guess may sit on the other side of a daylight saving change: settle once more.
  result = naive - zoneOffsetMs(new Date(result))
  return new Date(result)
}

const pad = (n: number) => String(n).padStart(2, '0')
const toIso = (year: number, month: number, day: number) => `${year}-${pad(month)}-${pad(day)}`

function parseIso(iso: string): { year: number; month: number; day: number } {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!m) throw new RangeError(`Expected a YYYY-MM-DD date, got "${iso}"`)
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) }
}

/** Adds calendar days with no time-of-day involved, so daylight saving cannot shift the result. */
function addDays(year: number, month: number, day: number, days: number): string {
  const d = new Date(Date.UTC(year, month - 1, day + days))
  return toIso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate())
}

const WEEK_MS = 7 * 86_400_000

/**
 * The admin's settings, but only while they describe the current event: from 7 days before it starts
 * (the window writes are open for) until it ends. Mirrors rsvp_session_date() in the database. Null
 * means "use the built-in weekly rule", including for a missing row or unparseable dates.
 */
function currentSettings(now: Date, settings?: EventSettings | null): EventSettings | null {
  if (!settings) return null
  const start = Date.parse(settings.eventStartAt)
  const end = Date.parse(settings.eventEndAt)
  const t = now.getTime()
  return t >= start - WEEK_MS && t < end ? settings : null
}

/**
 * The session this moment belongs to, as YYYY-MM-DD in the club's zone: today if it is Wednesday
 * and before the end of the live window, otherwise the next Wednesday.
 */
export function getSessionDate(now: Date, settings?: EventSettings | null): string {
  const current = currentSettings(now, settings)
  if (current) return localDateInZone(current.eventStartAt, current.timezone)
  const w = wallClock(now)
  const beforeLiveEnd = w.hour < LIVE_END_TIME.hour || (w.hour === LIVE_END_TIME.hour && w.minute < LIVE_END_TIME.minute)
  if (w.weekday === SESSION_WEEKDAY && beforeLiveEnd) return toIso(w.year, w.month, w.day)
  const ahead = (SESSION_WEEKDAY - w.weekday + 7) % 7 || 7
  return addDays(w.year, w.month, w.day, ahead)
}

/**
 * Mirrors the database's rule for writes (admin_add_rsvp / set_rsvp): a Wednesday that is not
 * before today and not more than 7 days ahead, by the club's calendar. Used by the demo API so
 * a write aimed at a run that has already passed is refused the same way the server refuses it.
 */
export function isOpenSessionDate(sessionDate: string, now: Date): boolean {
  const { year, month, day } = parseIso(sessionDate)
  if (new Date(Date.UTC(year, month - 1, day)).getUTCDay() !== SESSION_WEEKDAY) return false
  const t = wallClock(now)
  const today = toIso(t.year, t.month, t.day)
  return sessionDate >= today && sessionDate <= addDays(t.year, t.month, t.day, 7)
}

/** Cutoff, live start and live end for a session date, as UTC instants. */
export function getScheduleTimestamps(sessionDate: string, settings?: EventSettings | null): ScheduleTimestamps {
  // The settings describe one event; they apply only to the session on that event's local date.
  if (settings && localDateInZone(settings.eventStartAt, settings.timezone) === sessionDate) {
    return {
      openAt: settings.rsvpOpenAt ? new Date(settings.rsvpOpenAt) : null,
      cutoffAt: new Date(settings.rsvpCutoffAt),
      liveStart: new Date(settings.eventStartAt),
      liveEnd: new Date(settings.eventEndAt),
    }
  }
  const { year, month, day } = parseIso(sessionDate)
  const at = (t: { hour: number; minute: number }) => zonedToUtc(year, month, day, t.hour, t.minute)
  return { openAt: null, cutoffAt: at(CUTOFF_TIME), liveStart: at(LIVE_START_TIME), liveEnd: at(LIVE_END_TIME) }
}

/** The zone a session's times are shown in: the admin's setting for that event, else the club's zone. */
export function getSessionTimeZone(sessionDate: string, settings?: EventSettings | null): string {
  return settings && localDateInZone(settings.eventStartAt, settings.timezone) === sessionDate
    ? settings.timezone
    : SESSION_TIME_ZONE
}

/**
 * Where the session stands. `counts.in` is how many players are confirmed in. The boundaries are
 * inclusive of the later phase: exactly 6:00 PM is locked, exactly 8:00 PM is live.
 */
export function getPhase(args: {
  now: Date
  counts: { in: number }
  capacity?: number
  settings?: EventSettings | null
}): RsvpPhase {
  const { now, counts, capacity = CAPACITY, settings } = args
  const { openAt, cutoffAt, liveStart } = getScheduleTimestamps(getSessionDate(now, settings), settings)
  if (now >= liveStart) return 'live'
  if (now >= cutoffAt) return 'locked'
  if (openAt && now < openAt) return 'upcoming'
  return counts.in >= capacity ? 'full' : 'open'
}

/**
 * Whether RSVPs are accepted for the current session: from its open time (if any) up to, not including, its cutoff. Uses the
 * admin's settings while they describe the current event, and the built-in weekly rule when they are
 * null (no row) or out of date. A full list is still "open" here (it joins the waitlist); use
 * getPhase for that distinction. Admins can edit the list after the cutoff regardless.
 */
export function isRsvpOpen(now: Date, settings?: EventSettings | null): boolean {
  const { openAt, cutoffAt } = getScheduleTimestamps(getSessionDate(now, settings), settings)
  return now < cutoffAt && (!openAt || now >= openAt)
}

/** Waitlist spot for the nth person to RSVP (1-based): 1 for the first person past capacity, null if they got a place. */
export function getWaitlistPosition(signupRank: number, capacity: number = CAPACITY): number | null {
  return signupRank > capacity ? signupRank - capacity : null
}

const dateLabel = new Intl.DateTimeFormat('en-US', {
  timeZone: 'UTC',
  weekday: 'short',
  month: 'short',
  day: 'numeric',
})

/** "2026-11-25" -> "Wed, Nov 25". */
export function formatSessionDate(sessionDate: string): string {
  const { year, month, day } = parseIso(sessionDate)
  return dateLabel.format(new Date(Date.UTC(year, month - 1, day, 12)))
}
