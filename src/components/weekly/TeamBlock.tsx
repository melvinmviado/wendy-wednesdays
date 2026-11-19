import React from 'react'
import { Minus, Plus, X, Trophy, Medal } from 'lucide-react'
import { CourtData } from '../../types/leaderboard'

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
const SlotCell: React.FC<SlotCellProps> = ({ slot, place, isTargeted, isPicked, isNext, onTap, onRemove }) => {
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

interface TeamBlockProps {
  court: CourtData
  place: 1 | 2
  targetSlotId: string | null
  pickedSlotId: string | null
  nextSlotId: string | null
  onAdjust: (delta: number) => void
  onSlotTap: (slotId: string) => void
  onRemoveSlot: (slotId: string) => void
}

// A team's heading, its shared points stepper and its two player slots.
export const TeamBlock: React.FC<TeamBlockProps> = ({
  court,
  place,
  targetSlotId,
  pickedSlotId,
  nextSlotId,
  onAdjust,
  onSlotTap,
  onRemoveSlot,
}) => {
  const first = place === 1
  const points = first ? court.firstPlacePoints : court.secondPlacePoints
  const slots = court.slots.filter((s) => s.teamPlace === place)
  const ordinal = first ? '1st' : '2nd'
  const step = 'flex h-11 w-11 items-center justify-center rounded-md bg-raised text-ink-soft hover:bg-line hover:text-ink transition-colors cursor-pointer'

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
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {slots.map((slot) => (
          <SlotCell
            key={slot.slotId}
            slot={slot}
            place={place}
            isTargeted={targetSlotId === slot.slotId}
            isPicked={pickedSlotId === slot.slotId}
            isNext={nextSlotId === slot.slotId}
            onTap={() => onSlotTap(slot.slotId)}
            onRemove={() => onRemoveSlot(slot.slotId)}
          />
        ))}
      </div>
    </div>
  )
}
