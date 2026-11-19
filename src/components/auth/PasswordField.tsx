import React, { useState } from 'react'
import { Eye, EyeOff, Lock } from 'lucide-react'
import { AuthField } from './AuthField'

type PasswordFieldProps = Omit<React.ComponentProps<typeof AuthField>, 'icon' | 'type' | 'trailing' | 'label'> & {
  label?: string
}

/** Password input with a show/hide toggle. */
export const PasswordField: React.FC<PasswordFieldProps> = ({ label = 'Password', disabled, ...props }) => {
  const [visible, setVisible] = useState(false)
  return (
    <AuthField
      {...props}
      label={label}
      icon={Lock}
      type={visible ? 'text' : 'password'}
      disabled={disabled}
      trailing={
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          disabled={disabled}
          aria-label={visible ? 'Hide password' : 'Show password'}
          aria-pressed={visible}
          className="p-2 rounded-md text-ink-soft hover:text-ink hover:bg-raised transition-colors cursor-pointer disabled:opacity-50"
        >
          {visible ? <EyeOff className="w-4 h-4" aria-hidden="true" /> : <Eye className="w-4 h-4" aria-hidden="true" />}
        </button>
      }
    />
  )
}
