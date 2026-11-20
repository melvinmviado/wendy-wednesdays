import React from 'react'
import { AlertCircle, TriangleAlert, type LucideIcon } from 'lucide-react'

interface DateTimeFieldProps {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  onBlur: () => void
  icon: LucideIcon
  error?: string
  warning?: string
  hint?: string
}

/** A labelled date + time input. Messages sit in a live region so a screen reader hears them appear. */
export const DateTimeField: React.FC<DateTimeFieldProps> = ({ id, label, value, onChange, onBlur, icon: Icon, error, warning, hint }) => {
  const describedBy = [hint && `${id}-hint`, `${id}-msg`].filter(Boolean).join(' ')
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-semibold text-ink">{label}</label>
      <div className="relative">
        <Icon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden="true" />
        <input
          id={id}
          type="datetime-local"
          step={60}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={`min-h-11 w-full rounded-lg border bg-ground py-2 pl-9 pr-3 text-ink [color-scheme:dark] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-hover ${
            error ? 'border-brand' : 'border-line'
          }`}
        />
      </div>
      {hint && <p id={`${id}-hint`} className="text-xs text-muted">{hint}</p>}
      <div id={`${id}-msg`} aria-live="polite">
        {error && (
          <p className="flex items-start gap-1.5 text-sm text-brand-hover">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> {error}
          </p>
        )}
        {!error && warning && (
          <p className="flex items-start gap-1.5 text-sm text-gold">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> {warning}
          </p>
        )}
      </div>
    </div>
  )
}
