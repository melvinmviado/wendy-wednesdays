import React from 'react'
import { UserMinus, UserX, X } from 'lucide-react'
import type { BoardEntry } from '@/utils/courtBoardModel'

const quiet =
  'inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-lg border border-line bg-surface px-4 text-sm font-semibold text-ink hover:bg-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-hover'

interface SelectionBarProps {
  selected: BoardEntry
  onRemove: () => void
  onTakeOff: () => void
  onCancel: () => void
}

/** Stays in view at the bottom while a player is selected: what a tap does next, "Remove from court" and "Take off the board". */
export const SelectionBar: React.FC<SelectionBarProps> = ({ selected, onRemove, onTakeOff, onCancel }) => (
  <div
    role="region"
    aria-label="Selected player"
    className="sticky bottom-[calc(env(safe-area-inset-bottom)+0.5rem)] z-30 flex flex-col gap-2 rounded-xl border border-brand bg-surface p-3 shadow-lg sm:flex-row sm:items-center"
  >
    <p role="status" className="flex-1 text-sm text-ink">
      <span className="font-bold">{selected.name}</span> selected.{' '}
      {selected.seat
        ? 'Tap another player to swap, or an empty seat to move.'
        : 'Tap a player on a court to swap, or an empty seat to put them on.'}
    </p>
    <div className="flex flex-wrap gap-2">
      {selected.seat && (
        <button type="button" onClick={onRemove} className={`${quiet} flex-1`}>
          <UserMinus className="h-4 w-4" aria-hidden="true" /> Remove from court
        </button>
      )}
      <button type="button" onClick={onTakeOff} className={`${quiet} flex-1`}>
        <UserX className="h-4 w-4" aria-hidden="true" /> Take off the board
      </button>
      <button type="button" onClick={onCancel} className={quiet}>
        <X className="h-4 w-4" aria-hidden="true" /> Cancel
      </button>
    </div>
  </div>
)
