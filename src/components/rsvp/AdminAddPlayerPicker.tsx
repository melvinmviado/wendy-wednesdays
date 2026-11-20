import React, { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Search, UserPlus, X } from 'lucide-react'
import type { PlayerScore } from '../../types/leaderboard'
import type { AdminRsvpTarget } from '../../types/rsvp'
import { Avatar } from '../Avatar'

interface AdminAddPlayerPickerProps {
  /** Active players who are not on the list right now. */
  candidates: PlayerScore[]
  /** Any admin change is in flight. */
  busy: boolean
  /** Resolves true when the add went through. */
  onAdd: (player: AdminRsvpTarget) => Promise<boolean>
  onClose: () => void
}

// text-base keeps iOS from zooming the page when a field is focused.
/** Rendering hundreds of rows (each with an avatar) on every keystroke is what makes a long roster feel slow on a phone. */
export const MAX_RESULTS = 50

const field = 'w-full min-h-11 rounded-lg border border-line bg-ground px-3 pl-9 text-base text-ink placeholder:text-muted'
const row =
  'flex min-h-11 w-full cursor-pointer items-center gap-3 rounded-lg px-2 text-left text-base text-ink hover:bg-raised focus-visible:bg-raised disabled:cursor-not-allowed disabled:opacity-50'

/**
 * Searchable list of players not yet on the list. Tap one to add them; the picker stays open so
 * several can be added in a row. Arrow keys move between the search box and the results, Enter
 * in the box adds the only match, Escape closes the picker (not the sheet).
 */
export const AdminAddPlayerPicker: React.FC<AdminAddPlayerPickerProps> = ({ candidates, busy, onAdd, onClose }) => {
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const searchId = useId()

  useEffect(() => inputRef.current?.focus(), [])

  // Sorted and lower-cased once per roster change, not once per keystroke.
  const sorted = useMemo(
    () => candidates.map((p) => ({ p, key: p.name.toLowerCase() })).sort((a, b) => a.key.localeCompare(b.key)),
    [candidates],
  )
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    return sorted.filter((x) => !q || x.key.includes(q)).map((x) => x.p)
  }, [sorted, query])
  const shown = matches.slice(0, MAX_RESULTS)

  const add = async (p: PlayerScore) => {
    const ok = await onAdd({ id: p.id, name: p.name })
    if (ok) setQuery('')
    inputRef.current?.focus() // the tapped row is gone; keep the keyboard flow going
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      onClose()
      return
    }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    const items = [...(listRef.current?.querySelectorAll<HTMLElement>('button:not([disabled])') ?? [])]
    if (items.length === 0) return
    e.preventDefault()
    const i = items.indexOf(document.activeElement as HTMLElement)
    if (e.key === 'ArrowDown') items[Math.min(i + 1, items.length - 1)].focus()
    else if (i <= 0) inputRef.current?.focus()
    else items[i - 1].focus()
  }

  return (
    <section aria-label="Add a player" onKeyDown={onKeyDown} className="flex flex-col gap-2 rounded-xl border border-line bg-ground p-3">
      <div className="flex items-center gap-2">
        <h3 className="flex-1 text-sm font-bold text-ink">Add a player</h3>
        <button type="button" onClick={onClose} aria-label="Close add player" className="inline-flex h-11 w-11 cursor-pointer items-center justify-center rounded-lg text-ink-soft hover:bg-raised hover:text-ink">
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>
      <div className="relative">
        <label htmlFor={searchId} className="sr-only">Search players</label>
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden="true" />
        <input
          ref={inputRef}
          id={searchId}
          type="search"
          value={query}
          autoComplete="off"
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && matches.length === 1 && !busy) {
              e.preventDefault()
              void add(matches[0])
            }
          }}
          placeholder="Search players..."
          className={field}
        />
      </div>
      <ul ref={listRef} aria-label="Players not on the list" className="max-h-56 overflow-y-auto overscroll-contain">
        {candidates.length === 0 ? (
          <li className="px-2 py-3 text-sm text-muted">Everyone is already on the list.</li>
        ) : matches.length === 0 ? (
          <li className="px-2 py-3 text-sm text-muted">No players match "{query.trim()}".</li>
        ) : (
          shown.map((p) => (
            <li key={p.id}>
              <button type="button" disabled={busy} onClick={() => void add(p)} aria-label={`Add ${p.name}`} className={row}>
                <Avatar name={p.name} avatarUrl={p.avatarUrl} size={32} />
                <span className="min-w-0 flex-1 truncate font-semibold">{p.name}</span>
                <UserPlus className="h-5 w-5 shrink-0 text-ink-soft" aria-hidden="true" />
              </button>
            </li>
          ))
        )}
      </ul>
      {matches.length > shown.length && (
        <p className="px-2 text-xs text-muted">Showing {shown.length} of {matches.length}. Keep typing to narrow it down.</p>
      )}
    </section>
  )
}
