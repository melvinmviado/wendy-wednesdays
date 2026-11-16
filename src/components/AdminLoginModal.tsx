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
  const { signIn, isConfigured } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
      <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-950 p-6 shadow-2xl relative">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-900 transition cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 pb-4 border-b border-zinc-800">
          <div className="w-10 h-10 rounded-xl bg-red-950/60 border border-red-500/40 flex items-center justify-center text-red-500">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white">Administrator Access</h3>
            <p className="text-xs text-zinc-400">
              Sign in with admin credentials to manage players
            </p>
          </div>
        </div>

        {!isConfigured && (
          <div className="mt-4 p-3.5 rounded-xl bg-red-950/40 border border-red-500/30 text-xs text-red-200 space-y-2">
            <div className="flex items-center gap-2 font-bold text-white">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
              <span>Supabase Not Connected Yet</span>
            </div>
            <p className="text-[11px] leading-relaxed text-zinc-300">
              Running in demo mode. Any email with a password of 6+ characters will log you in as a demo admin.
            </p>
            <button
              type="button"
              onClick={() => setShowConfig(!showConfig)}
              className="text-xs text-red-400 underline hover:text-white font-medium cursor-pointer"
            >
              {showConfig ? 'Hide Supabase configuration' : 'Configure Supabase keys now →'}
            </button>
          </div>
        )}

        {showConfig && (
          <form onSubmit={handleSaveRuntimeConfig} className="mt-4 p-3.5 rounded-xl bg-black border border-zinc-800 space-y-3">
            <div className="text-xs font-semibold text-white flex items-center gap-1.5">
              <KeyRound className="w-3.5 h-3.5 text-red-500" />
              <span>Connect Supabase Project</span>
            </div>
            <div>
              <label className="block text-[11px] text-zinc-400 mb-1">Project URL</label>
              <input
                type="text"
                placeholder="https://xyzcompany.supabase.co"
                value={tempUrl}
                onChange={(e) => setTempUrl(e.target.value)}
                className="w-full px-3 py-1.5 text-xs rounded-lg bg-zinc-900 border border-zinc-800 text-white"
              />
            </div>
            <div>
              <label className="block text-[11px] text-zinc-400 mb-1">Anon API Key</label>
              <input
                type="password"
                placeholder="eyJhbGciOiJIUz..."
                value={tempKey}
                onChange={(e) => setTempKey(e.target.value)}
                className="w-full px-3 py-1.5 text-xs rounded-lg bg-zinc-900 border border-zinc-800 text-white font-mono"
              />
            </div>
            <button
              type="submit"
              className="w-full py-1.5 text-xs font-bold bg-white text-black hover:bg-zinc-200 rounded-lg transition"
            >
              Save & Reload
            </button>
          </form>
        )}

        {error && (
          <div className="mt-4 p-3 rounded-xl bg-red-950/70 border border-red-800/80 text-xs text-red-200 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-1.5">
              Admin Email
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@wendywednesdays.com"
                required
                className="w-full pl-9 pr-3.5 py-2.5 rounded-xl bg-black border border-zinc-800 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-1.5">
              Password
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="w-full pl-9 pr-3.5 py-2.5 rounded-xl bg-black border border-zinc-800 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500 font-mono"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-red-600 via-red-500 to-red-700 hover:from-red-500 hover:to-red-600 active:scale-95 text-white font-bold text-sm transition cursor-pointer shadow-lg shadow-red-600/30 disabled:opacity-50"
          >
            {loading ? 'Signing in...' : 'Sign In as Admin'}
          </button>
        </form>
      </div>
    </div>
  )
}
