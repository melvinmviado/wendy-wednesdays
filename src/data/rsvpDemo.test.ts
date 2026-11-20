import { describe, expect, it } from 'vitest'
import type { RsvpIdentity } from '../types/rsvp'
import { createDemoRsvpApi } from './rsvpDemo'

const players = Array.from({ length: 30 }, (_, i) => ({ id: `p${i + 1}`, name: `Player ${i + 1}` }))
const player = (n: number): RsvpIdentity => ({ kind: 'player', playerId: `p${n}`, name: `Player ${n}` })
const guest = (name: string): RsvpIdentity => ({ kind: 'guest', name })
const tok = (n: number) => `device-token-${String(n).padStart(8, '0')}`
const WED_MORNING = '2026-11-25T15:00:00Z'

const make = (over: Parameters<typeof createDemoRsvpApi>[0] = {}) => {
  const clock = { t: new Date(WED_MORNING) }
  return { clock, api: createDemoRsvpApi({ now: () => clock.t, players: () => players, ...over }) }
}
const code = (p: Promise<unknown>) =>
  p.then(
    () => 'ok',
    (e: { code: string }) => e.code,
  )

describe('demo RSVP api', () => {
  it('starts with a seeded list for the session and an empty "mine"', async () => {
    const { api } = make()
    const s = await api.getState(tok(1))
    expect(s).toMatchObject({ sessionDate: '2026-11-25', capacity: 24, inCount: 11, waitlistCount: 0, myStatus: null, myRsvps: [] })
    expect(s.cutoffAt.toISOString()).toBe('2026-11-25T23:00:00.000Z')
    expect(s.serverNow).toEqual(new Date(WED_MORNING))
    expect((await api.getRoster()).filter((r) => r.status === 'in')).toHaveLength(11)
  })

  it('lets a device take a free name, binds it, and refuses other devices', async () => {
    const { api } = make()
    expect(await api.setRsvp({ identity: player(20), status: 'in', token: tok(1) })).toMatchObject({ status: 'in', position: 12 })
    expect(await code(api.setRsvp({ identity: player(20), status: 'out', token: tok(2) }))).toBe('TOKEN_MISMATCH')
    expect((await api.setRsvp({ identity: player(20), status: 'out', token: tok(1) })).status).toBe('out')
    expect((await api.getState(tok(1))).myStatus).toBe('out')
  })

  it('binds a seeded, unbound name to the first device that taps it', async () => {
    const { api } = make()
    await api.setRsvp({ identity: player(1), status: 'in', token: tok(1) })
    expect(await code(api.setRsvp({ identity: player(1), status: 'out', token: tok(2) }))).toBe('TOKEN_MISMATCH')
  })

  it('waitlists past capacity, promotes on cancel, and sends a rejoiner to the back', async () => {
    const { api } = make({ capacity: 12 }) // 11 seeded, so one place is left
    const a = await api.setRsvp({ identity: player(20), status: 'in', token: tok(1) })
    const b = await api.setRsvp({ identity: player(21), status: 'in', token: tok(2) })
    expect(a).toMatchObject({ position: 12, waitlistPosition: null })
    expect(b).toMatchObject({ position: 13, waitlistPosition: 1 })
    expect(await api.getState(tok(2))).toMatchObject({ inCount: 12, waitlistCount: 1, myPosition: 13 })

    await api.setRsvp({ identity: player(20), status: 'out', token: tok(1) })
    expect(await api.getState(tok(2))).toMatchObject({ inCount: 12, waitlistCount: 0, myPosition: 12 }) // promoted

    const back = await api.setRsvp({ identity: player(20), status: 'in', token: tok(1) })
    expect(back).toMatchObject({ position: 13, waitlistPosition: 1 })
  })

  it('freezes everything from 6:00 PM', async () => {
    const { api, clock } = make()
    await api.setRsvp({ identity: player(20), status: 'in', token: tok(1) })
    clock.t = new Date('2026-11-25T22:59:59Z')
    expect(await code(api.setRsvp({ identity: player(20), status: 'out', token: tok(1) }))).toBe('ok')
    clock.t = new Date('2026-11-25T23:00:00Z')
    expect(await code(api.setRsvp({ identity: player(20), status: 'in', token: tok(1) }))).toBe('CUTOFF_PASSED')
    expect(await code(api.setRsvp({ identity: guest('Late Guest'), status: 'in', token: tok(3) }))).toBe('CUTOFF_PASSED')
  })

  it('rolls to a fresh list for next week after 10:00 PM', async () => {
    const { api, clock } = make()
    await api.setRsvp({ identity: player(20), status: 'in', token: tok(1) })
    clock.t = new Date('2026-11-26T03:00:00Z')
    expect(await api.getState(tok(1))).toMatchObject({ sessionDate: '2026-12-02', inCount: 11, myStatus: null })
  })

  it('rejects a player who is not on the roster', async () => {
    const { api } = make()
    expect(await code(api.setRsvp({ identity: player(99), status: 'in', token: tok(1) }))).toBe('NAME_CLAIMED')
  })

  describe('guests', () => {
    it('trims names and refuses a clash with a player, suggesting them', async () => {
      const { api } = make()
      await api.setRsvp({ identity: guest('  Zed   Guest '), status: 'in', token: tok(1) })
      expect((await api.getRoster()).some((r) => r.isGuest && r.name === 'Zed Guest')).toBe(true)

      const err = await api.setRsvp({ identity: guest('PLAYER 7'), status: 'in', token: tok(2) }).catch((e: unknown) => e)
      expect(err).toMatchObject({ code: 'NAME_EXISTS_SUGGESTION', suggestion: { playerId: 'p7', name: 'Player 7' } })
    })

    it('rejects bad names, and a name another device holds', async () => {
      const { api } = make()
      for (const name of ['', ' ', 'x', 'y'.repeat(41)]) {
        expect(await code(api.setRsvp({ identity: guest(name), status: 'in', token: tok(1) }))).toBe('INVALID_NAME')
      }
      await api.setRsvp({ identity: guest('Zed Guest'), status: 'in', token: tok(1) })
      expect(await code(api.setRsvp({ identity: guest('zed guest'), status: 'out', token: tok(2) }))).toBe('TOKEN_MISMATCH')
    })

    it('caps rows per device and guests per session', async () => {
      const { api } = make()
      for (const n of [20, 21, 22]) await api.setRsvp({ identity: player(n), status: 'in', token: tok(1) })
      expect(await code(api.setRsvp({ identity: player(23), status: 'in', token: tok(1) }))).toBe('RATE_LIMITED')
      for (let i = 0; i < 6; i++) await api.setRsvp({ identity: guest(`Cap Guest ${i}`), status: 'in', token: tok(10 + i) }) // 2 seeded + 6
      expect(await code(api.setRsvp({ identity: guest('One Too Many'), status: 'in', token: tok(30) }))).toBe('RATE_LIMITED')
    })

    it("cancelling a name that was never RSVP'd creates nothing", async () => {
      const { api } = make()
      expect(await api.setRsvp({ identity: guest('Nobody Here'), status: 'out', token: tok(1) })).toMatchObject({ rsvpId: null, status: null })
      expect((await api.getState(tok(1))).myRsvps).toEqual([])
    })
  })
})
