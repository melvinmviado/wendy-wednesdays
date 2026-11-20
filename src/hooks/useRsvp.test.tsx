import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { createDemoRsvpApi } from '../data/rsvpDemo'
import { resetDeviceMemory } from '../data/rsvpDevice'
import { RsvpError, type RsvpApi, type SetRsvpResult } from '../types/rsvp'
import { useRsvp } from './useRsvp'

const players = Array.from({ length: 30 }, (_, i) => ({ id: `p${i + 1}`, name: `Player ${i + 1}` }))
const ann = { kind: 'player', playerId: 'p20', name: 'Player 20' } as const
const demo = () => createDemoRsvpApi({ now: () => new Date(), players: () => players })

// Wed Nov 25 2026 in Toronto (EST): cutoff 6 PM = 23:00Z, live 8 PM = 01:00Z, end 10 PM = 03:00Z.
const at = (iso: string) => vi.setSystemTime(new Date(iso))
const advance = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms) })
const flush = () => advance(0)

beforeEach(() => {
  vi.useFakeTimers()
  localStorage.clear()
  resetDeviceMemory()
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' })
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('useRsvp', () => {
  it('loads state and derives the phase', async () => {
    at('2026-11-25T15:00:00Z')
    const api = demo()
    const { result } = renderHook(() => useRsvp({ api }))
    expect(result.current.loading).toBe(true)
    expect(result.current.phase).toBeNull()
    await flush()
    expect(result.current).toMatchObject({ loading: false, phase: 'open', sessionDate: '2026-11-25', inCount: 11, capacity: 24 })
  })

  it('flips the phase at 6:00, 8:00 and 10:00 PM without a reload', async () => {
    at('2026-11-25T22:59:40Z') // 5:59:40 PM
    const api = demo()
    const { result } = renderHook(() => useRsvp({ api }))
    await flush()
    expect(result.current.phase).toBe('open')

    await advance(30_000) // 6:00:10 PM
    expect(result.current.phase).toBe('locked')

    at('2026-11-26T00:59:45Z')
    await advance(30_000) // 8:00:15 PM
    expect(result.current.phase).toBe('live')

    at('2026-11-26T02:59:45Z')
    await advance(30_000) // 10:00:15 PM: next week's session, open again
    expect(result.current).toMatchObject({ phase: 'open', sessionDate: '2026-12-02' })
  })

  it('corrects for a device clock that is wrong', async () => {
    at('2026-11-25T15:00:00Z')
    const real = demo()
    // The "server" says it is 6:30 PM while this device thinks it is 10 AM.
    const api: RsvpApi = {
      ...real,
      getState: async (t) => ({ ...(await real.getState(t)), serverNow: new Date('2026-11-25T23:30:00Z') }),
    }
    const { result } = renderHook(() => useRsvp({ api }))
    await flush()
    expect(result.current.now.toISOString()).toBe('2026-11-25T23:30:00.000Z')
    expect(result.current.phase).toBe('locked')
  })

  it('refreshes on every poll and when the tab becomes visible', async () => {
    at('2026-11-25T15:00:00Z')
    const api = demo()
    const getState = vi.spyOn(api, 'getState')
    renderHook(() => useRsvp({ api }))
    await flush()
    expect(getState).toHaveBeenCalledTimes(1)
    await advance(30_000)
    expect(getState).toHaveBeenCalledTimes(2)
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')) })
    expect(getState).toHaveBeenCalledTimes(3)
  })

  it('does not poll while the tab is hidden', async () => {
    at('2026-11-25T15:00:00Z')
    const api = demo()
    const getState = vi.spyOn(api, 'getState')
    renderHook(() => useRsvp({ api }))
    await flush()
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' })
    await advance(90_000)
    expect(getState).toHaveBeenCalledTimes(1)
  })

  it('setIn updates at once, remembers who you are, and cancel reuses it', async () => {
    at('2026-11-25T15:00:00Z')
    const api = demo()
    const { result } = renderHook(() => useRsvp({ api }))
    await flush()

    let out: Awaited<ReturnType<typeof result.current.setIn>> | undefined
    await act(async () => { out = await result.current.setIn(ann) })
    expect(out).toMatchObject({ ok: true, data: { status: 'in', position: 12 } })
    expect(result.current).toMatchObject({ myStatus: 'in', myPosition: 12, inCount: 12, identity: ann })
    expect(localStorage.getItem('wendy_rsvp_identity')).toContain('p20')

    await act(async () => { await result.current.cancel() })
    expect(result.current).toMatchObject({ myStatus: 'out', inCount: 11 })
  })

  it('shows the change immediately and rolls it back when the server refuses', async () => {
    at('2026-11-25T15:00:00Z')
    const real = demo()
    let reject!: (e: unknown) => void
    const api: RsvpApi = { ...real, setRsvp: () => new Promise<SetRsvpResult>((_, rej) => { reject = rej }) }
    const { result } = renderHook(() => useRsvp({ api }))
    await flush()

    let pending: Promise<unknown> | undefined
    act(() => { pending = result.current.setIn(ann) })
    expect(result.current).toMatchObject({ myStatus: 'in', inCount: 12, busy: true }) // optimistic
    expect(result.current.roster.find((r) => r.playerId === 'p20')?.status).toBe('in')

    await act(async () => { reject(new RsvpError('TOKEN_MISMATCH')); await pending })
    expect(result.current).toMatchObject({ myStatus: null, inCount: 11, busy: false }) // rolled back
    expect(result.current.roster.find((r) => r.playerId === 'p20')).toBeUndefined()
    expect(result.current.actionError?.code).toBe('TOKEN_MISMATCH')
  })

  it('refuses a second change while one is saving', async () => {
    at('2026-11-25T15:00:00Z')
    const real = demo()
    const api: RsvpApi = { ...real, setRsvp: () => new Promise<SetRsvpResult>(() => {}) }
    const { result } = renderHook(() => useRsvp({ api }))
    await flush()
    act(() => { void result.current.setIn(ann) })
    let second: Awaited<ReturnType<typeof result.current.setIn>> | undefined
    await act(async () => { second = await result.current.setIn({ kind: 'player', playerId: 'p21', name: 'Player 21' }) })
    expect(second).toMatchObject({ ok: false, error: { code: 'BUSY' } })
  })

  it('does not let an older poll undo a change that just landed', async () => {
    at('2026-11-25T15:00:00Z')
    const real = demo()
    let release!: () => void
    const slowState: RsvpApi['getState'] = async (t) => {
      const snapshot = await real.getState(t) // read BEFORE the change
      await new Promise<void>((r) => { release = r })
      return snapshot
    }
    let calls = 0
    const api: RsvpApi = { ...real, getState: (t) => (++calls === 2 ? slowState(t) : real.getState(t)) }
    const { result } = renderHook(() => useRsvp({ api }))
    await flush()
    await advance(30_000) // poll #2 starts and hangs on the old snapshot
    await act(async () => { await result.current.setIn(ann) })
    expect(result.current.myStatus).toBe('in')
    await act(async () => { release() })
    expect(result.current.myStatus).toBe('in') // the stale read was dropped
  })

  it('blocks changes locally once the cutoff has passed, without calling the server', async () => {
    at('2026-11-25T23:00:30Z')
    const api = demo()
    const setRsvp = vi.spyOn(api, 'setRsvp')
    const { result } = renderHook(() => useRsvp({ api }))
    await flush()
    expect(result.current.phase).toBe('locked')
    let out: Awaited<ReturnType<typeof result.current.setIn>> | undefined
    await act(async () => { out = await result.current.setIn(ann) })
    expect(out).toMatchObject({ ok: false, error: { code: 'CUTOFF_PASSED' } })
    expect(setRsvp).not.toHaveBeenCalled()
  })

  it('asks who you are when nothing is remembered', async () => {
    at('2026-11-25T15:00:00Z')
    const api = demo()
    const { result } = renderHook(() => useRsvp({ api }))
    await flush()
    let out: Awaited<ReturnType<typeof result.current.setIn>> | undefined
    await act(async () => { out = await result.current.setIn() })
    expect(out).toMatchObject({ ok: false, error: { code: 'NO_IDENTITY' } })
  })

  it('forgets a remembered name the server says is not ours', async () => {
    at('2026-11-25T15:00:00Z')
    localStorage.setItem('wendy_rsvp_identity', JSON.stringify(ann))
    const real = demo()
    const api: RsvpApi = { ...real, setRsvp: async () => { throw new RsvpError('NAME_CLAIMED') } }
    const { result } = renderHook(() => useRsvp({ api }))
    await flush()
    expect(result.current.identity).toEqual(ann)
    await act(async () => { await result.current.setIn() })
    expect(result.current.identity).toBeNull()
    expect(localStorage.getItem('wendy_rsvp_identity')).toBeNull()
  })

  it('passes a "did you mean" suggestion through for a guest name that matches a player', async () => {
    at('2026-11-25T15:00:00Z')
    const api = demo()
    const { result } = renderHook(() => useRsvp({ api }))
    await flush()
    let out: Awaited<ReturnType<typeof result.current.setIn>> | undefined
    await act(async () => { out = await result.current.setIn({ kind: 'guest', name: 'player 7' }) })
    expect(out).toMatchObject({ ok: false, error: { code: 'NAME_EXISTS_SUGGESTION', suggestion: { playerId: 'p7' } } })
    expect(result.current.identity).toBeNull() // a refused name is not remembered
  })

  it('RSVPs as the claimed player and never stores an identity', async () => {
    at('2026-11-25T15:00:00Z')
    const claimedPlayer = { id: 'p25', name: 'Player 25' }
    const api = demo()
    const { result } = renderHook(() => useRsvp({ api, claimedPlayer }))
    await flush()
    await act(async () => { await result.current.setIn() })
    expect(result.current.myStatus).toBe('in')
    expect(result.current.identity).toMatchObject({ playerId: 'p25' })
    expect(localStorage.getItem('wendy_rsvp_identity')).toBeNull()
  })

  it('reports the waitlist place for someone past capacity', async () => {
    at('2026-11-25T15:00:00Z')
    const api = createDemoRsvpApi({ now: () => new Date(), players: () => players, capacity: 11 }) // seeded list already fills it
    const { result } = renderHook(() => useRsvp({ api }))
    await flush()
    expect(result.current.phase).toBe('full')
    await act(async () => { await result.current.joinWaitlist(ann) })
    expect(result.current).toMatchObject({ myStatus: 'in', myPosition: 12, myWaitlistPosition: 1, waitlistCount: 1 })
  })

  it('stops polling and says so when the migration is missing', async () => {
    at('2026-11-25T15:00:00Z')
    const getState = vi.fn().mockRejectedValue(new RsvpError('UNAVAILABLE'))
    const no = async () => { throw new Error('no') }
    const api: RsvpApi = { getState, getRoster: async () => [], setRsvp: no, adminAddRsvp: no, adminRemoveRsvp: no, adminAddGuest: no, adminRemoveGuest: no }
    const { result } = renderHook(() => useRsvp({ api }))
    await flush()
    expect(result.current).toMatchObject({ unavailable: true, loading: false })
    await advance(120_000)
    expect(getState).toHaveBeenCalledTimes(1)
  })
})
