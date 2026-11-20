import { Link } from 'react-router'
import { ADMIN_ROUTES } from './adminRoutes'

export function AdminNotFound() {
  return (
    <div role="status" className="flex flex-col items-start gap-3 text-sm text-ink-soft">
      <p>There is no admin page at this address.</p>
      <Link to={ADMIN_ROUTES.dashboard} className="font-semibold text-ink underline underline-offset-2">
        Back to the admin dashboard
      </Link>
    </div>
  )
}
