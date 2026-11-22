import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { AppRoutes } from '../../AppRoutes'
import { AuthContext } from '../../context/authContextInstance'
import type { AuthContextValue } from '../../types/auth'

// App is the leaderboard home; the guard tests only need to know it was reached.
vi.mock('../../App', () => ({ default: () => <p>Leaderboard home</p> }))
vi.mock('../../components/admin/EventSettingsPanel', () => ({ EventSettingsPanel: () => <p>Settings panel</p> }))
vi.mock('../../hooks/useRsvp', () => ({ useRsvp: () => ({ unavailable: false, loading: false, capacity: 12, inCount: 5 }) }))
vi.mock('../../hooks/useEventSettings', () => ({ useEventSettings: () => ({ settings: null }) }))
vi.mock('../../components/rsvp/AdminRsvpList', () => ({ AdminRsvpList: () => <p>RSVP list</p> }))
vi.mock('../../components/WeeklyEntryScreen', () => ({ WeeklyEntryScreen: () => <p>Weekly entry</p> }))

const auth = (over: Partial<AuthContextValue>): AuthContextValue =>
  ({ isAdmin: false, loading: false, isSignedIn: false, isConfigured: false, ...over }) as AuthContextValue

// Admin pages are lazy-loaded route chunks (AppRoutes.tsx), so each test waits for its first element.
const renderAt = (path: string, value: AuthContextValue) =>
  render(
    <AuthContext.Provider value={value}>
      <MemoryRouter initialEntries={[path]}>
        <AppRoutes />
      </MemoryRouter>
    </AuthContext.Provider>,
  )

describe('admin guard', () => {
  it.each(['/admin', '/admin/event', '/admin/players', '/admin/setup', '/admin/results', '/admin/events', '/admin/claims', '/admin/nope'])(
    'sends a non-admin from %s back to the leaderboard',
    async (path) => {
      renderAt(path, auth({ isAdmin: false }))
      expect(await screen.findByText('Leaderboard home')).toBeInTheDocument()
      expect(screen.queryByText('Admin only')).not.toBeInTheDocument()
    },
  )

  it('waits for the role check instead of redirecting or showing admin content', async () => {
    renderAt('/admin/events', auth({ isAdmin: true, loading: true }))
    expect(await screen.findByText(/Checking access/)).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Checking access')
    expect(screen.queryByText('Leaderboard home')).not.toBeInTheDocument()
    expect(screen.queryByText('Settings panel')).not.toBeInTheDocument()
  })
})

describe('admin pages', () => {
  const admin = auth({ isAdmin: true })

  it('dashboard lists the three groups as links, with live badges and no back link', async () => {
    renderAt('/admin', admin)
    expect(await screen.findByRole('heading', { name: 'Admin dashboard' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Weekly event/ })).toHaveAttribute('href', '/admin/event')
    expect(screen.getByRole('link', { name: /Players/ })).toHaveAttribute('href', '/admin/players')
    expect(screen.getByRole('link', { name: /Event setup/ })).toHaveAttribute('href', '/admin/setup')
    expect(screen.getByText('5/12 in')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Admin dashboard/ })).not.toBeInTheDocument()
  })

  it.each([
    ['/admin/event', 'Weekly event', 'RSVP list'],
    ['/admin/setup', 'Event setup', 'Settings panel'],
    ['/admin/results', 'Enter weekly results', 'Weekly entry'],
    ['/admin/events', 'Event dates & RSVP', 'Settings panel'],
  ])('%s renders its task under the shared header with a back link', async (path, title, body) => {
    renderAt(path, admin)
    expect(await screen.findByRole('heading', { name: title })).toBeInTheDocument()
    expect(await screen.findByText(body)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Admin dashboard/ })).toHaveAttribute('href', '/admin')
  })

  it('shows a not-found state for an unknown admin path', async () => {
    renderAt('/admin/nope', admin)
    expect(await screen.findByText(/no admin page at this address/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to the admin dashboard' })).toHaveAttribute('href', '/admin')
  })
})
