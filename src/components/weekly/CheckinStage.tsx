import React from 'react'
import { Check, Plus, Search, UserPlus, RefreshCw, ArrowRight } from 'lucide-react'
import { PlayerScore } from '../../types/leaderboard'
import type { WeeklyEntry } from '../../hooks/useWeeklyEntry'
import { btnPrimary } from './styles'

interface CheckinStageProps {
  w: WeeklyEntry
  roster: PlayerScore[]
}

export const CheckinStage: React.FC<CheckinStageProps> = ({ w, roster }) => {
  const {
    selectedWeek,
    checkedInPlayerIds,
    setCheckedInPlayerIds,
    newPlayerName,
    setNewPlayerName,
    searchFilter,
    setSearchFilter,
    loadingWeek,
    togglePlayerCheckin,
    handleQuickAddPlayer,
    handleProceedToCourts,
    filteredRoster,
    checkedInCount,
    courtsRequired,
  } = w

  return (
    <div className="flex flex-col gap-5">
      <form onSubmit={handleQuickAddPlayer} className="flex gap-2">
        <div className="relative flex-1">
          <UserPlus className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            type="text"
            value={newPlayerName}
            onChange={(e) => setNewPlayerName(e.target.value)}
            placeholder="Quick add player to roster..."
            aria-label="Quick add player to roster"
            className="w-full rounded-lg border border-line bg-surface py-3 pl-10 pr-3 text-base text-ink placeholder:text-muted"
          />
        </div>
        <button type="submit" disabled={!newPlayerName.trim()} className={`${btnPrimary} shrink-0`}>
          <Plus className="h-4 w-4" />
          <span>Add</span>
        </button>
      </form>

      <div className="flex flex-wrap items-center justify-between gap-4 border-y border-line py-4">
        <p className="flex flex-wrap items-baseline gap-x-6 gap-y-1 text-base text-ink-soft">
          <span>
            <strong className="text-3xl font-black text-ink tabular-nums">{checkedInCount}</strong> Checked In
          </span>
          <span>
            <strong className="text-3xl font-black text-brand-hover tabular-nums">{courtsRequired}</strong> Courts (4 players/court)
          </span>
        </p>
        <div className="relative w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            type="text"
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            placeholder="Search roster..."
            aria-label="Search roster"
            className="w-full rounded-lg border border-line bg-ground py-2.5 pl-10 pr-3 text-base text-ink placeholder:text-muted"
          />
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-base font-semibold text-ink-soft">Tap players that participated</h3>
          <div className="flex gap-4 text-base">
            <button
              type="button"
              onClick={() => setCheckedInPlayerIds(new Set(roster.map((p) => p.id)))}
              className="font-semibold text-ink underline hover:text-brand-hover cursor-pointer"
            >
              Select All
            </button>
            <button
              type="button"
              onClick={() => setCheckedInPlayerIds(new Set())}
              className="font-semibold text-ink-soft underline hover:text-ink cursor-pointer"
            >
              Clear
            </button>
          </div>
        </div>

        {loadingWeek ? (
          <div role="status" className="flex items-center justify-center gap-2 py-12 text-base text-ink-soft">
            <RefreshCw className="h-5 w-5 animate-spin text-brand-hover" />
            <span>Loading Week {selectedWeek} check-ins...</span>
          </div>
        ) : filteredRoster.length === 0 ? (
          <div className="rounded-lg border border-line bg-surface py-12 text-center text-base text-muted">
            No players match your search filter.
          </div>
        ) : (
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {filteredRoster.map((player) => {
              const isChecked = checkedInPlayerIds.has(player.id)
              return (
                <li key={player.id}>
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={isChecked}
                    onClick={() => togglePlayerCheckin(player.id)}
                    className={`flex w-full select-none items-center justify-between gap-3 rounded-lg border p-3 text-left transition-colors cursor-pointer ${
                      isChecked
                        ? 'border-brand bg-raised hover:bg-line'
                        : 'border-line bg-ground hover:bg-surface'
                    }`}
                  >
                    <span className="flex min-w-0 items-center gap-3">
                      <span
                        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md border ${
                          isChecked ? 'border-brand bg-brand text-brand-ink' : 'border-line bg-surface text-transparent'
                        }`}
                      >
                        <Check className="h-4 w-4 stroke-[3]" />
                      </span>
                      <span className="min-w-0">
                        <span className={`block truncate text-base font-bold ${isChecked ? 'text-ink' : 'text-ink-soft'}`}>
                          {player.name}
                        </span>
                        <span className="block text-sm text-muted">{isChecked ? 'Checked In' : 'Not Participating'}</span>
                      </span>
                    </span>
                    {isChecked && (
                      <span className="shrink-0 rounded-md bg-brand-soft px-2 py-1 text-sm font-semibold text-ink">Attended</span>
                    )}
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <div className="sticky bottom-4 z-20 w-full pt-2">
        <button onClick={handleProceedToCourts} disabled={checkedInCount === 0} className={`${btnPrimary} w-full py-4`}>
          <span>
            Proceed to Court Cards: {checkedInCount} Players, {courtsRequired} Courts
          </span>
          <ArrowRight className="h-5 w-5" />
        </button>
      </div>
    </div>
  )
}
