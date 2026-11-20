import React, { useEffect, useId, useRef, useState } from 'react'
import { Check, Loader2, Pencil, X } from 'lucide-react'
import { cleanGuestName, GUEST_NAME_MAX } from '../../utils/guestName'

interface AdminRenameGuestButtonProps {
  /** The RSVP id: a stable key for the element ids (never the name). */
  rowId: string
  name: string
  /** Any admin change is in flight. */
  disabled: boolean
  /** Instant client-side check; the server re-checks everything. Returns a message or null. */
  validate: (name: string) => string | null
  /** Resolves to null on success, or the message to show under the field. */
  onSave: (name: string) => Promise<string | null>
}

const btn =
  'inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50'

/**
 * Admin-only control for a guest row: a pencil that opens an inline editor in place (no dialog on
 * top of the sheet). Enter saves, Escape cancels (and stops there, so the sheet stays open), the
 * input is disabled while saving, and a failure such as a duplicate name stays under the field.
 */
export const AdminRenameGuestButton: React.FC<AdminRenameGuestButtonProps> = ({ rowId, name, disabled, validate, onSave }) => {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(name)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const openRef = useRef<HTMLButtonElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const restoreFocus = useRef(false)
  const inputId = useId()
  const errorId = useId()

  useEffect(() => {
    if (editing) inputRef.current?.select()
    else if (restoreFocus.current) {
      restoreFocus.current = false
      openRef.current?.focus()
    }
  }, [editing])

  const open = () => {
    setValue(name)
    setError(null)
    setEditing(true)
  }
  const close = () => {
    restoreFocus.current = true
    setEditing(false)
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (saving) return
    const clean = cleanGuestName(value)
    if (clean === name) return close() // nothing changed
    const problem = validate(clean)
    if (problem) return setError(problem)
    setSaving(true)
    setError(null)
    const failure = await onSave(clean)
    setSaving(false)
    if (failure) setError(failure)
    else close()
  }

  if (!editing) {
    return (
      <button
        ref={openRef}
        type="button"
        id={`rsvp-rename-${rowId}`}
        disabled={disabled}
        onClick={open}
        aria-label={`Rename ${name}`}
        className="inline-flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-lg text-ink-soft hover:bg-raised hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Pencil className="h-5 w-5" aria-hidden="true" />
      </button>
    )
  }

  return (
    <form
      aria-label={`Rename ${name}`}
      noValidate
      onSubmit={(e) => void submit(e)}
      onKeyDown={(e) => {
        if (e.key !== 'Escape' || saving) return
        e.preventDefault()
        e.stopPropagation() // closes the editor, not the whole sheet
        close()
      }}
      className="flex basis-full flex-col gap-2 pb-2"
    >
      <div className="flex items-center gap-2">
        <label htmlFor={inputId} className="sr-only">New name for {name}</label>
        <input
          ref={inputRef}
          id={inputId}
          type="text"
          autoFocus
          value={value}
          maxLength={GUEST_NAME_MAX + 10}
          autoComplete="off"
          disabled={saving}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          onChange={(e) => {
            setValue(e.target.value)
            setError(null)
          }}
          className="min-h-11 min-w-0 flex-1 rounded-lg border border-line bg-ground px-3 text-base text-ink disabled:opacity-50"
        />
        <button type="button" onClick={close} disabled={saving} aria-label="Cancel rename" className={`${btn} border border-line bg-surface px-3 text-ink hover:bg-raised`}>
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
        <button type="submit" disabled={saving || disabled} className={`${btn} bg-brand text-brand-ink hover:bg-brand-hover`}>
          {saving ? <Loader2 className="h-4 w-4 motion-safe:animate-spin" aria-hidden="true" /> : <Check className="h-5 w-5" aria-hidden="true" />}
          Save
        </button>
      </div>
      {error && <p id={errorId} role="alert" className="text-sm text-brand-hover [overflow-wrap:anywhere]">{error}</p>}
    </form>
  )
}
