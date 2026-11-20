import React, { useEffect, useRef, useState } from 'react'
import { UserMinus } from 'lucide-react'

interface AdminRemoveButtonProps {
  /** A stable key for the element id: the player id, or the RSVP id for a guest. */
  rowId: string
  name: string
  /** Any admin change is in flight. */
  disabled: boolean
  onConfirm: () => void
}

const btn =
  'inline-flex min-h-11 cursor-pointer items-center justify-center rounded-lg px-4 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50'

/**
 * Admin-only trailing control for a row in the list: a remove button that asks first, in place
 * (no second dialog on top of the sheet). Cancelling, or Escape, puts focus back on the button.
 */
export const AdminRemoveButton: React.FC<AdminRemoveButtonProps> = ({ rowId, name, disabled, onConfirm }) => {
  const [confirming, setConfirming] = useState(false)
  const openRef = useRef<HTMLButtonElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const restoreFocus = useRef(false)

  useEffect(() => {
    if (confirming) cancelRef.current?.focus() // default to the safe choice
    else if (restoreFocus.current) {
      restoreFocus.current = false
      openRef.current?.focus()
    }
  }, [confirming])

  const cancel = () => {
    restoreFocus.current = true
    setConfirming(false)
  }

  if (!confirming) {
    return (
      <button
        ref={openRef}
        type="button"
        id={`rsvp-remove-${rowId}`}
        disabled={disabled}
        onClick={() => setConfirming(true)}
        aria-label={`Remove ${name} from the list`}
        className="inline-flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-lg text-ink-soft hover:bg-raised hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
      >
        <UserMinus className="h-5 w-5" aria-hidden="true" />
      </button>
    )
  }

  return (
    <div
      role="group"
      aria-label={`Confirm removing ${name}`}
      onKeyDown={(e) => {
        if (e.key !== 'Escape') return
        e.preventDefault()
        e.stopPropagation() // closes this question, not the whole sheet
        cancel()
      }}
      className="flex basis-full items-center gap-2 pb-2"
    >
      <span className="mr-auto min-w-0 text-sm text-ink-soft">Take {name} off the list?</span>
      <button ref={cancelRef} type="button" onClick={cancel} disabled={disabled} className={`${btn} border border-line bg-surface text-ink hover:bg-raised`}>
        Cancel
      </button>
      <button type="button" onClick={onConfirm} disabled={disabled} className={`${btn} bg-brand text-brand-ink hover:bg-brand-hover`}>
        Remove
      </button>
    </div>
  )
}
