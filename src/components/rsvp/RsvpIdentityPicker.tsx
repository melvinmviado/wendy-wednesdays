import React, { useId, useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import type { PlayerScore } from '../../types/leaderboard'
import type { RsvpIdentity } from '../../types/rsvp'

interface RsvpIdentityPickerProps {
  players: PlayerScore[]
  /** Players already on this week's list. They are shown but cannot be picked again. */
  takenIds: Set<string>
  /** Opens the confirmation step; nothing is sent until the person confirms there. */
  onPick: (identity: RsvpIdentity) => void
}

// text-base keeps iOS from zooming the page when a field is focused.
const field = 'w-full min-h-11 rounded-lg border border-line bg-ground px-3 text-base text-ink placeholder:text-muted'
const row = 'flex min-h-11 w-full cursor-pointer items-center justify-between gap-3 rounded-lg px-3 text-left text-base text-ink hover:bg-raised disabled:cursor-not-allowed disabled:opacity-50'

/** "Who are you?": pick your name from the roster, or join as a guest. Shown until a name is remembered. */
export const RsvpIdentityPicker: React.FC<RsvpIdentityPickerProps> = ({ players, takenIds, onPick }) => {
  const [query, setQuery] = useState('')
  const [guest, setGuest] = useState('')
  const searchId = useId()
  const guestId = useId()

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    return players.filter((p) => !q || p.name.toLowerCase().includes(q))
  }, [players, query])

  return (
    <section aria-label="Who are you?" className="flex flex-col gap-3 border-b border-line p-4">
      <h3 className="text-sm font-bold text-ink">Who are you?</h3>
      <div className="relative">
        <label htmlFor={searchId} className="sr-only">Search your name</label>
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden="true" />
        <input id={searchId} type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search your name..." className={`${field} pl-9`} />
      </div>
      <ul className="max-h-44 overflow-y-auto">
        {matches.length === 0 && <li className="px-3 py-3 text-sm text-muted">No one by that name. Join as a guest below.</li>}
        {matches.map((p) => (
          <li key={p.id}>
            <button type="button" disabled={takenIds.has(p.id)} onClick={() => onPick({ kind: 'player', playerId: p.id, name: p.name })} className={row}>
              <span className="truncate">{p.name}</span>
              {takenIds.has(p.id) && <span className="shrink-0 text-xs text-muted">Already in</span>}
            </button>
          </li>
        ))}
      </ul>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (guest.trim()) onPick({ kind: 'guest', name: guest.trim() })
        }}
        className="flex flex-col gap-2"
      >
        <label htmlFor={guestId} className="text-sm font-medium text-ink-soft">Not on the list? Join as a guest</label>
        <div className="flex gap-2">
          <input id={guestId} value={guest} onChange={(e) => setGuest(e.target.value)} maxLength={40} placeholder="Your name" autoComplete="off" className={field} />
          <button type="submit" disabled={!guest.trim()} className="inline-flex min-h-11 shrink-0 cursor-pointer items-center gap-2 rounded-lg bg-brand px-4 text-sm font-bold text-brand-ink hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-50">
            Join
          </button>
        </div>
      </form>
    </section>
  )
}
