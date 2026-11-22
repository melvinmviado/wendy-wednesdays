import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DemoAuthProvider } from '../../context/DemoAuthProvider'
import { useAuth } from '../../context/AuthContext'
import { AuthModal } from './AuthModal'
import { UserMenu } from './UserMenu'
import { initialsOf } from '../Avatar'

// The tests use the demo provider directly: no network, and it does not depend on a local .env.
function Harness({ onClose = () => {} }: { onClose?: () => void }) {
  const { isSignedIn, role } = useAuth()
  return (
    <>
      <p data-testid="state">{isSignedIn ? `in:${role}` : 'out'}</p>
      <AuthModal isOpen onClose={onClose} />
    </>
  )
}
const renderModal = (onClose?: () => void) =>
  render(<DemoAuthProvider><Harness onClose={onClose} /></DemoAuthProvider>)

describe('AuthModal', () => {
  beforeEach(() => localStorage.clear())

  it('shows tabs, Google, and the password form', () => {
    renderModal()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Sign in' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('button', { name: /continue with google/i })).toBeInTheDocument()
    expect(screen.getByLabelText('Email')).toBeInTheDocument()
  })

  it('validates before submitting and links errors to the fields', async () => {
    const user = userEvent.setup()
    renderModal()
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    const email = screen.getByLabelText('Email')
    expect(email).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByText('Enter your email address.')).toBeInTheDocument()
    expect(screen.getByText('Enter your password.')).toBeInTheDocument()
    expect(screen.getByTestId('state')).toHaveTextContent('out')

    await user.type(email, 'not-an-email')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(screen.getByText(/valid email address/i)).toBeInTheDocument()
  })

  it('toggles password visibility', async () => {
    const user = userEvent.setup()
    renderModal()
    const password = screen.getByLabelText('Password')
    expect(password).toHaveAttribute('type', 'password')
    await user.click(screen.getByRole('button', { name: 'Show password' }))
    expect(password).toHaveAttribute('type', 'text')
    await user.click(screen.getByRole('button', { name: 'Hide password' }))
    expect(password).toHaveAttribute('type', 'password')
  })

  it('signs in through the same form an admin uses, then closes', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    renderModal(onClose)
    await user.type(screen.getByLabelText('Email'), 'boss@example.com')
    await user.type(screen.getByLabelText('Password'), 'secret1')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('in:admin'))
    expect(onClose).toHaveBeenCalled()
  })

  it('create account enforces the minimum password length and signs in as a regular user', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    renderModal(onClose)
    await user.click(screen.getByRole('tab', { name: 'Create account' }))
    await user.type(screen.getByLabelText('Email'), 'new@example.com')
    await user.type(screen.getByLabelText('Password'), '123')
    await user.click(screen.getByRole('button', { name: 'Create account' }))
    expect(screen.getByText('Use at least 8 characters.')).toBeInTheDocument()
    await user.type(screen.getByLabelText('Password'), '45678')
    await user.click(screen.getByRole('button', { name: 'Create account' }))
    await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('in:user'))
    expect(onClose).toHaveBeenCalled()
  })

  it('email link shows a confirmation state with a way back', async () => {
    const user = userEvent.setup()
    renderModal()
    await user.click(screen.getByRole('button', { name: 'Email me a link instead' }))
    await user.type(screen.getByLabelText('Email'), 'me@example.com')
    await user.click(screen.getByRole('button', { name: /email me a sign-in link/i }))
    const status = await screen.findByRole('status')
    expect(within(status).getByText('Check your email')).toBeInTheDocument()
    expect(within(status).getByText('me@example.com')).toBeInTheDocument()
    await user.click(within(status).getByRole('button', { name: 'Use a different email' }))
    expect(screen.getByLabelText('Email')).toBeInTheDocument()
  })

  it('Continue with Google signs in (demo) and closes', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    renderModal(onClose)
    await user.click(screen.getByRole('button', { name: /continue with google/i }))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(screen.getByTestId('state')).toHaveTextContent('in:user')
  })

  it('closes on Escape', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    renderModal(onClose)
    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalled()
  })
})

describe('UserMenu', () => {
  beforeEach(() => {
    localStorage.clear()
    localStorage.setItem('wendy_demo_auth', JSON.stringify({ email: 'ada.lovelace@example.com', role: 'user' }))
  })

  const setup = () => {
    const handlers = { onProfile: vi.fn(), onAdminDashboard: vi.fn(), onSignOut: vi.fn() }
    render(<DemoAuthProvider><UserMenu {...handlers} /></DemoAuthProvider>)
    return handlers
  }

  it('opens a menu without the Admin dashboard item for a regular user', async () => {
    const user = userEvent.setup()
    const h = setup()
    await user.click(screen.getByRole('button', { name: /account menu/i }))
    expect(screen.getByRole('menuitem', { name: 'Profile' })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'Admin dashboard' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('menuitem', { name: 'Sign out' }))
    expect(h.onSignOut).toHaveBeenCalled()
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('closes on Escape and returns focus to the button', async () => {
    const user = userEvent.setup()
    setup()
    const button = screen.getByRole('button', { name: /account menu/i })
    await user.click(button)
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(button).toHaveFocus()
  })

  it('shows one Admin dashboard item for admins and calls its handler', async () => {
    localStorage.setItem('wendy_demo_auth', JSON.stringify({ email: 'boss@example.com', role: 'admin' }))
    const user = userEvent.setup()
    const h = setup()
    await user.click(screen.getByRole('button', { name: /account menu/i }))
    expect(screen.queryByText('Administration')).not.toBeInTheDocument()
    expect(screen.queryByRole('group')).not.toBeInTheDocument()
    await user.click(screen.getByRole('menuitem', { name: 'Admin dashboard' }))
    expect(h.onAdminDashboard).toHaveBeenCalled()
    expect(screen.queryByRole('menu')).not.toBeInTheDocument() // closes on click
  })

  it('reaches Admin dashboard by keyboard, between Profile and Sign out', async () => {
    localStorage.setItem('wendy_demo_auth', JSON.stringify({ email: 'boss@example.com', role: 'admin' }))
    const user = userEvent.setup()
    const h = setup()
    await user.click(screen.getByRole('button', { name: /account menu/i }))
    await user.keyboard('{ArrowDown}') // Profile -> Admin dashboard
    expect(screen.getByRole('menuitem', { name: 'Admin dashboard' })).toHaveFocus()
    await user.keyboard('{ArrowDown}')
    expect(screen.getByRole('menuitem', { name: 'Sign out' })).toHaveFocus()
    await user.keyboard('{ArrowUp}{Enter}')
    expect(h.onAdminDashboard).toHaveBeenCalled()
  })

  it('shows regular users only Profile, one separator and Sign out', async () => {
    const user = userEvent.setup()
    setup()
    await user.click(screen.getByRole('button', { name: /account menu/i }))
    expect(screen.getAllByRole('menuitem').map((e) => e.textContent?.trim())).toEqual(['Profile', 'Sign out'])
    expect(screen.getAllByRole('separator')).toHaveLength(1)
  })
})

describe('initialsOf', () => {
  it.each([['Ada Lovelace', 'AL'], ['ada.lovelace@example.com', 'AL'], ['plato', 'P'], ['', '?']])('%s -> %s', (n, i) => {
    expect(initialsOf(n)).toBe(i)
  })
})
