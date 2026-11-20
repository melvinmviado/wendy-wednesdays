import React, { useEffect, useId, useRef, useState } from 'react'
import { UserPlus, X } from 'lucide-react'
import { cleanGuestName, GUEST_NAME_MAX, GUEST_NAME_MIN } from '../../utils/guestName'

interface AdminAddGuestFormProps {
  /** Any admin change is in flight. */
  busy: boolean
  /** Resolves true when the guest went on the list. */
  onAdd: (name: string) => Promise<boolean>
  onClose: () => void
}

/**
 * Admin-only form for putting a named guest on the list. Enter or the Add button submits, the
 * form stays open for the next guest, and Escape closes it (not the sheet). The server decides
 * whether the name is valid, so its message (for example "Did you mean ...") is shown as-is.
 */
export const AdminAddGuestForm: React.FC<AdminAddGuestFormProps> = ({ busy, onAdd, onClose }) => {
  const [name, setName] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const inputId = useId()
  const trimmed = cleanGuestName(name)
  const valid = trimmed.length >= GUEST_NAME_MIN && trimmed.length <= GUEST_NAME_MAX

  useEffect(() => inputRef.current?.focus(), [])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!valid || busy) return
    if (await onAdd(trimmed)) setName('')
    inputRef.current?.focus()
  }

  return (
    <form
      aria-label="Add a guest"
      onSubmit={(e) => void submit(e)}
      onKeyDown={(e) => {
        if (e.key !== 'Escape') return
        e.preventDefault()
        e.stopPropagation()
        onClose()
      }}
      className="flex flex-col gap-2 rounded-xl border border-line bg-ground p-3"
    >
      <div className="flex items-center gap-2">
        <h3 className="flex-1 text-sm font-bold text-ink">Add a guest</h3>
        <button type="button" onClick={onClose} aria-label="Close add guest" className="inline-flex h-11 w-11 cursor-pointer items-center justify-center rounded-lg text-ink-soft hover:bg-raised hover:text-ink">
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>
      <div className="flex gap-2">
        <label htmlFor={inputId} className="sr-only">Guest name</label>
        <input
          ref={inputRef}
          id={inputId}
          type="text"
          value={name}
          maxLength={GUEST_NAME_MAX}
          autoComplete="off"
          onChange={(e) => setName(e.target.value)}
          placeholder="Guest's name"
          className="min-h-11 min-w-0 flex-1 rounded-lg border border-line bg-ground px-3 text-base text-ink placeholder:text-muted"
        />
        <button
          type="submit"
          disabled={!valid || busy}
          className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-lg bg-brand px-4 text-sm font-bold text-brand-ink hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          <UserPlus className="h-5 w-5" aria-hidden="true" /> Add
        </button>
      </div>
    </form>
  )
}
