import React from 'react'
import { Loader2 } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import type { AuthSubmit } from '../../hooks/useAuthSubmit'
import { authBtnQuiet } from './authStyles'

// lucide-react ships no brand icons, so the Google "G" is inlined.
const GoogleLogo: React.FC = () => (
  <svg viewBox="0 0 24 24" className="w-4 h-4" aria-hidden="true">
    <path fill="#4285F4" d="M21.6 12.23c0-.71-.06-1.4-.18-2.05H12v3.87h5.39a4.6 4.6 0 0 1-2 3.02v2.5h3.23c1.89-1.74 2.98-4.3 2.98-7.34z" />
    <path fill="#34A853" d="M12 22c2.7 0 4.96-.9 6.62-2.42l-3.23-2.5c-.9.6-2.04.95-3.39.95-2.6 0-4.8-1.76-5.59-4.12H3.07v2.58A10 10 0 0 0 12 22z" />
    <path fill="#FBBC05" d="M6.41 13.91a6 6 0 0 1 0-3.82V7.51H3.07a10 10 0 0 0 0 8.98l3.34-2.58z" />
    <path fill="#EA4335" d="M12 5.98c1.47 0 2.79.5 3.82 1.5l2.86-2.86C16.95 2.99 14.7 2 12 2A10 10 0 0 0 3.07 7.51l3.34 2.58C7.2 7.74 9.4 5.98 12 5.98z" />
  </svg>
)

/**
 * Continue with Google. If the provider is not enabled the failure comes back through
 * `submit.error` as a friendly "isn't available yet" message instead of a dead end.
 */
export const GoogleButton: React.FC<{ submit: AuthSubmit }> = ({ submit }) => {
  const { signInWithGoogle } = useAuth()
  return (
    <button type="button" disabled={submit.busy} onClick={() => submit.run(() => signInWithGoogle())} className={authBtnQuiet}>
      {submit.busy ? <Loader2 className="w-4 h-4 motion-safe:animate-spin" aria-hidden="true" /> : <GoogleLogo />}
      <span>Continue with Google</span>
    </button>
  )
}
