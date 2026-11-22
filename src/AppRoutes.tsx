import { Route, Routes } from 'react-router'
import App from './App'
import { AdminClaimsPage } from './pages/admin/AdminClaimsPage'
import { AdminDashboard } from './pages/admin/AdminDashboard'
import { AdminEventPage } from './pages/admin/AdminEventPage'
import { AdminEventsPage } from './pages/admin/AdminEventsPage'
import { AdminPlayersPage } from './pages/admin/AdminPlayersPage'
import { AdminSetupPage } from './pages/admin/AdminSetupPage'
import { AdminLayout } from './pages/admin/AdminLayout'
import { AdminNotFound } from './pages/admin/AdminNotFound'
import { AdminResultsPage } from './pages/admin/AdminResultsPage'
import { RulesPage } from './pages/RulesPage'

/** Every URL. The existing single-page app owns "/" and anything unknown; /admin/* is guarded by AdminLayout. */
export function AppRoutes() {
  return (
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
  )
}
