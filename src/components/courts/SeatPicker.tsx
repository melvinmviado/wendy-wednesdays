import React, { useEffect, useMemo, useState } from 'react'
import { Loader2, Search } from 'lucide-react'
import type { Candidate } from '@/lib/courtBoard'
import type { CourtResult } from '@/lib/courtSettings'
import type { BoardEntry, PlayerRef } from '@/utils/courtBoardModel'
import { ModalShell } from '../admin/ModalShell'
import { Avatar } from '../Avatar'

interface SeatPickerProps {
  title: string
  /** Players sitting out: offered first. */
  tray: BoardEntry[]
  /** Everyone on the board, who is not offered again. */
  onBoard: ReadonlySet<string>
  loadCandidates: () => Promise<CourtResult<Candidate[]>>
  onPick: (player: PlayerRef) => void
  onClose: () => void
}

/** Rendering hundreds of rows on every keystroke makes a long roster slow on a phone. */
const MAX_RESULTS = 50
const row =
  'flex min-h-11 w-full cursor-pointer items-center gap-3 rounded-lg px-2 text-left text-base text-ink hover:bg-raised focus-visible:bg-raised focus-visible:outline-none'

/** Fill an empty seat: someone sitting out, someone on the RSVP list, or any active player. */
export const SeatPicker: React.FC<SeatPickerProps> = ({ title, tray, onBoard, loadCandidates, onPick, onClose }) => {
  const [query, setQuery] = useState('')
  const [candidates, setCandidates] = useState<Candidate[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    void loadCandidates().then((r) => {
      if (!live) return
      if (r.ok) setCandidates(r.data)
      else setError(r.error.message)
    })
    return () => {
      live = false
    }
  }, [loadCandidates])

  const q = query.trim().toLowerCase()
  const match = (p: PlayerRef) => !q || p.name.toLowerCase().includes(q)
  const others = useMemo(
    () => (candidates ?? []).filter((p) => !onBoard.has(p.id)).sort((a, b) => Number(b.rsvpd) - Number(a.rsvpd) || a.name.localeCompare(b.name)),
    [candidates, onBoard],
  )
  const shownTray = tray.filter(match)
  const shown = others.filter(match).slice(0, MAX_RESULTS)

  const item = (p: PlayerRef, note?: string) => (
    <li key={p.id}>
      <button type="button" onClick={() => onPick(p)} className={row}>
        <Avatar name={p.name} avatarUrl={p.avatarUrl} size={28} />
        <span className="min-w-0 flex-1 truncate">{p.name}</span>
        {note && <span className="shrink-0 text-xs text-muted">{note}</span>}
      </button>
    </li>
  )

  return (
    <ModalShell title={title} onClose={onClose}>
      <div className="relative mt-4">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden="true" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search players"
          aria-label="Search players"
          className="min-h-11 w-full rounded-lg border border-line bg-ground px-3 pl-9 text-base text-ink placeholder:text-muted"
        />
      </div>
      <div className="mt-3 flex max-h-[55vh] flex-col gap-3 overflow-y-auto">
        {shownTray.length > 0 && (
          <section aria-label="Sitting out">
            <h3 className="mb-1 text-xs font-bold uppercase tracking-wide text-muted">Sitting out</h3>
            <ul>{shownTray.map((p) => item(p, `#${p.seedRank}`))}</ul>
          </section>
        )}
        <section aria-label="Other players">
          <h3 className="mb-1 text-xs font-bold uppercase tracking-wide text-muted">Not on the board</h3>
          {error ? (
            <p role="alert" className="text-sm text-brand-hover">{error}</p>
          ) : !candidates ? (
            <p role="status" className="flex items-center gap-2 text-sm text-ink-soft">
              <Loader2 className="h-4 w-4 motion-safe:animate-spin" aria-hidden="true" /> Loading players…
            </p>
          ) : shown.length === 0 ? (
            <p className="text-sm text-ink-soft">{q ? 'No player matches that.' : 'Every active player is on the board.'}</p>
          ) : (
            <ul>{shown.map((p) => item(p, p.rsvpd ? "RSVP'd" : undefined))}</ul>
          )}
        </section>
      </div>
    </ModalShell>
  )
}
