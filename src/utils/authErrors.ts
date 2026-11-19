import { AppAuthError, type AuthErrorCode } from '../types/auth'

const MESSAGES: Record<AuthErrorCode, string> = {
  'invalid-credentials': 'Incorrect email or password.',
  'user-exists': 'An account with this email already exists. Try signing in instead.',
  'weak-password': 'That password is too weak. Use at least 6 characters.',
  'invalid-email': 'Please enter a valid email address.',
  'email-not-confirmed': 'Please confirm your email address first. Check your inbox for the link.',
  'rate-limited': 'Too many attempts. Please wait a minute and try again.',
  'provider-disabled': "Google sign-in isn't available yet. Use your email instead.",
  'signup-disabled': 'New sign-ups are currently turned off.',
  'link-expired': 'That sign-in link has expired or was already used. Request a new one.',
  'access-denied': 'Sign-in was cancelled or denied.',
  network: 'Could not reach the server. Check your connection and try again.',
  unknown: 'Something went wrong signing in. Please try again.',
}

export const authMessage = (code: AuthErrorCode): string => MESSAGES[code]

const make = (code: AuthErrorCode, status?: number) => new AppAuthError(code, MESSAGES[code], status)

interface ErrorLike {
  code?: unknown
  status?: unknown
  name?: unknown
  message?: unknown
}

/**
 * Maps anything thrown or returned by Supabase auth to an AppAuthError. Prefers the stable
 * `code` GoTrue sends; falls back to the message text for older servers.
 */
export function toAuthError(e: unknown): AppAuthError {
  if (e instanceof AppAuthError) return e
  const err: ErrorLike = typeof e === 'object' && e !== null ? e : {}
  const code = typeof err.code === 'string' ? err.code : ''
  const message = typeof err.message === 'string' ? err.message : typeof e === 'string' ? e : ''
  const status = typeof err.status === 'number' ? err.status : undefined
  const text = message.toLowerCase()

  if (err.name === 'AuthRetryableFetchError' || (e instanceof TypeError && /fetch|network/i.test(message))) {
    return make('network', status)
  }

  const byCode: Record<string, AuthErrorCode> = {
    invalid_credentials: 'invalid-credentials',
    user_already_exists: 'user-exists',
    email_exists: 'user-exists',
    weak_password: 'weak-password',
    email_address_invalid: 'invalid-email',
    email_not_confirmed: 'email-not-confirmed',
    over_request_rate_limit: 'rate-limited',
    over_email_send_rate_limit: 'rate-limited',
    over_sms_send_rate_limit: 'rate-limited',
    signup_disabled: 'signup-disabled',
    otp_expired: 'link-expired',
    provider_disabled: 'provider-disabled',
  }
  if (byCode[code]) return make(byCode[code], status)

  if (status === 429 || /rate limit|too many requests|after \d+ seconds/.test(text)) return make('rate-limited', status)
  if (/provider is not enabled|unsupported provider/.test(text)) return make('provider-disabled', status)
  if (/invalid login credentials/.test(text)) return make('invalid-credentials', status)
  if (/already registered|already exists/.test(text)) return make('user-exists', status)
  if (/password.*(short|weak|least)/.test(text)) return make('weak-password', status)
  if (/email not confirmed/.test(text)) return make('email-not-confirmed', status)
  if (/signups? not allowed|signup.*disabled/.test(text)) return make('signup-disabled', status)
  if (/expired|invalid.*(otp|token|link)/.test(text)) return make('link-expired', status)
  if (/invalid.*email|unable to validate email/.test(text)) return make('invalid-email', status)
  return make('unknown', status)
}
