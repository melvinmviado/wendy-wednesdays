import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { EventSettings } from '../../lib/eventSettings'
import { getDockView } from '../../utils/rsvpDockView'
import { RsvpScheduleInfo } from './RsvpScheduleInfo'

// Wed Nov 25 2026, Toronto (EST): cutoff 6 PM = 23:00Z, run 8-10 PM = 01:00Z-03:00Z.
const at = (iso: string) => new Date(iso)

describe('RsvpScheduleInfo', () => {
  it('shows the run, the cutoff with its zone label, and a countdown', () => {
    render(<RsvpScheduleInfo sessionDate="2026-11-25" now={at('2026-11-25T20:45:00Z')} settings={null} />)
    expect(screen.getByText('Wed, Nov 25, 8:00 PM – 10:00 PM EST')).toBeInTheDocument()
    expect(screen.getByText('RSVP closes Wed, Nov 25, 6:00 PM EST')).toBeInTheDocument()
    expect(screen.getByText('(in 2h 15m)')).toBeInTheDocument()
  })

  it('shows "RSVP closed" from exactly the cutoff', () => {
    render(<RsvpScheduleInfo sessionDate="2026-11-25" now={at('2026-11-25T23:00:00Z')} settings={null} />)
    expect(screen.getByRole('status')).toHaveTextContent('RSVP closed')
    expect(screen.queryByText(/RSVP closes/)).not.toBeInTheDocument()
  })

  it('follows the admin settings, in the event zone whatever the viewer zone is', () => {
    const settings: EventSettings = {
      rsvpOpenAt: null,
      rsvpCutoffAt: '2026-11-25T20:00:00.000Z', // 3 PM EST, earlier than the default
      eventStartAt: '2026-11-26T00:30:00.000Z',
      eventEndAt: '2026-11-26T02:30:00.000Z',
      timezone: 'America/Toronto',
      capacity: 24,
      updatedAt: '2026-11-20T00:00:00.000Z',
      updatedBy: null,
    }
    render(<RsvpScheduleInfo sessionDate="2026-11-25" now={at('2026-11-25T19:00:00Z')} settings={settings} />)
    expect(screen.getByText('Wed, Nov 25, 7:30 PM – 9:30 PM EST')).toBeInTheDocument()
    expect(screen.getByText('RSVP closes Wed, Nov 25, 3:00 PM EST')).toBeInTheDocument()
    expect(screen.getByText('(in 1h)')).toBeInTheDocument()
  })

  it('renders nothing until the session is known', () => {
    const { container } = render(<RsvpScheduleInfo sessionDate={null} now={at('2026-11-25T19:00:00Z')} settings={null} />)
    expect(container).toBeEmptyDOMElement()
  })
})

describe('dock line countdown', () => {
  const base = {
    phase: 'open' as const, loading: false, failed: false, sessionDate: '2026-11-25', inCount: 5, capacity: 24,
    waitlistCount: 0, myStatus: null, myWaitlistPosition: null,
  }
  it('adds the time left only when given, and never once locked', () => {
    expect(getDockView({ ...base, closesIn: '3h 15m' })).toMatchObject({ line: 'Wed, Nov 25 • 5/24 spots • Closes in 3h 15m' })
    expect(getDockView(base)).toMatchObject({ line: 'Wed, Nov 25 • 5/24 spots' })
    expect(getDockView({ ...base, phase: 'locked', closesIn: '1 min' })).toMatchObject({ line: 'RSVP closed • 5 playing' })
  })
})
