import React from 'react'
import { RefreshCw, RotateCcw, ArrowLeftRight, X } from 'lucide-react'
import type { WeeklyEntry } from '../../hooks/useWeeklyEntry'
import { TeamBlock } from './TeamBlock'
import { btnGhost } from './styles'

// The courts: per-court points entry, swap/move/remove, and the reset control.
export const CourtsPanel: React.FC<{ w: WeeklyEntry }> = ({ w }) => {
  const {
    selectedWeek,
    courts,
    selectedSlotId,
    pickedSlotId,
    nextEmptySlot,
    loadingWeek,
    attendedCount,
    handleSlotTap,
    handleRemoveFromSlot,
    handleAdjustTeamPoints,
    handleResetCourtAssignments,
  } = w

  const pickedName = courts.flatMap((c) => c.slots).find((s) => s.slotId === pickedSlotId)?.playerName

  return (
    <section aria-label="Courts" className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-base font-semibold text-ink-soft">Courts</h3>
        <button
          onClick={handleResetCourtAssignments}
          disabled={attendedCount === 0}
          className={`${btnGhost} min-h-11 disabled:opacity-50`}
          title="Remove every player from the courts"
        >
          <RotateCcw className="h-4 w-4" />
          <span>Reset Courts</span>
        </button>
      </div>

      {pickedSlotId && (
        <div
          role="status"
          className="sticky top-[60px] z-30 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gold bg-surface p-3 shadow-lg shadow-ground"
        >
          <p className="flex items-center gap-2 text-base text-ink">
            <ArrowLeftRight className="h-5 w-5 shrink-0 text-gold" />
            <span>
              <strong>{pickedName}</strong>: tap another player to swap, or an empty slot to move.
            </span>
          </p>
          <div className="flex gap-2">
            <button onClick={() => handleRemoveFromSlot(pickedSlotId)} className={`${btnGhost} min-h-11`}>
              <X className="h-4 w-4" />
              <span>Remove</span>
            </button>
            <button onClick={() => handleSlotTap(pickedSlotId)} className={`${btnGhost} min-h-11`}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {loadingWeek ? (
        <div role="status" className="flex items-center justify-center gap-2 rounded-xl border border-line bg-surface py-12 text-base text-ink-soft">
          <RefreshCw className="h-5 w-5 animate-spin text-brand-hover" />
          <span>Loading Week {selectedWeek}...</span>
        </div>
      ) : courts.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line bg-surface px-4 py-12 text-center text-base text-muted">
          No one is seated yet. Tap a player in the roster to place them on Court 1.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
          {courts.map((court) => {
            const filled = court.slots.filter((s) => s.playerId).length
            const teamProps = {
              court,
              targetSlotId: selectedSlotId,
              pickedSlotId,
              nextSlotId: nextEmptySlot?.slotId ?? null,
              onSlotTap: handleSlotTap,
              onRemoveSlot: handleRemoveFromSlot,
            }
            return (
              <article key={court.courtNumber} className="flex flex-col overflow-hidden rounded-xl border border-line bg-surface">
                <header className="flex items-center justify-between gap-3 border-b border-line bg-ground px-4 py-3.5">
                  <div className="flex items-center gap-3">
                    <span
                      className={`flex h-9 w-11 items-center justify-center rounded-md text-base font-black ${
                        court.courtNumber === 1 ? 'bg-gold text-ground' : 'bg-brand-soft text-ink'
                      }`}
                    >
                      C{court.courtNumber}
                    </span>
                    <h4 className="text-lg font-black text-ink">
                      Court {court.courtNumber}
                      {court.courtNumber === 1 && (
                        <span className="ml-2 rounded bg-gold/20 px-1.5 py-0.5 text-sm font-semibold text-gold">Top Court</span>
                      )}
                    </h4>
                  </div>
                  <span className={`rounded-md px-2.5 py-1 text-sm font-semibold tabular-nums ${filled === 4 ? 'bg-raised text-ok' : 'bg-brand-soft text-ink'}`}>
                    {filled}/4 Players
                  </span>
                </header>
                <div className="divide-y divide-line">
                  <TeamBlock {...teamProps} place={1} onAdjust={(d) => handleAdjustTeamPoints(court.courtNumber, 1, d)} />
                  <TeamBlock {...teamProps} place={2} onAdjust={(d) => handleAdjustTeamPoints(court.courtNumber, 2, d)} />
                </div>
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}
