import React from 'react'
import { Minus, Plus, Trophy, Medal } from 'lucide-react'
import { SlotCell } from './SlotCell'
import { CourtData } from '../../types/leaderboard'

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
            onClick={() => onAdjust(-1)}
            className={step}
            title={`Minus 5 points for both ${ordinal} place players`}
            aria-label={`Minus 5 points for both ${ordinal} place players`}
          >
            <Minus className="h-4 w-4" />
          </button>
          <span className="w-16 text-center text-base font-black text-ink tabular-nums">{points} pts</span>
          <button
            type="button"
            onClick={() => onAdjust(1)}
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
