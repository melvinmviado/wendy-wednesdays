import { buildCourtOrder } from '@/lib/courtAssignment'

/** The two text fields as typed. */
export interface CourtFormValues {
  top: string
  bottom: string
}

export interface CourtFormCheck {
  errors: Partial<Record<keyof CourtFormValues, string>>
  /** Court numbers top to bottom; null while there are errors. */
  courtOrder: number[] | null
}

/** More courts than the largest capacity (200 players) can fill is a typo, not a plan. */
export const MAX_COURTS = 50

function parseCourt(value: string): number | null {
  const v = value.trim()
  return /^\d+$/.test(v) && Number(v) >= 1 ? Number(v) : null
}

/** Mirrors event_court_settings (positive whole numbers, either direction) plus a sanity cap. */
export function checkCourtForm(values: CourtFormValues): CourtFormCheck {
  const errors: CourtFormCheck['errors'] = {}
  const top = parseCourt(values.top)
  const bottom = parseCourt(values.bottom)
  if (top === null) errors.top = 'Enter a court number of 1 or more.'
  if (bottom === null) errors.bottom = 'Enter a court number of 1 or more.'
  if (top === null || bottom === null) return { errors, courtOrder: null }

  const count = Math.abs(top - bottom) + 1
  if (count > MAX_COURTS) {
    errors.bottom = `That is ${count} courts. Check the numbers: at most ${MAX_COURTS} can be filled.`
    return { errors, courtOrder: null }
  }
  return { errors, courtOrder: buildCourtOrder(top, bottom) }
}

/** "4 courts: 10, 9, 8, 7 (top → bottom)", or "1 court: 5". */
export function describeCourtOrder(order: number[]): string {
  if (order.length === 1) return `1 court: ${order[0]}`
  return `${order.length} courts: ${order.join(', ')} (top → bottom)`
}
