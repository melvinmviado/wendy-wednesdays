import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { Toasts } from '../admin/Toasts'
import { createDemoRsvpApi, type DemoRsvpOptions } from '../../data/rsvpDemo'
import { resetDeviceMemory } from '../../data/rsvpDevice'
import { useToasts } from '../../hooks/useToasts'
import { DemoAuthProvider } from '../../context/DemoAuthProvider'
import type { PlayerScore } from '../../types/leaderboard'
import { RsvpError } from '../../types/rsvp'
import { RsvpDock, UNDO_MS } from './RsvpDock'

const players: PlayerScore[] = Array.from({ length: 30 }, (_, i) => ({ id: `p${i + 1}`, name: `Player ${i + 1}`, weeksPlayed: 0, totalPoints: 0 }))

function Harness({ at, demo }: { at: string; demo?: DemoRsvpOptions }) {
  const toast = useToasts()
  const [api] = useState(() => createDemoRsvpApi({ now: () => new Date(at), players: () => players, ...demo }))
  return (
    <DemoAuthProvider>
      <RsvpDock players={players} toast={toast} api={api} />
      <Toasts toasts={toast.toasts} onDismiss={toast.dismiss} />
    </DemoAuthProvider>
  )
}

const renderDock = async (at: string, demo?: DemoRsvpOptions) => {
  // user-event waits on timers, which are faked here; a plain click is all these tests need
  const user = { click: (el: Element) => act(async () => { fireEvent.click(el) }) }
  const utils = render(<Harness at={at} demo={demo} />)
  await act(async () => { await vi.advanceTimersByTimeAsync(0) })
  return { user, ...utils }
}
const dock = () => screen.getByRole('region', { name: 'Weekly RSVP' })

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] })
  vi.setSystemTime(new Date('2026-11-25T15:00:00Z'))
  localStorage.clear()
  resetDeviceMemory()
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' })
})
afterEach(() => vi.useRealTimers())

describe('RsvpDock', () => {
  it('open: shows the spots and an I\'m In button, with 44px+ targets', async () => {
    await renderDock('2026-11-25T15:00:00Z')
    expect(within(dock()).getByRole('button', { name: /Wed, Nov 25 • 11\/24 spots/ })).toBeInTheDocument()
    const join = within(dock()).getByRole('button', { name: /I'm In/ })
    expect(join).toHaveClass('min-h-11')
  })

  it('asks who you are the first time, then shows a green Going pill straight away', async () => {
    const { user } = await renderDock('2026-11-25T15:00:00Z')
    await user.click(within(dock()).getByRole('button', { name: /I'm In/ }))
    const sheet = screen.getByRole('dialog', { name: "Who's Playing" })
    await user.click(within(sheet).getByRole('button', { name: 'Player 20' }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Confirm RSVP' }))
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(within(dock()).getByText('Going')).toBeInTheDocument()
    expect(within(dock()).getByRole('button', { name: /Next Run: Wed, Nov 25 • 12\/24 In/ })).toBeInTheDocument()

    // remembered: the next visit RSVPs in one tap
    expect(localStorage.getItem('wendy_rsvp_identity')).toContain('p20')
  })

  it('cancel shows an Undo toast; Undo keeps the spot and nothing is sent', async () => {
    const { user } = await renderDock('2026-11-25T15:00:00Z')
    await user.click(within(dock()).getByRole('button', { name: /I'm In/ }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Player 20' }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Confirm RSVP' }))
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })

    await user.click(within(dock()).getByRole('button', { name: 'Cancel my spot' }))
    expect(within(dock()).queryByText('Going')).not.toBeInTheDocument()
    expect(within(dock()).getByRole('button', { name: /I'm In/ })).toBeInTheDocument()
    expect(screen.getByText("You're out for Wed, Nov 25.")).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Undo' }))
    expect(within(dock()).getByText('Going')).toBeInTheDocument()
    await act(async () => { await vi.advanceTimersByTimeAsync(UNDO_MS + 1000) })
    expect(within(dock()).getByText('Going')).toBeInTheDocument()
  })

  it('tapping I\'m In inside the undo window also undoes the cancel', async () => {
    const { user } = await renderDock('2026-11-25T15:00:00Z')
    await user.click(within(dock()).getByRole('button', { name: /I'm In/ }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Player 20' }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Confirm RSVP' }))
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    await user.click(within(dock()).getByRole('button', { name: 'Cancel my spot' }))
    await user.click(within(dock()).getByRole('button', { name: /I'm In/ }))
    expect(within(dock()).getByText('Going')).toBeInTheDocument()
  })

  it('full: offers the waitlist, then shows the place with Cancel', async () => {
    const { user } = await renderDock('2026-11-25T15:00:00Z', { capacity: 11 })
    expect(within(dock()).getByRole('button', { name: /Full \(11\/11\)/ })).toBeInTheDocument()
    await user.click(within(dock()).getByRole('button', { name: 'Join Waitlist (#1)' }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Player 20' }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Confirm RSVP' }))
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    expect(within(dock()).getByText('Waitlist #1')).toBeInTheDocument()
    expect(within(dock()).getByRole('button', { name: 'Leave the waitlist' })).toBeInTheDocument()
  })

  it('locked: hides the toggle and shows the headcount', async () => {
    await renderDock('2026-11-25T23:30:00Z')
    expect(within(dock()).getByRole('button', { name: /RSVP closed • 11 playing/ })).toBeInTheDocument()
    expect(within(dock()).queryByRole('button', { name: /I'm In|Join Waitlist|Cancel/ })).not.toBeInTheDocument()
  })

  it('live: swaps to the banner, which opens tonight\'s roster', async () => {
    const { user } = await renderDock('2026-11-26T01:30:00Z')
    const banner = within(dock()).getByRole('button', { name: /Live Run in Progress/ })
    await user.click(banner)
    expect(screen.getByRole('dialog', { name: "Tonight's Roster" })).toBeInTheDocument()
    expect(within(screen.getByRole('dialog')).queryByLabelText('Who are you?')).not.toBeInTheDocument()
  })

  it('the headcount line opens Who\'s Playing with the list in order', async () => {
    const { user } = await renderDock('2026-11-25T15:00:00Z')
    await user.click(within(dock()).getByRole('button', { name: /11\/24 spots/ }))
    const sheet = screen.getByRole('dialog', { name: "Who's Playing" })
    expect(within(sheet).getByText(/Wed, Nov 25 • 11\/24 in/)).toBeInTheDocument()
    expect(within(sheet).getByText('13 spots left')).toBeInTheDocument()
    const playing = within(within(sheet).getByRole('region', { name: 'In' }))
    expect(playing.getAllByRole('listitem')).toHaveLength(11)
    expect(playing.getByText('Player 1')).toBeInTheDocument()
    expect(within(sheet).getAllByText('Guest')).toHaveLength(2)
  })

  it('announces headcount changes politely', async () => {
    await renderDock('2026-11-25T15:00:00Z')
    const live = within(dock()).getByRole('status')
    expect(live).toHaveAttribute('aria-live', 'polite')
    expect(live).toHaveTextContent('11 of 24 spots taken.')
  })

  it('steps out of the way (inert, off-screen) while a text field has focus', async () => {
    await renderDock('2026-11-25T15:00:00Z')
    const input = document.createElement('input')
    document.body.appendChild(input)
    act(() => input.focus())
    expect(dock()).toHaveClass('translate-y-full')
    expect(dock()).toHaveAttribute('inert')
    act(() => input.blur())
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    expect(dock()).not.toHaveClass('translate-y-full')
    input.remove()
  })

  it('reserves room so nothing hides behind it, and clears the home indicator', async () => {
    const { container } = await renderDock('2026-11-25T15:00:00Z')
    expect(container.querySelector('[aria-hidden="true"].h-\\[calc\\(var\\(--spacing-dock\\)\\+env\\(safe-area-inset-bottom\\)\\)\\]')).not.toBeNull()
    expect(dock().className).toContain('pb-[env(safe-area-inset-bottom)]')
    expect(dock().className).toContain('z-40')
  })
  it('renders nothing (and does not crash) when RSVPs turn out to be unavailable after mounting', async () => {
    // The first render has no error yet; the first fetch then reports the migration is missing.
    // Hooks after an early return would throw "Rendered fewer hooks than expected" here.
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    function Unavailable() {
      const toast = useToasts()
      const [api] = useState(() => {
        const base = createDemoRsvpApi({ now: () => new Date('2026-11-25T15:00:00Z'), players: () => players })
        return { ...base, getState: () => Promise.reject(new RsvpError('UNAVAILABLE')) }
      })
      return (
        <DemoAuthProvider>
          <RsvpDock players={players} toast={toast} api={api} />
        </DemoAuthProvider>
      )
    }
    render(<Unavailable />)
    expect(dock()).toBeInTheDocument()
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    expect(screen.queryByRole('region', { name: 'Weekly RSVP' })).not.toBeInTheDocument()
    expect(errors).not.toHaveBeenCalled()
    errors.mockRestore()
  })
})
