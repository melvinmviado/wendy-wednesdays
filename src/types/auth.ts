import type { Session, User } from '@supabase/supabase-js'

export type Role = 'user' | 'admin'

/** A row of public.profiles, camel-cased. */
export interface Profile {
  id: string
  displayName: string | null
  avatarUrl: string | null
  role: Role
  createdAt: string
  updatedAt: string
}

export type AuthErrorCode =
  | 'invalid-credentials'
  | 'user-exists'
  | 'weak-password'
  | 'invalid-email'
  | 'email-not-confirmed'
  | 'rate-limited'
  | 'provider-disabled'
  | 'signup-disabled'
  | 'link-expired'
  | 'access-denied'
  | 'network'
  | 'unknown'

/** Auth failure with a stable code for branching and a message that is safe to show. */
export class AppAuthError extends Error {
  readonly code: AuthErrorCode
  readonly status?: number

  constructor(code: AuthErrorCode, message: string, status?: number) {
    super(message)
    this.name = 'AppAuthError'
    this.code = code
    this.status = status
  }
}

export interface AuthResult {
  error: AppAuthError | null
}

export interface SignUpResult extends AuthResult {
  /** True when the account exists but no session was returned (email confirmation is on). */
  needsEmailConfirmation: boolean
}

export interface AuthContextValue {
  session: Session | null
  user: User | null
  profile: Profile | null
  /** null while signed out. Admin if the JWT app_metadata claim OR the profile row says so (mirrors is_admin()). */
  role: Role | null
  isAdmin: boolean
  isSignedIn: boolean
  /** True until the session check and, when the role needs it, the profile fetch have settled. */
  loading: boolean
  isConfigured: boolean
  /** Set when a magic-link / OAuth return came back with an error (expired link, denied consent). */
  returnError: AppAuthError | null
  dismissReturnError: () => void
  signInWithPassword: (email: string, password: string) => Promise<AuthResult>
  signUpWithPassword: (email: string, password: string) => Promise<SignUpResult>
  sendMagicLink: (email: string) => Promise<AuthResult>
  signInWithGoogle: () => Promise<AuthResult>
  signOut: () => Promise<AuthResult>
  refreshProfile: () => Promise<void>
  /** Applies an edit to the in-memory profile (and to local storage in demo mode). Does not write to the server. */
  applyProfile: (patch: Partial<Pick<Profile, 'displayName' | 'avatarUrl'>>) => void
}
