import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DemoAuthProvider } from '../../context/DemoAuthProvider'
import { ProfileDialog } from './ProfileDialog'

// The real cropper needs canvas and layout; this stand-in "confirms" a small JPEG.
vi.mock('../results/PhotoCropModal', () => ({
  PhotoCropModal: ({ onConfirm, onCancel }: { onConfirm: (b: Blob) => void; onCancel: () => void }) => (
    <div>
      <button onClick={() => onConfirm(new Blob(['jpeg-bytes'], { type: 'image/jpeg' }))}>confirm crop</button>
      <button onClick={onCancel}>cancel crop</button>
    </div>
  ),
}))

const seed = (extra: object = {}) =>
  localStorage.setItem('wendy_demo_auth', JSON.stringify({ email: 'ada.lovelace@example.com', role: 'user', ...extra }))

const setup = () => {
  const onClose = vi.fn()
  const onSignOut = vi.fn()
  render(<DemoAuthProvider><ProfileDialog onClose={onClose} onSignOut={onSignOut} /></DemoAuthProvider>)
  return { onClose, onSignOut }
}
const file = (name: string, type: string, size = 100) => {
  const f = new File(['x'], name, { type })
  Object.defineProperty(f, 'size', { value: size })
  return f
}

describe('ProfileDialog (demo mode)', () => {
  beforeEach(() => {
    localStorage.clear()
    seed()
  })

  it('shows email and role read-only, and starts from the current name', () => {
    setup()
    expect(screen.getByText('ada.lovelace@example.com')).toBeInTheDocument()
    expect(screen.getByText('Member')).toBeInTheDocument()
    expect(screen.getByLabelText('Display name')).toHaveValue('ada.lovelace')
  })

  it('shows Admin for admins', () => {
    seed({ role: 'admin' })
    setup()
    expect(screen.getByText('Admin')).toBeInTheDocument()
  })

  it('validates the name and saves a valid one', async () => {
    const user = userEvent.setup()
    setup()
    const input = screen.getByLabelText('Display name')
    await user.clear(input)
    await user.type(input, '   ')
    await user.click(screen.getByRole('button', { name: 'Save name' }))
    expect(screen.getByText('Enter a display name.')).toBeInTheDocument()

    await user.clear(input)
    await user.type(input, 'Ada L')
    await user.click(screen.getByRole('button', { name: 'Save name' }))
    expect(await screen.findByText('Name saved.')).toBeInTheDocument()
    expect(JSON.parse(localStorage.getItem('wendy_demo_auth')!).displayName).toBe('Ada L')
    expect(screen.getByRole('button', { name: 'Save name' })).toBeDisabled() // nothing left to save
  })

  it('caps the name at 60 characters', async () => {
    const user = userEvent.setup()
    setup()
    const input = screen.getByLabelText('Display name')
    await user.clear(input)
    await user.type(input, 'x'.repeat(70))
    expect(input).toHaveValue('x'.repeat(60))
  })

  it('rejects the wrong file type and oversized files before cropping', async () => {
    const user = userEvent.setup({ applyAccept: false })
    setup()
    const input = screen.getByLabelText('Upload profile photo')
    await user.upload(input, file('a.svg', 'image/svg+xml'))
    expect(await screen.findByRole('alert')).toHaveTextContent(/JPEG, PNG or WebP/)
    await user.upload(input, file('big.png', 'image/png', 6 * 1024 * 1024))
    expect(await screen.findByRole('alert')).toHaveTextContent(/5 MB/)
    expect(screen.queryByText('confirm crop')).not.toBeInTheDocument()
  })

  it('crops, saves the photo, and can remove it', async () => {
    const user = userEvent.setup()
    setup()
    await user.upload(screen.getByLabelText('Upload profile photo'), file('me.png', 'image/png'))
    await user.click(await screen.findByText('confirm crop'))
    expect(await screen.findByText('Photo updated.')).toBeInTheDocument()
    await waitFor(() => expect(JSON.parse(localStorage.getItem('wendy_demo_auth')!).avatarUrl).toMatch(/^data:/))
    expect(screen.getByRole('button', { name: 'Change photo' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Remove' }))
    expect(await screen.findByText('Photo removed.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add photo' })).toBeInTheDocument()
    expect(JSON.parse(localStorage.getItem('wendy_demo_auth')!).avatarUrl).toBeNull()
  })

  it('keeps the typed name when the cropper is cancelled', async () => {
    const user = userEvent.setup()
    setup()
    const input = screen.getByLabelText('Display name')
    await user.clear(input)
    await user.type(input, 'Typed')
    await user.upload(screen.getByLabelText('Upload profile photo'), file('me.png', 'image/png'))
    await user.click(await screen.findByText('cancel crop'))
    expect(screen.getByLabelText('Display name')).toHaveValue('Typed')
  })

  it('signs out and closes', async () => {
    const user = userEvent.setup()
    const { onClose, onSignOut } = setup()
    await user.click(screen.getByRole('button', { name: 'Sign out' }))
    expect(onSignOut).toHaveBeenCalled()
    expect(onClose).toHaveBeenCalled()
  })
})
