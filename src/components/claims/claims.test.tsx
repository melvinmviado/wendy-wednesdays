import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ClaimQueue } from '../../hooks/useClaimQueue'

const m = vi.hoisted(() => ({
  auth: { user: { id: 'u1', is_anonymous: false } as { id: string; is_anonymous: boolean } | null, isSignedIn: true, isConfigured: true },
  fetchMyClaim: vi.fn(),
  fetchPlayerOwner: vi.fn(),
  submitClaim: vi.fn(),
}))

vi.mock('../../context/AuthContext', () => ({ useAuth: () => m.auth }))
vi.mock('../../data/claims', async (orig) => ({
  ...(await orig<typeof import('../../data/claims')>()),
  fetchMyClaim: m.fetchMyClaim,
  fetchPlayerOwner: m.fetchPlayerOwner,
  submitClaim: m.submitClaim,
}))

import { ClaimSection } from './ClaimSection'
import { ClaimRequestsDialog } from './ClaimRequestsDialog'

const empty = { linkedPlayer: null, latest: null }

beforeEach(() => {
  m.auth.user = { id: 'u1', is_anonymous: false }
  m.auth.isSignedIn = true
  m.auth.isConfigured = true
  m.fetchMyClaim.mockReset().mockResolvedValue(empty)
  m.fetchPlayerOwner.mockReset().mockResolvedValue(null)
  m.submitClaim.mockReset().mockResolvedValue(undefined)
})

describe('ClaimSection', () => {
  it('sends a request, then shows it as waiting', async () => {
    const user = userEvent.setup()
    render(<ClaimSection playerId="p1" playerName="Ada" />)
    await user.click(await screen.findByRole('button', { name: 'This is me' }))
    await user.type(screen.getByLabelText(/message for the admin/i), 'court 2')
    m.fetchMyClaim.mockResolvedValue({ linkedPlayer: null, latest: { id: 'r', playerId: 'p1', playerName: 'Ada', status: 'pending', createdAt: 'x' } })
    await user.click(screen.getByRole('button', { name: 'Send request' }))
    expect(m.submitClaim).toHaveBeenCalledWith('p1', 'u1', 'court 2')
    expect(await screen.findByText(/waiting for an admin/i)).toBeInTheDocument()
  })

  it('shows the database refusal in plain words and stays open', async () => {
    const user = userEvent.setup()
    m.submitClaim.mockRejectedValue({ code: '23505', message: 'x "claim_requests_one_pending_per_player"' })
    render(<ClaimSection playerId="p1" playerName="Ada" />)
    await user.click(await screen.findByRole('button', { name: 'This is me' }))
    await user.click(screen.getByRole('button', { name: 'Send request' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/already asked to claim this player/)
    expect(screen.getByRole('button', { name: 'Send request' })).toBeEnabled()
  })

  it('offers "Request again" after a decline', async () => {
    m.fetchMyClaim.mockResolvedValue({ linkedPlayer: null, latest: { id: 'r', playerId: 'p1', playerName: 'Ada', status: 'rejected', createdAt: 'x' } })
    render(<ClaimSection playerId="p1" playerName="Ada" />)
    expect(await screen.findByText(/declined your last request/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Request again' })).toBeInTheDocument()
  })

  it('says "This is you" on your own player', async () => {
    m.fetchPlayerOwner.mockResolvedValue('u1')
    render(<ClaimSection playerId="p1" playerName="Ada" />)
    expect(await screen.findByText('This is you')).toBeInTheDocument()
  })

  it.each([
    ['someone else owns the player', () => m.fetchPlayerOwner.mockResolvedValue('u2')],
    ['you already have a player', () => m.fetchMyClaim.mockResolvedValue({ linkedPlayer: { id: 'p9', name: 'Me' }, latest: null })],
  ])('renders nothing when %s', async (_n, arrange) => {
    arrange()
    const { container } = render(<ClaimSection playerId="p1" playerName="Ada" />)
    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument())
    expect(container).toBeEmptyDOMElement()
  })

  it.each([
    ['signed out', () => { m.auth.isSignedIn = false; m.auth.user = null }],
    ['an anonymous session', () => { m.auth.user = { id: 'u1', is_anonymous: true } }],
    ['demo mode', () => { m.auth.isConfigured = false }],
  ])('renders nothing and makes no requests when %s', (_n, arrange) => {
    arrange()
    const { container } = render(<ClaimSection playerId="p1" playerName="Ada" />)
    expect(container).toBeEmptyDOMElement()
    expect(m.fetchMyClaim).not.toHaveBeenCalled()
  })

  it('stays hidden (no error) when the claims migration is not applied', async () => {
    m.fetchMyClaim.mockRejectedValue({ code: 'PGRST205', message: 'no table' })
    const { container } = render(<ClaimSection playerId="p1" playerName="Ada" />)
    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument())
    expect(container).toBeEmptyDOMElement()
  })

  it('shows an error with a retry for any other failure', async () => {
    m.fetchMyClaim.mockRejectedValueOnce(new Error('network down'))
    render(<ClaimSection playerId="p1" playerName="Ada" />)
    expect(await screen.findByRole('alert')).toHaveTextContent('network down')
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('button', { name: 'This is me' })).toBeInTheDocument()
  })
})

const queue = (over: Partial<ClaimQueue> = {}): ClaimQueue => ({
  requests: [{ id: 'r1', playerId: 'p1', playerName: 'Ada', userId: 'u2', requesterName: 'Ada L', requesterEmail: 'ada@example.com', message: 'court 2', createdAt: '2026-01-02T00:00:00Z' }],
  linked: [{ playerId: 'p5', playerName: 'Grace', userId: 'u5', userName: 'Grace H' }],
  loading: false,
  error: null,
  actionError: null,
  busyId: null,
  unavailable: false,
  reload: vi.fn().mockResolvedValue(undefined),
  approve: vi.fn().mockResolvedValue(undefined),
  reject: vi.fn().mockResolvedValue(undefined),
  unlink: vi.fn().mockResolvedValue(undefined),
  ...over,
})

describe('ClaimRequestsDialog', () => {
  it('lists requests with their message and approves / rejects by id', async () => {
    const q = queue()
    const user = userEvent.setup()
    render(<ClaimRequestsDialog queue={q} onClose={() => {}} />)
    expect(screen.getByText('"court 2"')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'ada@example.com' })).toHaveAttribute('href', 'mailto:ada@example.com')
    await user.click(screen.getByRole('button', { name: /approve ada l for ada/i }))
    expect(q.approve).toHaveBeenCalledWith('r1')
    await user.click(screen.getByRole('button', { name: /reject ada l for ada/i }))
    expect(q.reject).toHaveBeenCalledWith('r1')
  })

  it('needs a second click to unlink', async () => {
    const q = queue()
    const user = userEvent.setup()
    render(<ClaimRequestsDialog queue={q} onClose={() => {}} />)
    await user.click(screen.getByRole('button', { name: /unlink grace/i }))
    expect(q.unlink).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: /confirm unlink grace/i }))
    expect(q.unlink).toHaveBeenCalledWith('p5')
  })

  it('cancelling the unlink confirmation does nothing', async () => {
    const q = queue()
    const user = userEvent.setup()
    render(<ClaimRequestsDialog queue={q} onClose={() => {}} />)
    await user.click(screen.getByRole('button', { name: /unlink grace/i }))
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(q.unlink).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: /unlink grace/i })).toBeInTheDocument()
  })

  it('disables every action while one is running', () => {
    render(<ClaimRequestsDialog queue={queue({ busyId: 'r1' })} onClose={() => {}} />)
    for (const b of screen.getAllByRole('button', { name: /approve|reject|unlink/i })) expect(b).toBeDisabled()
  })

  it('shows empty, loading, error and action-error states', async () => {
    const { rerender } = render(<ClaimRequestsDialog queue={queue({ requests: [], linked: [] })} onClose={() => {}} />)
    expect(screen.getByText('No requests waiting.')).toBeInTheDocument()
    expect(screen.getByText(/no players are linked/i)).toBeInTheDocument()

    rerender(<ClaimRequestsDialog queue={queue({ requests: [], linked: [], loading: true })} onClose={() => {}} />)
    expect(screen.getByRole('status')).toHaveTextContent('Loading claims')

    const q = queue({ error: 'Network down' })
    rerender(<ClaimRequestsDialog queue={q} onClose={() => {}} />)
    expect(screen.getByRole('alert')).toHaveTextContent('Network down')
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(q.reload).toHaveBeenCalled()

    rerender(<ClaimRequestsDialog queue={queue({ actionError: 'That request has already been handled.' })} onClose={() => {}} />)
    expect(screen.getByRole('alert')).toHaveTextContent('already been handled')
  })
})
