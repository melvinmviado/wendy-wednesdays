import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PlayerStatsModal, type SelectedPlayer } from './PlayerStatsModal'
import { getPlayerStats } from '../data/getPlayerStats'
import { fullSeason } from '../test/fixtures'

vi.mock('../lib/supabase', () => ({ isSupabaseConfigured: true, supabase: {} }))
vi.mock('../data/getPlayerStats', () => ({ getPlayerStats: vi.fn() }))

const mockStats = vi.mocked(getPlayerStats)

const pick = (name = 'Wendy Mitchell', rank = 1, tied = false): SelectedPlayer => ({
  player: { id: 'p1', name, weeksPlayed: 8, totalPoints: 100 },
  rank,
  tied,
})

const reducedMotion = (reduce: boolean) =>
  vi.stubGlobal('matchMedia', (q: string) => ({
    matches: reduce && q.includes('reduce'),
    media: q,
    addEventListener: () => {},
    removeEventListener: () => {},
  }))

beforeEach(() => {
  mockStats.mockReset()
})
afterEach(() => vi.useRealTimers())

describe('PlayerStatsModal', () => {
  it('shows a loading state, then the stats', async () => {
    let resolve!: (v: typeof fullSeason) => void
    mockStats.mockReturnValue(new Promise((r) => (resolve = r)))
    render(<PlayerStatsModal selected={pick()} onClose={() => {}} />)
    expect(screen.getByRole('status')).toHaveTextContent('Loading stats')
    await act(async () => resolve(fullSeason))
    expect(screen.getByText('Season trajectory')).toBeInTheDocument()
    expect(screen.getByText('Weekly log')).toBeInTheDocument()
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('shows the real error with a retry that refetches', async () => {
    mockStats.mockRejectedValueOnce({ message: 'permission denied for table weekly_scores', code: '42501' })
    mockStats.mockResolvedValueOnce(fullSeason)
    render(<PlayerStatsModal selected={pick()} onClose={() => {}} />)

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('permission denied for table weekly_scores') // plain object, not an Error
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))

    expect(await screen.findByText('Season trajectory')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).toBeNull()
    expect(mockStats).toHaveBeenCalledTimes(2)
  })

  it('shows a tied rank as T2 and a long name in full via title', async () => {
    mockStats.mockResolvedValue(fullSeason)
    const long = 'Bartholomew Wolfeschlegelsteinhausenbergerdorff-Montgomery III'
    render(<PlayerStatsModal selected={pick(long, 2, true)} onClose={() => {}} />)
    const heading = await screen.findByRole('heading', { level: 2, name: long })
    expect(heading).toHaveAttribute('title', long)
    expect(heading.className).toContain('line-clamp-2')
    expect(screen.getByText('T2')).toBeInTheDocument()
  })

  it('closes on Escape, backdrop click and the close button, but not on panel clicks', async () => {
    mockStats.mockResolvedValue(fullSeason)
    const onClose = vi.fn()
    render(<PlayerStatsModal selected={pick()} onClose={onClose} />)
    await screen.findByText('Season trajectory')

    await userEvent.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(1)

    await userEvent.click(screen.getByRole('dialog'))
    expect(onClose).toHaveBeenCalledTimes(1)

    await userEvent.click(screen.getByRole('dialog').parentElement!)
    expect(onClose).toHaveBeenCalledTimes(2)

    await userEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalledTimes(3)
  })

  it('traps focus inside the dialog in both directions', async () => {
    mockStats.mockResolvedValue(fullSeason)
    render(<PlayerStatsModal selected={pick()} onClose={() => {}} />)
    await screen.findByText('Season trajectory')
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveFocus()

    for (let i = 0; i < 24; i++) {
      await userEvent.tab()
      expect(dialog).toContainElement(document.activeElement as HTMLElement)
    }
    for (let i = 0; i < 24; i++) {
      await userEvent.tab({ shift: true })
      expect(dialog).toContainElement(document.activeElement as HTMLElement)
    }
  }, 20000)

  it('locks background scroll while open and restores it on close', async () => {
    mockStats.mockResolvedValue(fullSeason)
    document.body.style.overflow = 'auto'
    const { rerender } = render(<PlayerStatsModal selected={pick()} onClose={() => {}} />)
    expect(document.body.style.overflow).toBe('hidden')
    rerender(<PlayerStatsModal selected={null} onClose={() => {}} />)
    expect(document.body.style.overflow).toBe('auto')
  })

  it('plays an exit transition, then unmounts', async () => {
    mockStats.mockResolvedValue(fullSeason)
    reducedMotion(false)
    vi.useFakeTimers()
    const { rerender } = render(<PlayerStatsModal selected={pick()} onClose={() => {}} />)
    await act(async () => {})
    rerender(<PlayerStatsModal selected={null} onClose={() => {}} />)
    expect(screen.getByRole('dialog')).toBeInTheDocument() // still mounted while leaving
    expect(screen.getByRole('dialog').className).toContain('animate-sheet-down')
    await act(async () => void vi.advanceTimersByTime(200))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('unmounts immediately when the user prefers reduced motion', async () => {
    mockStats.mockResolvedValue(fullSeason)
    reducedMotion(true)
    const { rerender } = render(<PlayerStatsModal selected={pick()} onClose={() => {}} />)
    await screen.findByText('Season trajectory')
    rerender(<PlayerStatsModal selected={null} onClose={() => {}} />)
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })
})
