import { CheckSquare, RefreshCw, RotateCcw, Search } from 'lucide-react'
import { btn, btnQuiet } from '@/components/appStyles'

interface LeaderboardToolbarProps {
  searchQuery: string
  onSearch: (query: string) => void
  isAdmin: boolean
  isConfigured: boolean
  refreshing: boolean
  onRecordWeek: () => void
  onRefresh: () => void
  onResetDemo: () => void
}

/** Search box plus the leaderboard's actions (record a week, refresh, or reset the demo data). */
export function LeaderboardToolbar(p: LeaderboardToolbarProps) {
  return (
    <div className="flex items-center gap-2">
      <div className="relative flex-1">
        <Search className="w-4 h-4 text-muted absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" aria-hidden="true" />
        <input
          type="text"
          value={p.searchQuery}
          onChange={(e) => p.onSearch(e.target.value)}
          placeholder="Search player name..."
          aria-label="Search player name"
          className="w-full min-h-10 pl-9 pr-16 rounded-lg bg-surface border border-line text-ink placeholder:text-muted"
        />
        {p.searchQuery && (
          <button
            onClick={() => p.onSearch('')}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-sm text-ink-soft hover:text-ink px-2 py-0.5 rounded bg-raised cursor-pointer"
          >
            Clear
          </button>
        )}
      </div>

      {p.isAdmin && (
        <button onClick={p.onRecordWeek} className={`${btn} bg-ink text-ground hover:bg-ink-soft`} title="Record Weekly Entry">
          <CheckSquare className="w-4 h-4" aria-hidden="true" />
          <span className="hidden sm:inline">Record Week</span>
        </button>
      )}

      {p.isConfigured ? (
        <button onClick={p.onRefresh} disabled={p.refreshing} className={`${btnQuiet} px-3`} title="Refresh from Supabase database" aria-label="Refresh from Supabase database">
          <RefreshCw className={`w-4 h-4 ${p.refreshing ? 'motion-safe:animate-spin text-brand-hover' : ''}`} aria-hidden="true" />
        </button>
      ) : (
        <button onClick={p.onResetDemo} className={`${btnQuiet} px-3`} title="Reset to default scores" aria-label="Reset to default scores">
          <RotateCcw className="w-4 h-4" aria-hidden="true" />
        </button>
      )}
    </div>
  )
}
