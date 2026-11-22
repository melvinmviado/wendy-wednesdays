import React, { useCallback, useEffect, useMemo, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { fetchOwnProfile } from '../data/profiles'
import { AppAuthError, type AuthContextValue, type AuthResult, type Profile, type SignUpResult } from '../types/auth'
import { toAuthError } from '../utils/authErrors'
import { claimRole, resolveRole } from '../utils/authRole'
import { cleanAuthUrl, initialReturnError } from '../utils/authUrl'
import { AuthContext } from './authContextInstance'

// Magic-link and OAuth both come back to the app's own origin; the single-page app then
// picks the session up from the URL (detectSessionInUrl) and we tidy the address bar.
const redirectTo = () => window.location.origin

/** Runs an auth call and folds both thrown and returned errors into an AuthResult. */
async function attempt(call: () => Promise<{ error: unknown }>): Promise<AuthResult> {
  try {
    const { error } = await call()
    return { error: error ? toAuthError(error) : null }
  } catch (e: unknown) {
    return { error: toAuthError(e) }
  }
}

/**
 * Pre-flights the OAuth authorize URL. An enabled provider answers with a redirect to the
 * provider's consent screen (an opaque redirect, since we ask not to follow it). A disabled
 * one answers 400, which the browser surfaces as a readable error response or a blocked
 * (TypeError) fetch. Offline is not a provider problem, so that case is let through to fail
 * as a normal network error.
 */
async function providerResponds(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { redirect: 'manual' })
    return res.type === 'opaqueredirect' || (res.status >= 300 && res.status < 400)
  } catch {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new TypeError('Failed to fetch')
    return false
  }
}

export const SupabaseAuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<Session | null>(null)
  const [sessionLoading, setSessionLoading] = useState(true)
  const [profileState, setProfileState] = useState<{ userId: string; profile: Profile | null } | null>(null)
  const [returnError, setReturnError] = useState<AppAuthError | null>(initialReturnError)

  const user = session?.user ?? null
  const userId = user?.id ?? null

  // 1. Session: the initial value (this also waits for supabase-js to finish consuming a
  //    magic-link / OAuth return), then every later change.
  useEffect(() => {
    let active = true
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!active) return
        setSession(data.session)
        setSessionLoading(false)
        cleanAuthUrl()
      })
      .catch(() => {
        if (!active) return
        setSessionLoading(false)
        cleanAuthUrl()
      })

    // Keep this callback synchronous: calling supabase from inside it can deadlock.
    const { data } = supabase.auth.onAuthStateChange((event, next) => {
      setSession(next)
      setSessionLoading(false)
      if (event === 'SIGNED_IN') cleanAuthUrl()
    })
    return () => {
      active = false
      data.subscription.unsubscribe()
    }
  }, [])

  // 2. Profile row, once per signed-in user (not on every token refresh).
  useEffect(() => {
    if (!userId) {
      setProfileState(null)
      return
    }
    let active = true
    fetchOwnProfile(userId).then((r) => {
      if (!active) return
      if (r.error) console.warn('[auth] profile unavailable:', r.error)
      setProfileState({ userId, profile: r.profile })
    })
    return () => {
      active = false
    }
  }, [userId])

  const profileSettled = profileState?.userId === userId
  const profile = profileSettled ? (profileState?.profile ?? null) : null
  const role = useMemo(() => resolveRole(user, profile), [user, profile])
  // An admin claim is enough on its own; everyone else waits for the profile before we decide.
  const loading = sessionLoading || (user !== null && claimRole(user) !== 'admin' && !profileSettled)

  const refreshProfile = useCallback(async () => {
    if (!userId) return
    const r = await fetchOwnProfile(userId)
    if (!r.error) setProfileState({ userId, profile: r.profile })
  }, [userId])

  const applyProfile = useCallback<AuthContextValue['applyProfile']>(
    (patch) => {
      setProfileState((s) => (s && s.profile && s.userId === userId ? { ...s, profile: { ...s.profile, ...patch } } : s))
    },
    [userId]
  )

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user,
      profile,
      role,
      isAdmin: role === 'admin',
      isSignedIn: user !== null,
      loading,
      isConfigured: true,
      returnError,
      dismissReturnError: () => setReturnError(null),
      signInWithPassword: (email, password) =>
        attempt(() => supabase.auth.signInWithPassword({ email: email.trim(), password })),
      signUpWithPassword: async (email, password): Promise<SignUpResult> => {
        try {
          const { data, error } = await supabase.auth.signUp({
            email: email.trim(),
            password,
            options: { emailRedirectTo: redirectTo() },
          })
          if (error) return { error: toAuthError(error), needsEmailConfirmation: false }
          // With confirmation ON, an existing address comes back as a fake user with no identities.
          // Supabase hides whether the address is taken on purpose; answer exactly as for a new
          // account ("check your email") so this form can't be used to test which emails exist.
          if (data.user && data.user.identities?.length === 0) {
            return { error: null, needsEmailConfirmation: true }
          }
          // Confirmation OFF returns a session at once (onAuthStateChange picks it up); ON does not.
          return { error: null, needsEmailConfirmation: !data.session }
        } catch (e: unknown) {
          return { error: toAuthError(e), needsEmailConfirmation: false }
        }
      },
      sendMagicLink: (email) =>
        attempt(() => supabase.auth.signInWithOtp({ email: email.trim(), options: { emailRedirectTo: redirectTo() } })),
      signInWithGoogle: async () => {
        // Ask for the authorize URL instead of navigating, so a provider that is switched off
        // can be caught here rather than stranding the user on Supabase's JSON error page.
        const start = await attempt(async () => {
          const { data, error } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: { redirectTo: redirectTo(), skipBrowserRedirect: true },
          })
          if (error || !data.url) return { error: error ?? new Error('No authorize URL') }
          if (!(await providerResponds(data.url))) return { error: { code: 'provider_disabled' } }
          window.location.assign(data.url)
          return { error: null }
        })
        return start
      },
      signOut: async () => {
        const first = await attempt(() => supabase.auth.signOut())
        if (!first.error) return first
        // The server call failed (offline, expired token): still end the session on this device.
        const local = await attempt(() => supabase.auth.signOut({ scope: 'local' }))
        if (!local.error) setSession(null)
        return local
      },
      refreshProfile,
      applyProfile,
    }),
    [session, user, profile, role, loading, returnError, refreshProfile, applyProfile]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
