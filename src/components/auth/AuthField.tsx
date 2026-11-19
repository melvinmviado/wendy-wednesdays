import React, { useId } from 'react'
import type { LucideIcon } from 'lucide-react'
import { authField } from './authStyles'

type AuthFieldProps = Omit<React.ComponentProps<'input'>, 'id'> & {
  label: string
  icon: LucideIcon
  error?: string | null
  /** Control rendered inside the input's right edge (e.g. a show/hide toggle). */
  trailing?: React.ReactNode
}

/** Labelled input with a leading icon and an inline, screen-reader-linked error. */
export const AuthField: React.FC<AuthFieldProps> = ({ label, icon: Icon, error, trailing, className, ...input }) => {
  const id = useId()
  const errorId = `${id}-error`
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-semibold text-ink mb-1.5">
        {label}
      </label>
      <div className="relative">
        <Icon className="w-4 h-4 text-muted absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" aria-hidden="true" />
        <input
          {...input}
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          className={`${authField} pl-9 ${trailing ? 'pr-11' : 'pr-3.5'} ${error ? 'border-brand' : 'border-line'} ${className ?? ''}`}
        />
        {trailing && <div className="absolute right-1 top-1/2 -translate-y-1/2">{trailing}</div>}
      </div>
      {error && (
        <p id={errorId} className="mt-1.5 text-sm text-brand-hover">
          {error}
        </p>
      )}
    </div>
  )
}
