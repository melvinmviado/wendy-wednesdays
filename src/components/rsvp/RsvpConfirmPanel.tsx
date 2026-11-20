import React, { useEffect, useId, useRef } from 'react'
import { CalendarCheck, Loader2 } from 'lucide-react'
import type { RsvpError, RsvpIdentity } from '../../types/rsvp'
import { formatSessionDate } from '../../utils/rsvpSchedule'

interface RsvpConfirmPanelProps {
  identity: RsvpIdentity
  sessionDate: string | null
  /** The write is in flight: both buttons are off, so a double tap cannot send it twice. */
  busy: boolean
  error: RsvpError | null
  onConfirm: () => void
  onCancel: () => void
  /** The server said the typed guest name is really this player: confirm as them instead. */
  onUseSuggestion: (identity: RsvpIdentity) => void
}

const btn = 'inline-flex min-h-11 flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg px-4 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-50'

/**
 * "Add Jordan to the Wed, Nov 25 run?" shown inside the Who's Playing sheet, so it shares the sheet's
 * focus trap, scroll lock and focus restore. Cancel gets the focus, so a stray Enter never confirms.
 */
export const RsvpConfirmPanel: React.FC<RsvpConfirmPanelProps> = ({ identity, sessionDate, busy, error, onConfirm, onCancel, onUseSuggestion }) => {
  const titleId = useId()
  const bodyId = useId()
  const cancelRef = useRef<HTMLButtonElement>(null)
  const name = identity.name.trim()

  useEffect(() => {
    // The sheet's own focus effect runs after this one on first open, so wait a tick to win.
    queueMicrotask(() => cancelRef.current?.focus())
  }, [])

  return (
    <section role="alertdialog" aria-labelledby={titleId} aria-describedby={bodyId} className="flex flex-col gap-4 border-b border-line p-4">
      <div className="flex items-start gap-3">
        <CalendarCheck className="mt-0.5 h-6 w-6 shrink-0 text-brand-hover" aria-hidden="true" />
        <div className="min-w-0">
          <h3 id={titleId} className="text-lg font-black text-ink">Confirm your RSVP</h3>
          <p id={bodyId} className="mt-1 text-base text-ink-soft [overflow-wrap:anywhere]">
            Add <strong className="font-bold text-ink">{name}</strong> to the {sessionDate ? formatSessionDate(sessionDate) : 'next'} run?
          </p>
        </div>
      </div>

      {error && (
        <div role="alert" className="flex flex-col items-start gap-2 text-sm text-brand-hover [overflow-wrap:anywhere]">
          <p>{error.message}</p>
          {error.suggestion && (
            <button
              type="button"
              disabled={busy}
              onClick={() => error.suggestion && onUseSuggestion({ kind: 'player', playerId: error.suggestion.playerId, name: error.suggestion.name })}
              className="min-h-11 cursor-pointer rounded-lg border border-line bg-raised px-4 font-semibold text-ink hover:bg-surface disabled:opacity-50"
            >
              Yes, I'm {error.suggestion.name}
            </button>
          )}
        </div>
      )}

      <div className="flex gap-2">
        <button ref={cancelRef} type="button" onClick={onCancel} disabled={busy} className={`${btn} border border-line bg-surface text-ink hover:bg-raised`}>
          Cancel
        </button>
        <button type="button" onClick={onConfirm} disabled={busy} className={`${btn} bg-brand text-brand-ink hover:bg-brand-hover`}>
          {busy && <Loader2 className="h-4 w-4 motion-safe:animate-spin" aria-hidden="true" />} Confirm RSVP
        </button>
      </div>
    </section>
  )
}
