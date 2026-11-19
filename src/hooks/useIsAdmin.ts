import { useAuth } from '../context/AuthContext'

export interface IsAdminState {
  isAdmin: boolean
  /** True until the session check and role lookup finish. Don't flash admin controls or a sign-in prompt while true. */
  isLoading: boolean
}

/**
 * Thin wrapper over useAuth() for code that only cares about admin status. The role comes from
 * the JWT app_metadata claim or the profile row (see utils/authRole.ts), mirroring the
 * database's is_admin(). It is only a UI hint: RLS is the real enforcement.
 */
export function useIsAdmin(): IsAdminState {
  const { isAdmin, loading } = useAuth()
  return { isAdmin: isAdmin && !loading, isLoading: loading }
}
