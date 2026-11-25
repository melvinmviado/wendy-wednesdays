import React, { useEffect, useId, useMemo, useRef } from 'react'
import { LayoutGrid, X } from 'lucide-react'
import { useAdminRsvpPanel } from '../../hooks/useAdminRsvpPanel'
import { useDialogBehavior } from '../../hooks/useDialogBehavior'
import type { PlayerScore } from '../../types/leaderboard'
import type { RsvpAdminActions, RsvpError, RsvpIdentity, RsvpRosterEntry } from '../../types/rsvp'
import type { EventSettings } from '../../lib/eventSettings'
import { formatSessionDate, type RsvpPhase } from '../../utils/rsvpSchedule'
import { AdminRowActions } from './AdminRowActions'
import { Group } from './RsvpGroup'
import { RsvpAdminTools } from './RsvpAdminTools'
import { RsvpConfirmPanel } from './RsvpConfirmPanel'
import { RsvpIdentityPicker } from './RsvpIdentityPicker'
import { RsvpScheduleInfo } from './RsvpScheduleInfo'

interface WhosPlayingSheetProps {
  phase: RsvpPhase | null
  sessionDate: string | null
  /** The run's Court Board, once its courts are published. */
  courtsHref?: string | null
  /** The server-corrected clock, and the admin's settings (null = built-in weekly schedule). */
  now: Date
  settings: EventSettings | null
  capacity: number
  inCount: number
  roster: RsvpRosterEntry[]
  players: PlayerScore[]
  identity: RsvpIdentity | null
  /** Signed-in with a claimed player: the name is fixed, so there is no picker or "not you". */
  identityLocked: boolean
  /** A name was chosen: ask the dock to open the confirmation. Nothing is sent yet. */
  onPick: (identity: RsvpIdentity) => void
  /** Set while the inline "Add X to the run?" step is showing. */
  confirm?: { identity: RsvpIdentity; busy: boolean; error: RsvpError | null }
  onConfirm: (identity?: RsvpIdentity) => void
  onCancelConfirm: () => void
  onForget: () => void
  onClose: () => void
  loading?: boolean
  error?: boolean
  /** Re-reads the roster; called on a short timer while the sheet is open. */
  onRefresh?: () => void
  /** Admins only: add or remove any player. Everyone else leaves this out. */
  admin?: RsvpAdminActions
}

export const SHEET_POLL_MS = 10_000

/** Who's Playing: the week's list in order, then the waitlist. Also where a first-time visitor says who they are. */
export const WhosPlayingSheet: React.FC<WhosPlayingSheetProps> = (p) => {
  const panelRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  useDialogBehavior(true, panelRef, p.onClose)
  const { onRefresh } = p
  const panel = useAdminRsvpPanel(p.admin)
  useEffect(() => {
    if (!onRefresh) return
    onRefresh()
    const id = setInterval(() => { if (document.visibilityState === 'visible') onRefresh() }, SHEET_POLL_MS)
    return () => clearInterval(id)
  }, [onRefresh])

  const { going, waitlist, takenIds } = useMemo(() => {
    const ins = p.roster.filter((e) => e.status === 'in')
    return {
      going: ins.filter((e) => (e.position ?? 0) <= p.capacity),
      waitlist: ins.filter((e) => (e.position ?? 0) > p.capacity),
      takenIds: new Set(ins.flatMap((e) => (e.playerId ? [e.playerId] : []))),
    }
  }, [p.roster, p.capacity])

  const candidates = useMemo(() => p.players.filter((pl) => !takenIds.has(pl.id)), [p.players, takenIds])
  // An optimistic row has no real id yet, so it gets no controls.
  const removeFor = (e: RsvpRosterEntry) =>
    !p.admin || e.rsvpId === 'pending' ? null : <AdminRowActions entry={e} roster={p.roster} players={p.players} panel={panel} busy={p.admin.busy} />
  const isMine = (e: RsvpRosterEntry) =>
    !!p.identity && (p.identity.kind === 'player' ? e.playerId === p.identity.playerId : e.isGuest && e.name.toLowerCase() === p.identity.name.trim().toLowerCase())
  // Picking is only useful while changes are still possible
  const canPick = !p.identity && !p.identityLocked && (p.phase === 'open' || p.phase === 'full')
  const spotsLeft = Math.max(0, p.capacity - p.inCount)
  const empty = going.length + waitlist.length === 0
  const live = p.phase === 'live'

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ground/90 motion-safe:animate-backdrop-in sm:items-center sm:p-4" onClick={p.onClose}>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[90dvh] w-full flex-col overflow-hidden rounded-t-2xl border border-line bg-surface outline-none motion-safe:animate-sheet-up sm:max-w-lg sm:rounded-2xl sm:motion-safe:animate-dialog-in"
      >
        <header className="flex items-center gap-3 border-b border-line p-4">
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="text-lg font-black text-ink">{live ? "Tonight's Roster" : "Who's Playing"}</h2>
            {p.sessionDate && (
              <p className="text-sm text-ink-soft">{formatSessionDate(p.sessionDate)} • {p.inCount}/{p.capacity} in • <span className="font-semibold text-ink">{spotsLeft > 0 ? `${spotsLeft} spot${spotsLeft === 1 ? '' : 's'} left` : 'Full'}</span></p>
            )}
            {p.courtsHref && (
              <a href={p.courtsHref} className="mt-1 inline-flex min-h-11 items-center gap-1.5 text-sm font-bold text-ink underline underline-offset-2 hover:text-brand-hover">
                <LayoutGrid className="h-4 w-4" aria-hidden="true" /> Courts are posted: see the courts
              </a>
            )}
          </div>
          <button type="button" onClick={p.onClose} aria-label="Close" className="inline-flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-lg text-ink-soft hover:bg-raised hover:text-ink">
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </header>
        <RsvpScheduleInfo sessionDate={p.sessionDate} now={p.now} settings={p.settings} />

        <div className="flex-1 overflow-y-auto overscroll-contain pb-[max(1rem,env(safe-area-inset-bottom))]">
          {p.admin && <RsvpAdminTools panel={panel} candidates={candidates} busy={p.admin.busy} />}
          {p.confirm && (
            <RsvpConfirmPanel
              identity={p.confirm.identity}
              sessionDate={p.sessionDate}
              busy={p.confirm.busy}
              error={p.confirm.error}
              onConfirm={() => p.onConfirm()}
              onCancel={p.onCancelConfirm}
              onUseSuggestion={p.onConfirm}
            />
          )}
          {/* Hidden, not unmounted, while confirming: Cancel brings back what was typed. */}
          {canPick && (
            <div hidden={!!p.confirm}>
              <RsvpIdentityPicker players={p.players} takenIds={takenIds} onPick={p.onPick} />
            </div>
          )}
          <div className="flex flex-col gap-4 p-4">
            {p.loading && empty ? (
              <p role="status" className="py-8 text-center text-muted">Loading the list…</p>
            ) : p.error && empty ? (
              <div role="alert" className="flex flex-col items-center gap-2 py-8 text-center text-muted">
                <p>Couldn't load the list.</p>
                <button type="button" onClick={p.onRefresh} className="min-h-11 cursor-pointer rounded-lg border border-line px-4 font-semibold text-ink hover:bg-raised">Try again</button>
              </div>
            ) : empty ? (
              <p className="py-8 text-center text-muted">Nobody's in yet. Be the first.</p>
            ) : (
              <>
                <Group title="In" people={going} isMine={isMine} action={removeFor} />
                <Group title="Waitlist" people={waitlist} isMine={isMine} offset={0} action={removeFor} />
              </>
            )}
            {p.identity && !p.identityLocked && (
              <p className="text-sm text-muted">
                You're {p.identity.name}.{' '}
                <button type="button" onClick={p.onForget} className="min-h-11 cursor-pointer font-semibold text-ink underline underline-offset-2">Not you?</button>
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
