import React, { useMemo } from 'react'
import { Plus, Search, UserPlus, Users } from 'lucide-react'
import type { WeeklyEntry } from '../../hooks/useWeeklyEntry'
import { getBenchPlayers } from '../../utils/weeklyEntry'
import { btnPrimary } from './styles'

// The roster is the bench: tap a name to seat them. Seated players stay listed, dimmed, below.
export const RosterPanel: React.FC<{ w: WeeklyEntry; rosterSize: number }> = ({ w, rosterSize }) => {
  const {
    courts,
    loadingWeek,
    newPlayerName,
    setNewPlayerName,
    searchFilter,
    setSearchFilter,
    filteredRoster,
    handleQuickAddPlayer,
    handleBenchPlayerTap,
    handleSlotTap,
    handleSelectAll,
  } = w

  const unseated = useMemo(() => getBenchPlayers(filteredRoster, courts), [filteredRoster, courts])
  const seated = useMemo(() => {
    const where = new Map<string, { court: number; slotId: string }>()
    courts.forEach((c) =>
      c.slots.forEach((s) => {
        if (s.playerId) where.set(s.playerId, { court: c.courtNumber, slotId: s.slotId })
      })
    )
    return filteredRoster.flatMap((player) => {
      const at = where.get(player.id)
      return at ? [{ player, ...at }] : []
    })
  }, [filteredRoster, courts])

  const input = 'w-full rounded-lg border border-line bg-surface py-3 pl-10 pr-3 text-base text-ink placeholder:text-muted'

  return (
    <section aria-label="Roster" className="flex flex-col gap-4">
      <form onSubmit={handleQuickAddPlayer} className="flex gap-2">
        <div className="relative flex-1">
          <UserPlus className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            type="text"
            value={newPlayerName}
            onChange={(e) => setNewPlayerName(e.target.value)}
            placeholder="Quick add player..."
            aria-label="Quick add player to roster"
            className={input}
          />
        </div>
        <button type="submit" disabled={!newPlayerName.trim()} className={`${btnPrimary} shrink-0`}>
          <Plus className="h-4 w-4" />
          <span>Add</span>
        </button>
      </form>

      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            type="text"
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            placeholder="Search roster..."
            aria-label="Search roster"
            className={input}
          />
        </div>
        <button
          type="button"
          onClick={handleSelectAll}
          disabled={rosterSize === 0 || loadingWeek}
          className="min-h-11 shrink-0 px-1 text-base font-semibold text-ink underline hover:text-brand-hover cursor-pointer disabled:opacity-50"
          title="Seat everyone on the roster, in order"
        >
          Select All
        </button>
      </div>

      {rosterSize === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-line bg-surface px-4 py-10 text-center text-base text-muted">
          <Users className="h-6 w-6" />
          <span>No active players yet. Use Quick add above.</span>
        </div>
      ) : filteredRoster.length === 0 ? (
        <div className="rounded-xl border border-line bg-surface py-10 text-center text-base text-muted">
          No players match your search.
        </div>
      ) : (
        <ul className="flex max-h-[60vh] flex-col gap-2 overflow-y-auto lg:max-h-[calc(100vh-14rem)]">
          {unseated.map((player) => (
            <li key={player.id}>
              <button
                type="button"
                disabled={loadingWeek}
                onClick={() => handleBenchPlayerTap(player)}
                className="flex min-h-14 w-full select-none items-center justify-between gap-3 rounded-lg border border-line bg-ground px-3 py-2 text-left transition-colors hover:border-brand hover:bg-surface cursor-pointer disabled:opacity-50"
              >
                <span className="truncate text-base font-bold text-ink">{player.name}</span>
                <Plus className="h-5 w-5 shrink-0 text-ink-soft" />
              </button>
            </li>
          ))}
          {seated.map(({ player, court, slotId }) => (
            <li key={player.id}>
              <button
                type="button"
                onClick={() => handleSlotTap(slotId)}
                className="flex min-h-14 w-full select-none items-center justify-between gap-3 rounded-lg border border-line bg-surface px-3 py-2 text-left opacity-60 transition-colors hover:opacity-100 cursor-pointer"
                title="Tap to swap, move or remove"
              >
                <span className="truncate text-base font-semibold text-ink-soft">{player.name}</span>
                <span className="shrink-0 rounded-md bg-brand-soft px-2 py-1 text-sm font-semibold text-ink">Court {court}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
