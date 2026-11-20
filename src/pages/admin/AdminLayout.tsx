import { ArrowLeft, ChevronLeft, Loader2, Lock } from 'lucide-react'
import { Link, Navigate, Outlet, useLocation } from 'react-router'
import { WebsiteLogo } from '../../components/WebsiteLogo'
import { Toasts } from '../../components/admin/Toasts'
import { useAuth } from '../../context/AuthContext'
import { useClaimQueue } from '../../hooks/useClaimQueue'
import { useIsAdmin } from '../../hooks/useIsAdmin'
import { useToasts } from '../../hooks/useToasts'
import type { AdminContext } from './adminContext'
import { ADMIN_ROUTES } from './adminRoutes'
import { adminTitleFor, DASHBOARD_TITLE } from './adminTasks'

const focus = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-hover'

/**
 * Shared frame for every /admin page and the single admin guard.
 * While auth is loading nothing admin-shaped renders; non-admins and signed-out users go home.
 */
export function AdminLayout() {
  const { isAdmin, isLoading } = useIsAdmin()
  const { pathname } = useLocation()
  const { isConfigured } = useAuth()
  const toasts = useToasts()
  // false until the role check passes, so nothing is fetched for a non-admin
  const claimQueue = useClaimQueue(isAdmin && isConfigured)

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-ground text-ink-soft">
        <p role="status" className="flex items-center gap-2">
          <Loader2 className="h-4 w-4 motion-safe:animate-spin" aria-hidden="true" /> Checking access…
        </p>
      </div>
    )
  }
  if (!isAdmin) return <Navigate to="/" replace />

  const title = adminTitleFor(pathname)
  const isDashboard = title === DASHBOARD_TITLE

  return (
    <div className="min-h-screen bg-ground text-ink">
      <header className="sticky top-0 z-30 w-full border-b border-line bg-ground">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3 px-4 py-3 text-sm sm:px-6">
          <Link to="/" className={`inline-flex min-h-11 items-center gap-2 rounded-lg font-semibold text-ink-soft hover:text-ink ${focus}`}>
            <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Leaderboard
          </Link>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 py-1 text-ink-soft">
            <Lock className="h-3.5 w-3.5" aria-hidden="true" /> Admin only
          </span>
        </div>
      </header>

      <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-8 sm:px-6 sm:py-12">
        {!isDashboard && (
          <Link to={ADMIN_ROUTES.dashboard} className={`-mb-2 inline-flex min-h-11 w-fit items-center gap-1 rounded-lg text-sm font-semibold text-ink-soft hover:text-ink ${focus}`}>
            <ChevronLeft className="h-4 w-4" aria-hidden="true" /> Admin dashboard
          </Link>
        )}
        <div className="flex items-center gap-3">
          <WebsiteLogo size="md" />
          <h1 className="text-2xl font-black text-ink">{title ?? 'Page not found'}</h1>
        </div>
        <Outlet context={{ toasts, claimQueue } satisfies AdminContext} />
      </main>
      <Toasts toasts={toasts.toasts} onDismiss={toasts.dismiss} />
    </div>
  )
}
