import React, { useMemo } from 'react'
import { Loader2 } from 'lucide-react'
import { useEventSettings } from '../../hooks/useEventSettings'
import { useAdminRsvpPanel } from '../../hooks/useAdminRsvpPanel'
import { useRsvp } from '../../hooks/useRsvp'
import type { PlayerScore } from '../../types/leaderboard'
import type { RsvpRosterEntry } from '../../types/rsvp'
import { formatSessionDate } from '../../utils/rsvpSchedule'
import { AdminRowActions } from './AdminRowActions'
import { RsvpAdminTools } from './RsvpAdminTools'
import { RsvpScheduleInfo } from './RsvpScheduleInfo'
import { Group } from './RsvpGroup'
import { SHEET_POLL_MS } from './WhosPlayingSheet'

const notMine = () => false

/** The next run's RSVP list shown inline for admins: add player / guest, remove, waitlist. Same data and actions as the dock's sheet. */
export const AdminRsvpList: React.FC<{ players: PlayerScore[] }> = ({ players }) => {
  const { settings } = useEventSettings()
  // Polls at the sheet's faster rate itself (one interval, not a second one on top of the default)
  const r = useRsvp({ isAdmin: true, settings, pollMs: SHEET_POLL_MS })
  const panel = useAdminRsvpPanel({ busy: r.adminBusy, add: r.adminAddRsvp, remove: r.adminRemoveRsvp, addGuest: r.adminAddGuest, removeGuest: r.adminRemoveGuest, renameGuest: r.adminRenameGuest })
  const capacity = r.capacity ?? 0
  const { going, waitlist, takenIds } = useMemo(() => {
    const ins = r.roster.filter((e) => e.status === 'in')
    return {
      going: ins.filter((e) => (e.position ?? 0) <= capacity),
      waitlist: ins.filter((e) => (e.position ?? 0) > capacity),
      takenIds: new Set(ins.flatMap((e) => (e.playerId ? [e.playerId] : []))),
    }
  }, [r.roster, capacity])
  const candidates = useMemo(() => players.filter((p) => !takenIds.has(p.id)), [players, takenIds])

  if (r.unavailable) return <p className="text-sm text-muted">RSVPs aren't set up on this database yet.</p>
  const empty = going.length + waitlist.length === 0

  // An optimistic row has no real id yet, so it gets no controls.
  const removeFor = (e: RsvpRosterEntry) =>
    e.rsvpId === 'pending' ? null : <AdminRowActions entry={e} roster={r.roster} players={players} panel={panel} busy={r.adminBusy} />

  return (
    <section aria-labelledby="rsvp-heading" className="overflow-hidden rounded-xl border border-line bg-surface">
      <header className="border-b border-line p-4">
        <h2 id="rsvp-heading" className="text-lg font-bold text-ink">Next RSVP list</h2>
        {r.sessionDate && <p className="text-sm text-ink-soft">{formatSessionDate(r.sessionDate)} • {r.inCount}/{capacity} in</p>}
      </header>
      <RsvpScheduleInfo sessionDate={r.sessionDate} now={r.now} settings={settings} />
      <RsvpAdminTools panel={panel} candidates={candidates} busy={r.adminBusy} />
      <div className="flex flex-col gap-4 p-4">
        {r.loading && empty ? (
          <p role="status" className="flex items-center justify-center gap-2 py-6 text-sm text-muted">
            <Loader2 className="h-4 w-4 motion-safe:animate-spin" aria-hidden="true" /> Loading the list…
          </p>
        ) : r.error && empty ? (
          <div role="alert" className="flex flex-col items-center gap-2 py-6 text-sm text-muted">
            <p>Couldn't load the list.</p>
            <button type="button" onClick={() => void r.refresh()} className="min-h-11 cursor-pointer rounded-lg border border-line px-4 font-semibold text-ink hover:bg-raised">Try again</button>
          </div>
        ) : empty ? (
          <p className="py-6 text-center text-sm text-muted">Nobody's in yet.</p>
        ) : (
          <>
            <Group title="In" people={going} isMine={notMine} action={removeFor} />
            <Group title="Waitlist" people={waitlist} isMine={notMine} action={removeFor} />
          </>
        )}
      </div>
    </section>
  )
}
