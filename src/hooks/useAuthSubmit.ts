import { useCallback, useState } from 'react'
import type { AppAuthError, AuthResult } from '../types/auth'
import { toAuthError } from '../utils/authErrors'

export interface AuthSubmit {
  busy: boolean
  error: AppAuthError | null
  clearError: () => void
  /** Runs one auth action: tracks busy, captures its error, and returns the result (null if it threw). */
  run: <T extends AuthResult>(call: () => Promise<T>) => Promise<T | null>
}

/** Shared busy/error state for the sign-in dialog, so every method disables together. */
export function useAuthSubmit(): AuthSubmit {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<AppAuthError | null>(null)

  const run = useCallback(async <T extends AuthResult>(call: () => Promise<T>): Promise<T | null> => {
    setBusy(true)
    setError(null)
    try {
      const result = await call()
      if (result.error) setError(result.error)
      return result
    } catch (e: unknown) {
      setError(toAuthError(e))
      return null
    } finally {
      setBusy(false)
    }
  }, [])

  const clearError = useCallback(() => setError(null), [])
  return { busy, error, clearError, run }
}
