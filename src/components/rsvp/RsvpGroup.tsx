import React from 'react'
import type { RsvpRosterEntry } from '@/types/rsvp'
import { Avatar } from '@/components/Avatar'

/** One numbered row of the RSVP list. */
const Person: React.FC<{ entry: RsvpRosterEntry; place: number; mine: boolean; action?: React.ReactNode }> = ({ entry, place, mine, action }) => (
  <li className={`flex min-h-11 flex-wrap items-center gap-3 rounded-lg px-2 ${mine ? 'bg-brand-soft' : ''}`}>
    <span className="w-6 shrink-0 text-right text-sm tabular-nums text-muted">{place}</span>
    <Avatar name={entry.name} avatarUrl={entry.avatarUrl} size={32} />
    <span className="min-w-0 flex-1 truncate text-base font-semibold text-ink">{entry.name}</span>
    {entry.isGuest && <span className="shrink-0 rounded-full border border-line px-2 py-0.5 text-xs text-ink-soft">Guest</span>}
    {mine && <span className="shrink-0 text-xs font-bold text-ink">You</span>}
    {action}
  </li>
)

/** A titled, numbered section of the RSVP list (Going, Waitlist). Renders nothing when empty. */
export const Group: React.FC<{
  title: string
  people: RsvpRosterEntry[]
  isMine: (e: RsvpRosterEntry) => boolean
  offset?: number
  action?: (e: RsvpRosterEntry) => React.ReactNode
}> = ({ title, people, isMine, offset = 0, action }) =>
  people.length === 0 ? null : (
    <section aria-label={title} className="flex flex-col gap-1">
      <h3 className="px-2 text-xs font-bold uppercase tracking-wide text-muted">{title} ({people.length})</h3>
      <ol>{people.map((e, i) => <Person key={e.rsvpId} entry={e} place={offset + i + 1} mine={isMine(e)} action={action?.(e)} />)}</ol>
    </section>
  )
