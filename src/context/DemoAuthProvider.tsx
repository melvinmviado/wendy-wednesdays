import React, { useMemo, useState } from 'react'
import { AppAuthError, type AuthContextValue, type AuthResult, type SignUpResult } from '../types/auth'
import { AuthContext } from './authContextInstance'
import { demoProfile, demoUser, loadDemoSession, saveDemoSession, type DemoSession } from './demoAuth'

const OK: AuthResult = { error: null }
const MIN_PASSWORD = 6

/**
 * Auth for demo mode. No Supabase calls. Signing in with a password behaves as before (any
 * email, 6+ characters, becomes the demo admin) so the admin screens stay reachable. Sign-up
 * and Google have no provider to talk to, so they sign in immediately as a plain demo user,
 * which is what you need to exercise the non-admin UI. The email link has no inbox, so it only
 * reports success (the "check your email" screen).
 */
export const DemoAuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [demo, setDemo] = useState<DemoSession | null>(loadDemoSession)

  const value = useMemo<AuthContextValue>(() => {
    const start = (next: DemoSession): AuthResult => {
      saveDemoSession(next)
      setDemo(next)
      return OK
    }
    const tooShort = () => new AppAuthError('weak-password', `Password must be at least ${MIN_PASSWORD} characters in demo mode.`)

    return {
      session: null,
      user: demo ? demoUser(demo) : null,
      profile: demo ? demoProfile(demo) : null,
      role: demo ? demo.role : null,
      isAdmin: demo?.role === 'admin',
      isSignedIn: demo !== null,
      loading: false,
      isConfigured: false,
      returnError: null,
      dismissReturnError: () => {},
      signInWithPassword: async (email, password) =>
        password.length >= MIN_PASSWORD ? start({ email: email.trim(), role: 'admin' }) : { error: tooShort() },
      signUpWithPassword: async (email, password): Promise<SignUpResult> =>
        password.length >= MIN_PASSWORD
          ? { ...start({ email: email.trim(), role: 'user' }), needsEmailConfirmation: false }
          : { error: tooShort(), needsEmailConfirmation: false },
      // There is no inbox in demo mode: report success so the "check your email" screen shows.
      sendMagicLink: async () => OK,
      signInWithGoogle: async () => start({ email: 'demo.google@example.com', role: 'user' }),
      signOut: async () => {
        saveDemoSession(null)
        setDemo(null)
        return OK
      },
      refreshProfile: async () => {},
      applyProfile: (patch) => {
        setDemo((current) => {
          if (!current) return current
          const next = {
            ...current,
            ...(patch.displayName !== undefined && { displayName: patch.displayName ?? undefined }),
            ...(patch.avatarUrl !== undefined && { avatarUrl: patch.avatarUrl }),
          }
          saveDemoSession(next)
          return next
        })
      },
    }
  }, [demo])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
