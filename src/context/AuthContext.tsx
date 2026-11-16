import React, { createContext, useContext, useEffect, useState } from 'react'
import { User, Session } from '@supabase/supabase-js'
import { supabase, isSupabaseConfigured } from '../lib/supabase'

interface AuthContextType {
  user: User | null
  session: Session | null
  isAdmin: boolean
  isLoading: boolean
  isConfigured: boolean
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>
  signUp: (email: string, password: string) => Promise<{ error: Error | null }>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    if (!isSupabaseConfigured) {
      // In demo/mock mode without Supabase credentials, check if admin demo session exists
      const demoAdmin = localStorage.getItem('demo_admin_logged_in') === 'true'
      if (demoAdmin) {
        setUser({
          id: 'demo-admin-id',
          email: 'admin@wendywednesdays.com',
          app_metadata: {},
          user_metadata: { role: 'admin' },
          aud: 'authenticated',
          created_at: new Date().toISOString(),
        } as unknown as User)
      }
      setIsLoading(false)
      return
    }

    // 1. Fetch current session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setUser(session?.user ?? null)
      setIsLoading(false)
    })

    // 2. Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      setUser(session?.user ?? null)
      setIsLoading(false)
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [])

  const signIn = async (email: string, password: string) => {
    if (!isSupabaseConfigured) {
      // Demo authentication for local testing
      if (password.length >= 6) {
        localStorage.setItem('demo_admin_logged_in', 'true')
        setUser({
          id: 'demo-admin-id',
          email,
          app_metadata: {},
          user_metadata: { role: 'admin' },
          aud: 'authenticated',
          created_at: new Date().toISOString(),
        } as unknown as User)
        return { error: null }
      }
      return { error: new Error('Password must be at least 6 characters for demo admin login') }
    }

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })
    return { error }
  }

  const signUp = async (email: string, password: string) => {
    if (!isSupabaseConfigured) {
      return signIn(email, password)
    }

    const { error } = await supabase.auth.signUp({
      email,
      password,
    })
    return { error }
  }

  const signOut = async () => {
    if (!isSupabaseConfigured) {
      localStorage.removeItem('demo_admin_logged_in')
      setUser(null)
      return
    }
    await supabase.auth.signOut()
    setUser(null)
    setSession(null)
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        isAdmin: Boolean(user),
        isLoading,
        isConfigured: isSupabaseConfigured,
        signIn,
        signUp,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
