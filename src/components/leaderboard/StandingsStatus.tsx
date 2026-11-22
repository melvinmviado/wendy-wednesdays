import { AlertTriangle, Loader2 } from 'lucide-react'

interface StandingsStatusProps {
  loading: boolean
  /** True once the database has answered at least once (always true in demo mode). */
  loaded: boolean
  error: string | null
  playerCount: number
  isAdmin: boolean
  onRetry: () => void
}

const box = 'rounded-xl border border-line bg-surface p-6 text-center text-muted'

/**
 * Loading, error and empty states for the standings. Returns null when the table should simply
 * show. Visitors get a plain message; the database's own error text is shown to admins only.
 */
export function StandingsStatus({ loading, loaded, error, playerCount, isAdmin, onRetry }: StandingsStatusProps) {
  if (error) {
    const stale = playerCount > 0
    return (
      <div role="alert" className="p-4 rounded-xl bg-brand-soft border border-brand text-sm text-ink flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-brand-hover shrink-0" aria-hidden="true" />
        <div className="min-w-0 flex-1 space-y-1">
          <p className="font-semibold">
            {stale ? "Couldn't refresh the standings. Showing the last copy we had." : "Couldn't load the standings."}
          </p>
          {isAdmin && <p className="text-ink-soft wrap-break-word">Details: {error}</p>}
        </div>
        <button onClick={onRetry} className="shrink-0 font-bold underline hover:text-brand-hover cursor-pointer">
          Try again
        </button>
      </div>
    )
  }
  if (!loaded && playerCount === 0) {
    return (
      <p role="status" className={`${box} flex items-center justify-center gap-2`}>
        <Loader2 className="w-4 h-4 motion-safe:animate-spin" aria-hidden="true" />
        {loading ? 'Loading the standings…' : 'Waiting for the standings…'}
      </p>
    )
  }
  if (loaded && playerCount === 0) {
    return (
      <p className={box}>
        No players on the roster yet.{isAdmin ? ' Add players from the admin dashboard.' : ' Check back after the first week.'}
      </p>
    )
  }
  return null
}
