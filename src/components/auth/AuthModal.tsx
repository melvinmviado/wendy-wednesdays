import React, { useEffect, useRef, useState } from 'react'
import { AlertCircle } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useAuthSubmit } from '../../hooks/useAuthSubmit'
import { ModalShell } from '../admin/ModalShell'
import { CheckEmail } from './CheckEmail'
import { DemoModeNotice } from './DemoModeNotice'
import { GoogleButton } from './GoogleButton'
import { MagicLinkForm } from './MagicLinkForm'
import { PasswordForm } from './PasswordForm'
import { authLink } from './authStyles'

interface AuthModalProps {
  isOpen: boolean
  onClose: () => void
}

type Tab = 'signin' | 'signup'
type Method = 'password' | 'magic'

// Hide the button with VITE_GOOGLE_AUTH_ENABLED=false. Left on, a switched-off provider fails with a friendly message.
const googleEnabled = import.meta.env.VITE_GOOGLE_AUTH_ENABLED !== 'false'

const TABS: [Tab, string][] = [['signin', 'Sign in'], ['signup', 'Create account']]

const AuthDialog: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { returnError, isSignedIn } = useAuth()
  const submit = useAuthSubmit()
  const startedSignedIn = useRef(isSignedIn)
  const [tab, setTab] = useState<Tab>('signin')
  const [method, setMethod] = useState<Method>('password')
  const [sent, setSent] = useState<{ email: string; kind: 'magic' | 'confirm' } | null>(null)
  const bodyRef = useRef<HTMLDivElement>(null)

  // Whatever method signed the user in (password, sign-up with a session, Google in demo), close once it did.
  useEffect(() => {
    if (isSignedIn && !startedSignedIn.current) onClose()
  }, [isSignedIn, onClose])

  // Focus the first field when the view changes. Deferred so it lands after the dialog's own initial focus.
  useEffect(() => {
    const t = setTimeout(() => bodyRef.current?.querySelector<HTMLElement>('input')?.focus(), 0)
    return () => clearTimeout(t)
  }, [tab, method, sent])

  const switchTab = (next: Tab) => {
    if (submit.busy) return
    setTab(next)
    setMethod('password')
    setSent(null)
    submit.clearError()
  }

  const error = submit.error ?? returnError

  return (
    <ModalShell title={tab === 'signin' ? 'Sign in' : 'Create your account'} onClose={onClose}>
      <p className="mt-1 text-sm text-ink-soft">
        {tab === 'signin' ? 'Welcome back to Wendy Wednesdays.' : 'Join with your email or Google. It only takes a moment.'}
      </p>

      <DemoModeNotice />

      <div role="tablist" aria-label="Account" className="mt-5 flex p-1 rounded-xl bg-ground border border-line">
        {TABS.map(([id, label]) => (
          <button
            key={id}
            role="tab"
            type="button"
            aria-selected={tab === id}
            disabled={submit.busy}
            onClick={() => switchTab(id)}
            className={`flex-1 min-h-10 px-3 rounded-lg text-sm font-semibold transition-colors cursor-pointer disabled:cursor-not-allowed ${
              tab === id ? 'bg-brand text-brand-ink' : 'text-ink-soft hover:text-ink'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {error && (
        <p role="alert" className="mt-4 pl-4 border-l-2 border-brand text-sm text-ink flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 text-brand-hover" aria-hidden="true" />
          <span>{error.message}</span>
        </p>
      )}

      <div ref={bodyRef} className="mt-5 space-y-4">
        {sent ? (
          <CheckEmail {...sent} onBack={() => setSent(null)} />
        ) : (
          <>
            {googleEnabled && (
              <>
                <GoogleButton submit={submit} />
                <div className="flex items-center gap-3 text-xs text-muted" aria-hidden="true">
                  <span className="h-px flex-1 bg-line" />
                  <span>or</span>
                  <span className="h-px flex-1 bg-line" />
                </div>
              </>
            )}

            {method === 'password' ? (
              <PasswordForm
                key={tab}
                mode={tab}
                submit={submit}
                onSignedIn={onClose}
                onNeedsConfirmation={(email) => setSent({ email, kind: 'confirm' })}
              />
            ) : (
              <MagicLinkForm key={tab} mode={tab} submit={submit} onSent={(email) => setSent({ email, kind: 'magic' })} />
            )}

            <div className="text-center">
              <button
                type="button"
                disabled={submit.busy}
                onClick={() => {
                  submit.clearError()
                  setMethod(method === 'password' ? 'magic' : 'password')
                }}
                className={authLink}
              >
                {method === 'password' ? 'Email me a link instead' : 'Use a password instead'}
              </button>
            </div>
          </>
        )}
      </div>
    </ModalShell>
  )
}

/** Sign in / create account, with password, email link and Google. Admins use the same form. */
export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose }) => {
  const { returnError, dismissReturnError } = useAuth()
  if (!isOpen) return null
  return (
    <AuthDialog
      onClose={() => {
        if (returnError) dismissReturnError()
        onClose()
      }}
    />
  )
}
