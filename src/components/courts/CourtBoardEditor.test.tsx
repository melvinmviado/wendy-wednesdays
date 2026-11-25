import { describe, expect, it, vi } from 'vitest'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import type { BoardData, CourtBoardApi } from '@/lib/courtBoard'
import type { CourtAssignmentsApi } from '@/lib/courtSettings'
import type { ToastApi, ToastOptions } from '@/hooks/useToasts'
import { applyEdit, type BoardEdit, type BoardEntry } from '@/utils/courtBoardModel'
import { CourtBoardEditor } from './CourtBoardEditor'

const p = (id: string, name: string, seat: BoardEntry['seat'], seedRank: number): BoardEntry => ({ id, name, avatarUrl: null, seat, seedRank })

// Courts 10 (top) and 9 (bottom). Four on court 10, Eve sitting out, court 9 empty.
const draft = (): BoardData => ({
  sessionDate: '2026-11-25',
  courtNumbers: [10, 9],
  autoPublish: false,
  state: 'draft',
  manuallyEdited: false,
  generatedAt: '2026-11-25T23:05:00Z',
  publishedAt: null,
  rsvpChanges: [],
  entries: [
    p('p1', 'Ann', { courtPosition: 0, slot: 0 }, 1),
    p('p2', 'Bo', { courtPosition: 0, slot: 1 }, 2),
    p('p3', 'Cy', { courtPosition: 0, slot: 2 }, 3),
    p('p4', 'Di', { courtPosition: 0, slot: 3 }, 4),
    p('p5', 'Eve', null, 5),
  ],
})

/** An in-memory server: edits apply the way the database would, and Realtime can be fired by hand. */
function setup(initial: BoardData | null = draft()) {
  let board = initial
  let realtime: (() => void) | null = null
  const api = {
    load: vi.fn(async () => ({ ok: true as const, data: board ? structuredClone(board) : null })),
    edit: vi.fn(async (_d: string, e: BoardEdit) => {
      if (board) board = { ...board, entries: applyEdit(board.entries, e), manuallyEdited: true }
      return { ok: true as const, data: null }
    }),
    setPublished: vi.fn(async (_d: string, published: boolean) => {
      const state = published ? ('published' as const) : ('draft' as const)
      if (board) board = { ...board, state }
      return { ok: true as const, data: state }
    }),
    activity: vi.fn(async () => ({ ok: true as const, data: [] })),
    candidates: vi.fn(async () => ({ ok: true as const, data: [{ id: 'p9', name: 'Nia', avatarUrl: null, rsvpd: true }] })),
    subscribe: vi.fn((_d: string, onChange: () => void) => {
      realtime = onChange
      return () => { realtime = null }
    }),
  }
  const generate = vi.fn(async () => ({
    ok: true as const,
    data: { skipped: false, action: 'regenerate' as const, state: 'draft' as const, courts: 1, sittingOut: 1, convertedGuests: 0 },
  }))
  const toast = vi.fn<(kind: 'success' | 'error', message: string, options?: ToastOptions) => number>(() => 0)
  render(
    <MemoryRouter>
      <CourtBoardEditor
        sessionDate="2026-11-25"
        timeZone="America/Toronto"
        toast={toast as ToastApi['push']}
        api={api as unknown as CourtBoardApi}
        generate={generate as unknown as CourtAssignmentsApi['generate']}
      />
    </MemoryRouter>,
  )
  return {
    api, generate, toast, user: userEvent.setup(),
    setServer: (b: BoardData) => { board = b },
    fireRealtime: () => act(() => realtime?.()),
  }
}

const chip = (name: string) => screen.getByRole('button', { name: new RegExp(`^${name}, seed`) })
const court = (n: number) => screen.getByRole('listitem', { name: `Court ${n}` })

describe('CourtBoardEditor', () => {
  it('shows the courts top to bottom with TOP / BOTTOM, the tray, and the draft badge', async () => {
    setup()
    expect(await screen.findByText('Draft - not visible to players')).toBeInTheDocument()
    const courts = within(screen.getByRole('list', { name: 'Courts, top to bottom' })).getAllByRole('heading')
    expect(courts.map((h) => h.textContent)).toEqual(['Court 10', 'Court 9'])
    expect(within(court(10)).getByText('TOP')).toBeInTheDocument()
    expect(within(court(9)).getByText('BOTTOM')).toBeInTheDocument()
    expect(within(court(9)).getByText('Not in use')).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: /Sitting out/ })).getByRole('button', { name: /^Eve, seed 5/ })).toBeInTheDocument()
  })

  it('swaps by tapping two players, saves it, and offers Undo', async () => {
    const { api, toast, user } = setup()
    await user.click(await screen.findByRole('button', { name: /^Ann, seed/ }))
    expect(chip('Ann')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText(/Tap another player to swap/)).toBeInTheDocument()
    await user.click(chip('Eve'))

    // Shown at once: Eve took Ann's seat, Ann is sitting out.
    expect(within(court(10)).getByRole('button', { name: /^Eve, seed/ })).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: /Sitting out/ })).getByRole('button', { name: /^Ann, seed/ })).toBeInTheDocument()
    await waitFor(() => expect(api.edit).toHaveBeenCalledWith('2026-11-25', { kind: 'swap', a: 'p1', b: 'p5' }))
    await waitFor(() => expect(toast).toHaveBeenCalledWith('success', 'Swapped Ann and Eve.', expect.objectContaining({ action: expect.objectContaining({ label: 'Undo' }) })))
    expect(screen.getByText('Edited by hand')).toBeInTheDocument()

    const undo = toast.mock.calls.find((c) => c[1] === 'Swapped Ann and Eve.')![2]!.action!
    act(() => undo.onClick())
    await waitFor(() => expect(api.edit).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(within(court(10)).getByRole('button', { name: /^Ann, seed/ })).toBeInTheDocument())
  })

  it('removes a player from their court, leaving a flagged empty seat and a warning', async () => {
    const { api, user } = setup()
    await user.click(await screen.findByRole('button', { name: /^Bo, seed/ }))
    await user.click(screen.getByRole('button', { name: 'Remove from court' }))
    expect(within(court(10)).getByRole('button', { name: 'Court 10, seat 2: choose a player' })).toBeInTheDocument()
    expect(screen.getByText('Court 10 has 3 players, not 4.')).toBeInTheDocument()
    await waitFor(() => expect(api.edit).toHaveBeenCalledWith('2026-11-25', expect.objectContaining({ kind: 'move', to: null })))
  })

  it('warns when the RSVP list changed after the board was made, and clears once fixed by hand', async () => {
    const board = {
      ...draft(),
      rsvpChanges: [
        { kind: 'not_confirmed' as const, id: 'p2', name: 'Bo' },
        { kind: 'not_on_board' as const, id: 'p9', name: 'Nia' },
        { kind: 'not_on_board' as const, id: null, name: 'Gus (guest)' },
      ],
    }
    const { api, user } = setup(board)
    const warning = await screen.findByRole('region', { name: 'The RSVP list changed after this board was made' })
    expect(warning).toHaveTextContent('No longer confirmed, still on the board: Bo.')
    expect(warning).toHaveTextContent('Confirmed, not on the board: Nia, Gus (guest).')
    await user.click(chip('Bo'))
    await user.click(screen.getByRole('button', { name: 'Take off the board' }))
    await waitFor(() => expect(api.edit).toHaveBeenCalledWith('2026-11-25', { kind: 'drop', playerId: 'p2' }))
    expect(screen.queryByText(/No longer confirmed/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Bo, seed/ })).not.toBeInTheDocument()
  })

  it('moves a selected player into an empty seat', async () => {
    const { api, user } = setup()
    await user.click(await screen.findByRole('button', { name: /^Di, seed/ }))
    await user.click(screen.getByRole('button', { name: 'Court 9, seat 1: move Di here' }))
    expect(within(court(9)).getByRole('button', { name: /^Di, seed/ })).toBeInTheDocument()
    await waitFor(() => expect(api.edit).toHaveBeenCalledWith('2026-11-25', expect.objectContaining({ kind: 'move', to: { courtPosition: 1, slot: 0 } })))
  })

  it('fills an empty seat from the picker: sitting out first, then RSVP\'d players', async () => {
    const { api, user } = setup()
    await user.click(await screen.findByRole('button', { name: 'Court 9, seat 3: choose a player' }))
    const dialog = screen.getByRole('dialog', { name: 'Fill court 9, seat 3' })
    expect(within(dialog).getByRole('region', { name: 'Sitting out' })).toHaveTextContent('Eve')
    expect(await within(dialog).findByText("RSVP'd")).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: /Nia/ }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(within(court(9)).getByRole('button', { name: /^Nia, seed 6/ })).toBeInTheDocument()
    await waitFor(() => expect(api.edit).toHaveBeenCalledWith('2026-11-25', expect.objectContaining({ kind: 'move', player: expect.objectContaining({ id: 'p9' }) })))
  })

  it('publishes and unpublishes', async () => {
    const { api, user } = setup()
    await user.click(await screen.findByRole('button', { name: 'Publish' }))
    expect(await screen.findByText('Published')).toBeInTheDocument()
    expect(api.setPublished).toHaveBeenCalledWith('2026-11-25', true)
    await user.click(screen.getByRole('button', { name: 'Unpublish' }))
    await waitFor(() => expect(api.setPublished).toHaveBeenLastCalledWith('2026-11-25', false))
  })

  it('blocks publishing while a player is on the board twice', async () => {
    const b = draft()
    b.entries.push(p('p1', 'Ann', null, 6))
    setup(b)
    expect(await screen.findByText('Ann is on the board twice. Publishing is blocked until they are in one place.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Publish' })).toBeDisabled()
  })

  it('regenerates after a confirm that warns about manual edits, forcing over them', async () => {
    const b = draft()
    b.manuallyEdited = true
    const { generate, user } = setup(b)
    await user.click(await screen.findByRole('button', { name: 'Regenerate' }))
    const dialog = screen.getByRole('dialog', { name: 'Regenerate the board?' })
    expect(within(dialog).getByText('Your manual edits will be lost.')).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Regenerate' }))
    await waitFor(() => expect(generate).toHaveBeenCalledWith('2026-11-25', true))
  })

  it('shows a refused change as an error and reloads the board', async () => {
    const { api, toast, user } = setup()
    api.edit.mockResolvedValueOnce({ ok: false, error: { code: 'CA022', message: 'That seat was just taken.' } } as never)
    await user.click(await screen.findByRole('button', { name: /^Cy, seed/ }))
    await user.click(screen.getByRole('button', { name: 'Court 9, seat 1: move Cy here' }))
    await waitFor(() => expect(toast).toHaveBeenCalledWith('error', 'That seat was just taken.'))
    await waitFor(() => expect(within(court(10)).getByRole('button', { name: /^Cy, seed/ })).toBeInTheDocument())
  })

  it("follows another admin's change through Realtime", async () => {
    const { setServer, fireRealtime } = setup()
    await screen.findByText('Draft - not visible to players')
    setServer({ ...draft(), state: 'published', publishedAt: '2026-11-25T23:30:00Z' })
    fireRealtime()
    expect(await screen.findByText('Published', {}, { timeout: 2000 })).toBeInTheDocument()
  })

  it('says when the run has no board yet', async () => {
    setup(null)
    expect(await screen.findByText('No board for Wed, Nov 25 yet.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Event setup' })).toHaveAttribute('href', '/admin/setup')
  })
})
