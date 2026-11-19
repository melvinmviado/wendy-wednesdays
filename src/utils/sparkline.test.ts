import { describe, expect, it } from 'vitest'
import { buildSparkline } from './sparkline'

const N = null

describe('buildSparkline', () => {
  it('draws one segment for a full season', () => {
    const s = buildSparkline([10, 12, 14, 16, 18, 20, 22, 24])
    expect(s.segments).toHaveLength(1)
    expect(s.bestIndex).toBe(7)
  })

  it('splits the line at missed weeks instead of dropping to zero', () => {
    const s = buildSparkline([10, 12, N, N, 18, 20, N, 22])
    expect(s.segments).toHaveLength(2) // W1-2 and W5-6; W8 is a lone dot
    expect(s.points[2].value).toBeNull()
    expect(s.points[2].y).toBe(s.baselineY)
  })

  it('draws no line for a lone attended week', () => {
    const s = buildSparkline([N, N, N, 17, N, N, N, N])
    expect(s.segments).toHaveLength(0)
    expect(s.bestIndex).toBe(3)
  })

  it('handles a player who never attended', () => {
    const s = buildSparkline(Array(8).fill(N))
    expect(s.segments).toHaveLength(0)
    expect(s.bestIndex).toBeNull()
  })

  it('does not divide by zero when all values are 0', () => {
    const s = buildSparkline([0, 0, 0, N, N, N, N, N])
    expect(s.points.every((p) => Number.isFinite(p.y))).toBe(true)
  })

  it('picks the first week on a best-week tie', () => {
    expect(buildSparkline([N, 20, 15, 20, N, N, N, N]).bestIndex).toBe(1)
  })

  it('places higher scores higher on the chart', () => {
    const s = buildSparkline([10, 20, N, N, N, N, N, N])
    expect(s.points[1].y).toBeLessThan(s.points[0].y)
  })
})
