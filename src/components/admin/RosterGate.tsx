import type { ReactNode } from 'react'
import { AlertTriangle, Loader2 } from 'lucide-react'

interface RosterGateProps {
  /** True once the roster has loaded at least once (always true in demo mode). */
  loaded: boolean
  error: string | null
  onRetry: () => void
  children: ReactNode
}

const retryBtn = 'shrink-0 font-bold underline hover:text-brand-hover cursor-pointer'

/**
 * Holds back roster-based admin tools until the roster has loaded. Saving a week also marks
 * every roster player who isn't seated as absent, so it must never run against a missing roster.
 * A failed refresh of an already-loaded roster shows a warning above the tools.
 */
export function RosterGate({ loaded, error, onRetry, children }: RosterGateProps) {
  if (!loaded) {
    return error ? (
      <div role="alert" className="flex items-start gap-3 rounded-xl border border-brand bg-brand-soft p-4 text-sm text-ink">
        <AlertTriangle className="h-5 w-5 shrink-0 text-brand-hover" aria-hidden="true" />
        <p className="min-w-0 flex-1 wrap-break-word">Couldn't load the player roster: {error}</p>
        <button onClick={onRetry} className={retryBtn}>Try again</button>
      </div>
    ) : (
      <p role="status" className="flex items-center justify-center gap-2 rounded-xl border border-line bg-surface p-6 text-sm text-muted">
        <Loader2 className="h-4 w-4 motion-safe:animate-spin" aria-hidden="true" /> Loading the player roster…
      </p>
    )
  }
  return (
    <>
      {error && (
        <div role="alert" className="flex items-start gap-3 rounded-xl border border-gold/60 bg-surface p-4 text-sm text-ink">
          <AlertTriangle className="h-5 w-5 shrink-0 text-gold" aria-hidden="true" />
          <p className="min-w-0 flex-1 wrap-break-word">Couldn't refresh the player roster ({error}). It may be out of date.</p>
          <button onClick={onRetry} className={retryBtn}>Try again</button>
        </div>
      )}
      {children}
    </>
  )
}
