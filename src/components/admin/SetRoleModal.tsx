import React, { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import type { PlayerScore } from '../../types/leaderboard'
import { PLAYER_ROLES, type PlayerRole } from '../../types/roles'
import { ModalShell, modalBtn, modalBtnQuiet } from './ModalShell'

interface SetRoleModalProps {
  player: PlayerScore
  /** False once the player has been deleted elsewhere: the modal closes itself. */
  exists: boolean
  saving: boolean
  error: string | null
  onSave: (role: PlayerRole | null) => Promise<boolean>
  onClose: () => void
}

const OPTION =
  'flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-line px-3 text-sm text-ink hover:bg-raised has-[:checked]:bg-raised has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand'

/** One cosmetic role per player (radio group, with "No role"). Roles never grant admin access. */
export const SetRoleModal: React.FC<SetRoleModalProps> = ({ player, exists, saving, error, onSave, onClose }) => {
  const initial = player.role ?? null
  const [role, setRole] = useState<PlayerRole | null>(initial)
  const changed = role !== initial

  useEffect(() => {
    if (!exists) onClose()
  }, [exists, onClose])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (saving || !changed) return // also swallows a double-click / double-Enter
    if (await onSave(role)) onClose()
  }

  return (
    <ModalShell title={`Set role for ${player.name}`} onClose={saving ? () => {} : onClose}>
      <form onSubmit={submit} className="mt-4 flex flex-col gap-4" noValidate>
        <fieldset disabled={saving} className="flex flex-col gap-2">
          <legend className="mb-1 text-sm text-ink-soft">
            A label shown as a badge on the player's profile. It does not change what they can do.
          </legend>
          {PLAYER_ROLES.map((r) => (
            <label key={r.key} className={OPTION}>
              <input type="radio" name="player-role" checked={role === r.key} onChange={() => setRole(r.key)} className="accent-brand" />
              {r.label}
            </label>
          ))}
          <label className={OPTION}>
            <input type="radio" name="player-role" checked={role === null} onChange={() => setRole(null)} className="accent-brand" />
            <span className="text-ink-soft">No role</span>
          </label>
        </fieldset>

        {error && (
          <p role="alert" className="text-sm text-brand-hover [overflow-wrap:anywhere]">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={saving} className={modalBtnQuiet}>
            Cancel
          </button>
          <button type="submit" disabled={saving || !changed} className={`${modalBtn} bg-brand text-brand-ink hover:bg-brand-hover`}>
            {saving && <Loader2 className="h-4 w-4 motion-safe:animate-spin" aria-hidden="true" />}
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </ModalShell>
  )
}
