import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useEventSettings } from '../../hooks/useEventSettings'
import { useIsAdmin } from '../../hooks/useIsAdmin'
import { useKeyboardOpen } from '../../hooks/useKeyboardOpen'
import { useMyPlayer } from '../../hooks/useMyPlayer'
import { useRsvp } from '../../hooks/useRsvp'
import type { ToastApi } from '../../hooks/useToasts'
import type { PlayerScore } from '../../types/leaderboard'
import type { RsvpApi, RsvpError, RsvpIdentity } from '../../types/rsvp'
import { describeForScreenReader, getDockView } from '../../utils/rsvpDockView'
import { formatCountdown } from '../../utils/rsvpCountdown'
import { formatEventDateTime } from '../../lib/datetime'
import { formatSessionDate, getScheduleTimestamps, getSessionTimeZone } from '../../utils/rsvpSchedule'
import { RsvpBar } from './RsvpBar'
import { WhosPlayingSheet } from './WhosPlayingSheet'

export const UNDO_MS = 5000

/** The inline confirmation. `fromDock`: the sheet was opened just for it, so it closes with it. */
interface Confirming {
  identity: RsvpIdentity
  busy: boolean
  error: RsvpError | null
  fromDock: boolean
}

interface RsvpDockProps {
  players: PlayerScore[]
  toast: Pick<ToastApi, 'push' | 'dismiss'>
  /** Tests inject one; the app uses Supabase or the in-memory demo. */
  api?: RsvpApi
}

/**
 * The weekly RSVP bar. Mount it once at the app root. It renders an in-flow spacer as tall as
 * itself (plus the phone's home-indicator inset), so the page's last content is never hidden
 * behind it, and a fixed bar at z-40: above the page and the sticky nav (z-30), under every
 * modal and sheet (z-50) and the toasts (z-60).
 */
export const RsvpDock: React.FC<RsvpDockProps> = ({ players, toast, api }) => {
  const claimed = useMyPlayer()
  const { isAdmin } = useIsAdmin()
  const { settings, refetch: refetchSettings } = useEventSettings()
  const r = useRsvp({ claimedPlayer: claimed, api, isAdmin, settings })
  const keyboardOpen = useKeyboardOpen()
  const [sheetOpen, setSheetOpen] = useState(false)
  const [confirming, setConfirming] = useState<Confirming | null>(null)
  const sending = useRef(false)
  const confirmingRef = useRef(confirming)
  confirmingRef.current = confirming

  // Signing in (or out) mid-question changes who the RSVP would be for, and a claimed player
  // overrides the name on screen. Drop the question without writing; they can tap again.
  const { user } = useAuth()
  const userId = user?.id ?? null
  useEffect(() => {
    const open = confirmingRef.current
    if (!open || sending.current) return
    if (open.fromDock) setSheetOpen(false)
    setConfirming(null)
  }, [userId])
  const pendingUndo = useRef<(() => boolean) | null>(null)

  // The server refused for a closed cutoff: our copy of the settings is behind an admin's change.
  const refused = r.actionError?.code === 'CUTOFF_PASSED'
  useEffect(() => {
    if (refused) void refetchSettings()
  }, [refused, refetchSettings])

  // Only worth a mention inside the last day; the sheet always has the full time.
  const untilClose = r.cutoffAt ? r.cutoffAt.getTime() - r.now.getTime() : 0
  const closesIn = (r.phase === 'open' || r.phase === 'full') && untilClose > 0 && untilClose < 86_400_000 ? formatCountdown(untilClose) : null
  const openAt = r.sessionDate && r.phase === 'upcoming' ? getScheduleTimestamps(r.sessionDate, settings).openAt : null
  const opensAt = openAt && r.sessionDate ? formatEventDateTime(openAt.toISOString(), getSessionTimeZone(r.sessionDate, settings)) : null
  const view = getDockView({ ...r, failed: r.error !== null, capacity: r.capacity, closesIn, opensAt })
  if (r.unavailable) return null // the RSVP migration is not applied: stay out of the way

  const refreshRef = useRef(r.refresh)
  refreshRef.current = r.refresh
  const refresh = useCallback(() => void refreshRef.current(), [])

  const canRsvp = view.kind === 'open' || view.kind === 'full'
  const fail = (message: string) => toast.push('error', message)

  const join = async () => {
    if (pendingUndo.current?.()) return // tapping I'm In inside the undo window just undoes the cancel
    if (!canRsvp) return // closed, live or loading: nothing to ask about
    if (!r.identity) return setSheetOpen(true) // first time on this device: ask who they are
    setConfirming({ identity: r.identity, busy: false, error: null, fromDock: true }) // everyone confirms first
    setSheetOpen(true)
  }

  const cancel = () => {
    const res = r.cancelWithUndo({
      delayMs: UNDO_MS,
      onSettled: (s) => {
        if (!s.ok) fail(s.error.message) // the screen has already rolled back
      },
    })
    if (!res.ok) return fail(res.error.message)
    const { undo } = res.data
    pendingUndo.current = undo
    const what = view.kind === 'waitlisted' ? 'You left the waitlist.' : `You're out for ${r.sessionDate ? formatSessionDate(r.sessionDate) : 'this week'}.`
    toast.push('success', what, { durationMs: UNDO_MS, action: { label: 'Undo', onClick: () => void undo() } })
  }

  const pick = (identity: RsvpIdentity) => canRsvp && setConfirming({ identity, busy: false, error: null, fromDock: false })

  const cancelConfirm = () => {
    if (!confirming || sending.current) return // no backing out mid-write
    if (confirming.fromDock) setSheetOpen(false)
    setConfirming(null)
  }

  /** The one write. `sending` is a ref so a double tap in the same frame cannot send twice. */
  const confirmRsvp = async (who?: RsvpIdentity) => {
    if (!confirming || sending.current) return
    const identity = who ?? confirming.identity
    sending.current = true
    setConfirming({ ...confirming, identity, busy: true, error: null })
    const res = await (view.kind === 'full' ? r.joinWaitlist(identity) : r.setIn(identity))
    sending.current = false
    if (res.ok) {
      setConfirming(null)
      setSheetOpen(false)
    } else {
      setConfirming({ ...confirming, identity, busy: false, error: res.error })
    }
  }

  return (
    <>
      <div aria-hidden="true" className="h-[calc(var(--spacing-dock)+env(safe-area-inset-bottom))]" />
      <section
        aria-label="Weekly RSVP"
        inert={keyboardOpen}
        className={`fixed inset-x-0 bottom-0 z-40 border-t border-line bg-ground/95 pb-[env(safe-area-inset-bottom)] backdrop-blur transition-transform duration-200 motion-reduce:transition-none ${
          keyboardOpen ? 'translate-y-full' : ''
        }`}
      >
        <p role="status" aria-live="polite" className="sr-only">
          {describeForScreenReader(view, r.inCount, r.capacity)}
        </p>
        <RsvpBar view={view} busy={r.busy} onOpenSheet={() => setSheetOpen(true)} onJoin={join} onCancel={cancel} onRetry={() => void r.refresh()} />
      </section>

      {sheetOpen && (
        <WhosPlayingSheet
          phase={r.phase}
          sessionDate={r.sessionDate}
          now={r.now}
          settings={settings}
          capacity={r.capacity ?? 0}
          inCount={r.inCount}
          roster={r.roster}
          players={players}
          identity={r.identity}
          identityLocked={claimed !== null}
          onPick={pick}
          confirm={confirming ?? undefined}
          onConfirm={(who) => void confirmRsvp(who)}
          onCancelConfirm={cancelConfirm}
          onForget={r.forgetIdentity}
          loading={r.loading}
          error={r.error !== null}
          onRefresh={refresh}
          admin={isAdmin ? { busy: r.adminBusy, add: r.adminAddRsvp, remove: r.adminRemoveRsvp, addGuest: r.adminAddGuest, removeGuest: r.adminRemoveGuest, renameGuest: r.adminRenameGuest } : undefined}
          onClose={() => (confirming ? cancelConfirm() : setSheetOpen(false))}
        />
      )}
    </>
  )
}
