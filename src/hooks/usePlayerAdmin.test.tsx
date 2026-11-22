import { useState } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import type { PlayerScore, Result } from '../types/leaderboard'
import { usePlayerAdmin } from './usePlayerAdmin'

// Each data call waits until the test answers it, so two actions can overlap.
const calls = vi.hoisted(() => ({ pending: new Map<string, (r: Result<PlayerScore>) => void>() }))
const wait = (key: string) => new Promise<Result<PlayerScore>>((resolve) => calls.pending.set(key, resolve))

vi.mock('../data/players', () => ({
  fetchPlayers: () => Promise.resolve({ ok: true, data: [] }),
  renamePlayer: (id: string) => wait(`rename:${id}`),
  archivePlayer: (id: string) => wait(`archive:${id}`),
  restorePlayer: (id: string) => wait(`restore:${id}`),
  deletePlayer: (id: string) => wait(`delete:${id}`),
}))

const p = (id: string, name = `Player ${id}`): PlayerScore => ({ id, name, weeksPlayed: 0, totalPoints: 0 })
const refused: Result<PlayerScore> = { ok: false, error: { code: 'UNKNOWN', message: 'nope' } }

function setup(initial: PlayerScore[]) {
  const toast = { push: vi.fn() }
  return renderHook(() => {
    const [players, setPlayers] = useState(initial)
    const admin = usePlayerAdmin({ enabled: true, players, setPlayers, toast, refresh: () => {} })
    return { players, setPlayers, admin }
  })
}
const names = (list: PlayerScore[]) => list.map((x) => x.name)

beforeEach(() => calls.pending.clear())

describe('usePlayerAdmin optimistic rollback', () => {
  it('a failed action undoes only its own player, keeping an action that succeeded meanwhile', async () => {
    const { result } = setup([p('1', 'Ann'), p('2', 'Bob'), p('3', 'Cy')])
    await act(async () => {})

    let rename!: Promise<Result<PlayerScore>>
    let archive!: Promise<boolean>
    act(() => { rename = result.current.admin.rename(p('1', 'Ann'), 'Annie') })
    act(() => { archive = result.current.admin.archive(p('2', 'Bob')) })
    expect(names(result.current.players)).toEqual(['Annie', 'Cy'])

    // B (archive Bob) succeeds first, then A (rename Ann) is refused
    await act(async () => { calls.pending.get('archive:2')!({ ok: true, data: { ...p('2', 'Bob'), archivedAt: 'x' } }); await archive })
    await act(async () => { calls.pending.get('rename:1')!(refused); await rename })

    expect(names(result.current.players)).toEqual(['Ann', 'Cy']) // Ann's name back, Bob stays archived
    expect(names(result.current.admin.archived)).toEqual(['Bob'])
  })

  it('a refused archive puts the player back where they were', async () => {
    const { result } = setup([p('1'), p('2'), p('3')])
    await act(async () => {})
    let archive!: Promise<boolean>
    act(() => { archive = result.current.admin.archive(p('2')) })
    await act(async () => { calls.pending.get('archive:2')!(refused); await archive })
    expect(result.current.players.map((x) => x.id)).toEqual(['1', '2', '3'])
    expect(result.current.admin.archived).toEqual([])
  })

  it('a refresh that lands during an action is not overwritten by the rollback', async () => {
    const { result } = setup([p('1', 'Ann'), p('2', 'Bob')])
    await act(async () => {})
    let rename!: Promise<Result<PlayerScore>>
    act(() => { rename = result.current.admin.rename(p('1', 'Ann'), 'Annie') })
    act(() => result.current.setPlayers((list) => [...list, p('9', 'New from server')]))
    await act(async () => { calls.pending.get('rename:1')!(refused); await rename })
    expect(names(result.current.players)).toEqual(['Ann', 'Bob', 'New from server'])
  })
})
