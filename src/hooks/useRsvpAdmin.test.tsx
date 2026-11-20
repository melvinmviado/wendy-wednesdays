import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { createDemoRsvpApi } from '../data/rsvpDemo'
import { resetDeviceMemory } from '../data/rsvpDevice'
import { RsvpError, type RsvpApi } from '../types/rsvp'
import { useRsvp } from './useRsvp'

const players = Array.from({ length: 30 }, (_, i) => ({ id: `p${i + 1}`, name: `Player ${i + 1}` }))
const p20 = { id: 'p20', name: 'Player 20' } // not in the seeded list
const p1 = { id: 'p1', name: 'Player 1' } // seeded in
const demo = () => createDemoRsvpApi({ now: () => new Date(), players: () => players })

// Wed Nov 25 2026 in Toronto (EST): cutoff 6 PM = 23:00Z.
const at = (iso: string) => vi.setSystemTime(new Date(iso))
const flush = () => act(async () => { await vi.advanceTimersByTimeAsync(0) })

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

const setup = async (opts: { isAdmin?: boolean; api?: RsvpApi } = {}) => {
  at('2026-11-25T15:00:00Z')
  const api = opts.api ?? demo()
  const hook = renderHook(() => useRsvp({ api, isAdmin: opts.isAdmin ?? true }))
  await flush()
  return { api, ...hook }
}

describe('useRsvpAdmin', () => {
  describe('adminRemoveGuest', () => {
    const guestId = (r: { current: { roster: { rsvpId: string; isGuest: boolean; name: string }[] } }, name: string) =>
      r.current.roster.find((e) => e.isGuest && e.name === name)!.rsvpId

    it('deletes the guest by id, drops the count, and a repeat is a harmless no-op', async () => {
      const { result } = await setup()
      const id = guestId(result, 'Riley Park')
      expect(result.current.inCount).toBe(11)
      let res
      await act(async () => { res = await result.current.adminRemoveGuest({ id, name: 'Riley Park' }) })
      expect(res).toMatchObject({ ok: true, data: { changed: true } })
      expect(result.current.roster.some((e) => e.rsvpId === id)).toBe(false)
      expect(result.current.inCount).toBe(10)
      await act(async () => { res = await result.current.adminRemoveGuest({ id, name: 'Riley Park' }) })
      expect(res).toMatchObject({ ok: true, data: { changed: false } })
      expect(result.current.inCount).toBe(10)
    })

    it('promotes the first waitlisted person when an in-list guest is deleted', async () => {
      const { result } = await setup({ api: createDemoRsvpApi({ now: () => new Date(), players: () => players, capacity: 10 }) })
      expect(result.current).toMatchObject({ inCount: 10, waitlistCount: 1 })
      const riley = guestId(result, 'Riley Park')
      await act(async () => { await result.current.adminRemoveGuest({ id: riley, name: 'Riley Park' }) })
      expect(result.current).toMatchObject({ inCount: 10, waitlistCount: 0 })
      expect(result.current.roster.find((e) => e.name === 'Jamie Ortiz')?.position).toBe(10) // moved up from the waitlist
    })

    it('rolls back the optimistic change when the server refuses', async () => {
      const { api, result } = await setup()
      const id = guestId(result, 'Jamie Ortiz')
      vi.spyOn(api, 'adminRemoveGuest').mockRejectedValue({ code: '42501', message: 'Admins only' })
      let res
      await act(async () => { res = await result.current.adminRemoveGuest({ id, name: 'Jamie Ortiz' }) })
      expect(res).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } })
      expect(result.current.roster.some((e) => e.rsvpId === id)).toBe(true)
      expect(result.current.inCount).toBe(11)
    })

    it('refuses without calling the server when the caller is not an admin', async () => {
      const { api, result } = await setup({ isAdmin: false })
      const spy = vi.spyOn(api, 'adminRemoveGuest')
      let res
      await act(async () => { res = await result.current.adminRemoveGuest({ id: guestId(result, 'Riley Park'), name: 'Riley Park' }) })
      expect(res).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } })
      expect(spy).not.toHaveBeenCalled()
    })

    it("will not delete a player's RSVP", async () => {
      const { api, result } = await setup()
      const playerRow = result.current.roster.find((e) => e.playerId === 'p1')!
      await expect(api.adminRemoveGuest(playerRow.rsvpId)).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    })
  })

  describe('adminRenameGuest', () => {
    const find = (r: { current: { roster: { rsvpId: string; isGuest: boolean; name: string; position: number | null }[] } }, name: string) =>
      r.current.roster.find((e) => e.isGuest && e.name === name)!

    it('renames by id, trimming and collapsing spaces, and keeps the place in line', async () => {
      const { result } = await setup()
      const riley = find(result, 'Riley Park')
      let res
      await act(async () => { res = await result.current.adminRenameGuest({ id: riley.rsvpId, name: riley.name }, '  Riley   Parks ') })
      expect(res).toMatchObject({ ok: true, data: { changed: true, name: 'Riley Parks' } })
      expect(find(result, 'Riley Parks')).toMatchObject({ rsvpId: riley.rsvpId, position: riley.position })
      expect(result.current.inCount).toBe(11)
    })

    it("refuses another guest's name (any case) and rolls the screen back", async () => {
      const { result } = await setup()
      const riley = find(result, 'Riley Park')
      let res
      await act(async () => { res = await result.current.adminRenameGuest({ id: riley.rsvpId, name: riley.name }, 'jamie ORTIZ') })
      expect(res).toMatchObject({ ok: false, error: { code: 'NAME_ON_LIST' } })
      expect(find(result, 'Riley Park').rsvpId).toBe(riley.rsvpId)
    })

    it("refuses an existing player's name with a suggestion", async () => {
      const { result } = await setup()
      const riley = find(result, 'Riley Park')
      let res
      await act(async () => { res = await result.current.adminRenameGuest({ id: riley.rsvpId, name: riley.name }, 'player 3') })
      expect(res).toMatchObject({ ok: false, error: { code: 'NAME_EXISTS_SUGGESTION' } })
    })

    it('allows changing only the case of its own name', async () => {
      const { result } = await setup()
      const riley = find(result, 'Riley Park')
      let res
      await act(async () => { res = await result.current.adminRenameGuest({ id: riley.rsvpId, name: riley.name }, 'riley park') })
      expect(res).toMatchObject({ ok: true, data: { changed: true, name: 'riley park' } })
    })

    it("rejects an empty or one-character name, a player's row, and a missing guest", async () => {
      const { api, result } = await setup()
      const riley = find(result, 'Riley Park')
      await expect(api.adminRenameGuest(riley.rsvpId, '   ')).rejects.toMatchObject({ code: 'INVALID_NAME' })
      await expect(api.adminRenameGuest(riley.rsvpId, 'R')).rejects.toMatchObject({ code: 'INVALID_NAME' })
      const playerRow = result.current.roster.find((e) => e.playerId === 'p1')!
      await expect(api.adminRenameGuest(playerRow.rsvpId, 'Someone')).rejects.toMatchObject({ code: 'BAD_REQUEST' })
      await expect(api.adminRenameGuest('demo-nope', 'Someone')).rejects.toMatchObject({ code: 'GUEST_GONE' })
    })

    it('refuses without calling the server when the caller is not an admin', async () => {
      const { api, result } = await setup({ isAdmin: false })
      const spy = vi.spyOn(api, 'adminRenameGuest')
      const riley = find(result, 'Riley Park')
      let res
      await act(async () => { res = await result.current.adminRenameGuest({ id: riley.rsvpId, name: riley.name }, 'Someone Else') })
      expect(res).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } })
      expect(spy).not.toHaveBeenCalled()
    })
  })

  it('adds a player who has not RSVP\'d, leaving the admin\'s own status alone', async () => {
    const { result } = await setup()
    expect(result.current.inCount).toBe(11)
    let res
    await act(async () => { res = await result.current.adminAddRsvp(p20) })
    expect(res).toMatchObject({ ok: true, data: { changed: true, status: 'in', position: 12 } })
    expect(result.current).toMatchObject({ inCount: 12, myStatus: null })
    expect(result.current.roster.find((e) => e.playerId === 'p20')).toMatchObject({ status: 'in', position: 12 })
  })

  it('is idempotent: adding someone already in changes nothing', async () => {
    const { result } = await setup()
    let res
    await act(async () => { res = await result.current.adminAddRsvp(p1) })
    expect(res).toMatchObject({ ok: true, data: { changed: false } })
    expect(result.current.inCount).toBe(11)
    await act(async () => { await result.current.adminAddRsvp(p20) })
    await act(async () => { await result.current.adminAddRsvp(p20) })
    expect(result.current.inCount).toBe(12)
    expect(result.current.roster.filter((e) => e.playerId === 'p20')).toHaveLength(1)
  })

  it('removes a player and moves everyone behind up; removing twice is a no-op', async () => {
    const { result } = await setup()
    await act(async () => { await result.current.adminRemoveRsvp(p1) })
    expect(result.current.inCount).toBe(10)
    expect(result.current.roster.find((e) => e.playerId === 'p1')).toMatchObject({ status: 'out', position: null })
    expect(result.current.roster.find((e) => e.playerId === 'p2')?.position).toBe(1)
    let res
    await act(async () => { res = await result.current.adminRemoveRsvp(p1) })
    expect(res).toMatchObject({ ok: true, data: { changed: false } })
    expect(result.current.inCount).toBe(10)
  })

  it('still works after the 6 PM cutoff, as the database allows admins to', async () => {
    const { result } = await setup()
    at('2026-11-25T23:30:00Z')
    let res
    await act(async () => { res = await result.current.adminAddRsvp(p20) })
    expect(res).toMatchObject({ ok: true, data: { changed: true } })
  })

  it('refuses without the admin hint, and never calls the server', async () => {
    const api = demo()
    const add = vi.spyOn(api, 'adminAddRsvp')
    const { result } = await setup({ isAdmin: false, api })
    let res
    await act(async () => { res = await result.current.adminAddRsvp(p20) })
    expect(res).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } })
    expect(add).not.toHaveBeenCalled()
    expect(result.current.adminError?.code).toBe('FORBIDDEN')
  })

  it('rolls the screen back when the server refuses (a non-admin token, for example)', async () => {
    const api = demo()
    vi.spyOn(api, 'adminAddRsvp').mockRejectedValue({ code: '42501', message: 'Admins only' })
    const { result } = await setup({ api })
    const before = { inCount: result.current.inCount, roster: result.current.roster }
    let res
    await act(async () => { res = await result.current.adminAddRsvp(p20) })
    expect(res).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } })
    expect(result.current.inCount).toBe(before.inCount)
    expect(result.current.roster).toEqual(before.roster)
    expect(result.current.adminBusy).toBe(false)
  })

  it('reports an archived or unknown player distinctly and rolls back', async () => {
    const { result } = await setup()
    let res
    await act(async () => { res = await result.current.adminAddRsvp({ id: 'nobody', name: 'Nobody' }) })
    expect(res).toMatchObject({ ok: false, error: expect.any(RsvpError) })
    expect(result.current.adminError?.code).toBe('PLAYER_UNAVAILABLE')
    expect(result.current.inCount).toBe(11)
    expect(result.current.roster.some((e) => e.playerId === 'nobody')).toBe(false)
  })

  it('puts a player past capacity on the waitlist', async () => {
    at('2026-11-25T15:00:00Z')
    const api = createDemoRsvpApi({ now: () => new Date(), players: () => players, capacity: 11 })
    const { result } = renderHook(() => useRsvp({ api, isAdmin: true }))
    await flush()
    let res
    await act(async () => { res = await result.current.adminAddRsvp(p20) })
    expect(res).toMatchObject({ ok: true, data: { position: 12, waitlistPosition: 1 } })
    expect(result.current).toMatchObject({ inCount: 11, waitlistCount: 1 })
  })

  describe('edge cases', () => {
    const TOKEN = 'edge-case-device-token-0001'
    const adv = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms) })

    it('acts on the run on screen, not the run that is "next" by the time the tap lands', async () => {
      const { api, result } = await setup()
      const add = vi.spyOn(api, 'adminAddRsvp')
      at('2026-11-26T03:30:00Z') // 10:30 PM Wednesday: the server-side default has rolled to Dec 2
      let res
      await act(async () => { res = await result.current.adminAddRsvp(p20) })
      expect(add).toHaveBeenCalledWith({ playerId: 'p20', sessionDate: '2026-11-25' })
      expect(res).toMatchObject({ ok: true, data: { sessionDate: '2026-11-25', changed: true } })
      // The new run (Dec 2) is untouched: it is the seeded list without Player 20.
      await adv(0)
      expect(result.current.sessionDate).toBe('2026-12-02')
      expect(result.current.roster.some((e) => e.playerId === 'p20')).toBe(false)
    })

    it('is refused, rolled back and re-read when the run it was showing has closed', async () => {
      const { result } = await setup()
      at('2026-11-26T06:00:00Z') // Thursday 1 AM: Nov 25 is over
      let res
      await act(async () => { res = await result.current.adminAddRsvp(p20) })
      expect(res).toMatchObject({ ok: false, error: { code: 'BAD_REQUEST' } })
      await adv(0)
      expect(result.current.sessionDate).toBe('2026-12-02') // it re-read and now shows the new run
      expect(result.current.roster.some((e) => e.playerId === 'p20')).toBe(false)
      expect(result.current.adminBusy).toBe(false)
    })

    it('removing someone who already cancelled is a no-op and the count settles on the truth', async () => {
      const { api, result } = await setup()
      expect(result.current.roster.find((e) => e.playerId === 'p1')?.status).toBe('in') // stale view
      await api.setRsvp({ identity: { kind: 'player', playerId: 'p1', name: 'Player 1' }, status: 'out', token: TOKEN })
      let res
      await act(async () => { res = await result.current.adminRemoveRsvp(p1) })
      expect(res).toMatchObject({ ok: true, data: { changed: false, status: 'out' } })
      expect(result.current.inCount).toBe(10) // 11 minus the one who cancelled, not minus two
    })

    it.each(['admin first', 'player first'])('an admin add racing the player RSVPing themselves leaves exactly one row (%s)', async (order) => {
      const { api, result } = await setup()
      const self = api.setRsvp({ identity: { kind: 'player', playerId: 'p20', name: p20.name }, status: 'in', token: TOKEN })
      const adm = api.adminAddRsvp({ playerId: 'p20', sessionDate: '2026-11-25' })
      await (order === 'admin first' ? Promise.all([adm, self]) : Promise.all([self, adm]))
      await act(async () => { await result.current.refresh(true) })
      expect(result.current.roster.filter((e) => e.playerId === 'p20')).toHaveLength(1)
      expect(result.current.inCount).toBe(12)
    })

    it('reaches other viewers on their next poll (the app polls, it does not use realtime for RSVPs)', async () => {
      const { api, result } = await setup()
      const viewer = renderHook(() => useRsvp({ api, isAdmin: false }))
      await flush()
      expect(viewer.result.current.inCount).toBe(11)
      await act(async () => { await result.current.adminAddRsvp(p20) })
      expect(viewer.result.current.inCount).toBe(11) // not yet: nothing pushes to it
      await adv(30_000)
      expect(viewer.result.current.inCount).toBe(12)
      expect(viewer.result.current.roster.some((e) => e.playerId === 'p20' && e.status === 'in')).toBe(true)
    })
  })
})
