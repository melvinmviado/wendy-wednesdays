import { ClaimRequestsPanel } from '../../components/claims/ClaimRequestsPanel'
import { useAdminContext } from './adminContext'

export function AdminClaimsPage() {
  const { claimQueue } = useAdminContext()
  return <ClaimRequestsPanel queue={claimQueue} />
}
