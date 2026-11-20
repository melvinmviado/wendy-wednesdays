// Time zone helpers built on Intl only. Every function takes the zone explicitly, so results never
// depend on the viewer's own zone, and daylight saving changes are handled by Intl's zone database.

const formatters = new Map<string, Intl.DateTimeFormat>()

function partsFormat(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone)
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    })
    formatters.set(timeZone, f)
  }
  return f
}

export interface ZonedParts {
  year: number
  month: number // 1-12
  day: number
  hour: number
  minute: number
  second: number
}

/** True when Intl knows this IANA zone name. */
export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone })
    return true
  } catch {
    return false
  }
}

/** The wall-clock reading in a zone at an instant. */
export function zonedParts(instant: Date, timeZone: string): ZonedParts {
  const p: Record<string, string> = {}
  for (const part of partsFormat(timeZone).formatToParts(instant)) p[part.type] = part.value
  return {
    year: Number(p.year),
    month: Number(p.month),
    day: Number(p.day),
    hour: Number(p.hour),
    minute: Number(p.minute),
    second: Number(p.second),
  }
}

/** Milliseconds the zone is ahead of UTC at an instant (negative for Toronto). */
function zoneOffsetMs(instant: Date, timeZone: string): number {
  const w = zonedParts(instant, timeZone)
  const asUtc = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second)
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000
}

const DAY_MS = 86_400_000

/**
 * The UTC instant at which a zone's wall clock reads this date and time.
 * - Normal times map to exactly one instant.
 * - A time that happens twice (clocks going back) resolves to the first occurrence.
 * - A time that never happens (clocks going forward) resolves to the same offset as just before
 *   the change, which lands after the gap (02:30 becomes 03:30).
 */
export function zonedTimeToUtc(
  year: number, month: number, day: number, hour: number, minute: number, timeZone: string,
): Date {
  const naive = Date.UTC(year, month - 1, day, hour, minute)
  const before = zoneOffsetMs(new Date(naive - DAY_MS), timeZone)
  const after = zoneOffsetMs(new Date(naive + DAY_MS), timeZone)
  const matches = (ms: number) => {
    const w = zonedParts(new Date(ms), timeZone)
    return w.year === year && w.month === month && w.day === day && w.hour === hour && w.minute === minute
  }
  const valid = [naive - before, naive - after].filter(matches)
  return new Date(valid.length ? Math.min(...valid) : naive - before)
}

const pad = (n: number, width = 2) => String(n).padStart(width, '0')

/** "YYYY-MM-DD" for the instant's calendar date in the zone, or '' when the input is not a date. */
export function localDateInZone(instant: string | Date, timeZone: string): string {
  const d = typeof instant === 'string' ? new Date(instant) : instant
  if (Number.isNaN(d.getTime())) return ''
  const w = zonedParts(d, timeZone)
  return `${pad(w.year, 4)}-${pad(w.month)}-${pad(w.day)}`
}

/** A UTC ISO string as the value of an <input type="datetime-local"> in the zone, or '' if invalid. */
export function utcIsoToDatetimeLocal(iso: string, timeZone: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const w = zonedParts(d, timeZone)
  return `${pad(w.year, 4)}-${pad(w.month)}-${pad(w.day)}T${pad(w.hour)}:${pad(w.minute)}`
}

const LOCAL_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?$/

/**
 * A datetime-local value read as wall-clock time in the zone, as a UTC ISO string.
 * Null for anything that is not a real calendar date and time (empty, Feb 30, hour 24).
 */
export function datetimeLocalToUtcIso(value: string, timeZone: string): string | null {
  const m = LOCAL_RE.exec(value)
  if (!m) return null
  const [year, month, day, hour, minute] = m.slice(1, 6).map(Number)
  const check = new Date(Date.UTC(year, month - 1, day, hour, minute))
  if (
    check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day ||
    hour > 23 || minute > 59
  ) {
    return null
  }
  return zonedTimeToUtc(year, month, day, hour, minute, timeZone).toISOString()
}

/** "Wed, Nov 25, 6:00 PM EST": for showing an instant in the event's zone, whatever the viewer's. */
export function formatEventDateTime(iso: string, timeZone: string, options: { withZoneName?: boolean } = {}): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    ...(options.withZoneName === false ? {} : { timeZoneName: 'short' as const }),
  }).format(d)
}

/** The zone's short name at an instant, e.g. "EST" or "EDT" (Intl decides, so it follows daylight saving). */
function zoneLabel(date: Date, timeZone: string): string {
  const part = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'short' })
    .formatToParts(date)
    .find((p) => p.type === 'timeZoneName')
  return part?.value ?? timeZone
}

const clock = (date: Date, timeZone: string) =>
  new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', minute: '2-digit' }).format(date)

/**
 * "Wed, Nov 25, 8:00 PM – 10:00 PM EST". When the event crosses midnight in the zone, both ends
 * carry their own date: "Wed, Nov 25, 11:00 PM – Thu, Nov 26, 1:00 AM EST".
 */
export function formatEventRange(startIso: string, endIso: string, timeZone: string): string {
  const start = new Date(startIso)
  const end = new Date(endIso)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return ''
  if (localDateInZone(start, timeZone) !== localDateInZone(end, timeZone)) {
    return `${formatEventDateTime(startIso, timeZone, { withZoneName: false })} – ${formatEventDateTime(endIso, timeZone)}`
  }
  const day = formatEventDateTime(startIso, timeZone, { withZoneName: false }).split(',').slice(0, 2).join(',')
  return `${day}, ${clock(start, timeZone)} – ${clock(end, timeZone)} ${zoneLabel(end, timeZone)}`
}

/** "Eastern Time": the zone's generic name, with no standard/daylight wording, for labelling a form. */
export function zoneGenericName(timeZone: string, at: Date = new Date()): string {
  for (const timeZoneName of ['longGeneric', 'long'] as const) {
    try {
      const part = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName })
        .formatToParts(at)
        .find((p) => p.type === 'timeZoneName')
      if (part) return part.value
    } catch {
      // older engines lack longGeneric: fall through to 'long'
    }
  }
  return timeZone
}
