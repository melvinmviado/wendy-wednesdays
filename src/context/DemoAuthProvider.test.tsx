import { beforeEach, describe, expect, it } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { AuthContext } from './authContextInstance'
import { DemoAuthProvider } from './DemoAuthProvider'
import { useContext } from 'react'

const wrapper = ({ children }: { children: ReactNode }) => <DemoAuthProvider>{children}</DemoAuthProvider>
const useCtx = () => {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('no context')
  return ctx
}

describe('DemoAuthProvider', () => {
  beforeEach(() => localStorage.clear())

  it('starts signed out and never loading', () => {
    const { result } = renderHook(useCtx, { wrapper })
    expect(result.current).toMatchObject({ isSignedIn: false, isAdmin: false, role: null, loading: false, isConfigured: false })
  })

  it('password sign-in keeps the old behavior: demo admin, 6+ characters', async () => {
    const { result } = renderHook(useCtx, { wrapper })
    let res = await act(() => result.current.signInWithPassword('a@b.co', '123'))
    expect(res.error?.code).toBe('weak-password')
    res = await act(() => result.current.signInWithPassword('a@b.co', '123456'))
    expect(res.error).toBeNull()
    expect(result.current).toMatchObject({ isSignedIn: true, isAdmin: true, role: 'admin' })
    expect(result.current.profile?.displayName).toBe('a')
  })

  it('sign-up and Google sign in as a plain user; the magic link only reports success', async () => {
    const { result } = renderHook(useCtx, { wrapper })
    const up = await act(() => result.current.signUpWithPassword('new@b.co', 'secret1'))
    expect(up).toEqual({ error: null, needsEmailConfirmation: false })
    expect(result.current).toMatchObject({ isSignedIn: true, isAdmin: false, role: 'user' })
    await act(() => result.current.signOut())
    expect(await act(() => result.current.sendMagicLink('x@y.co'))).toEqual({ error: null })
    expect(result.current.isSignedIn).toBe(false)
    await act(() => result.current.signInWithGoogle())
    expect(result.current.role).toBe('user')
  })

  it('persists across reloads and clears on sign-out', async () => {
    const first = renderHook(useCtx, { wrapper })
    await act(() => first.result.current.signInWithPassword('a@b.co', '123456'))
    first.unmount()
    const second = renderHook(useCtx, { wrapper })
    expect(second.result.current.isAdmin).toBe(true)
    await act(() => second.result.current.signOut())
    expect(second.result.current.isSignedIn).toBe(false)
    expect(localStorage.getItem('wendy_demo_auth')).toBeNull()
  })

  it('still honours the legacy admin flag', () => {
    localStorage.setItem('demo_admin_logged_in', 'true')
    const { result } = renderHook(useCtx, { wrapper })
    expect(result.current.isAdmin).toBe(true)
  })
})
