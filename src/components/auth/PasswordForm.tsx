import React, { useRef, useState } from 'react'
import { Loader2, Mail } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import type { AuthSubmit } from '../../hooks/useAuthSubmit'
import { validateEmail, validatePassword } from '../../utils/authValidation'
import { AuthField } from './AuthField'
import { PasswordField } from './PasswordField'
import { authBtnBrand } from './authStyles'

interface PasswordFormProps {
  mode: 'signin' | 'signup'
  submit: AuthSubmit
  onSignedIn: () => void
  onNeedsConfirmation: (email: string) => void
}

export const PasswordForm: React.FC<PasswordFormProps> = ({ mode, submit, onSignedIn, onNeedsConfirmation }) => {
  const { signInWithPassword, signUpWithPassword } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({})
  const formRef = useRef<HTMLFormElement>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const next = {
      email: validateEmail(email) ?? undefined,
      password: validatePassword(password, mode) ?? undefined,
    }
    setErrors(next)
    if (next.email || next.password) {
      formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
      return
    }

    if (mode === 'signin') {
      const res = await submit.run(() => signInWithPassword(email, password))
      if (res && !res.error) onSignedIn()
      return
    }
    const res = await submit.run(() => signUpWithPassword(email, password))
    if (!res || res.error) return
    // Confirmation off: a session already exists. Confirmation on: wait for the emailed link.
    if (res.needsEmailConfirmation) onNeedsConfirmation(email.trim())
    else onSignedIn()
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} noValidate className="space-y-4">
      <AuthField
        label="Email"
        icon={Mail}
        type="email"
        autoComplete="email"
        inputMode="email"
        placeholder="you@example.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        error={errors.email}
        disabled={submit.busy}
      />
      <PasswordField
        autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
        placeholder="••••••••"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        error={errors.password}
        disabled={submit.busy}
      />
      <button type="submit" disabled={submit.busy} className={authBtnBrand}>
        {submit.busy && <Loader2 className="w-4 h-4 motion-safe:animate-spin" aria-hidden="true" />}
        <span>{mode === 'signin' ? (submit.busy ? 'Signing in…' : 'Sign in') : submit.busy ? 'Creating account…' : 'Create account'}</span>
      </button>
    </form>
  )
}
