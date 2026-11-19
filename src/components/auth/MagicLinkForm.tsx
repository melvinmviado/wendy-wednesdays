import React, { useState } from 'react'
import { Loader2, Mail, Send } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import type { AuthSubmit } from '../../hooks/useAuthSubmit'
import { validateEmail } from '../../utils/authValidation'
import { AuthField } from './AuthField'
import { authBtnBrand } from './authStyles'

interface MagicLinkFormProps {
  mode: 'signin' | 'signup'
  submit: AuthSubmit
  onSent: (email: string) => void
}

/** "Email me a link": works for both sign-in and sign-up, since the link creates the account if needed. */
export const MagicLinkForm: React.FC<MagicLinkFormProps> = ({ mode, submit, onSent }) => {
  const { sendMagicLink } = useAuth()
  const [email, setEmail] = useState('')
  const [emailError, setEmailError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const problem = validateEmail(email)
    setEmailError(problem)
    if (problem) return
    const res = await submit.run(() => sendMagicLink(email))
    if (res && !res.error) onSent(email.trim())
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      <AuthField
        label="Email"
        icon={Mail}
        type="email"
        autoComplete="email"
        inputMode="email"
        placeholder="you@example.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        error={emailError}
        disabled={submit.busy}
      />
      <button type="submit" disabled={submit.busy} className={authBtnBrand}>
        {submit.busy ? (
          <Loader2 className="w-4 h-4 motion-safe:animate-spin" aria-hidden="true" />
        ) : (
          <Send className="w-4 h-4" aria-hidden="true" />
        )}
        <span>{submit.busy ? 'Sending…' : mode === 'signin' ? 'Email me a sign-in link' : 'Email me a link to join'}</span>
      </button>
    </form>
  )
}
