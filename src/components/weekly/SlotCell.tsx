import React from 'react'
import { X } from 'lucide-react'
import type { CourtData } from '@/types/leaderboard'

type Slot = CourtData['slots'][number]

interface SlotCellProps {
  slot: Slot
  place: 1 | 2
  isTargeted: boolean
  isPicked: boolean
  isNext: boolean
  onTap: () => void
  onRemove: () => void
}

// One player position on a court: seated, picked for swap/move, targeted, next in order, or open.
export const SlotCell: React.FC<SlotCellProps> = ({ slot, place, isTargeted, isPicked, isNext, onTap, onRemove }) => {
  const isFilled = Boolean(slot.playerId)
  const ordinal = place === 1 ? '1st' : '2nd'
  const medal = place === 1 ? 'bg-gold text-ground' : 'bg-silver text-ground'
  const state = isPicked
    ? 'border-gold bg-raised ring-2 ring-gold'
    : isFilled
    ? 'border-line bg-raised hover:bg-line'
    : isTargeted
    ? 'border-brand-hover bg-brand-soft ring-2 ring-brand-hover'
    : isNext
    ? 'border-dashed border-brand-hover bg-ground hover:bg-surface'
    : 'border-dashed border-line bg-ground hover:bg-surface'

  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={isPicked || isTargeted}
      aria-label={isFilled ? `${slot.playerName}, ${ordinal} place team` : `Empty ${ordinal} place slot`}
      onClick={onTap}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onTap()
        }
      }}
      className={`flex min-h-16 select-none items-center justify-between gap-2 rounded-lg border p-2.5 transition-colors cursor-pointer ${state}`}
    >
      <div className="flex min-w-0 flex-1 items-center gap-2.5">
        <span className={`flex h-7 w-9 shrink-0 items-center justify-center rounded-md text-sm font-black ${medal}`}>
          {ordinal}
        </span>
        <div className="min-w-0 flex-1">
          {isFilled ? (
            <>
              <span className="block truncate text-base font-bold text-ink">{slot.playerName}</span>
              <span className="block text-sm text-muted tabular-nums">
                {isPicked ? 'Tap another slot to swap or move' : `Partner ${slot.playerIndex}, ${slot.points} pts`}
              </span>
            </>
          ) : (
            <span className={`block truncate text-sm font-semibold ${isTargeted || isNext ? 'text-brand-hover' : 'text-muted'}`}>
              {isTargeted ? 'Selected Target' : isNext ? `Next: ${ordinal} Place` : `Partner ${slot.playerIndex}`}
            </span>
          )}
        </div>
      </div>
      {isFilled && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onRemove()
          }}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-line bg-surface text-ink-soft transition-colors hover:bg-brand-soft hover:text-ink cursor-pointer"
          title="Remove from court (did not attend)"
          aria-label={`Remove ${slot.playerName} from court`}
        >
          <X className="h-5 w-5" />
        </button>
      )}
    </div>
  )
}
