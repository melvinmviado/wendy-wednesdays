import React from 'react'
import { ArrowLeft, CheckCircle2, Plus, RefreshCw, RotateCcw, Save, Trophy } from 'lucide-react'
import type { WeeklyEntry } from '../../hooks/useWeeklyEntry'
import { TeamBlock } from './TeamBlock'
import { btnGhost, btnPrimary } from './styles'

export const CourtsStage: React.FC<{ w: WeeklyEntry }> = ({ w }) => {
  const {
    selectedWeek,
    setStage,
    courts,
    selectedSlotId,
    setSelectedSlotId,
    saving,
    loadingWeek,
    unassignedBenchPlayers,
    nextEmptySlot,
    handleBenchPlayerTap,
    handleRemoveFromSlot,
    handleAdjustTeamPoints,
    handleResetCourtAssignments,
    handleSaveWeek,
    checkedInCount,
    assignedCount,
  } = w

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-2">
        <button onClick={() => setStage('checkin')} className={btnGhost}>
          <ArrowLeft className="h-4 w-4" />
          <span>Back to Check-in</span>
        </button>
        <button
          onClick={handleResetCourtAssignments}
          className={btnGhost}
          title="Reset all assigned players back to bench dock"
        >
          <RotateCcw className="h-4 w-4" />
          <span>Reset Courts</span>
        </button>
      </div>

      <section className="sticky top-[60px] z-30 flex w-full flex-col gap-3 rounded-xl border border-line bg-surface p-4 shadow-lg shadow-ground">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-lg font-bold text-ink">Unassigned Bench Dock</h3>
          <span className="rounded-md bg-raised px-2.5 py-1 text-sm font-semibold text-ink tabular-nums">
            {unassignedBenchPlayers.length} on bench
          </span>
        </div>
        <p className="text-base text-ink-soft">
          Tap names below in finishing order: Winning team partners (1st place) then Runner-up partners (2nd place).
        </p>

        {unassignedBenchPlayers.length === 0 ? (
          <div role="status" className="flex items-center justify-center gap-2 rounded-lg border border-ok/50 bg-ground px-3 py-3 text-base font-semibold text-ink">
            <CheckCircle2 className="h-5 w-5 shrink-0 text-ok" />
            <span>All checked-in players are assigned to courts! Ready to save.</span>
          </div>
        ) : (
          <div className="flex max-h-40 flex-wrap gap-2 overflow-y-auto">
            {unassignedBenchPlayers.map((player) => (
              <button
                key={player.id}
                onClick={() => handleBenchPlayerTap(player)}
                className="inline-flex select-none items-center gap-2 rounded-lg border border-line bg-raised px-3 py-2 text-base font-bold text-ink transition-colors hover:border-brand hover:bg-brand cursor-pointer"
                title={`Tap to place ${player.name} onto next court slot`}
              >
                <span aria-hidden="true" className="flex h-6 w-6 items-center justify-center rounded-full bg-ground text-sm text-ink-soft">
                  {player.name.charAt(0)}
                </span>
                <span>{player.name}</span>
                <Plus className="h-4 w-4" />
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-4">
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="text-base font-semibold text-ink-soft">
            Rendered Courts ({courts.length} Courts, 2 Teams / 4 Players)
          </h3>
          <span className="text-base text-muted tabular-nums">
            {assignedCount} / {checkedInCount} assigned
          </span>
        </div>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          {courts.map((court) => {
            const filledCount = court.slots.filter((s) => s.playerId).length
            const isTopCourt = court.courtNumber === 1
            const teamProps = {
              court,
              selectedSlotId,
              nextSlotId: nextEmptySlot?.slotId ?? null,
              onSelectSlot: setSelectedSlotId,
              onRemoveSlot: handleRemoveFromSlot,
            }

            return (
              <article key={court.courtNumber} className="flex flex-col overflow-hidden rounded-xl border border-line bg-surface">
                <header className="flex items-center justify-between gap-3 border-b border-line bg-ground px-4 py-3.5">
                  <div className="flex items-center gap-3">
                    <span
                      className={`flex h-9 w-11 items-center justify-center rounded-md text-base font-black ${
                        isTopCourt ? 'bg-gold text-ground' : 'bg-brand-soft text-ink'
                      }`}
                    >
                      C{court.courtNumber}
                    </span>
                    <div>
                      <h4 className="flex items-center gap-2 text-lg font-black text-ink">
                        <span>Court {court.courtNumber}</span>
                        {isTopCourt && (
                          <span className="rounded bg-gold/20 px-1.5 py-0.5 text-sm font-semibold text-gold">Top Court</span>
                        )}
                      </h4>
                      <span className="text-sm text-muted">2 Teams of 2 Players</span>
                    </div>
                  </div>
                  <span className={`rounded-md px-2.5 py-1 text-sm font-semibold tabular-nums ${filledCount === 4 ? 'bg-raised text-ok' : 'bg-brand-soft text-ink'}`}>
                    {filledCount}/4 Players
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
      </section>

      <div className="sticky bottom-4 z-20 w-full pt-2">
        <div className="flex w-full flex-col items-center justify-between gap-3 rounded-xl border border-line bg-surface p-4 shadow-lg shadow-ground sm:flex-row">
          <p className="flex items-center gap-2 text-base text-ink-soft">
            <Trophy className="h-5 w-5 shrink-0 text-gold" />
            <span>
              <strong className="text-ink">Week {selectedWeek}</strong>: {assignedCount} / {checkedInCount} on Courts
              {unassignedBenchPlayers.length > 0 && (
                <span className="ml-1 font-bold text-brand-hover">
                  ({unassignedBenchPlayers.length} unassigned on bench)
                </span>
              )}
            </span>
          </p>
          <button onClick={handleSaveWeek} disabled={saving || loadingWeek} className={`${btnPrimary} w-full sm:w-auto`}>
            {saving ? (
              <>
                <RefreshCw className="h-5 w-5 animate-spin" />
                <span>Saving Court Results...</span>
              </>
            ) : (
              <>
                <Save className="h-5 w-5" />
                <span>Save Week {selectedWeek} & Compute Leaderboard</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
