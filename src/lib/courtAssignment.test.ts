import { describe, expect, it } from 'vitest'
import { buildCourtOrder, generateStartingAssignment, type AssignmentPlayer } from './courtAssignment'

const BASE = Date.parse('2026-11-24T12:00:00.000Z')

/** A player who RSVP'd `minutesAfter` minutes after BASE. */
const player = (id: string, rank: number | null, minutesAfter = 0): AssignmentPlayer => ({
  id,
  rank,
  rsvpAt: new Date(BASE + minutesAfter * 60_000).toISOString(),
})

/** "p01", "p02", ... */
const pid = (n: number) => `p${String(n).padStart(2, '0')}`

/** Ids pid(from) through pid(to), inclusive. */
const ids = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => pid(from + i))

/** `count` players ranked 1..count, each RSVP'd a minute after the one before. */
const ranked = (count: number) => Array.from({ length: count }, (_, i) => player(pid(i + 1), i + 1, i))

/** Everyone in the result, in seed order. */
const seedOrderOf = (r: ReturnType<typeof generateStartingAssignment>) => [
  ...r.courts.flatMap((c) => c.playerIds),
  ...r.sittingOut.map((s) => s.playerId),
]

describe('buildCourtOrder', () => {
  it('counts down when the top court has the higher number', () => {
    expect(buildCourtOrder(10, 4)).toEqual([10, 9, 8, 7, 6, 5, 4])
  })

  it('counts up when the top court has the lower number', () => {
    expect(buildCourtOrder(4, 10)).toEqual([4, 5, 6, 7, 8, 9, 10])
  })

  it('is one court when top and bottom are the same', () => {
    expect(buildCourtOrder(5, 5)).toEqual([5])
  })

  it.each([
    [0, 4],
    [4, 0],
    [-1, 4],
    [2.5, 4],
    [Number.NaN, 4],
    [4, Number.POSITIVE_INFINITY],
  ])('throws for top %s, bottom %s', (top, bottom) => {
    expect(() => buildCourtOrder(top, bottom)).toThrow(RangeError)
  })
})

describe('generateStartingAssignment', () => {
  it('16 players on 4 courts: best four on the top court, nobody sits out', () => {
    const r = generateStartingAssignment({ players: ranked(16), courtOrder: [1, 2, 3, 4] })
    expect(r).toEqual({
      courts: [
        { courtPosition: 0, courtNumber: 1, playerIds: ids(1, 4) },
        { courtPosition: 1, courtNumber: 2, playerIds: ids(5, 8) },
        { courtPosition: 2, courtNumber: 3, playerIds: ids(9, 12) },
        { courtPosition: 3, courtNumber: 4, playerIds: ids(13, 16) },
      ],
      sittingOut: [],
    })
  })

  it('18 players: only full courts are used and the 2 lowest seeds sit out as remainder', () => {
    const r = generateStartingAssignment({ players: ranked(18), courtOrder: buildCourtOrder(1, 6) })
    expect(r.courts).toHaveLength(4)
    expect(r.courts[3].playerIds).toEqual(ids(13, 16))
    expect(r.sittingOut).toEqual([
      { playerId: 'p17', reason: 'remainder' },
      { playerId: 'p18', reason: 'remainder' },
    ])
  })

  it('30 players with only 6 courts: 24 play, the next foursome overflows, the last 2 are remainder', () => {
    const r = generateStartingAssignment({ players: ranked(30), courtOrder: buildCourtOrder(1, 6) })
    expect(r.courts).toHaveLength(6)
    expect(r.courts[5]).toEqual({ courtPosition: 5, courtNumber: 6, playerIds: ids(21, 24) })
    expect(r.sittingOut).toEqual([
      ...ids(25, 28).map((playerId) => ({ playerId, reason: 'overflow' })),
      ...ids(29, 30).map((playerId) => ({ playerId, reason: 'remainder' })),
    ])
    expect(seedOrderOf(r)).toEqual(ids(1, 30)) // everyone exactly once
  })

  it('with no courts at all, every full foursome overflows', () => {
    const r = generateStartingAssignment({ players: ranked(9), courtOrder: [] })
    expect(r.courts).toEqual([])
    expect(r.sittingOut.map((s) => s.reason)).toEqual([...Array(8).fill('overflow'), 'remainder'])
  })

  it('descending and ascending numbering seed the same groups, top court first', () => {
    const players = ranked(28)
    const down = generateStartingAssignment({ players, courtOrder: buildCourtOrder(10, 4) })
    const up = generateStartingAssignment({ players, courtOrder: buildCourtOrder(4, 10) })

    expect(down.courts.map((c) => c.courtNumber)).toEqual([10, 9, 8, 7, 6, 5, 4])
    expect(up.courts.map((c) => c.courtNumber)).toEqual([4, 5, 6, 7, 8, 9, 10])
    expect(down.courts[0].playerIds).toEqual(ids(1, 4)) // court 10 is the top court
    expect(up.courts[0].playerIds).toEqual(ids(1, 4)) // court 4 is the top court
    expect(down.courts.map((c) => c.playerIds)).toEqual(up.courts.map((c) => c.playerIds))
  })

  it('unranked players seed below every ranked player, earliest RSVP first', () => {
    const players = [
      player('u1', null, 2),
      player('u2', null, 0),
      player('u3', null, 1),
      ...[1, 2, 3, 4, 5].map((n) => player(`r${n}`, n, 10 + n)), // RSVP'd after the unranked
    ]
    const r = generateStartingAssignment({ players, courtOrder: [1, 2] })
    expect(r.courts.map((c) => c.playerIds)).toEqual([
      ['r1', 'r2', 'r3', 'r4'],
      ['r5', 'u2', 'u3', 'u1'],
    ])
  })

  it('unranked players are the first to sit out', () => {
    const r = generateStartingAssignment({ players: [...ranked(6), player('new', null, -60)], courtOrder: [1, 2] })
    expect(r.courts.map((c) => c.playerIds)).toEqual([ids(1, 4)])
    expect(r.sittingOut.map((s) => s.playerId)).toEqual(['p05', 'p06', 'new'])
  })

  it('ties: an earlier RSVP seeds higher, then the id decides', () => {
    const players = [player('bob', 2, 5), player('zed', 2, 1), player('amy', 2, 1), player('cat', 1, 9)]
    const r = generateStartingAssignment({ players, courtOrder: [1] })
    expect(r.courts[0].playerIds).toEqual(['cat', 'amy', 'zed', 'bob'])
  })

  it('ties on RSVP time are decided by microseconds, which Date.parse alone would drop', () => {
    const players = [
      { id: 'a', rank: 3, rsvpAt: '2026-11-24T23:00:00.123900+00:00' },
      { id: 'b', rank: 3, rsvpAt: '2026-11-24T23:00:00.123100+00:00' },
      player('c', 1),
      player('d', 2),
    ]
    expect(generateStartingAssignment({ players, courtOrder: [1] }).courts[0].playerIds).toEqual(['c', 'd', 'b', 'a'])
  })

  it('duplicate rank values (1, 2, 2, 4, 5, 5, 5, 8) keep rank order and break ties by RSVP time', () => {
    const players = [
      player('h', 8, 0),
      player('e3', 5, 30),
      player('e1', 5, 10),
      player('e2', 5, 20),
      player('d', 4, 0),
      player('b2', 2, 7),
      player('b1', 2, 3),
      player('a', 1, 99),
    ]
    const r = generateStartingAssignment({ players, courtOrder: [7, 6] })
    expect(r.courts).toEqual([
      { courtPosition: 0, courtNumber: 7, playerIds: ['a', 'b1', 'b2', 'd'] },
      { courtPosition: 1, courtNumber: 6, playerIds: ['e1', 'e2', 'e3', 'h'] },
    ])
  })

  it('fewer than 4 players: no courts, everyone sits out as remainder', () => {
    const r = generateStartingAssignment({ players: ranked(3), courtOrder: [1, 2] })
    expect(r).toEqual({
      courts: [],
      sittingOut: ids(1, 3).map((playerId) => ({ playerId, reason: 'remainder' })),
    })
    expect(generateStartingAssignment({ players: [], courtOrder: [1] })).toEqual({ courts: [], sittingOut: [] })
  })

  // RSVP counts to check before go-live. courts: [court count used, players sitting out, why].
  it.each([
    [0, 8, 0, 0, []],
    [3, 8, 0, 3, ['remainder']],
    [4, 8, 1, 0, []],
    [5, 8, 1, 1, ['remainder']],
    [33, 8, 8, 1, ['remainder']],
    [33, 7, 7, 5, ['overflow', 'remainder']],
  ])('%i confirmed on %i courts: %i courts used, %i sitting out', (count, courts, used, out, reasons) => {
    const r = generateStartingAssignment({ players: ranked(count), courtOrder: buildCourtOrder(10, 11 - courts) })
    expect(r.courts).toHaveLength(used)
    expect(r.courts.every((c) => c.playerIds.length === 4)).toBe(true)
    expect(r.courts.map((c) => c.courtNumber)).toEqual(Array.from({ length: used }, (_, i) => 10 - i))
    expect(r.sittingOut).toHaveLength(out)
    expect([...new Set(r.sittingOut.map((s) => s.reason))]).toEqual(reasons)
    expect(new Set(seedOrderOf(r)).size).toBe(count) // everyone exactly once
    expect(seedOrderOf(r)).toEqual(ids(1, count))     // best seeds on the top court
  })

  it('is deterministic: input order does not matter and the input is not changed', () => {
    const players = [...ranked(14), player('x', null, 3), player('y', 2, 1)]
    const shuffled = [...players].reverse()
    const before = JSON.stringify(shuffled)
    const a = generateStartingAssignment({ players, courtOrder: [3, 2, 1] })
    const b = generateStartingAssignment({ players: shuffled, courtOrder: [3, 2, 1] })
    expect(b).toEqual(a)
    expect(generateStartingAssignment({ players, courtOrder: [3, 2, 1] })).toEqual(a)
    expect(JSON.stringify(shuffled)).toBe(before)
  })

  it.each([
    ['a duplicate player', [player('a', 1), player('a', 2)], [1]],
    ['rank 0', [player('a', 0)], [1]],
    ['a fractional rank', [player('a', 1.5)], [1]],
    ['an unreadable rsvpAt', [{ id: 'a', rank: 1, rsvpAt: 'tuesday' }], [1]],
    ['an empty id', [player('', 1)], [1]],
    ['a court number of 0', [player('a', 1)], [0]],
    ['a court listed twice', [player('a', 1)], [4, 4]],
  ])('throws for %s', (_label, players, courtOrder) => {
    expect(() => generateStartingAssignment({ players, courtOrder })).toThrow(RangeError)
  })
})
