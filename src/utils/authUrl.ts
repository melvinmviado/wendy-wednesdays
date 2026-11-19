import { AppAuthError } from '../types/auth'
import { authMessage, toAuthError } from './authErrors'

// Parameters Supabase puts on the URL when a magic link / OAuth flow returns to the app.
// Implicit flow uses the hash (#access_token=...), PKCE uses the query (?code=...).
const AUTH_PARAMS = [
  'access_token', 'refresh_token', 'expires_at', 'expires_in', 'token_type', 'type',
  'provider_token', 'provider_refresh_token', 'code',
  'error', 'error_code', 'error_description',
]

function paramsOf(url: URL): [URLSearchParams, URLSearchParams] {
  return [new URLSearchParams(url.search), new URLSearchParams(url.hash.replace(/^#/, ''))]
}

/** The error a failed magic-link / OAuth return carries, if any. */
export function parseAuthReturnError(href: string): AppAuthError | null {
  for (const p of paramsOf(new URL(href))) {
    const error = p.get('error')
    const errorCode = p.get('error_code')
    if (!error && !errorCode) continue
    const description = p.get('error_description') ?? ''
    if (errorCode === 'otp_expired') return new AppAuthError('link-expired', authMessage('link-expired'))
    if (error === 'access_denied') return new AppAuthError('access-denied', authMessage('access-denied'))
    return toAuthError({ code: errorCode ?? '', message: description || error || '' })
  }
  return null
}

/** Path + query + hash of the same URL without any auth-return parameters; other params are kept. */
export function stripAuthParams(href: string): string {
  const url = new URL(href)
  // Only re-serialize a part that actually carried auth params, so an unrelated hash such as
  // "#results" is never rewritten.
  const clean = (raw: string, prefix: string): string => {
    const params = new URLSearchParams(raw.replace(/^[?#]/, ''))
    if (!AUTH_PARAMS.some((k) => params.has(k))) return raw
    AUTH_PARAMS.forEach((k) => params.delete(k))
    const rest = params.toString()
    return rest ? `${prefix}${rest}` : ''
  }
  return `${url.pathname}${clean(url.search, '?')}${clean(url.hash, '#')}`
}

// Read once at module load, synchronously, BEFORE supabase-js (which starts its own URL
// processing in a microtask) can consume or rewrite the URL. Without this an error return
// would be gone by the time the provider mounts.
export const initialReturnError: AppAuthError | null =
  typeof window === 'undefined' ? null : parseAuthReturnError(window.location.href)

/** Removes auth params from the address bar without adding a history entry. */
export function cleanAuthUrl(): void {
  if (typeof window === 'undefined') return
  const clean = stripAuthParams(window.location.href)
  const current = `${window.location.pathname}${window.location.search}${window.location.hash}`
  if (clean !== current) window.history.replaceState(window.history.state, '', clean)
}
