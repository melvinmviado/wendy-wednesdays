import { useOutletContext } from 'react-router'
import type { useClaimQueue } from '../../hooks/useClaimQueue'
import type { ToastApi } from '../../hooks/useToasts'

/** What AdminLayout shares with its pages. One claim queue so the dashboard badge and the claims page agree. */
export interface AdminContext {
  toasts: ToastApi
  claimQueue: ReturnType<typeof useClaimQueue>
}

export const useAdminContext = () => useOutletContext<AdminContext>()
