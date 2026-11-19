import React, { useEffect, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import type { PlayerScore, Result } from '../../types/leaderboard'
import { MAX_PLAYER_NAME_LENGTH, validatePlayerName } from '../../utils/playerName'
import { ModalShell, modalBtn, modalBtnQuiet } from './ModalShell'

interface RenamePlayerModalProps {
  player: PlayerScore
  activePlayers: PlayerScore[]
  onSubmit: (name: string) => Promise<Result<PlayerScore>>
  onClose: () => void
}

export const RenamePlayerModal: React.FC<RenamePlayerModalProps> = ({ player, activePlayers, onSubmit, onClose }) => {
  const [name, setName] = useState(player.name)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // useDialogBehavior focuses the panel on mount; take focus back for the input afterwards
  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.select(), 0)
    return () => clearTimeout(t)
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (saving) return
    const problem = validatePlayerName(name, activePlayers, player.id)
    if (problem) {
      setError(problem)
      return
    }
    if (name.trim() === player.name) {
      onClose()
      return
    }
    setSaving(true)
    setError(null)
    const result = await onSubmit(name.trim())
    if (result.ok) {
      onClose()
    } else {
      setError(result.error.message)
      setSaving(false)
    }
  }

  return (
    <ModalShell title="Rename player" onClose={saving ? () => {} : onClose}>
      <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-4" noValidate>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="rename-player-name" className="text-sm font-semibold text-ink-soft">
            Name
          </label>
          <input
            id="rename-player-name"
            ref={inputRef}
            value={name}
            onChange={(e) => {
              setName(e.target.value)
              setError(null)
            }}
            maxLength={MAX_PLAYER_NAME_LENGTH + 10}
            autoComplete="off"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? 'rename-player-error' : undefined}
            disabled={saving}
            className="min-h-10 rounded-lg bg-ground border border-line px-3 text-ink"
          />
          {error && (
            <p id="rename-player-error" role="alert" className="text-sm text-brand-hover">
              {error}
            </p>
          )}
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={saving} className={modalBtnQuiet}>
            Cancel
          </button>
          <button type="submit" disabled={saving} className={`${modalBtn} bg-brand text-brand-ink hover:bg-brand-hover`}>
            {saving && <Loader2 className="w-4 h-4 motion-safe:animate-spin" aria-hidden="true" />}
            Save
          </button>
        </div>
      </form>
    </ModalShell>
  )
}
