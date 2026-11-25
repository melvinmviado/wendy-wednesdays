import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import type { PublicBoard, PublicBoardApi, PublicSeat } from '@/lib/publicCourtBoard'
import { PublicCourtBoard } from './PublicCourtBoard'
import { TvCourtBoard } from './TvCourtBoard'

const seat = (id: string, name: string, seedRank: number, at: [number, number, number] | null): PublicSeat => ({
  playerId: id, name, avatarUrl: null, seedRank,
  courtPosition: at ? at[0] : null, courtNumber: at ? at[1] : null, slot: at ? at[2] : null,
})

const published = (): PublicBoard => ({
  sessionDate: '2026-11-25',
  publishedAt: '2026-11-25T23:10:00Z',
  seats: [
    seat('a', 'Ann', 1, [0, 10, 0]), seat('b', 'Bo', 2, [0, 10, 1]), seat('c', 'Cy', 3, [0, 10, 2]), seat('d', 'Di', 4, [0, 10, 3]),
    seat('e', 'Eli', 5, [1, 9, 0]), seat('f', 'Fay', 6, [1, 9, 1]), seat('g', 'Gus', 7, [1, 9, 2]), seat('h', 'Hal', 8, [1, 9, 3]),
    seat('y', 'Yan', 9, null),
  ],
})

function fakeApi(initial: PublicBoard | null) {
  let board = initial
  let onChange: (() => void) | null = null
  const api: PublicBoardApi = {
    load: vi.fn(async () => ({ ok: true as const, data: board })),
    subscribe: vi.fn((_d: string, cb: () => void, onLive?: (live: boolean) => void) => {
      onChange = cb
      onLive?.(true)
      return () => { onChange = null }
    }),
  }
  return { api, set: (b: PublicBoard | null) => { board = b }, fire: () => act(() => onChange?.()) }
}

const renderBoard = (board: PublicBoard | null, myPlayerId: string | null = null) => {
  const fake = fakeApi(board)
  render(<MemoryRouter><PublicCourtBoard sessionDate="2026-11-25" myPlayerId={myPlayerId} api={fake.api} /></MemoryRouter>)
  return { ...fake, user: userEvent.setup() }
}

beforeEach(() => {
  Object.defineProperty(window, 'isSecureContext', { configurable: true, value: true })
})

describe('PublicCourtBoard', () => {
  it('says when the courts are not posted yet', async () => {
    renderBoard(null)
    expect(await screen.findByText('Courts are posted once RSVP closes and the organizer publishes.')).toBeInTheDocument()
  })

  it('lists the courts top to bottom with the court number as the heading, then the alternates', async () => {
    renderBoard(published())
    const courts = await screen.findAllByRole('listitem', { name: /^Court \d+/ })
    expect(courts.map((c) => c.getAttribute('aria-label'))).toEqual(['Court 10, top court', 'Court 9, bottom court'])
    expect(within(courts[0]).getByRole('heading')).toHaveTextContent('Court10')
    for (const label of within(courts[0]).getAllByText('seed')) expect(label).toHaveClass('sr-only') // rank shown subtly, read out in words
    expect(within(screen.getByRole('region', { name: 'Sitting out / alternates' })).getByText('Yan')).toBeInTheDocument()
    expect(screen.getByText(/^Updated /)).toBeInTheDocument()
    expect(screen.getByText('Live')).toBeInTheDocument()
  })

  it.each([
    [0, 'Nobody is on the courts for this run.'],
    [3, 'Not enough players for a full court of four.'],
  ])('with %i players published, says why there are no courts (not "not posted yet")', async (count, message) => {
    const board = published()
    board.seats = board.seats.slice(0, count).map((s) => ({ ...s, courtPosition: null, courtNumber: null, slot: null }))
    renderBoard(board)
    expect(await screen.findByText(message)).toBeInTheDocument()
    expect(screen.queryByText(/Courts are posted once/)).not.toBeInTheDocument()
  })

  it('pins my court with my three co-players, and marks my card in words', async () => {
    renderBoard(published(), 'f')
    const banner = await screen.findByRole('region', { name: 'Your court' })
    expect(banner).toHaveTextContent('Court 9')
    expect(banner).toHaveTextContent('With Eli, Gus and Hal')
    const mine = screen.getByRole('listitem', { name: 'Court 9, bottom court, your court' })
    expect(within(mine).getByText('Your court')).toBeInTheDocument()
    expect(within(mine).getByText('(you)')).toBeInTheDocument()
  })

  it('tells an alternate plainly', async () => {
    renderBoard(published(), 'y')
    expect(await screen.findByRole('region', { name: "You're an alternate" })).toBeInTheDocument()
  })

  it('filters to the courts with a matching player', async () => {
    const { user } = renderBoard(published())
    await user.type(await screen.findByRole('searchbox', { name: 'Find a player by name' }), 'gus')
    expect(screen.getAllByRole('listitem', { name: /^Court \d+/ }).map((c) => c.getAttribute('aria-label'))).toEqual(['Court 9, bottom court'])
    expect(screen.getByText('Gus').tagName).toBe('MARK')
    expect(screen.getByText('1 player found')).toBeInTheDocument()
  })

  it('copies the courts as text for the group chat, and shows a QR code to the page', async () => {
    const { user } = renderBoard(published())
    await user.click(await screen.findByRole('button', { name: 'Copy as text' }))
    expect(await navigator.clipboard.readText()).toBe(
      `Courts, Wed, Nov 25\nCourt 10: Ann, Bo, Cy, Di\nCourt 9: Eli, Fay, Gus, Hal\nSitting out: Yan\n${window.location.origin}/events/2026-11-25/courts`,
    )
    await user.click(screen.getByRole('button', { name: 'QR code' }))
    expect(screen.getByRole('img', { name: 'QR code: scan to open the courts on your phone' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'TV mode' })).toHaveAttribute('href', '/events/2026-11-25/courts?tv=1')
  })

  it('updates live when the organizer changes the board', async () => {
    const { set, fire } = renderBoard(published())
    await screen.findByText('Ann')
    const next = published()
    next.seats[0] = { ...next.seats[0], name: 'Ann B.' }
    set(next)
    fire()
    expect(await screen.findByText('Ann B.', {}, { timeout: 2000 })).toBeInTheDocument()
  })
})

describe('TvCourtBoard', () => {
  it('shows every court in big type with no navigation', async () => {
    const { api } = fakeApi(published())
    render(<TvCourtBoard sessionDate="2026-11-25" api={api} />)
    expect(await screen.findByRole('heading', { level: 1, name: 'Courts · Wed, Nov 25' })).toBeInTheDocument()
    expect(within(screen.getByRole('list', { name: 'Courts, top to bottom' })).getAllByRole('heading').map((h) => h.textContent)).toEqual(['10', '9'])
    expect(screen.getByText('TOP')).toBeInTheDocument()
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument()
  })
})
