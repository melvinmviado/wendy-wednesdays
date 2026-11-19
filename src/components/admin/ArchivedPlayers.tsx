import React from 'react'
import { ArchiveRestore, Trash2, Loader2 } from 'lucide-react'
import type { PlayerScore } from '../../types/leaderboard'

interface ArchivedPlayersProps {
  players: PlayerScore[]
  loading: boolean
  error: string | null
  pendingIds: ReadonlySet<string>
  onRestore: (player: PlayerScore) => void
  onDelete: (player: PlayerScore) => void
  onRetry: () => void
}

const small =
  'inline-flex items-center gap-1.5 min-h-9 px-3 rounded-lg border border-line bg-surface text-sm font-semibold text-ink hover:bg-raised cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed'

const archivedOn = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString() : '')

export const ArchivedPlayers: React.FC<ArchivedPlayersProps> = ({ players, loading, error, pendingIds, onRestore, onDelete, onRetry }) => (
  <section aria-labelledby="archived-heading" className="flex flex-col gap-3">
    <h2 id="archived-heading" className="text-lg font-bold text-ink">
      Archived players
    </h2>

    {loading && (
      <p role="status" className="flex items-center gap-2 text-ink-soft">
        <Loader2 className="w-4 h-4 motion-safe:animate-spin" aria-hidden="true" /> Loading archived players...
      </p>
    )}

    {error && !loading && (
      <p role="alert" className="flex items-center gap-3 text-sm text-ink">
        Could not load archived players: {error}
        <button onClick={onRetry} className={small}>
          Retry
        </button>
      </p>
    )}

    {!loading && !error && players.length === 0 && (
      <p className="rounded-xl border border-line bg-surface py-8 text-center text-muted">No archived players.</p>
    )}

    {players.length > 0 && (
      <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
        {players.map((p) => {
          const pending = pendingIds.has(p.id)
          return (
            <li key={p.id} className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-ink">{p.name}</p>
                <p className="text-sm text-muted">
                  {p.weeksPlayed} {p.weeksPlayed === 1 ? 'week' : 'weeks'} played, {p.totalPoints.toLocaleString()} pts
                  {p.archivedAt ? `, archived ${archivedOn(p.archivedAt)}` : ''}
                </p>
              </div>
              <button onClick={() => onRestore(p)} disabled={pending} className={small} aria-label={`Restore ${p.name}`}>
                <ArchiveRestore className="w-4 h-4" aria-hidden="true" /> Restore
              </button>
              <button onClick={() => onDelete(p)} disabled={pending} className={small} aria-label={`Delete ${p.name}`}>
                <Trash2 className="w-4 h-4" aria-hidden="true" />
                <span className="hidden sm:inline">Delete</span>
              </button>
            </li>
          )
        })}
      </ul>
    )}
  </section>
)
