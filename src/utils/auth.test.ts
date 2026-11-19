import { describe, expect, it } from 'vitest'
import type { User } from '@supabase/supabase-js'
import { AppAuthError, type Profile } from '../types/auth'
import { toAuthError } from './authErrors'
import { claimRole, resolveRole } from './authRole'
import { parseAuthReturnError, stripAuthParams } from './authUrl'

const user = (role?: unknown) => ({ id: 'u1', app_metadata: role === undefined ? {} : { role } }) as unknown as User
const profile = (role: 'user' | 'admin'): Profile => ({
  id: 'u1', displayName: null, avatarUrl: null, role, createdAt: '', updatedAt: '',
})

describe('toAuthError', () => {
  it.each([
    [{ code: 'invalid_credentials', message: 'x' }, 'invalid-credentials'],
    [{ message: 'Invalid login credentials', status: 400 }, 'invalid-credentials'],
    [{ code: 'user_already_exists' }, 'user-exists'],
    [{ message: 'User already registered' }, 'user-exists'],
    [{ code: 'weak_password' }, 'weak-password'],
    [{ code: 'over_email_send_rate_limit' }, 'rate-limited'],
    [{ status: 429, message: 'slow down' }, 'rate-limited'],
    [{ message: 'Unsupported provider: provider is not enabled' }, 'provider-disabled'],
    [{ code: 'validation_failed', message: 'Unsupported provider: provider is not enabled' }, 'provider-disabled'],
    [{ code: 'email_not_confirmed' }, 'email-not-confirmed'],
    [{ code: 'otp_expired' }, 'link-expired'],
    [{ name: 'AuthRetryableFetchError', message: 'Failed to fetch' }, 'network'],
    [new TypeError('Failed to fetch'), 'network'],
    [{ message: 'boom' }, 'unknown'],
    ['weird', 'unknown'],
  ])('%j -> %s', (input, code) => {
    expect(toAuthError(input).code).toBe(code)
  })

  it('returns friendly text and passes an AppAuthError through', () => {
    const e = toAuthError({ code: 'invalid_credentials', message: 'Invalid login credentials' })
    expect(e).toBeInstanceOf(AppAuthError)
    expect(e.message).toBe('Incorrect email or password.')
    expect(toAuthError(e)).toBe(e)
  })
})

describe('role resolution', () => {
  it('is null when signed out', () => expect(resolveRole(null, null)).toBeNull())
  it('reads the app_metadata claim', () => {
    expect(claimRole(user('admin'))).toBe('admin')
    expect(claimRole(user('hacker'))).toBeNull()
    expect(claimRole(user())).toBeNull()
  })
  it('admin claim alone is enough (no profile needed)', () => expect(resolveRole(user('admin'), null)).toBe('admin'))
  it('profile admin covers a token without the claim', () => expect(resolveRole(user(), profile('admin'))).toBe('admin'))
  it('defaults to user', () => {
    expect(resolveRole(user(), null)).toBe('user')
    expect(resolveRole(user('user'), profile('user'))).toBe('user')
  })
})

describe('auth return URLs', () => {
  const base = 'https://wendy.example/'
  it('strips implicit-flow hash tokens and keeps unrelated params', () => {
    const href = `${base}?week=3#access_token=a&refresh_token=b&expires_in=3600&token_type=bearer&type=magiclink&tab=results`
    expect(stripAuthParams(href)).toBe('/?week=3#tab=results')
  })
  it('strips PKCE ?code= and leaves a clean path', () => {
    expect(stripAuthParams(`${base}?code=abc`)).toBe('/')
  })
  it('leaves a normal URL untouched', () => expect(stripAuthParams(`${base}?a=1#b`)).toBe('/?a=1#b'))

  it('detects an expired link', () => {
    const e = parseAuthReturnError(`${base}#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid`)
    expect(e?.code).toBe('link-expired')
  })
  it('detects denied OAuth consent in the query', () => {
    expect(parseAuthReturnError(`${base}?error=access_denied&error_description=x`)?.code).toBe('access-denied')
  })
  it('returns null when there is no error', () => expect(parseAuthReturnError(`${base}#access_token=a`)).toBeNull())
})
