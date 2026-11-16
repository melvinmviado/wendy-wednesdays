import React, { useState } from 'react'
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
  const { signIn, signUp, isConfigured } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isSignUp, setIsSignUp] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showConfig, setShowConfig] = useState(false)
  const [tempUrl, setTempUrl] = useState('')
  const [tempKey, setTempKey] = useState('')

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
      const res = isSignUp ? await signUp(email, password) : await signIn(email, password)

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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in">
      <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl relative">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 pb-4 border-b border-slate-800">
          <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white">Administrator Access</h3>
            <p className="text-xs text-slate-400">
              {isSignUp ? 'Create administrator account' : 'Sign in to add/edit players'}
            </p>
          </div>
        </div>

        {!isConfigured && (
          <div className="mt-4 p-3.5 rounded-xl bg-amber-950/40 border border-amber-500/30 text-xs text-amber-200/90 space-y-2">
            <div className="flex items-center gap-2 font-semibold text-amber-400">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>Supabase Not Connected Yet</span>
            </div>
            <p className="text-[11px] leading-relaxed text-amber-300/80">
              Running in demo mode. Any email with a password of 6+ characters will log you in as a demo admin.
            </p>
            <button
              type="button"
              onClick={() => setShowConfig(!showConfig)}
              className="text-xs text-amber-400 underline hover:text-amber-300 font-medium cursor-pointer"
            >
              {showConfig ? 'Hide Supabase configuration' : 'Configure Supabase keys now →'}
            </button>
          </div>
        )}

        {showConfig && (
          <form onSubmit={handleSaveRuntimeConfig} className="mt-4 p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
            <div className="text-xs font-semibold text-white flex items-center gap-1.5">
              <KeyRound className="w-3.5 h-3.5 text-cyan-400" />
              <span>Connect Supabase Project</span>
            </div>
            <div>
              <label className="block text-[11px] text-slate-400 mb-1">Project URL</label>
              <input
                type="text"
                placeholder="https://xyzcompany.supabase.co"
                value={tempUrl}
                onChange={(e) => setTempUrl(e.target.value)}
                className="w-full px-3 py-1.5 text-xs rounded-lg bg-slate-900 border border-slate-800 text-white"
              />
            </div>
            <div>
              <label className="block text-[11px] text-slate-400 mb-1">Anon API Key</label>
              <input
                type="password"
                placeholder="eyJhbGciOiJIUz..."
                value={tempKey}
                onChange={(e) => setTempKey(e.target.value)}
                className="w-full px-3 py-1.5 text-xs rounded-lg bg-slate-900 border border-slate-800 text-white font-mono"
              />
            </div>
            <button
              type="submit"
              className="w-full py-1.5 text-xs font-semibold bg-cyan-500 text-slate-950 rounded-lg hover:bg-cyan-400 transition"
            >
              Save & Reload
            </button>
          </form>
        )}

        {error && (
          <div className="mt-4 p-3 rounded-xl bg-rose-950/50 border border-rose-800/60 text-xs text-rose-300 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
              Admin Email
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@wendywednesdays.com"
                required
                className="w-full pl-9 pr-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
              Password
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="w-full pl-9 pr-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 font-mono"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 active:scale-95 text-slate-950 font-bold text-sm transition cursor-pointer shadow-lg shadow-cyan-500/20 disabled:opacity-50"
          >
            {loading ? 'Authenticating...' : isSignUp ? 'Sign Up as Admin' : 'Sign In as Admin'}
          </button>

          <div className="text-center pt-2">
            <button
              type="button"
              onClick={() => {
                setIsSignUp(!isSignUp)
                setError('')
              }}
              className="text-xs text-slate-400 hover:text-cyan-400 transition cursor-pointer"
            >
              {isSignUp ? 'Already have an admin account? Sign in' : 'Need an admin account? Create one'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
