import { useCallback, useState } from 'react'
import { formatSessionDate } from '../utils/rsvpSchedule'
import { ADMIN_ONLY_MESSAGE, RsvpError, type AdminGuestRemoveResult, type AdminGuestRenameResult, type AdminGuestTarget, type AdminRsvpResult, type AdminRsvpTarget, type RsvpAdminActions, type RsvpResult } from '../types/rsvp'

const NOT_ADMIN = new RsvpError('FORBIDDEN', { message: ADMIN_ONLY_MESSAGE })

export interface AdminNotice {
  kind: 'success' | 'error'
  text: string
}

/**
 * Feedback for the admin controls on the list sheet. The list updates optimistically, so a row
 * can vanish before the server answers: the outcome is therefore kept here, above the rows,
 * rather than inside a row that may no longer exist. `admin` is undefined for non-admins, and
 * then both actions fail safely with a message. The database is the real gate.
 */
export function useAdminRsvpPanel(admin: RsvpAdminActions | undefined) {
  const [notice, setNotice] = useState<AdminNotice | null>(null)

  const finish = useCallback(
    (res: RsvpResult<AdminRsvpResult>, success: (r: AdminRsvpResult) => string): boolean => {
      setNotice(res.ok ? { kind: 'success', text: success(res.data) } : { kind: 'error', text: res.error.message })
      return res.ok
    },
    [],
  )

  /** Resolves true when the server accepted the change (including "already done"). */
  const add = useCallback(
    async (player: AdminRsvpTarget): Promise<boolean> => {
      if (!admin) return finish({ ok: false, error: NOT_ADMIN }, () => '')
      setNotice(null)
      return finish(await admin.add(player), (r) =>
        !r.changed
          ? `${player.name} is already on the list for ${formatSessionDate(r.sessionDate)}.`
          : r.waitlistPosition
            ? `${player.name} added to the ${formatSessionDate(r.sessionDate)} waitlist (#${r.waitlistPosition}).`
            : `${player.name} added for ${formatSessionDate(r.sessionDate)}.`,
      )
    },
    [admin, finish],
  )

  const remove = useCallback(
    async (player: AdminRsvpTarget): Promise<boolean> => {
      if (!admin) return finish({ ok: false, error: NOT_ADMIN }, () => '')
      setNotice(null)
      return finish(await admin.remove(player), (r) => (r.changed ? `${player.name} removed for ${formatSessionDate(r.sessionDate)}.` : `${player.name} wasn't on the ${formatSessionDate(r.sessionDate)} list.`))
    },
    [admin, finish],
  )

  /** Resolves true when the guest was added (or was already on the list). */
  const addGuest = useCallback(
    async (name: string): Promise<boolean> => {
      if (!admin) return finish({ ok: false, error: NOT_ADMIN }, () => '')
      setNotice(null)
      return finish(await admin.addGuest(name), (r) =>
        !r.changed
          ? `${name} is already on the list for ${formatSessionDate(r.sessionDate)}.`
          : r.waitlistPosition
            ? `${name} added as a guest to the ${formatSessionDate(r.sessionDate)} waitlist (#${r.waitlistPosition}).`
            : `${name} added as a guest for ${formatSessionDate(r.sessionDate)}.`,
      )
    },
    [admin, finish],
  )

  /** Resolves true when the guest is gone (including "was already gone"). */
  const removeGuest = useCallback(
    async (guest: AdminGuestTarget): Promise<boolean> => {
      if (!admin) {
        setNotice({ kind: 'error', text: NOT_ADMIN.message })
        return false
      }
      setNotice(null)
      const res: RsvpResult<AdminGuestRemoveResult> = await admin.removeGuest(guest)
      setNotice(
        res.ok
          ? { kind: 'success', text: res.data.changed ? `${guest.name} removed (guest).` : `${guest.name} was already off the list.` }
          : { kind: 'error', text: res.error.message },
      )
      return res.ok
    },
    [admin],
  )

  /**
   * Resolves to null on success, else the message to show next to the field. The inline editor
   * shows failures itself, so only success goes to the shared notice.
   */
  const renameGuest = useCallback(
    async (guest: AdminGuestTarget, name: string): Promise<string | null> => {
      if (!admin) return NOT_ADMIN.message
      setNotice(null)
      const res: RsvpResult<AdminGuestRenameResult> = await admin.renameGuest(guest, name)
      if (!res.ok) return res.error.message
      setNotice({ kind: 'success', text: res.data.changed ? `${guest.name} renamed to ${res.data.name}.` : `${guest.name} already has that name.` })
      return null
    },
    [admin],
  )

  const clearNotice = useCallback(() => setNotice(null), [])

  return { notice, add, remove, addGuest, removeGuest, renameGuest, clearNotice }
}
