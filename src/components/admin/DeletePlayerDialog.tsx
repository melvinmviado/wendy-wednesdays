import React, { useEffect, useState } from 'react'
import { AlertTriangle, Loader2 } from 'lucide-react'
import type { PlayerScore } from '../../types/leaderboard'
import { getPlayerScoreCount } from '../../data/players'
import { ModalShell, modalBtn, modalBtnQuiet } from './ModalShell'

interface DeletePlayerDialogProps {
  player: PlayerScore
  onConfirm: () => Promise<boolean>
  /** Offered when the player has history. Omit for players who are already archived. */
  onArchiveInstead?: () => void
  onClose: () => void
}

export const DeletePlayerDialog: React.FC<DeletePlayerDialogProps> = ({ player, onConfirm, onArchiveInstead, onClose }) => {
  const [typed, setTyped] = useState('')
  const [weeks, setWeeks] = useState<number | null>(null)
  const [countFailed, setCountFailed] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    getPlayerScoreCount(player.id).then((res) => {
      if (cancelled) return
      if (res.ok) setWeeks(res.data)
      else setCountFailed(true)
    })
    return () => {
      cancelled = true
    }
  }, [player.id])

  const matches = typed.trim() === player.name.trim()
  const hasHistory = (weeks ?? 0) > 0

  const confirm = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!matches || busy) return
    setBusy(true)
    await onConfirm()
    onClose()
  }

  return (
    <ModalShell title={`Delete ${player.name}?`} onClose={busy ? () => {} : onClose}>
      <form onSubmit={confirm} className="mt-3 flex flex-col gap-4">
        <div className="flex gap-3 rounded-lg border border-brand bg-brand-soft p-3 text-sm text-ink">
          <AlertTriangle className="w-5 h-5 shrink-0 text-brand-hover" aria-hidden="true" />
          <div className="space-y-1.5" aria-live="polite">
            <p className="font-semibold">This cannot be undone.</p>
            {weeks === null && !countFailed && <p className="text-ink-soft">Checking their results...</p>}
            {countFailed && <p className="text-ink-soft">Could not check their results. Deleting also erases any they have.</p>}
            {weeks !== null && !hasHistory && <p className="text-ink-soft">They have no recorded weeks.</p>}
            {hasHistory && (
              <p className="text-ink-soft">
                Deleting erases their {weeks} recorded {weeks === 1 ? 'week' : 'weeks'} of results. Other players'
                points are not recalculated, but past weekly results and teams will change.
              </p>
            )}
          </div>
        </div>

        {hasHistory && onArchiveInstead && (
          <p className="text-sm text-ink-soft">
            To keep their history,{' '}
            <button type="button" onClick={onArchiveInstead} disabled={busy} className="font-semibold text-ink underline cursor-pointer">
              archive instead
            </button>
            .
          </p>
        )}

        <div className="flex flex-col gap-1.5">
          <label htmlFor="delete-player-confirm" className="text-sm font-semibold text-ink-soft">
            Type <span className="text-ink">{player.name}</span> to confirm
          </label>
          <input
            id="delete-player-confirm"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoComplete="off"
            disabled={busy}
            className="min-h-10 rounded-lg bg-ground border border-line px-3 text-ink"
          />
        </div>

        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={busy} className={modalBtnQuiet}>
            Cancel
          </button>
          <button type="submit" disabled={!matches || busy} className={`${modalBtn} bg-brand text-brand-ink hover:bg-brand-hover`}>
            {busy && <Loader2 className="w-4 h-4 motion-safe:animate-spin" aria-hidden="true" />}
            Delete permanently
          </button>
        </div>
      </form>
    </ModalShell>
  )
}
