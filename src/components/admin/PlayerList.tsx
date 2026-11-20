import React from 'react'
import { Archive, Search } from 'lucide-react'
import type { PlayerAdmin } from '../../hooks/usePlayerAdmin'
import type { PlayerScore } from '../../types/leaderboard'
import { RoleBadges } from '../RoleBadge'
import { PlayerActionsMenu } from './PlayerActionsMenu'

interface PlayerListProps {
  rows: PlayerScore[]
  admin: PlayerAdmin
  query: string
  onQuery: (q: string) => void
  loading: boolean
  error: string | null
  onRetry: () => void
}

/** Search, "Show archived", and one row per player with the ⋯ menu. Loading, error and empty states included. */
export const PlayerList: React.FC<PlayerListProps> = ({ rows, admin, query, onQuery, loading, error, onRetry }) => (
  <div className="flex flex-col gap-3">
    <div className="flex items-center gap-2">
      <div className="relative flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden="true" />
        <input
          type="search"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder="Search players..."
          aria-label="Search players"
          className="min-h-11 w-full rounded-lg border border-line bg-surface pl-9 pr-3 text-ink placeholder:text-muted"
        />
      </div>
      <button
        type="button"
        onClick={admin.toggleArchived}
        aria-pressed={admin.showArchived}
        className={`inline-flex min-h-11 shrink-0 cursor-pointer items-center gap-2 rounded-lg border border-line px-3 text-sm font-semibold text-ink hover:bg-raised ${admin.showArchived ? 'bg-raised' : 'bg-surface'}`}
      >
        <Archive className="h-4 w-4" aria-hidden="true" />
        <span>{admin.showArchived ? 'Hide archived' : 'Show archived'}</span>
      </button>
    </div>

    {error && (
      <p role="alert" className="flex items-center gap-3 text-sm text-ink">
        {error}
        <button type="button" onClick={onRetry} className="min-h-9 cursor-pointer rounded-lg border border-line px-3 font-semibold hover:bg-raised">
          Retry
        </button>
      </p>
    )}
    {admin.showArchived && admin.archivedError && (
      <p role="alert" className="flex items-center gap-3 text-sm text-ink">
        Could not load archived players: {admin.archivedError}
        <button type="button" onClick={admin.loadArchived} className="min-h-9 cursor-pointer rounded-lg border border-line px-3 font-semibold hover:bg-raised">
          Retry
        </button>
      </p>
    )}
    {(loading || (admin.showArchived && admin.archivedLoading)) && rows.length === 0 && (
      <p role="status" className="text-sm text-muted">Loading players…</p>
    )}
    {rows.length === 0 && !loading && !error && (
      <p className="rounded-xl border border-line bg-surface py-8 text-center text-muted">
        {query.trim() ? 'No players match your search.' : 'No players yet.'}
      </p>
    )}

    {rows.length > 0 && (
      <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
        {rows.map((p) => {
          const archived = Boolean(p.archivedAt)
          return (
            <li key={p.id} className="flex items-center gap-3 px-4 py-2">
              <span className={`min-w-0 flex-1 truncate font-medium ${archived ? 'text-ink-soft' : 'text-ink'}`}>{p.name}</span>
              <RoleBadges roles={p.role ? [p.role] : []} />
              {archived && <span className="shrink-0 rounded-full border border-line px-2 py-0.5 text-xs text-ink-soft">Archived</span>}
              <PlayerActionsMenu
                playerName={p.name}
                onRename={() => admin.openDialog('rename', p)}
                onSetRole={() => admin.openDialog('role', p)}
                onArchive={() => admin.openDialog('archive', p)}
                onRestore={archived ? () => void admin.restore(p) : undefined}
                onDelete={() => admin.openDialog('delete', p)}
              />
            </li>
          )
        })}
      </ul>
    )}
  </div>
)
