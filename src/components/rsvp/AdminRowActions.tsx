import React, { useCallback } from 'react'
import type { useAdminRsvpPanel } from '../../hooks/useAdminRsvpPanel'
import type { PlayerScore } from '../../types/leaderboard'
import type { RsvpRosterEntry } from '../../types/rsvp'
import { validateGuestName } from '../../utils/guestName'
import { AdminRemoveButton } from './AdminRemoveButton'
import { AdminRenameGuestButton } from './AdminRenameGuestButton'

interface AdminRowActionsProps {
  entry: RsvpRosterEntry
  roster: RsvpRosterEntry[]
  players: PlayerScore[]
  panel: ReturnType<typeof useAdminRsvpPanel>
  /** Any admin change is in flight. */
  busy: boolean
}

/**
 * Admin-only trailing controls for a roster row. A guest can be renamed and removed; a player can
 * only be removed (players are renamed on the Players page). Players go by player id, guests by
 * their RSVP id, never by name.
 */
export const AdminRowActions: React.FC<AdminRowActionsProps> = ({ entry, roster, players, panel, busy }) => {
  const { playerId, rsvpId, name, isGuest } = entry
  const { renameGuest } = panel
  const validate = useCallback(
    (next: string) =>
      validateGuestName(next, players, roster.filter((e) => e.isGuest).map((e) => ({ id: e.rsvpId, name: e.name })), rsvpId),
    [players, roster, rsvpId],
  )
  const save = useCallback((next: string) => renameGuest({ id: rsvpId, name }, next), [renameGuest, rsvpId, name])
  const confirm = () => void (playerId ? panel.remove({ id: playerId, name }) : panel.removeGuest({ id: rsvpId, name }))

  return (
    <>
      {isGuest && <AdminRenameGuestButton rowId={rsvpId} name={name} disabled={busy} validate={validate} onSave={save} />}
      <AdminRemoveButton rowId={playerId ?? rsvpId} name={name} disabled={busy} onConfirm={confirm} />
    </>
  )
}
