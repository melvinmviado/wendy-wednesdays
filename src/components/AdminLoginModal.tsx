import React, { useEffect, useRef, useState } from 'react'
import { ShieldCheck, Lock, Mail, X, AlertCircle, KeyRound } from 'lucide-react'
import { useAuth } from '../context/AuthContext'

interface AdminLoginModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess?: () => void
}

export const AdminLoginModal: React.FC<AdminLoginModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const { signIn, isConfigured } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showConfig, setShowConfig] = useState(false)
  const [tempUrl, setTempUrl] = useState('')
  const [tempKey, setTempKey] = useState('')

  const dialogRef = useRef<HTMLDivElement>(null)

  // Escape closes; Tab stays inside the dialog; focus lands on the first field
  useEffect(() => {
    if (!isOpen) return
    const dialog = dialogRef.current
    const focusable = () =>
      Array.from(
        dialog?.querySelectorAll<HTMLElement>('button, input, [href]') ?? []
      ).filter((el) => !el.hasAttribute('disabled'))
    const previous = document.activeElement as HTMLElement | null
    dialog?.querySelector<HTMLElement>('input')?.focus()

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
        return
      }
      if (e.key !== 'Tab') return
      const items = focusable()
      if (items.length === 0) return
      const first = items[0]
      const last = items[items.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      previous?.focus()
    }
  }, [isOpen, onClose])

  if (!isOpen) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!email.trim() || !password) {
      setError('Please provide both email and password.')
      return
    }

    setLoading(true)
    try {
      const res = await signIn(email, password)

      if (res.error) {
        setError(res.error.message)
      } else {
        onClose()
        if (onSuccess) onSuccess()
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Authentication failed'
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  const handleSaveRuntimeConfig = (e: React.FormEvent) => {
    e.preventDefault()
    if (!tempUrl.trim() || !tempKey.trim()) {
      setError('Both Supabase URL and Anon Key are required.')
      return
    }
    localStorage.setItem('supabase_url', tempUrl.trim())
    localStorage.setItem('supabase_anon_key', tempKey.trim())
    window.location.reload()
  }

  const field =
    'w-full min-h-11 rounded-lg bg-ground border border-line text-ink placeholder:text-muted'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ground/90">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-login-title"
        className="w-full max-w-md rounded-xl border border-line bg-surface p-6 relative"
      >
        <button
          onClick={onClose}
          className="absolute right-4 top-4 p-2 rounded-lg text-ink-soft hover:text-ink hover:bg-raised transition-colors cursor-pointer"
          aria-label="Close"
        >
          <X className="w-5 h-5" aria-hidden="true" />
        </button>

        <div className="pb-4 pr-10 border-b border-line">
          <h3 id="admin-login-title" className="flex items-center gap-2 text-xl font-bold text-ink">
            <ShieldCheck className="w-5 h-5 text-brand-hover" aria-hidden="true" />
            Administrator Access
          </h3>
          <p className="mt-1 text-sm text-ink-soft">
            Sign in with admin credentials to manage players
          </p>
        </div>

        {!isConfigured && (
          <div className="mt-4 pl-4 border-l-2 border-brand text-sm space-y-2">
            <p className="flex items-center gap-2 font-bold text-ink">
              <AlertCircle className="w-4 h-4 text-brand-hover shrink-0" aria-hidden="true" />
              Supabase Not Connected Yet
            </p>
            <p className="leading-relaxed text-ink-soft">
              Running in demo mode. Any email with a password of 6+ characters will log you in as a demo admin.
            </p>
            <button
              type="button"
              onClick={() => setShowConfig(!showConfig)}
              className="text-brand-hover underline underline-offset-2 hover:text-ink font-medium cursor-pointer"
            >
              {showConfig ? 'Hide Supabase configuration' : 'Configure Supabase keys now'}
            </button>
          </div>
        )}

        {showConfig && (
          <form onSubmit={handleSaveRuntimeConfig} className="mt-4 space-y-3">
            <h4 className="flex items-center gap-2 text-sm font-semibold text-ink">
              <KeyRound className="w-4 h-4 text-brand-hover" aria-hidden="true" />
              Connect Supabase Project
            </h4>
            <div>
              <label htmlFor="sb-url" className="block text-sm text-ink-soft mb-1">Project URL</label>
              <input
                id="sb-url"
                type="text"
                placeholder="https://xyzcompany.supabase.co"
                value={tempUrl}
                onChange={(e) => setTempUrl(e.target.value)}
                className={`${field} px-3`}
              />
            </div>
            <div>
              <label htmlFor="sb-key" className="block text-sm text-ink-soft mb-1">Anon API Key</label>
              <input
                id="sb-key"
                type="password"
                placeholder="eyJhbGciOiJIUz…"
                value={tempKey}
                onChange={(e) => setTempKey(e.target.value)}
                className={`${field} px-3`}
              />
            </div>
            <button
              type="submit"
              className="w-full min-h-11 text-sm font-bold bg-ink text-ground hover:bg-ink-soft rounded-lg transition-colors cursor-pointer"
            >
              Save & Reload
            </button>
          </form>
        )}

        {error && (
          <p role="alert" className="mt-4 pl-4 border-l-2 border-brand text-sm text-ink flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-brand-hover" aria-hidden="true" />
            <span>{error}</span>
          </p>
        )}

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div>
            <label htmlFor="admin-email" className="block text-sm font-semibold text-ink mb-1.5">
              Admin Email
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-muted absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" aria-hidden="true" />
              <input
                id="admin-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@wendywednesdays.com"
                required
                className={`${field} pl-9 pr-3.5`}
              />
            </div>
          </div>

          <div>
            <label htmlFor="admin-password" className="block text-sm font-semibold text-ink mb-1.5">
              Password
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-muted absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" aria-hidden="true" />
              <input
                id="admin-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                className={`${field} pl-9 pr-3.5`}
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full min-h-11 px-4 rounded-lg bg-brand hover:bg-brand-hover motion-safe:active:scale-[0.97] text-brand-ink font-bold text-sm transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Signing in…' : 'Sign In as Admin'}
          </button>
        </form>
      </div>
    </div>
  )
}
