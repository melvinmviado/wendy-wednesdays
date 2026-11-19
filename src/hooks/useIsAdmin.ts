import { useAuth } from '../context/AuthContext'

export interface IsAdminState {
  isAdmin: boolean
  /** True until the first session check finishes. Don't flash admin controls or a sign-in prompt while true. */
  isLoading: boolean
}

/**
 * Whether the current visitor sees admin controls. This mirrors the database's `is_admin()`
 * (any signed-in Supabase user), but it is only a UI hint: RLS is the real enforcement.
 * Tighten both together if admin identity ever moves to an `admins` table.
 */
export function useIsAdmin(): IsAdminState {
  const { isAdmin, isLoading } = useAuth()
  return { isAdmin: isAdmin && !isLoading, isLoading }
}
