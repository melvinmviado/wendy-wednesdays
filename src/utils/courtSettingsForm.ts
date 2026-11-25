import { buildCourtOrder } from '@/lib/courtAssignment'

export interface CourtFormCheck {
  error: string | null
  /** Court numbers top to bottom; null while there is an error. */
  courtOrder: number[] | null
}

/** More courts than the largest capacity (200 players) can fill is a typo, not a plan. Same cap as the database. */
export const MAX_COURTS = 50

/** Keeps a typo like 100000000000000000000 from reaching the database's integer column. */
const MAX_COURT_NUMBER = 9999

const tooMany = (count: number) => `That is ${count} courts. Check the numbers: at most ${MAX_COURTS} can be filled.`

/**
 * The facility's courts as typed, top court first: "10, 9, 8, 7, 3, 2". Commas or spaces separate
 * them, and "10-7" is short for 10, 9, 8, 7. Mirrors event_court_settings.court_numbers: 1 to 50
 * different whole numbers of 1 or more, in any order.
 */
export function checkCourtNumbers(text: string): CourtFormCheck {
  const tokens = text
    .replace(/\s*[-–—]\s*/g, '-')
    .split(/[\s,;]+/)
    .filter(Boolean)
  if (tokens.length === 0) return { error: 'Enter the court numbers, top court first.', courtOrder: null }

  const order: number[] = []
  for (const token of tokens) {
    const range = /^(\d+)-(\d+)$/.exec(token)
    if (!range && !/^\d+$/.test(token)) {
      return { error: `"${token}" isn't a court number. Use whole numbers, like 10, 9, 8, 7, 3, 2.`, courtOrder: null }
    }
    const [from, to] = range ? [Number(range[1]), Number(range[2])] : [Number(token), Number(token)]
    if (from < 1 || to < 1) return { error: 'Court numbers start at 1.', courtOrder: null }
    if (from > MAX_COURT_NUMBER || to > MAX_COURT_NUMBER) {
      return { error: `Court numbers go up to ${MAX_COURT_NUMBER}.`, courtOrder: null }
    }
    if (Math.abs(from - to) + 1 > MAX_COURTS) return { error: tooMany(Math.abs(from - to) + 1), courtOrder: null }
    order.push(...buildCourtOrder(from, to))
  }

  if (order.length > MAX_COURTS) return { error: tooMany(order.length), courtOrder: null }
  const twice = order.find((n, i) => order.indexOf(n) !== i)
  if (twice !== undefined) return { error: `Court ${twice} is listed twice.`, courtOrder: null }
  return { error: null, courtOrder: order }
}

/** How a saved list starts out in the field: "10, 9, 8, 7, 3, 2". */
export const formatCourtNumbers = (order: number[]): string => order.join(', ')

/** "4 courts: 10, 9, 8, 7 (top → bottom)", or "1 court: 5". */
export function describeCourtOrder(order: number[]): string {
  if (order.length === 1) return `1 court: ${order[0]}`
  return `${order.length} courts: ${order.join(', ')} (top → bottom)`
}
