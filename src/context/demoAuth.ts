import type { User } from '@supabase/supabase-js'
import type { Profile, Role } from '../types/auth'

// Demo mode (no Supabase credentials): auth lives entirely in localStorage. Nothing here
// talks to the network.

const KEY = 'wendy_demo_auth'
const LEGACY_KEY = 'demo_admin_logged_in' // written by the old admin-only login

export interface DemoSession {
  email: string
  role: Role
  /** Edited in the profile dialog; the avatar is a data URL because demo mode has no storage. */
  displayName?: string
  avatarUrl?: string | null
}

export function loadDemoSession(): DemoSession | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<DemoSession>
      if (typeof parsed.email === 'string' && (parsed.role === 'admin' || parsed.role === 'user')) {
        return {
          email: parsed.email,
          role: parsed.role,
          displayName: typeof parsed.displayName === 'string' ? parsed.displayName : undefined,
          avatarUrl: typeof parsed.avatarUrl === 'string' ? parsed.avatarUrl : null,
        }
      }
    }
    if (localStorage.getItem(LEGACY_KEY) === 'true') {
      return { email: 'admin@wendywednesdays.com', role: 'admin' }
    }
  } catch {
    // unreadable storage: behave as signed out
  }
  return null
}

export function saveDemoSession(session: DemoSession | null): void {
  try {
    localStorage.removeItem(LEGACY_KEY)
    if (session) localStorage.setItem(KEY, JSON.stringify(session))
    else localStorage.removeItem(KEY)
  } catch {
    // storage full or blocked: the in-memory state still works for this page load
  }
}

const DEMO_ID = 'demo-user-id'
const NOW = new Date().toISOString()

export function demoUser(s: DemoSession): User {
  return {
    id: DEMO_ID,
    email: s.email,
    app_metadata: { role: s.role },
    user_metadata: {},
    aud: 'authenticated',
    created_at: NOW,
  } as unknown as User
}

export function demoProfile(s: DemoSession): Profile {
  return {
    id: DEMO_ID,
    displayName: s.displayName ?? (s.email.split('@')[0] || 'Demo'),
    avatarUrl: s.avatarUrl ?? null,
    role: s.role,
    createdAt: NOW,
    updatedAt: NOW,
  }
}
