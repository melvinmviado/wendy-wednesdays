import React, { useState } from 'react'
import { Loader2 } from 'lucide-react'
import type { PlayerScore } from '../../types/leaderboard'
import { ModalShell, modalBtn, modalBtnQuiet } from './ModalShell'

interface ArchivePlayerDialogProps {
  player: PlayerScore
  onConfirm: () => Promise<boolean>
  onClose: () => void
}

export const ArchivePlayerDialog: React.FC<ArchivePlayerDialogProps> = ({ player, onConfirm, onClose }) => {
  const [busy, setBusy] = useState(false)

  const confirm = async () => {
    setBusy(true)
    await onConfirm() // failures surface as a toast and roll the list back
    onClose()
  }

  return (
    <ModalShell title={`Archive ${player.name}?`} onClose={busy ? () => {} : onClose}>
      <p className="mt-3 text-sm leading-relaxed text-ink-soft">
        They will leave the leaderboard and the weekly check-in list. Their past results stay in Weekly Results,
        and you can restore them any time from Archived players.
      </p>
      <div className="mt-5 flex justify-end gap-2">
        <button type="button" onClick={onClose} disabled={busy} className={modalBtnQuiet}>
          Cancel
        </button>
        <button type="button" onClick={confirm} disabled={busy} className={`${modalBtn} bg-brand text-brand-ink hover:bg-brand-hover`}>
          {busy && <Loader2 className="w-4 h-4 motion-safe:animate-spin" aria-hidden="true" />}
          Archive
        </button>
      </div>
    </ModalShell>
  )
}
