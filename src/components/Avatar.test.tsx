import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { PlayerScore } from '../types/leaderboard'
import { Avatar, initialsOf } from './Avatar'
import { LeaderboardTable } from './LeaderboardTable'
import { PlayerStatsDialog } from './PlayerStatsDialog'

const player = (over: Partial<PlayerScore>): PlayerScore => ({
  id: 'p', name: 'Ada Lovelace', weeksPlayed: 3, totalPoints: 50, ...over,
})
const imgs = (c: HTMLElement) => [...c.querySelectorAll('img')]

describe('Avatar', () => {
  it('renders a lazy, fixed-size image', () => {
    const { container } = render(<Avatar name="Ada" avatarUrl="https://x.test/a.jpg" size={36} />)
    const img = imgs(container)[0]
    expect(img).toHaveAttribute('loading', 'lazy')
    expect(img).toHaveAttribute('decoding', 'async')
    expect(img).toHaveAttribute('width', '36')
    expect(img).toHaveAttribute('height', '36')
    expect(img.style.width).toBe('36px')
    expect(img).toHaveAttribute('alt', '')
  })

  it('can load eagerly', () => {
    const { container } = render(<Avatar name="Ada" avatarUrl="https://x.test/a.jpg" eager />)
    expect(imgs(container)[0]).toHaveAttribute('loading', 'eager')
  })

  it('shows initials, at the same fixed size, when there is no photo', () => {
    const { container } = render(<Avatar name="Ada Lovelace" avatarUrl={null} size={40} />)
    expect(imgs(container)).toHaveLength(0)
    expect(container.textContent).toBe('AL')
    expect((container.firstElementChild as HTMLElement).style.width).toBe('40px')
  })

  it('falls back to initials if the image fails, and retries when the URL changes', () => {
    const { container, rerender } = render(<Avatar name="Ada" avatarUrl="https://x.test/broken.jpg" />)
    fireEvent.error(imgs(container)[0])
    expect(imgs(container)).toHaveLength(0)
    expect(container.textContent).toBe('A')
    rerender(<Avatar name="Ada" avatarUrl="https://x.test/new.jpg?v=2" />)
    expect(imgs(container)[0]).toHaveAttribute('src', 'https://x.test/new.jpg?v=2')
  })

  it.each([['Ada Lovelace', 'AL'], ['ada.lovelace@example.com', 'AL'], ['plato', 'P'], ['', '?']])('initials %s -> %s', (n, i) => {
    expect(initialsOf(n)).toBe(i)
  })
})

describe('leaderboard and stats modal', () => {
  it('leaderboard rows show the photo when there is one and initials otherwise', () => {
    const { container } = render(
      <LeaderboardTable
        players={[
          player({ id: '1', name: 'Pat Photo', avatarUrl: 'https://x.test/pat.jpg', totalPoints: 90 }),
          player({ id: '2', name: 'Ivy Initials', avatarUrl: null, totalPoints: 80 }),
          player({ id: '3', name: 'Undef Una', totalPoints: 70 }), // before the migration the field is absent
        ]}
      />
    )
    const images = imgs(container)
    expect(images).toHaveLength(1)
    expect(images[0]).toHaveAttribute('src', 'https://x.test/pat.jpg')
    expect(images[0]).toHaveAttribute('loading', 'lazy')
    expect(screen.getByText('II')).toBeInTheDocument()
    expect(screen.getByText('UU')).toBeInTheDocument()
  })

  it('the stats dialog header shows the same avatar', () => {
    const state = { stats: null, loading: false, error: null, available: false }
    const { container } = render(
      <PlayerStatsDialog
        selected={{ player: player({ avatarUrl: 'https://x.test/ada.jpg' }), rank: 1, tied: false }}
        state={state}
        onRetry={() => {}}
        onClose={() => {}}
      />
    )
    expect(imgs(container)[0]).toHaveAttribute('src', 'https://x.test/ada.jpg')
  })
})
