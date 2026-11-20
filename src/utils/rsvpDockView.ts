import type { RsvpStatus } from '../types/rsvp'
import { formatSessionDate, type RsvpPhase } from './rsvpSchedule'

export interface DockInput {
  phase: RsvpPhase | null
  loading: boolean
  failed: boolean
  sessionDate: string | null
  inCount: number
  capacity: number | null
  waitlistCount: number
  myStatus: RsvpStatus | null
  /** Waitlist place (1 = first in line), or null when confirmed or not in. */
  myWaitlistPosition: number | null
  /** "3h 15m" until RSVPs close, when that is soon enough to be worth showing. Null otherwise. */
  closesIn?: string | null
  /** "Wed, Nov 25, 9:00 AM EST": when RSVPs open, while they have not yet. Null otherwise. */
  opensAt?: string | null
}

/** What the dock shows. `line` is the left-hand text; the kind decides the action on the right. */
export type DockView =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'live'; line: string }
  | { kind: 'upcoming'; line: string }
  | { kind: 'locked'; line: string; mine: 'going' | 'waitlist' | null; waitlistPosition: number | null }
  | { kind: 'open'; line: string }
  | { kind: 'full'; line: string; joinNumber: number }
  | { kind: 'going'; line: string }
  | { kind: 'waitlisted'; line: string; waitlistPosition: number }

export function getDockView(i: DockInput): DockView {
  if (i.phase === null || i.sessionDate === null || i.capacity === null) {
    return i.failed && !i.loading ? { kind: 'error' } : { kind: 'loading' }
  }
  const date = formatSessionDate(i.sessionDate)
  const cap = i.capacity
  const soon = i.closesIn ? ` • Closes in ${i.closesIn}` : ''

  if (i.phase === 'live') return { kind: 'live', line: "Live Run in Progress • View Tonight's Roster" }

  if (i.phase === 'upcoming') {
    return { kind: 'upcoming', line: `${date} • RSVPs open${i.opensAt ? ` ${i.opensAt}` : ' soon'}` }
  }

  const waitlistPosition = i.myStatus === 'in' ? i.myWaitlistPosition : null
  const mine = i.myStatus !== 'in' ? null : waitlistPosition === null ? 'going' : 'waitlist'

  if (i.phase === 'locked') {
    return { kind: 'locked', line: `RSVP closed • ${i.inCount} playing`, mine, waitlistPosition }
  }
  if (mine === 'going') return { kind: 'going', line: `Next Run: ${date} • ${i.inCount}/${cap} In${soon}` }
  if (mine === 'waitlist' && waitlistPosition !== null) {
    return { kind: 'waitlisted', line: `${date} • Full (${cap}/${cap})${soon}`, waitlistPosition }
  }
  return i.phase === 'full'
    ? { kind: 'full', line: `${date} • Full (${cap}/${cap})${soon}`, joinNumber: i.waitlistCount + 1 }
    : { kind: 'open', line: `${date} • ${i.inCount}/${cap} spots${soon}` }
}

/** Plain-language status for screen readers, announced when it changes. */
export function describeForScreenReader(view: DockView, inCount: number, capacity: number | null): string {
  switch (view.kind) {
    case 'loading':
    case 'error':
      return ''
    case 'live':
      return 'Live run in progress.'
    case 'upcoming':
      return `${view.line}.`
    case 'locked':
      return `RSVPs are closed. ${inCount} playing.${view.mine === 'going' ? " You're going." : ''}${
        view.mine === 'waitlist' ? ` You're number ${view.waitlistPosition} on the waitlist.` : ''
      }`
    case 'going':
      return `You're going. ${inCount} of ${capacity} spots taken.`
    case 'waitlisted':
      return `You're number ${view.waitlistPosition} on the waitlist.`
    case 'full':
      return `The run is full, ${capacity} of ${capacity}.`
    case 'open':
      return `${inCount} of ${capacity} spots taken.`
  }
}
