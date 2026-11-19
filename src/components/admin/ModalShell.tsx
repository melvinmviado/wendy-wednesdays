import React, { useId, useRef } from 'react'
import { X } from 'lucide-react'
import { useDialogBehavior } from '../../hooks/useDialogBehavior'

interface ModalShellProps {
  title: string
  onClose: () => void
  children: React.ReactNode
}

/** Overlay + dialog panel with Escape, focus trap, scroll lock and focus restore (via useDialogBehavior). */
export const ModalShell: React.FC<ModalShellProps> = ({ title, onClose, children }) => {
  const panelRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  useDialogBehavior(true, panelRef, onClose)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ground/90" onClick={onClose}>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-md rounded-2xl border border-line bg-surface p-6 outline-none"
      >
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute right-4 top-4 p-1.5 rounded-lg text-ink-soft hover:text-ink hover:bg-raised transition-colors cursor-pointer"
        >
          <X className="w-5 h-5" aria-hidden="true" />
        </button>
        <h2 id={titleId} className="pr-8 text-lg font-bold text-ink">
          {title}
        </h2>
        {children}
      </div>
    </div>
  )
}

export const modalBtn =
  'inline-flex items-center justify-center gap-2 min-h-10 px-4 rounded-lg text-sm font-semibold transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed'
export const modalBtnQuiet = `${modalBtn} border border-line bg-surface text-ink hover:bg-raised`
export const modalBtnDanger = `${modalBtn} bg-brand text-brand-ink hover:bg-brand-hover`
