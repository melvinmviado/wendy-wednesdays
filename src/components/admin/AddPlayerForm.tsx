import React, { useState } from 'react'
import { Loader2, UserPlus } from 'lucide-react'
import type { PlayerScore, Result } from '../../types/leaderboard'

interface AddPlayerFormProps {
  onAdd: (name: string) => Promise<Result<PlayerScore>>
}

/** Inline "Add player" form: just a name. Shows the server's reason (e.g. duplicate name) under the field. */
export const AddPlayerForm: React.FC<AddPlayerFormProps> = ({ onAdd }) => {
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (busy) return
    if (!name.trim()) return setError('Enter a player name.')
    setBusy(true)
    setError(null)
    const res = await onAdd(name)
    setBusy(false)
    if (res.ok) setName('')
    else setError(res.error.message)
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2" noValidate>
      <label htmlFor="new-player-name" className="text-sm font-semibold text-ink-soft">
        Player name
      </label>
      <div className="flex gap-2">
        <input
          id="new-player-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Jordan Hayes"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? 'new-player-error' : undefined}
          className="min-h-11 min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 text-ink placeholder:text-muted"
        />
        <button
          type="submit"
          disabled={busy}
          className="inline-flex min-h-11 shrink-0 cursor-pointer items-center gap-2 rounded-lg bg-brand px-4 text-sm font-semibold text-brand-ink hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 motion-safe:animate-spin" aria-hidden="true" /> : <UserPlus className="h-4 w-4" aria-hidden="true" />}
          Add
        </button>
      </div>
      <p id="new-player-error" role="alert" className={error ? 'text-sm text-brand-hover [overflow-wrap:anywhere]' : 'sr-only'}>
        {error}
      </p>
    </form>
  )
}
