import { lazy, Suspense, type ComponentType } from 'react'
import { Route, Routes } from 'react-router'
import App from './App'

/** A route component that is downloaded on first visit. Pages use named exports. */
function page<M>(load: () => Promise<M>, pick: (m: M) => ComponentType) {
  return lazy(() => load().then((m) => ({ default: pick(m) })))
}

// Everything under /admin (and the rules page) is split out of the public bundle: most visitors
// only ever see the leaderboard.
const AdminLayout = page(() => import('./pages/admin/AdminLayout'), (m) => m.AdminLayout)
const AdminDashboard = page(() => import('./pages/admin/AdminDashboard'), (m) => m.AdminDashboard)
const AdminEventPage = page(() => import('./pages/admin/AdminEventPage'), (m) => m.AdminEventPage)
const AdminEventsPage = page(() => import('./pages/admin/AdminEventsPage'), (m) => m.AdminEventsPage)
const AdminPlayersPage = page(() => import('./pages/admin/AdminPlayersPage'), (m) => m.AdminPlayersPage)
const AdminSetupPage = page(() => import('./pages/admin/AdminSetupPage'), (m) => m.AdminSetupPage)
const AdminResultsPage = page(() => import('./pages/admin/AdminResultsPage'), (m) => m.AdminResultsPage)
const AdminClaimsPage = page(() => import('./pages/admin/AdminClaimsPage'), (m) => m.AdminClaimsPage)
const AdminNotFound = page(() => import('./pages/admin/AdminNotFound'), (m) => m.AdminNotFound)
const RulesPage = page(() => import('./pages/RulesPage'), (m) => m.RulesPage)

function PageLoading() {
  return (
    <p role="status" className="p-8 text-center text-sm text-muted">
      Loading…
    </p>
  )
}

/** Every URL. The existing single-page app owns "/" and anything unknown; /admin/* is guarded by AdminLayout. */
export function AppRoutes() {
  return (
    <Suspense fallback={<PageLoading />}>
      <Routes>
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<AdminDashboard />} />
          <Route path="event" element={<AdminEventPage />} />
          <Route path="players" element={<AdminPlayersPage />} />
          <Route path="setup" element={<AdminSetupPage />} />
          <Route path="results" element={<AdminResultsPage />} />
          <Route path="events" element={<AdminEventsPage />} />
          <Route path="claims" element={<AdminClaimsPage />} />
          <Route path="*" element={<AdminNotFound />} />
        </Route>
        <Route path="/rules" element={<RulesPage />} />
        <Route path="*" element={<App />} />
      </Routes>
    </Suspense>
  )
}
