import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { createDemoRsvpApi } from '../data/rsvpDemo'
import { resetDeviceMemory } from '../data/rsvpDevice'
import { RsvpError, type RsvpApi, type RsvpResult, type SetRsvpResult } from '../types/rsvp'
import { useRsvp } from './useRsvp'

const players = Array.from({ length: 30 }, (_, i) => ({ id: `p${i + 1}`, name: `Player ${i + 1}` }))
const ann = { kind: 'player', playerId: 'p20', name: 'Player 20' } as const
const advance = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms) })

const setup = async (wrap: (api: RsvpApi) => RsvpApi = (a) => a) => {
  const real = createDemoRsvpApi({ now: () => new Date(), players: () => players })
  const api = wrap(real)
  const hook = renderHook(() => useRsvp({ api }))
  await advance(0)
  await act(async () => { await hook.result.current.setIn(ann) }) // in at position 12
  return { api, real, ...hook }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-11-25T15:00:00Z'))
  localStorage.clear()
  resetDeviceMemory()
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' })
})
afterEach(() => vi.useRealTimers())

describe('useRsvp cancelWithUndo', () => {
  it('cancels on screen at once but only tells the server when the window closes', async () => {
    const { api, result } = await setup()
    const setRsvp = vi.spyOn(api, 'setRsvp')
    let settled: RsvpResult<SetRsvpResult> | undefined
    act(() => { result.current.cancelWithUndo({ delayMs: 5000, onSettled: (r) => { settled = r } }) })
    expect(result.current).toMatchObject({ myStatus: 'out', inCount: 11 })
    expect(setRsvp).not.toHaveBeenCalled()

    await advance(4999)
    expect(setRsvp).not.toHaveBeenCalled()
    await advance(1)
    expect(setRsvp).toHaveBeenCalledWith(expect.objectContaining({ status: 'out' }))
    expect(settled).toMatchObject({ ok: true })
    expect(result.current).toMatchObject({ myStatus: 'out', inCount: 11 })
  })

  it('undo restores the spot, and the same place in line, without any server call', async () => {
    const { api, result } = await setup()
    const setRsvp = vi.spyOn(api, 'setRsvp')
    let undo!: () => boolean
    act(() => {
      const r = result.current.cancelWithUndo({ delayMs: 5000 })
      if (r.ok) undo = r.data.undo
    })
    expect(result.current.myStatus).toBe('out')
    let undone = false
    await act(async () => { undone = undo() })
    expect(undone).toBe(true)
    expect(result.current).toMatchObject({ myStatus: 'in', myPosition: 12, inCount: 12 })
    await advance(10_000)
    expect(setRsvp).not.toHaveBeenCalled()
    expect(result.current.myStatus).toBe('in')
  })

  it('undo after the window has closed does nothing', async () => {
    const { result } = await setup()
    let undo!: () => boolean
    act(() => {
      const r = result.current.cancelWithUndo({ delayMs: 1000 })
      if (r.ok) undo = r.data.undo
    })
    await advance(1000)
    expect(undo()).toBe(false)
    expect(result.current.myStatus).toBe('out')
  })

  it('rolls back and reports it when the server refuses', async () => {
    const { result } = await setup((real) => ({
      ...real,
      setRsvp: async (args) => {
        if (args.status === 'out') throw new RsvpError('NETWORK')
        return real.setRsvp(args)
      },
    }))
    let settled: RsvpResult<SetRsvpResult> | undefined
    act(() => { result.current.cancelWithUndo({ delayMs: 100, onSettled: (r) => { settled = r } }) })
    expect(result.current.myStatus).toBe('out')
    await advance(100)
    expect(settled).toMatchObject({ ok: false, error: { code: 'NETWORK' } })
    expect(result.current).toMatchObject({ myStatus: 'in', inCount: 12 })
  })

  it('a poll during the window cannot flip the screen back', async () => {
    const { result } = await setup()
    act(() => { result.current.cancelWithUndo({ delayMs: 60_000 }) })
    await advance(30_000) // a poll lands while we wait
    expect(result.current.myStatus).toBe('out')
  })

  it('sends the cancel straight away if the page is hidden mid-window', async () => {
    const { api, result } = await setup()
    const setRsvp = vi.spyOn(api, 'setRsvp')
    act(() => { result.current.cancelWithUndo({ delayMs: 60_000 }) })
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' })
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')) })
    expect(setRsvp).toHaveBeenCalledTimes(1)
  })

  it('refuses when nothing can be cancelled', async () => {
    const real = createDemoRsvpApi({ now: () => new Date(), players: () => players })
    const { result } = renderHook(() => useRsvp({ api: real }))
    await advance(0)
    expect(result.current.cancelWithUndo()).toMatchObject({ ok: false, error: { code: 'NO_IDENTITY' } })
  })
})
