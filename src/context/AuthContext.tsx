import React, { useContext } from 'react'
import { isSupabaseConfigured } from '../lib/supabase'
import type { AuthContextValue } from '../types/auth'
import { AuthContext } from './authContextInstance'
import { DemoAuthProvider } from './DemoAuthProvider'
import { SupabaseAuthProvider } from './SupabaseAuthProvider'

/** Picks the real Supabase-backed provider, or the local demo one when no credentials exist. */
export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) =>
  isSupabaseConfigured ? (
    <SupabaseAuthProvider>{children}</SupabaseAuthProvider>
  ) : (
    <DemoAuthProvider>{children}</DemoAuthProvider>
  )

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
