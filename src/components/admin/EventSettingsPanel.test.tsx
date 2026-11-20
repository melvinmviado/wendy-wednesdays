import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { EventSettings } from '../../lib/eventSettings'
import { EventSettingsPanel } from './EventSettingsPanel'

describe('EventSettingsPanel', () => {
  // Wed Nov 25 2026 (EST): saved cutoff 6 PM, run 8-10 PM. "Now" is Wednesday 3 PM, RSVPs open.
  const saved: EventSettings = {
    rsvpOpenAt: null,
    rsvpCutoffAt: '2026-11-25T23:00:00.000Z',
    eventStartAt: '2026-11-26T01:00:00.000Z',
    eventEndAt: '2026-11-26T03:00:00.000Z',
    timezone: 'America/Toronto',
    capacity: 24,
    updatedAt: '2026-11-20T00:00:00.000Z',
    updatedBy: null,
  }
  const setup = () => {
    const update = vi.fn(async (input) => ({ ok: true as const, data: { ...saved, ...input } }))
    const toast = vi.fn()
    const user = userEvent.setup()
    render(<EventSettingsPanel settings={saved} update={update} toast={toast} />)
    return { update, toast, user }
  }
  // datetime-local inputs are set directly: typing into them is not meaningful in jsdom
  const type = async (_user: ReturnType<typeof userEvent.setup>, label: string, value: string) => {
    fireEvent.change(screen.getByLabelText(label), { target: { value } })
  }

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] }) // freeze the clock only; user-event and promises need real timers
    vi.setSystemTime(new Date('2026-11-25T20:00:00Z'))
  })
  afterEach(() => vi.useRealTimers())

  it('shows the saved schedule with the zone label, and the form in the event zone', () => {
    setup()
    expect(screen.getByText('Wed, Nov 25, 8:00 PM – 10:00 PM EST')).toBeInTheDocument()
    expect(screen.getByText('RSVP closes Wed, Nov 25, 6:00 PM EST')).toBeInTheDocument()
    expect(screen.getByText('Eastern Time')).toBeInTheDocument()
    expect(screen.getByLabelText('RSVP cutoff')).toHaveValue('2026-11-25T18:00')
    expect(screen.getByRole('button', { name: 'Save settings' })).toBeDisabled() // nothing changed
  })

  it('shows inline errors on save and does not call the server', async () => {
    const { update, user } = setup()
    await type(user, 'Event end', '2026-11-25T19:00')
    await user.click(screen.getByRole('button', { name: 'Save settings' }))
    expect(screen.getByText('The event must end after it starts.')).toBeInTheDocument()
    expect(screen.getByLabelText('Event end')).toHaveAttribute('aria-invalid', 'true')
    expect(update).not.toHaveBeenCalled()
  })

  it('saves a valid change in UTC and confirms with a toast', async () => {
    const { update, toast, user } = setup()
    await type(user, 'RSVP cutoff', '2026-11-25T17:00')
    await user.click(screen.getByRole('button', { name: 'Save settings' }))
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ rsvpCutoffAt: '2026-11-25T22:00:00.000Z' }))
    expect(toast).toHaveBeenCalledWith('success', 'Event settings saved.')
  })

  it('asks first when the new cutoff would close open RSVPs right now', async () => {
    const { update, toast, user } = setup()
    await type(user, 'RSVP cutoff', '2026-11-25T14:00') // 2 PM; it is 3 PM
    await user.click(screen.getByRole('button', { name: 'Save settings' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Saving this will close them immediately')
    expect(update).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Close RSVPs now' }))
    expect(update).toHaveBeenCalledTimes(1)
    expect(toast).toHaveBeenCalledWith('success', 'Event settings saved.')
  })

  it('going back from the confirmation saves nothing', async () => {
    const { update, user } = setup()
    await type(user, 'RSVP cutoff', '2026-11-25T14:00')
    await user.click(screen.getByRole('button', { name: 'Save settings' }))
    await user.click(screen.getByRole('button', { name: 'Go back' }))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(update).not.toHaveBeenCalled()
  })

  it('reports a refusal from the server as an error toast', async () => {
    const update = vi.fn(async () => ({ ok: false as const, error: { code: 'FORBIDDEN' as const, message: 'Only admins can change the event settings.' } }))
    const toast = vi.fn()
    const user = userEvent.setup()
    render(<EventSettingsPanel settings={saved} update={update} toast={toast} />)
    await type(user, 'RSVP cutoff', '2026-11-25T17:00')
    await user.click(screen.getByRole('button', { name: 'Save settings' }))
    expect(toast).toHaveBeenCalledWith('error', 'Only admins can change the event settings.')
  })

  it('quick fill sets the run and the cutoff 24h before it', async () => {
    const { user } = setup()
    await user.click(screen.getByRole('button', { name: /Next Wednesday 7:00 to 9:00 PM/ }))
    expect(screen.getByLabelText('Event start')).toHaveValue('2026-11-25T19:00') // it is 3 PM Wednesday: 7 PM today is ahead
    expect(screen.getByLabelText('Event end')).toHaveValue('2026-11-25T21:00')
    await user.click(screen.getByRole('button', { name: 'Cutoff 24h before start' }))
    expect(screen.getByLabelText('RSVP cutoff')).toHaveValue('2026-11-24T19:00')
  })
})
