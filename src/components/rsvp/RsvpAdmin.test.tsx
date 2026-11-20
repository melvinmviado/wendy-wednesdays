import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { createDemoRsvpApi } from '../../data/rsvpDemo'
import { resetDeviceMemory } from '../../data/rsvpDevice'
import { saveDemoSession } from '../../context/demoAuth'
import { DemoAuthProvider } from '../../context/DemoAuthProvider'
import { useToasts } from '../../hooks/useToasts'
import type { PlayerScore } from '../../types/leaderboard'
import { ADMIN_ONLY_MESSAGE, RsvpError, type RsvpApi } from '../../types/rsvp'
import { RsvpDock } from './RsvpDock'

const players: PlayerScore[] = Array.from({ length: 30 }, (_, i) => ({ id: `p${i + 1}`, name: `Player ${i + 1}`, weeksPlayed: 0, totalPoints: 0 }))
// Wed Nov 25 2026, 10 AM Toronto: open. Players 1-9 and two guests start out "in" (11 of 24).
const NOW = new Date('2026-11-25T15:00:00Z')

let api: RsvpApi
function Harness() {
  const toast = useToasts()
  return (
    <DemoAuthProvider>
      <RsvpDock players={players} toast={toast} api={api} />
    </DemoAuthProvider>
  )
}

const click = (el: Element) => act(async () => { fireEvent.click(el) })
const settle = () => act(async () => { await vi.advanceTimersByTimeAsync(0) })
const list = (sheet: HTMLElement, group = 'In') => within(within(sheet).getByRole('region', { name: group }))
const openSheet = async (role: 'admin' | 'user') => {
  saveDemoSession({ email: 'a@example.com', role })
  render(<Harness />)
  await settle()
  await click(within(screen.getByRole('region', { name: 'Weekly RSVP' })).getByRole('button', { name: /spots/ }))
  return screen.getByRole('dialog')
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] })
  vi.setSystemTime(NOW)
  localStorage.clear()
  resetDeviceMemory()
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' })
  api = createDemoRsvpApi({ now: () => new Date(), players: () => players })
})
afterEach(() => vi.useRealTimers())

describe('admin RSVP controls', () => {
  it('are not rendered for a signed-in non-admin', async () => {
    const sheet = await openSheet('user')
    expect(list(sheet).getByText('Player 1')).toBeInTheDocument()
    expect(within(sheet).queryByRole('button', { name: /Add player/ })).toBeNull()
    expect(within(sheet).queryByRole('button', { name: /^Remove / })).toBeNull()
  })

  it('removing asks first; cancel puts focus back; confirm updates the list and the count at once', async () => {
    const sheet = await openSheet('admin')
    const remove = within(sheet).getByRole('button', { name: 'Remove Player 1 from the list' })
    expect(remove).toHaveClass('h-11', 'w-11') // 44px target

    await click(remove)
    const confirm = within(sheet).getByRole('group', { name: 'Confirm removing Player 1' })
    expect(within(confirm).getByRole('button', { name: 'Cancel' })).toHaveFocus()
    await click(within(confirm).getByRole('button', { name: 'Cancel' }))
    expect(within(sheet).getByRole('button', { name: 'Remove Player 1 from the list' })).toHaveFocus()
    expect(within(sheet).getByText(/11\/24 in/)).toBeInTheDocument()

    await click(within(sheet).getByRole('button', { name: 'Remove Player 1 from the list' }))
    await click(within(sheet).getByRole('button', { name: 'Remove' }))
    await settle()
    expect(list(sheet).queryByText('Player 1')).toBeNull()
    expect(within(sheet).getByText(/10\/24 in/)).toBeInTheDocument()
    expect(within(sheet).getByRole('status')).toHaveTextContent('Player 1 removed for Wed, Nov 25.')
  })

  it('Escape closes the confirm question, not the sheet', async () => {
    const sheet = await openSheet('admin')
    await click(within(sheet).getByRole('button', { name: 'Remove Player 2 from the list' }))
    await act(async () => { fireEvent.keyDown(within(sheet).getByRole('button', { name: 'Cancel' }), { key: 'Escape' }) })
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(within(sheet).queryByRole('group')).toBeNull()
  })

  it('removes a guest after confirming; the row and the count update at once', async () => {
    const sheet = await openSheet('admin')
    await click(within(sheet).getByRole('button', { name: 'Remove Riley Park from the list' }))
    expect(within(sheet).getByRole('group', { name: 'Confirm removing Riley Park' })).toBeInTheDocument()
    await click(within(sheet).getByRole('button', { name: 'Remove' }))
    await settle()
    expect(list(sheet).queryByText('Riley Park')).toBeNull()
    expect(list(sheet).getByText('Jamie Ortiz')).toBeInTheDocument() // the other guest is untouched
    expect(within(sheet).getByText(/10\/24 in/)).toBeInTheDocument()
    expect(within(sheet).getByRole('status')).toHaveTextContent('Riley Park removed (guest).')
  })

  it('does not offer guest controls to a signed-in non-admin', async () => {
    const sheet = await openSheet('user')
    expect(within(sheet).queryByRole('button', { name: /Add guest/ })).toBeNull()
    expect(within(sheet).queryByRole('button', { name: 'Remove Riley Park from the list' })).toBeNull()
  })

  it('adds a guest by name, stays open for the next, and Escape closes only the form', async () => {
    const sheet = await openSheet('admin')
    await click(within(sheet).getByRole('button', { name: /Add guest/ }))
    const input = within(sheet).getByRole('textbox', { name: 'Guest name' })
    expect(input).toHaveFocus()
    expect(within(sheet).getByRole('button', { name: /^Add$/ })).toBeDisabled() // too short

    await act(async () => { fireEvent.change(input, { target: { value: '  Sam   Lee ' } }) })
    await click(within(sheet).getByRole('button', { name: /^Add$/ }))
    await settle()
    expect(list(sheet).getByText('Sam Lee')).toBeInTheDocument()
    expect(within(sheet).getByText(/12\/24 in/)).toBeInTheDocument()
    expect(within(sheet).getByRole('status')).toHaveTextContent('Sam Lee added as a guest for Wed, Nov 25.')
    expect(input).toHaveValue('')
    expect(input).toHaveFocus()

    await act(async () => { fireEvent.keyDown(input, { key: 'Escape' }) })
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(within(sheet).queryByRole('textbox', { name: 'Guest name' })).toBeNull()
    expect(within(sheet).getByRole('button', { name: /Add guest/ })).toHaveFocus()
  })

  it("shows the server's message when a guest name is an existing player", async () => {
    const sheet = await openSheet('admin')
    await click(within(sheet).getByRole('button', { name: /Add guest/ }))
    await act(async () => { fireEvent.change(within(sheet).getByRole('textbox', { name: 'Guest name' }), { target: { value: 'player 20' } }) })
    await click(within(sheet).getByRole('button', { name: /^Add$/ }))
    await settle()
    expect(within(sheet).getByRole('alert')).toHaveTextContent('Did you mean Player 20?')
    expect(within(sheet).getByText(/11\/24 in/)).toBeInTheDocument() // rolled back
  })

  it('adds a player from a searchable picker and keeps it open for the next one', async () => {
    const sheet = await openSheet('admin')
    await click(within(sheet).getByRole('button', { name: /Add player/ }))
    const search = within(sheet).getByRole('searchbox', { name: 'Search players' })
    expect(search).toHaveFocus()
    expect(within(sheet).queryByRole('button', { name: 'Add Player 1' })).toBeNull() // already in

    await act(async () => { fireEvent.change(search, { target: { value: 'player 20' } }) })
    expect(within(sheet).getAllByRole('button', { name: /^Add Player/ })).toHaveLength(1)
    await click(within(sheet).getByRole('button', { name: 'Add Player 20' }))
    await settle()

    expect(within(sheet).getByText(/12\/24 in/)).toBeInTheDocument()
    expect(within(sheet).getByRole('status')).toHaveTextContent('Player 20 added for Wed, Nov 25.')
    expect(within(sheet).getByRole('searchbox', { name: 'Search players' })).toHaveFocus()
    expect(within(sheet).getByRole('searchbox', { name: 'Search players' })).toHaveValue('')
    expect(within(sheet).queryByRole('button', { name: 'Add Player 20' })).toBeNull()
  })

  it('moves through the results with the arrow keys; Escape closes only the picker and refocuses Add player', async () => {
    const sheet = await openSheet('admin')
    await click(within(sheet).getByRole('button', { name: /Add player/ }))
    const search = within(sheet).getByRole('searchbox', { name: 'Search players' })
    await act(async () => { fireEvent.keyDown(search, { key: 'ArrowDown' }) })
    expect(within(sheet).getByRole('button', { name: 'Add Player 10' })).toHaveFocus()
    await act(async () => { fireEvent.keyDown(document.activeElement as Element, { key: 'ArrowUp' }) })
    expect(search).toHaveFocus()

    await act(async () => { fireEvent.keyDown(search, { key: 'Escape' }) })
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(within(sheet).queryByRole('searchbox', { name: 'Search players' })).toBeNull()
    expect(within(sheet).getByRole('button', { name: /Add player/ })).toHaveFocus()
  })

  it('shows an inline error and rolls the list back when the server refuses', async () => {
    vi.spyOn(api, 'adminRemoveRsvp').mockRejectedValue(new RsvpError('FORBIDDEN', { message: ADMIN_ONLY_MESSAGE }))
    const sheet = await openSheet('admin')
    await click(within(sheet).getByRole('button', { name: 'Remove Player 3 from the list' }))
    await click(within(sheet).getByRole('button', { name: 'Remove' }))
    await settle()
    expect(list(sheet).getByText('Player 3')).toBeInTheDocument()
    expect(within(sheet).getByText(/11\/24 in/)).toBeInTheDocument()
    expect(within(sheet).getByRole('alert')).toHaveTextContent(ADMIN_ONLY_MESSAGE)
  })

  it('disables every admin button while a change is in flight', async () => {
    let release: () => void = () => {}
    const real = api.adminRemoveRsvp.bind(api)
    vi.spyOn(api, 'adminRemoveRsvp').mockImplementation((args) => new Promise((resolve) => { release = () => resolve(real(args)) }))
    const sheet = await openSheet('admin')
    await click(within(sheet).getByRole('button', { name: 'Remove Player 4 from the list' }))
    await click(within(sheet).getByRole('button', { name: 'Remove' }))
    expect(within(sheet).getByRole('button', { name: /Add player/ })).toBeDisabled()
    expect(within(sheet).getByRole('button', { name: 'Remove Player 5 from the list' })).toBeDisabled()
    await act(async () => { release() })
    await settle()
    expect(within(sheet).getByRole('button', { name: /Add player/ })).toBeEnabled()
  })
})
