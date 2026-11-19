import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SeasonSparkline } from './SeasonSparkline'
import { CareerTiles } from './CareerTiles'
import { WeeklyLog } from './WeeklyLog'
import { fullSeason, neverPlayed, oneWeek, withGaps } from '../../test/fixtures'

const filledMarkers = (c: HTMLElement) => c.querySelectorAll('circle.fill-gold, circle.fill-brand-hover')
const hollowMarkers = (c: HTMLElement) => c.querySelectorAll('circle.fill-surface')

describe('SeasonSparkline', () => {
  it('draws a single dot, not a line, for a one-week player', () => {
    const { container } = render(<SeasonSparkline points={oneWeek.weeklyPoints} />)
    expect(container.querySelectorAll('path')).toHaveLength(0)
    expect(filledMarkers(container)).toHaveLength(1)
    expect(container.querySelector('circle.fill-gold')).not.toBeNull() // it is also the best week
    expect(hollowMarkers(container)).toHaveLength(7)
    expect(screen.getByText('17')).toBeInTheDocument() // best week value is always labelled
  })

  it('breaks the line at missed weeks and marks them hollow', () => {
    const { container } = render(<SeasonSparkline points={withGaps.weeklyPoints} />)
    expect(container.querySelectorAll('path')).toHaveLength(2) // W1-2 and W5-6; W8 is a lone dot
    expect(hollowMarkers(container)).toHaveLength(3)
    expect(filledMarkers(container)).toHaveLength(5)
  })

  it('highlights only the best week and labels W1-W8', () => {
    const { container } = render(<SeasonSparkline points={fullSeason.weeklyPoints} />)
    expect(container.querySelectorAll('circle.fill-gold')).toHaveLength(1)
    for (let w = 1; w <= 8; w++) expect(screen.getByText(`W${w}`)).toBeInTheDocument()
    expect(screen.getByText('27')).toBeInTheDocument()
  })

  it('shows a value on focus and "Did not attend" for a missed week', async () => {
    render(<SeasonSparkline points={withGaps.weeklyPoints} />)
    await userEvent.tab() // keyboard focus on the W1 target shows its value
    expect(screen.getByText('22')).toBeInTheDocument()
    // Tap = focus then click; the value must stay visible rather than toggling off
    await userEvent.click(screen.getByLabelText('Week 3: did not attend'))
    expect(screen.getByText('Did not attend')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('img')) // tapping elsewhere clears it
    expect(screen.queryByText('Did not attend')).toBeNull()
  })

  it('shows an empty state when the player never attended', () => {
    const { container } = render(<SeasonSparkline points={neverPlayed.weeklyPoints} />)
    expect(screen.getByText('No weeks played yet')).toBeInTheDocument()
    expect(container.querySelector('svg')).toBeNull()
  })
})

describe('CareerTiles', () => {
  it('shows 0 podiums with a hint, not a blank', () => {
    render(<CareerTiles career={oneWeek.career} />)
    expect(screen.getByText('Podiums').nextElementSibling).toHaveTextContent('0')
    expect(screen.getByText('None yet')).toBeInTheDocument()
    expect(screen.getByText('Court 3 · Runner-up')).toBeInTheDocument()
  })

  it('shows dashes when there is no data and 1-decimal averages otherwise', () => {
    const { unmount } = render(<CareerTiles career={neverPlayed.career} />)
    expect(screen.getAllByText('–')).toHaveLength(2)
    unmount()
    render(<CareerTiles career={fullSeason.career} />)
    expect(screen.getByText('22.9')).toBeInTheDocument()
    expect(screen.queryByText('None yet')).toBeNull()
  })
})

describe('WeeklyLog', () => {
  it('lists attended weeks newest first and omits missed weeks', () => {
    render(<WeeklyLog log={withGaps.weeklyLog} onSelectWeek={() => {}} />)
    const rows = screen.getAllByRole('button')
    expect(rows).toHaveLength(5)
    expect(rows[0]).toHaveAccessibleName(/^Week 8,/)
    expect(rows[4]).toHaveAccessibleName(/^Week 1,/)
    expect(screen.queryByText('Week 3')).toBeNull()
  })

  it('calls onSelectWeek with the week number', async () => {
    const picked: number[] = []
    render(<WeeklyLog log={fullSeason.weeklyLog} onSelectWeek={(w) => picked.push(w)} />)
    await userEvent.click(screen.getByRole('button', { name: /^Week 3,/ }))
    expect(picked).toEqual([3])
  })

  it('renders non-interactive rows without a handler, and an empty state', () => {
    const { unmount } = render(<WeeklyLog log={oneWeek.weeklyLog} />)
    expect(screen.queryByRole('button')).toBeNull()
    unmount()
    render(<WeeklyLog log={[]} />)
    expect(screen.getByText('No weeks played yet')).toBeInTheDocument()
  })
})
