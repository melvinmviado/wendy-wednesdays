import React, { useEffect, useRef } from 'react'
import { X } from 'lucide-react'

const TOPICS: { title: string; body: string }[] = [
  {
    title: 'Seating',
    body: 'Tap a name in the roster to seat that player in the next open slot. Being seated means they attended. Tap in finishing order: the 1st and 2nd players tapped are the winning team, the 3rd and 4th are the runners-up, then the next court starts. Courts are added automatically. Tap an empty slot first to choose exactly where the next player goes.',
  },
  {
    title: 'Swap',
    body: 'Tap a seated player (on the court or dimmed in the roster), then tap another seated player. The two trade places and each takes the points of the slot they land in.',
  },
  {
    title: 'Move',
    body: 'Tap a seated player, then tap an empty slot, on any court. They move there and their old slot opens up. Tap the same player again, or Cancel, to back out.',
  },
  {
    title: 'Remove',
    body: 'Press the X on a seated player, or Remove in the bar that appears after tapping them. Removing means the player did not attend that week. They go back to the unseated part of the roster and are marked absent when you save.',
  },
  {
    title: 'Quick add',
    body: 'Type a new name in "Quick add player" and press Add. The player is created and seated straight away.',
  },
  {
    title: 'Select All',
    body: 'Seats the whole roster in roster order. If anyone is already seated you are asked first, because it replaces the current placement and resets points to their defaults.',
  },
  {
    title: 'Reset Courts',
    body: 'Removes every player from the courts after you confirm. Nothing is saved until you press Save, so switching weeks or reloading the page discards unsaved changes.',
  },
  {
    title: 'Points and saving',
    body: 'Each team has one points stepper (steps of 5) shared by both partners. Courts with fewer than four players are allowed, but you are asked to confirm. Save writes attendance and points for the week and recomputes the leaderboard.',
  },
]

export const HelpModal: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => {
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="entry-help-title"
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-t-2xl border border-line bg-surface shadow-2xl sm:rounded-2xl"
      >
        <header className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
          <h3 id="entry-help-title" className="text-lg font-black text-ink">
            How weekly entry works
          </h3>
          <button
            ref={closeRef}
            onClick={onClose}
            aria-label="Close help"
            className="flex h-11 w-11 items-center justify-center rounded-lg border border-line bg-raised text-ink-soft hover:text-ink cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </header>
        <dl className="flex flex-col gap-4 overflow-y-auto px-5 py-4">
          {TOPICS.map((t) => (
            <div key={t.title}>
              <dt className="text-base font-bold text-ink">{t.title}</dt>
              <dd className="mt-1 text-base text-ink-soft">{t.body}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  )
}
