import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { RankMovement } from './RankMovement'
import type { RankMovement as Movement } from '../utils/ranking'

const m = (status: Movement['status'], delta: number | null): Movement => ({
  playerId: 'a',
  currentRank: 1,
  previousRank: delta == null ? null : 1 + delta,
  delta,
  status,
})

describe('RankMovement', () => {
  it('labels a move up with arrow, number and accessible text', () => {
    render(<RankMovement movement={m('up', 3)} />)
    const el = screen.getByRole('img', { name: 'Up 3 places since last week' })
    expect(el).toHaveTextContent('▲ 3')
  })

  it('uses singular for one place and a quieter style for moving down', () => {
    render(<RankMovement movement={m('down', -1)} />)
    const el = screen.getByRole('img', { name: 'Down 1 place since last week' })
    expect(el).toHaveTextContent('▼ 1')
    expect(el.className).toContain('text-muted')
  })

  it('shows a NEW pill', () => {
    render(<RankMovement movement={m('new', null)} />)
    expect(screen.getByRole('img', { name: 'New this week' })).toHaveTextContent('NEW')
  })

  it('renders nothing for no change or no data', () => {
    const { container, rerender } = render(<RankMovement movement={m('same', 0)} />)
    expect(container).toBeEmptyDOMElement()
    rerender(<RankMovement />)
    expect(container).toBeEmptyDOMElement()
  })
})
