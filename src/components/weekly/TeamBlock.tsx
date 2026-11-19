import React from 'react'
import { Minus, Plus, X, Trophy, Medal } from 'lucide-react'
import { CourtData } from '../../types/leaderboard'

type Slot = CourtData['slots'][number]

interface SlotCellProps {
  slot: Slot
  place: 1 | 2
  isTargeted: boolean
  isNext: boolean
  onSelect: () => void
  onRemove: () => void
}

// One player position on a court: filled, targeted, next in order, or open.
const SlotCell: React.FC<SlotCellProps> = ({ slot, place, isTargeted, isNext, onSelect, onRemove }) => {
  const isFilled = Boolean(slot.playerId)
  const ordinal = place === 1 ? '1st' : '2nd'
  const medal = place === 1 ? 'bg-gold text-ground' : 'bg-silver text-ground'
  const state = isFilled
    ? 'border-line bg-raised'
    : isTargeted
    ? 'border-brand-hover bg-brand-soft ring-2 ring-brand-hover cursor-pointer'
    : isNext
    ? 'border-dashed border-brand-hover bg-ground cursor-pointer hover:bg-surface'
    : 'border-dashed border-line bg-ground cursor-pointer hover:bg-surface'

  return (
    <div
      onClick={() => {
        if (!isFilled) onSelect()
      }}
      className={`flex min-h-14 items-center justify-between gap-2 rounded-lg border p-2.5 transition-colors ${state}`}
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
                Partner {slot.playerIndex}, {slot.points} pts
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
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-line bg-surface text-ink-soft transition-colors hover:bg-brand-soft hover:text-ink cursor-pointer"
          title="Unassign player back to bench"
          aria-label={`Unassign ${slot.playerName} back to bench`}
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  )
}

interface TeamBlockProps {
  court: CourtData
  place: 1 | 2
  selectedSlotId: string | null
  nextSlotId: string | null
  onAdjust: (delta: number) => void
  onSelectSlot: (slotId: string) => void
  onRemoveSlot: (slotId: string) => void
}

// A team's heading, its shared points stepper and its two player slots.
export const TeamBlock: React.FC<TeamBlockProps> = ({
  court,
  place,
  selectedSlotId,
  nextSlotId,
  onAdjust,
  onSelectSlot,
  onRemoveSlot,
}) => {
  const first = place === 1
  const points = first ? court.firstPlacePoints : court.secondPlacePoints
  const slots = court.slots.filter((s) => s.teamPlace === place)
  const ordinal = first ? '1st' : '2nd'
  const step = 'flex h-8 w-8 items-center justify-center rounded-md bg-raised text-ink-soft hover:bg-line hover:text-ink transition-colors cursor-pointer'

  return (
    <div className="flex flex-col gap-3 px-4 py-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {first ? (
            <Trophy className="h-5 w-5 shrink-0 text-gold" />
          ) : (
            <Medal className="h-5 w-5 shrink-0 text-silver" />
          )}
          <h5 className={`text-base font-bold ${first ? 'text-gold' : 'text-silver'}`}>
            {first ? '1st Place Team (Winners)' : '2nd Place Team (Runners-Up)'}
          </h5>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted">Both share:</span>
          <div className="flex items-center gap-1 rounded-lg border border-line bg-ground p-1">
            <button
              type="button"
              onClick={() => onAdjust(-5)}
              className={step}
              title={`Minus 5 points for both ${ordinal} place players`}
              aria-label={`Minus 5 points for both ${ordinal} place players`}
            >
              <Minus className="h-4 w-4" />
            </button>
            <span className="w-16 text-center text-base font-black text-ink tabular-nums">{points} pts</span>
            <button
              type="button"
              onClick={() => onAdjust(5)}
              className={step}
              title={`Add 5 points for both ${ordinal} place players`}
              aria-label={`Add 5 points for both ${ordinal} place players`}
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {slots.map((slot) => (
          <SlotCell
            key={slot.slotId}
            slot={slot}
            place={place}
            isTargeted={selectedSlotId === slot.slotId}
            isNext={nextSlotId === slot.slotId}
            onSelect={() => onSelectSlot(slot.slotId)}
            onRemove={() => onRemoveSlot(slot.slotId)}
          />
        ))}
      </div>
    </div>
  )
}
