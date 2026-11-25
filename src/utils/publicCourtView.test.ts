import { describe, expect, it } from 'vitest'
import type { PublicSeat } from '@/lib/publicCourtBoard'
import { boardAsText, filterView, findMine, groupBoard } from './publicCourtView'

const seat = (id: string, name: string, seedRank: number, at: [number, number, number] | null): PublicSeat => ({
  playerId: id, name, avatarUrl: null, seedRank,
  courtPosition: at ? at[0] : null, courtNumber: at ? at[1] : null, slot: at ? at[2] : null,
})

// Court 10 (top) and court 9; Zoë and Yan sitting out. Listed out of order on purpose.
const seats = [
  seat('e', 'Eli', 5, [1, 9, 0]), seat('f', 'Fay', 6, [1, 9, 1]), seat('g', 'Gus', 7, [1, 9, 2]), seat('h', 'Hal', 8, [1, 9, 3]),
  seat('a', 'Ann', 1, [0, 10, 0]), seat('b', 'Bo', 2, [0, 10, 1]), seat('c', 'Cy', 3, [0, 10, 2]), seat('d', 'Di', 4, [0, 10, 3]),
  seat('z', 'Zoë', 10, null), seat('y', 'Yan', 9, null),
]
const view = groupBoard(seats)

describe('groupBoard', () => {
  it('orders courts top to bottom with seats by slot, and alternates by seed', () => {
    expect(view.courts.map((c) => c.number)).toEqual([10, 9])
    expect(view.courts[0].seats.map((s) => s?.name)).toEqual(['Ann', 'Bo', 'Cy', 'Di'])
    expect(view.alternates.map((s) => s.name)).toEqual(['Yan', 'Zoë'])
  })

  it('keeps an open seat open', () => {
    const v = groupBoard(seats.filter((s) => s.playerId !== 'b'))
    expect(v.courts[0].seats.map((s) => s?.name ?? null)).toEqual(['Ann', null, 'Cy', 'Di'])
  })
})

describe('findMine', () => {
  it('finds my court and my three co-players', () => {
    const mine = findMine(view, 'f')
    expect(mine?.kind).toBe('court')
    if (mine?.kind !== 'court') return
    expect(mine.court.number).toBe(9)
    expect(mine.partners.map((s) => s.name)).toEqual(['Eli', 'Gus', 'Hal'])
  })

  it('says when I am an alternate, and nothing when I am not on the board or signed out', () => {
    expect(findMine(view, 'z')).toEqual({ kind: 'alternate', seat: expect.objectContaining({ name: 'Zoë' }) })
    expect(findMine(view, 'nobody')).toBeNull()
    expect(findMine(view, null)).toBeNull()
  })
})

describe('filterView', () => {
  it('keeps the courts and alternates with a matching name, ignoring case and accents', () => {
    const { view: v, matches } = filterView(view, 'zoe')
    expect(v.courts).toEqual([])
    expect(v.alternates.map((s) => s.name)).toEqual(['Zoë'])
    expect([...matches]).toEqual(['z'])
    expect(filterView(view, 'GU').view.courts.map((c) => c.number)).toEqual([9])
  })

  it('shows everything for an empty search', () => {
    expect(filterView(view, '  ').view).toBe(view)
  })
})

describe('boardAsText', () => {
  it('formats one line per court for the group chat', () => {
    expect(boardAsText(view, 'Courts, Wed, Nov 25', 'https://x.test/events/2026-11-25/courts')).toBe(
      'Courts, Wed, Nov 25\nCourt 10: Ann, Bo, Cy, Di\nCourt 9: Eli, Fay, Gus, Hal\nSitting out: Yan, Zoë\nhttps://x.test/events/2026-11-25/courts',
    )
  })
})
