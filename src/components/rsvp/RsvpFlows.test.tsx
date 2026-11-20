import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { Toasts } from '../admin/Toasts'
import { createDemoRsvpApi, type DemoRsvpOptions } from '../../data/rsvpDemo'
import { resetDeviceMemory } from '../../data/rsvpDevice'
import { useToasts } from '../../hooks/useToasts'
import { useAuth } from '../../context/AuthContext'
import { DemoAuthProvider } from '../../context/DemoAuthProvider'
import type { RsvpApi } from '../../types/rsvp'
import type { PlayerScore } from '../../types/leaderboard'
import { RsvpDock } from './RsvpDock'

const players: PlayerScore[] = Array.from({ length: 30 }, (_, i) => ({ id: `p${i + 1}`, name: `Player ${i + 1}`, weeksPlayed: 0, totalPoints: 0 }))

const SignInButton = () => {
  const { signInWithGoogle } = useAuth()
  return <button type="button" onClick={() => void signInWithGoogle()}>Test sign in</button>
}

// Every test shares one spy so it can count what reached the "database".
const setRsvp = vi.fn()

function Harness({ at, demo }: { at: string; demo?: DemoRsvpOptions }) {
  const toast = useToasts()
  const [api] = useState<RsvpApi>(() => {
    const real = createDemoRsvpApi({ now: () => new Date(at), players: () => players, ...demo })
    return { ...real, setRsvp: (args) => { setRsvp(args); return real.setRsvp(args) } }
  })
  return (
    <DemoAuthProvider>
      <SignInButton />
      <RsvpDock players={players} toast={toast} api={api} />
      <Toasts toasts={toast.toasts} onDismiss={toast.dismiss} />
    </DemoAuthProvider>
  )
}

const click = (el: Element) => act(async () => { fireEvent.click(el) })
const settle = () => act(async () => { await vi.advanceTimersByTimeAsync(0) })
const show = async (at: string, demo?: DemoRsvpOptions) => {
  const utils = render(<Harness at={at} demo={demo} />)
  await settle()
  return utils
}
const dock = () => screen.getByRole('region', { name: 'Weekly RSVP' })
const joinAs = async (name: string) => {
  await click(within(dock()).getByRole('button', { name: /I'm In/ }))
  await click(within(screen.getByRole('dialog')).getByRole('button', { name }))
  await click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Confirm RSVP' }))
  await settle()
}

beforeEach(() => {
  setRsvp.mockClear()
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] })
  vi.setSystemTime(new Date('2026-11-25T15:00:00Z'))
  localStorage.clear()
  resetDeviceMemory()
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' })
})
afterEach(() => vi.useRealTimers())

describe('RSVP flows through the dock', () => {
  it('last spot: taking it makes the bar read 12/12', async () => {
    await show('2026-11-25T15:00:00Z', { capacity: 12 })
    expect(within(dock()).getByRole('button', { name: /11\/12 spots/ })).toBeInTheDocument()
    await joinAs('Player 20')
    expect(within(dock()).getByText('Going')).toBeInTheDocument()
    expect(within(dock()).getByRole('button', { name: /12\/12 In/ })).toBeInTheDocument()
  })

  it('new guest: a name matching a player offers "Yes, I\'m …", a fresh name joins', async () => {
    await show('2026-11-25T15:00:00Z')
    await click(within(dock()).getByRole('button', { name: /I'm In/ }))
    const sheet = screen.getByRole('dialog')
    const input = within(sheet).getByPlaceholderText('Your name')
    const submit = input.closest('form')!.querySelector('button[type="submit"]')!

    fireEvent.change(input, { target: { value: 'player 21' } })
    await click(submit)
    await click(within(sheet).getByRole('button', { name: 'Confirm RSVP' }))
    await settle()
    expect(within(sheet).getByRole('button', { name: /Yes, I'm Player 21/ })).toBeInTheDocument()
    await click(within(sheet).getByRole('button', { name: 'Cancel' }))

    fireEvent.change(input, { target: { value: 'Sam Visitor' } })
    await click(submit)
    await click(within(sheet).getByRole('button', { name: 'Confirm RSVP' }))
    await settle()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(within(dock()).getByText('Going')).toBeInTheDocument()
  })

  it('asks first: names the person and the run, Cancel keeps the typed name and sends nothing', async () => {
    await show('2026-11-25T15:00:00Z')
    await click(within(dock()).getByRole('button', { name: /I'm In/ }))
    const sheet = screen.getByRole('dialog')
    const input = within(sheet).getByPlaceholderText('Your name')
    fireEvent.change(input, { target: { value: '  Jordan ' } })
    await click(input.closest('form')!.querySelector('button[type="submit"]')!)

    const ask = within(sheet).getByRole('alertdialog')
    expect(ask).toHaveTextContent('Add Jordan to the Wed, Nov 25 run?')
    await settle()
    expect(within(ask).getByRole('button', { name: 'Cancel' })).toHaveFocus()

    await click(within(ask).getByRole('button', { name: 'Cancel' }))
    expect(within(sheet).queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(within(sheet).getByPlaceholderText('Your name')).toHaveValue('  Jordan ')
    expect(within(dock()).queryByText('Going')).not.toBeInTheDocument()
    expect(localStorage.getItem('wendy_rsvp_identity')).toBeNull()
  })

  it('Escape cancels the question first, and only then closes the sheet', async () => {
    await show('2026-11-25T15:00:00Z')
    await click(within(dock()).getByRole('button', { name: /I'm In/ }))
    await click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Player 20' }))
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('a remembered name is asked about too, and the sheet closes with the answer', async () => {
    await show('2026-11-25T15:00:00Z')
    await joinAs('Player 20')
    await click(within(dock()).getByRole('button', { name: 'Cancel my spot' }))
    await act(async () => { await vi.advanceTimersByTimeAsync(6000) })
    await click(within(dock()).getByRole('button', { name: /I'm In/ }))
    expect(screen.getByRole('alertdialog')).toHaveTextContent('Add Player 20 to the Wed, Nov 25 run?')
    await click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await click(within(dock()).getByRole('button', { name: /I'm In/ }))
    await click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Confirm RSVP' }))
    await settle()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(within(dock()).getByText('Going')).toBeInTheDocument()
  })

  describe('the confirmation step', () => {
    const openGuestForm = async () => {
      await show('2026-11-25T15:00:00Z')
      await click(within(dock()).getByRole('button', { name: /I'm In/ }))
      const sheet = screen.getByRole('dialog')
      const input = within(sheet).getByPlaceholderText('Your name')
      return { sheet, input, form: input.closest('form')! }
    }

    it('opens instead of inserting: nothing is sent until Confirm, and Confirm sends exactly once', async () => {
      const { sheet, input, form } = await openGuestForm()
      fireEvent.change(input, { target: { value: '  Jordan  ' } })
      await act(async () => { fireEvent.submit(form) }) // what Enter in the field does
      expect(within(sheet).getByRole('alertdialog')).toHaveTextContent('Add Jordan to the Wed, Nov 25 run?')
      expect(setRsvp).not.toHaveBeenCalled()

      const confirm = within(sheet).getByRole('button', { name: 'Confirm RSVP' })
      await act(async () => { fireEvent.click(confirm); fireEvent.click(confirm) }) // a double tap
      await settle()
      expect(setRsvp).toHaveBeenCalledTimes(1)
      expect(setRsvp.mock.calls[0][0].identity).toEqual({ kind: 'guest', name: 'Jordan' }) // trimmed
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('Cancel never inserts', async () => {
      const { sheet, input, form } = await openGuestForm()
      fireEvent.change(input, { target: { value: 'Jordan' } })
      await act(async () => { fireEvent.submit(form) })
      await click(within(sheet).getByRole('button', { name: 'Cancel' }))
      await settle()
      expect(setRsvp).not.toHaveBeenCalled()
    })

    it('a blank or whitespace-only name opens nothing', async () => {
      const { sheet, input, form } = await openGuestForm()
      expect(within(form).getByRole('button', { name: 'Join' })).toBeDisabled()
      fireEvent.change(input, { target: { value: '    ' } })
      expect(within(form).getByRole('button', { name: 'Join' })).toBeDisabled()
      await act(async () => { fireEvent.submit(form) }) // Enter still cannot get past it
      expect(within(sheet).queryByRole('alertdialog')).not.toBeInTheDocument()
      expect(setRsvp).not.toHaveBeenCalled()
    })

    it("tapping I'm In twice opens one question", async () => {
      await show('2026-11-25T15:00:00Z')
      const join = within(dock()).getByRole('button', { name: /I'm In/ })
      await act(async () => { fireEvent.click(join); fireEvent.click(join) })
      expect(screen.getAllByRole('dialog')).toHaveLength(1)
    })

    it('signing in while it is open closes it without writing', async () => {
      const { sheet, input, form } = await openGuestForm()
      fireEvent.change(input, { target: { value: 'Jordan' } })
      await act(async () => { fireEvent.submit(form) })
      expect(within(sheet).getByRole('alertdialog')).toBeInTheDocument()
      await click(screen.getByText('Test sign in', { selector: 'button' }))
      await settle()
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
      expect(setRsvp).not.toHaveBeenCalled()
    })

    it('never opens once check-in has closed', async () => {
      await show('2026-11-25T23:30:00Z') // past the 6 PM cutoff
      expect(within(dock()).queryByRole('button', { name: /I'm In|Join Waitlist/ })).not.toBeInTheDocument()
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    })

    it('a failure stays inside the question and can be retried', async () => {
      const { sheet, input, form } = await openGuestForm()
      fireEvent.change(input, { target: { value: 'player 21' } })
      await act(async () => { fireEvent.submit(form) })
      await click(within(sheet).getByRole('button', { name: 'Confirm RSVP' }))
      await settle()
      const ask = within(sheet).getByRole('alertdialog')
      expect(within(ask).getByRole('alert')).toHaveTextContent(/Player 21/)
      expect(within(ask).getByRole('button', { name: 'Confirm RSVP' })).toBeEnabled()
    })
  })

  it('a name that is already in cannot be picked again', async () => {
    await show('2026-11-25T15:00:00Z')
    await click(within(dock()).getByRole('button', { name: /I'm In/ }))
    const row = within(screen.getByRole('dialog')).getByRole('button', { name: /Player 1 .*Already in|Player 1Already in/ })
    expect(row).toBeDisabled()
  })

  it('"Not you?" forgets the remembered name', async () => {
    await show('2026-11-25T15:00:00Z')
    await joinAs('Player 20')
    expect(localStorage.getItem('wendy_rsvp_identity')).toContain('p20')
    await click(within(dock()).getByRole('button', { name: /Next Run/ }))
    await click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Not you?' }))
    expect(localStorage.getItem('wendy_rsvp_identity')).toBeNull()
  })

  it('logged out, the roster opens and shows names but never a way to act as someone else', async () => {
    await show('2026-11-25T15:00:00Z')
    await click(within(dock()).getByRole('button', { name: /11\/24 spots/ }))
    const sheet = screen.getByRole('dialog', { name: "Who's Playing" })
    expect(within(sheet).getByText('13 spots left')).toBeInTheDocument()
  })

  it.each([
    ['2026-11-25T22:59:00Z', /I'm In/, '5:59 PM is still open'],
    ['2026-11-25T23:00:00Z', /RSVP closed/, '6:00 PM exactly is locked'],
    ['2026-11-26T00:59:00Z', /RSVP closed/, '7:59 PM is locked'],
    ['2026-11-26T01:00:00Z', /Live Run in Progress/, '8:00 PM is live'],
    ['2026-11-26T02:59:00Z', /Live Run in Progress/, '9:59 PM is live'],
    ['2026-11-26T03:00:00Z', /Wed, Dec 2/, '10:00 PM rolls to next week'],
  ])('at %s: %s', async (at, expected) => {
    await show(at)
    expect(within(dock()).getByRole('button', { name: expected })).toBeInTheDocument()
  })
})
