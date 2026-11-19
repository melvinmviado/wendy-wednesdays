import React from 'react'
import { MailCheck } from 'lucide-react'
import { authBtnQuiet } from './authStyles'

interface CheckEmailProps {
  email: string
  kind: 'magic' | 'confirm'
  onBack: () => void
}

/** Confirmation state after a magic link or a confirm-your-email sign-up. */
export const CheckEmail: React.FC<CheckEmailProps> = ({ email, kind, onBack }) => (
  <div role="status" className="flex flex-col items-center gap-3 text-center py-2">
    <div className="w-12 h-12 rounded-2xl bg-brand-soft border border-brand flex items-center justify-center text-brand-hover">
      <MailCheck className="w-6 h-6" aria-hidden="true" />
    </div>
    <h3 className="text-lg font-bold text-ink">Check your email</h3>
    <p className="text-sm text-ink-soft leading-relaxed">
      {kind === 'magic' ? 'We sent a sign-in link to ' : 'We sent a confirmation link to '}
      <span className="font-semibold text-ink break-all">{email}</span>. Open it on this device to finish.
    </p>
    <p className="text-sm text-muted">Nothing there? Check spam, or try again in a minute.</p>
    <button type="button" onClick={onBack} className={`${authBtnQuiet} mt-2`}>
      Use a different email
    </button>
  </div>
)
