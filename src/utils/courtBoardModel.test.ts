import { describe, expect, it } from 'vitest'
import {
  applyEdit, boardIssues, buildBoardView, describeEdit, inverseEdit,
  type BoardEdit, type BoardEntry,
} from './courtBoardModel'

const at = (courtPosition: number, slot: number) => ({ courtPosition, slot })
const p = (id: string, seat: BoardEntry['seat'], seedRank: number): BoardEntry => ({ id, name: id.toUpperCase(), avatarUrl: null, seat, seedRank })

// Courts 10 then 9. a-d on court 10, e sitting out, court 9 empty.
const board: BoardEntry[] = [p('a', at(0, 0), 1), p('b', at(0, 1), 2), p('c', at(0, 2), 3), p('d', at(0, 3), 4), p('e', null, 5)]
const order = [10, 9]
const seatOf = (entries: BoardEntry[], id: string) => entries.find((x) => x.id === id)?.seat ?? null

describe('buildBoardView', () => {
  it('lays courts out top to bottom with four seats each, and the tray in seed order', () => {
    const view = buildBoardView([p('z', null, 9), ...board], order)
    expect(view.courts.map((c) => c.number)).toEqual([10, 9])
    expect(view.courts[0].slots.map((s) => s?.id)).toEqual(['a', 'b', 'c', 'd'])
    expect(view.courts[1].slots).toEqual([null, null, null, null])
    expect(view.tray.map((x) => x.id)).toEqual(['e', 'z'])
  })

  it('never hides a player whose seat the view cannot show', () => {
    const view = buildBoardView([p('x', at(5, 0), 1), p('y', at(0, 0), 2), p('w', at(0, 0), 3)], order)
    expect(view.courts[0].slots[0]?.id).toBe('y')
    expect(view.tray.map((x) => x.id)).toEqual(['x', 'w'])
  })
})

describe('boardIssues', () => {
  it('warns about a court with 1 to 3 players, but not an empty one', () => {
    const entries = applyEdit(board, { kind: 'move', player: board[0], to: at(1, 0) })
    expect(boardIssues(entries, buildBoardView(entries, order)).shortCourts).toEqual([
      { number: 10, count: 3 },
      { number: 9, count: 1 },
    ])
    expect(boardIssues(board, buildBoardView(board, order)).shortCourts).toEqual([])
  })

  it('finds a player listed twice', () => {
    const entries = [...board, p('a', null, 6)]
    expect(boardIssues(entries, buildBoardView(entries, order)).duplicates.map((x) => x.id)).toEqual(['a'])
  })
})

describe('applyEdit', () => {
  it('swaps two seated players, or a seated player with one sitting out', () => {
    const swapped = applyEdit(board, { kind: 'swap', a: 'a', b: 'd' })
    expect(seatOf(swapped, 'a')).toEqual(at(0, 3))
    expect(seatOf(swapped, 'd')).toEqual(at(0, 0))
    const inOut = applyEdit(board, { kind: 'swap', a: 'e', b: 'b' })
    expect(seatOf(inOut, 'e')).toEqual(at(0, 1))
    expect(seatOf(inOut, 'b')).toBeNull()
  })

  it('moves to an empty seat or to sitting out, keeping the seed', () => {
    const moved = applyEdit(board, { kind: 'move', player: board[1], to: at(1, 2) })
    expect(moved.find((x) => x.id === 'b')).toMatchObject({ seat: at(1, 2), seedRank: 2 })
    expect(seatOf(applyEdit(board, { kind: 'move', player: board[1], to: null }), 'b')).toBeNull()
  })

  it('adds a player who is not on the board, seeded last', () => {
    const added = applyEdit(board, { kind: 'move', player: { id: 'n', name: 'NEW', avatarUrl: null }, to: at(1, 0) })
    expect(added.at(-1)).toEqual({ id: 'n', name: 'NEW', avatarUrl: null, seat: at(1, 0), seedRank: 6 })
  })

  it('returns the same array when the edit cannot apply', () => {
    expect(applyEdit(board, { kind: 'move', player: board[4], to: at(0, 0) })).toBe(board) // seat taken
    expect(applyEdit(board, { kind: 'move', player: board[0], to: at(0, 0) })).toBe(board) // already there
    expect(applyEdit(board, { kind: 'swap', a: 'a', b: 'gone' })).toBe(board)
    expect(applyEdit([...board, p('f', null, 6)], { kind: 'swap', a: 'e', b: 'f' })).toHaveLength(6) // both sit out: no change
    expect(applyEdit(board, { kind: 'drop', playerId: 'gone' })).toBe(board)
  })
})

describe('inverseEdit', () => {
  const roundTrip = (edit: BoardEdit) => {
    const after = applyEdit(board, edit)
    const undo = inverseEdit(board, edit)
    expect(undo).not.toBeNull()
    return applyEdit(after, undo!)
  }

  it.each<[string, BoardEdit]>([
    ['a swap', { kind: 'swap', a: 'a', b: 'e' }],
    ['a move to another court', { kind: 'move', player: board[2], to: at(1, 3) }],
    ['a move to sitting out', { kind: 'move', player: board[2], to: null }],
    ['adding a player', { kind: 'move', player: { id: 'n', name: 'NEW', avatarUrl: null }, to: at(1, 0) }],
  ])('puts the board back after %s', (_name, edit) => {
    const restored = roundTrip(edit)
    expect([...restored].sort((x, y) => x.seedRank - y.seedRank)).toEqual(board)
  })
})

describe('describeEdit', () => {
  it('says what happened, with facility court numbers', () => {
    expect(describeEdit(board, { kind: 'swap', a: 'a', b: 'e' }, order)).toBe('Swapped A and E.')
    expect(describeEdit(board, { kind: 'move', player: board[0], to: at(1, 0) }, order)).toBe('Moved A to court 9.')
    expect(describeEdit(board, { kind: 'move', player: board[0], to: null }, order)).toBe('A is sitting out.')
    expect(describeEdit(board, { kind: 'move', player: { id: 'n', name: 'NEW', avatarUrl: null }, to: at(1, 0) }, order)).toBe('Added NEW to court 9.')
  })
})
