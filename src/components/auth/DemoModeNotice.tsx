import React, { useState } from 'react'
import { AlertCircle, KeyRound } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { authField, authBtnBrand } from './authStyles'

/** Shown only in demo mode: explains it, and lets you point the app at a Supabase project. */
export const DemoModeNotice: React.FC = () => {
  const { isConfigured } = useAuth()
  const [showConfig, setShowConfig] = useState(false)
  const [url, setUrl] = useState('')
  const [key, setKey] = useState('')
  const [error, setError] = useState('')

  if (isConfigured) return null

  const save = (e: React.FormEvent) => {
    e.preventDefault()
    if (!url.trim() || !key.trim()) {
      setError('Both Supabase URL and Anon Key are required.')
      return
    }
    localStorage.setItem('supabase_url', url.trim())
    localStorage.setItem('supabase_anon_key', key.trim())
    window.location.reload()
  }

  return (
    <div className="mt-4 space-y-3">
      <div className="pl-4 border-l-2 border-brand text-sm space-y-2">
        <p className="flex items-center gap-2 font-bold text-ink">
          <AlertCircle className="w-4 h-4 text-brand-hover shrink-0" aria-hidden="true" />
          Supabase Not Connected Yet
        </p>
        <p className="leading-relaxed text-ink-soft">
          Running in demo mode. Email and password (6+ characters) signs you in as a demo admin. Creating an account
          and Google sign you in as a regular demo user. The email link only shows its confirmation screen.
        </p>
        {import.meta.env.DEV && <button
          type="button"
          onClick={() => setShowConfig(!showConfig)}
          className="text-brand-hover underline underline-offset-2 hover:text-ink font-medium cursor-pointer"
        >
          {showConfig ? 'Hide Supabase configuration' : 'Configure Supabase keys now'}
        </button>}
      </div>

      {/* Dev only: lib/supabase.ts ignores saved keys in production builds */}
      {import.meta.env.DEV && showConfig && (
        <form onSubmit={save} className="space-y-3">
          <h4 className="flex items-center gap-2 text-sm font-semibold text-ink">
            <KeyRound className="w-4 h-4 text-brand-hover" aria-hidden="true" />
            Connect Supabase Project
          </h4>
          <div>
            <label htmlFor="sb-url" className="block text-sm text-ink-soft mb-1">Project URL</label>
            <input id="sb-url" type="text" placeholder="https://xyzcompany.supabase.co" value={url}
              onChange={(e) => setUrl(e.target.value)} className={`${authField} border-line px-3`} />
          </div>
          <div>
            <label htmlFor="sb-key" className="block text-sm text-ink-soft mb-1">Anon API Key</label>
            <input id="sb-key" type="password" placeholder="eyJhbGciOiJIUz…" value={key}
              onChange={(e) => setKey(e.target.value)} className={`${authField} border-line px-3`} />
          </div>
          {error && <p role="alert" className="text-sm text-brand-hover">{error}</p>}
          <button type="submit" className={authBtnBrand}>Save &amp; Reload</button>
        </form>
      )}
    </div>
  )
}
