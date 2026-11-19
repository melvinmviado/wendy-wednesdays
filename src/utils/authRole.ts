import type { User } from '@supabase/supabase-js'
import type { Profile, Role } from '../types/auth'

/** The role the JWT carries (auth.users.raw_app_meta_data.role). Only the server can write it. */
export function claimRole(user: User | null): Role | null {
  const claim: unknown = user?.app_metadata?.role
  return claim === 'admin' || claim === 'user' ? claim : null
}

/**
 * Mirrors the database's is_admin(): admin if the JWT claim says so OR the profile row does.
 * The claim is read first so admins need no profile fetch; the profile covers tokens minted
 * before the claim existed and a promotion the token has not picked up yet.
 * This is a UI hint only. RLS is the real enforcement.
 */
export function resolveRole(user: User | null, profile: Profile | null): Role | null {
  if (!user) return null
  return claimRole(user) === 'admin' || profile?.role === 'admin' ? 'admin' : 'user'
}
