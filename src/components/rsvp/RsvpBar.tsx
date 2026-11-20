import React from 'react'
import { Check, ChevronUp, Loader2, Radio } from 'lucide-react'
import type { DockView } from '../../utils/rsvpDockView'

interface RsvpBarProps {
  view: DockView
  busy: boolean
  onOpenSheet: () => void
  /** I'm In, or Join Waitlist when the run is full. */
  onJoin: () => void
  onCancel: () => void
  onRetry: () => void
}

// Every control is at least 44px tall: this is tapped one-handed, often in a hurry.
const summary =
  'flex min-h-11 min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-lg text-left text-sm font-semibold text-ink hover:text-brand-hover'
const pill = 'inline-flex min-h-11 shrink-0 items-center justify-center gap-1.5 rounded-full px-4 text-sm font-bold whitespace-nowrap'
const join = `${pill} cursor-pointer bg-brand text-brand-ink hover:bg-brand-hover motion-safe:active:scale-[0.97] transition-colors`
const status = `${pill} border border-ok bg-surface text-ok motion-safe:animate-dialog-in`
const cancelBtn =
  'inline-flex min-h-11 min-w-11 shrink-0 cursor-pointer items-center justify-center rounded-lg px-3 text-sm font-medium text-muted underline-offset-2 hover:text-ink hover:underline'

const Row: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="mx-auto flex h-dock max-w-3xl items-center gap-3 px-4 sm:px-6">{children}</div>
)

/** The dock's one line and its one action. All the rules live in getDockView; this only draws them. */
export const RsvpBar: React.FC<RsvpBarProps> = ({ view, busy, onOpenSheet, onJoin, onCancel, onRetry }) => {
  if (view.kind === 'loading') {
    return (
      <Row>
        <span role="status" className="flex items-center gap-2 text-sm text-muted">
          <Loader2 className="h-4 w-4 motion-safe:animate-spin" aria-hidden="true" /> Loading this week's run...
        </span>
      </Row>
    )
  }
  if (view.kind === 'error') {
    return (
      <Row>
        <p role="alert" className="flex-1 text-sm text-ink-soft">Couldn't load this week's RSVPs.</p>
        <button type="button" onClick={onRetry} className={`${pill} cursor-pointer border border-line bg-surface text-ink hover:bg-raised`}>
          Try again
        </button>
      </Row>
    )
  }
  if (view.kind === 'live') {
    return (
      <Row>
        <button type="button" onClick={onOpenSheet} className={`${summary} text-base`}>
          <Radio className="h-5 w-5 shrink-0 text-brand-hover motion-safe:animate-pulse" aria-hidden="true" />
          <span className="truncate">{view.line}</span>
          <ChevronUp className="ml-auto h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
        </button>
      </Row>
    )
  }

  return (
    <Row>
      <button type="button" onClick={onOpenSheet} className={summary} aria-label={`${view.line}. See who's playing`}>
        <span className="truncate" aria-hidden="true">{view.line}</span>
        <ChevronUp className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
      </button>

      {view.kind === 'open' && (
        <button type="button" onClick={onJoin} disabled={busy} className={join}>
          I'm In <span aria-hidden="true">🏓</span>
        </button>
      )}
      {view.kind === 'full' && (
        <button type="button" onClick={onJoin} disabled={busy} className={join}>
          Join Waitlist (#{view.joinNumber})
        </button>
      )}
      {(view.kind === 'going' || view.kind === 'waitlisted') && (
        <>
          <span className={status}>
            {view.kind === 'going' ? (
              <>
                <Check className="h-4 w-4" aria-hidden="true" /> Going
              </>
            ) : (
              <>Waitlist #{view.waitlistPosition}</>
            )}
          </span>
          <button type="button" onClick={onCancel} disabled={busy} className={cancelBtn} aria-label={view.kind === 'going' ? 'Cancel my spot' : 'Leave the waitlist'}>
            Cancel
          </button>
        </>
      )}
      {view.kind === 'locked' && view.mine && (
        // Read-only: nothing can change after the cutoff, so there is nothing to tap.
        <span className={status}>
          {view.mine === 'going' ? (
            <>
              <Check className="h-4 w-4" aria-hidden="true" /> Going
            </>
          ) : (
            <>Waitlist #{view.waitlistPosition}</>
          )}
        </span>
      )}
    </Row>
  )
}
