import React from 'react'
import { CheckCircle2, AlertCircle, X } from 'lucide-react'
import type { Toast } from '../../hooks/useToasts'

interface ToastsProps {
  toasts: Toast[]
  onDismiss: (id: number) => void
}

export const Toasts: React.FC<ToastsProps> = ({ toasts, onDismiss }) => (
  <div aria-live="polite" className="fixed bottom-4 right-4 left-4 sm:left-auto z-[60] flex flex-col gap-2 sm:w-96">
    {toasts.map((t) => (
      <div
        key={t.id}
        role={t.kind === 'error' ? 'alert' : 'status'}
        className={`flex items-start gap-3 rounded-lg border bg-surface p-3.5 text-sm text-ink shadow-lg ${
          t.kind === 'error' ? 'border-brand' : 'border-ok/50'
        }`}
      >
        {t.kind === 'error' ? (
          <AlertCircle className="w-5 h-5 shrink-0 text-brand-hover" aria-hidden="true" />
        ) : (
          <CheckCircle2 className="w-5 h-5 shrink-0 text-ok" aria-hidden="true" />
        )}
        <p className="flex-1 min-w-0 wrap-break-word">{t.message}</p>
        <button
          onClick={() => onDismiss(t.id)}
          aria-label="Dismiss notification"
          className="shrink-0 rounded p-0.5 text-ink-soft hover:text-ink cursor-pointer"
        >
          <X className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>
    ))}
  </div>
)
