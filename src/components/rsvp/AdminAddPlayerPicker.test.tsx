import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { PlayerScore } from '../../types/leaderboard'
import { AdminAddPlayerPicker, MAX_RESULTS } from './AdminAddPlayerPicker'

const roster = (n: number): PlayerScore[] =>
  Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `Player ${i}`, weeksPlayed: 0, totalPoints: 0 }))

const renderPicker = (candidates: PlayerScore[]) =>
  render(<AdminAddPlayerPicker candidates={candidates} busy={false} onAdd={vi.fn().mockResolvedValue(true)} onClose={() => {}} />)
const addButtons = () => screen.queryAllByRole('button', { name: /^Add / })

describe('AdminAddPlayerPicker with a large roster', () => {
  it('renders a bounded number of rows and says how many more there are', () => {
    renderPicker(roster(600))
    expect(addButtons()).toHaveLength(MAX_RESULTS)
    expect(screen.getByText(`Showing ${MAX_RESULTS} of 600. Keep typing to narrow it down.`)).toBeInTheDocument()
  })

  it('narrows as you type, with no hint once everything fits', () => {
    renderPicker(roster(600))
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search players' }), { target: { value: 'player 59' } })
    expect(addButtons()).toHaveLength(11) // Player 59 and Player 590-599
    expect(screen.queryByText(/Keep typing/)).toBeNull()
  })

  it('lists alphabetically and finds names case-insensitively', () => {
    renderPicker([{ id: 'b', name: 'zoe Adams', weeksPlayed: 0, totalPoints: 0 }, { id: 'a', name: 'Amy Zhou', weeksPlayed: 0, totalPoints: 0 }])
    expect(addButtons().map((b) => b.getAttribute('aria-label'))).toEqual(['Add Amy Zhou', 'Add zoe Adams'])
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search players' }), { target: { value: 'ZOE' } })
    expect(addButtons()).toHaveLength(1)
  })

  it('stays quick: 5,000 players still render only one page and filter in well under a frame budget', () => {
    renderPicker(roster(5000))
    expect(addButtons()).toHaveLength(MAX_RESULTS)
    const t0 = performance.now()
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search players' }), { target: { value: 'player 4' } })
    expect(performance.now() - t0).toBeLessThan(500) // generous: this guards against rendering every match, not a micro-benchmark
    expect(addButtons()).toHaveLength(MAX_RESULTS)
  })
})
