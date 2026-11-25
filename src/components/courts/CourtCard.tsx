import React from 'react'
import { AlertTriangle } from 'lucide-react'
import { PLAYERS_PER_COURT } from '@/lib/courtAssignment'
import type { BoardCourt, BoardEntry, DropTarget, Seat } from '@/utils/courtBoardModel'
import { EmptySeat, PlayerChip } from './BoardSeat'

export interface BoardControls {
  selected: BoardEntry | null
  duplicateIds: ReadonlySet<string>
  draggable: boolean
  onTapPlayer: (id: string) => void
  onTapSeat: (seat: Seat) => void
  onDrop: (draggedId: string, target: DropTarget) => void
}

interface CourtCardProps {
  court: BoardCourt
  /** "TOP" on the first card, "BOTTOM" on the last. */
  edge: 'TOP' | 'BOTTOM' | null
  controls: BoardControls
}

/** One court: its facility number, TOP / BOTTOM, and four seats. */
export const CourtCard: React.FC<CourtCardProps> = ({ court, edge, controls: c }) => {
  const filled = court.slots.filter(Boolean).length
  const short = filled > 0 && filled < PLAYERS_PER_COURT
  const headingId = `court-${court.position}-heading`

  return (
    <li aria-labelledby={headingId} className={`rounded-xl border bg-surface p-3 ${short ? 'border-brand' : 'border-line'}`}>
      <div className="mb-2 flex items-center gap-2">
        <h3 id={headingId} className="text-base font-bold text-ink">Court {court.number}</h3>
        {edge && (
          <span className="rounded-full bg-raised px-2 py-0.5 text-xs font-bold tracking-wide text-ink-soft">{edge}</span>
        )}
        <span className={`ml-auto flex items-center gap-1 text-xs font-semibold ${short ? 'text-brand-hover' : 'text-muted'}`}>
          {short && <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />}
          {filled === 0 ? 'Not in use' : `${filled} of ${PLAYERS_PER_COURT}`}
        </span>
      </div>
      <ul className="grid grid-cols-1 gap-2 min-[380px]:grid-cols-2">
        {court.slots.map((entry, slot) => {
          const seat = { courtPosition: court.position, slot }
          return (
            <li key={slot}>
              {entry ? (
                <PlayerChip
                  entry={entry}
                  selected={c.selected?.id === entry.id}
                  duplicate={c.duplicateIds.has(entry.id)}
                  draggable={c.draggable}
                  onTap={c.onTapPlayer}
                  onDrop={(dragged, target) => c.onDrop(dragged, { kind: 'player', id: target })}
                />
              ) : (
                <EmptySeat
                  label={`Court ${court.number}, seat ${slot + 1}`}
                  movingName={c.selected?.name ?? null}
                  draggable={c.draggable}
                  onTap={() => c.onTapSeat(seat)}
                  onDrop={(dragged) => c.onDrop(dragged, { kind: 'seat', seat })}
                />
              )}
            </li>
          )
        })}
      </ul>
    </li>
  )
}
