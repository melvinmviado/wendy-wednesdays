import { beforeEach, describe, expect, it } from 'vitest'
import { courtAssignmentsApi, demoCourtAssignmentsApi } from './courtSettings'

// Tests run without Supabase (vite.config blanks it), so the app uses the demo API.
describe('demoCourtAssignmentsApi', () => {
  beforeEach(() => localStorage.clear())

  it('is the API in use when there is no database', () => {
    expect(courtAssignmentsApi).toBe(demoCourtAssignmentsApi)
  })

  it('has nothing until a range is saved', async () => {
    expect(await demoCourtAssignmentsApi.load('2026-11-25')).toEqual({ ok: true, data: { settings: null, inherited: false, meta: null } })
  })

  it("carries the latest earlier run's range forward, like generation does", async () => {
    await demoCourtAssignmentsApi.save({ sessionDate: '2026-11-11', courtNumbers: [4, 5, 6], autoPublish: false })
    await demoCourtAssignmentsApi.save({ sessionDate: '2026-11-18', courtNumbers: [10, 9, 8, 7, 3, 2], autoPublish: true })
    const r = await demoCourtAssignmentsApi.load('2026-11-25')
    expect(r).toEqual({
      ok: true,
      data: { settings: { sessionDate: '2026-11-18', courtNumbers: [10, 9, 8, 7, 3, 2], autoPublish: true }, inherited: true, meta: null },
    })
    const own = await demoCourtAssignmentsApi.load('2026-11-18')
    expect(own.ok && own.data.inherited).toBe(false)
  })

  it('reads settings saved before court lists (top and bottom) as that range', async () => {
    localStorage.setItem('wendy_court_settings', JSON.stringify({ '2026-11-18': { sessionDate: '2026-11-18', top: 10, bottom: 7, autoPublish: false } }))
    const r = await demoCourtAssignmentsApi.load('2026-11-18')
    expect(r.ok && r.data.settings?.courtNumbers).toEqual([10, 9, 8, 7])
  })

  it('cannot generate without a database', async () => {
    const r = await demoCourtAssignmentsApi.generate('2026-11-25', false)
    expect(r.ok).toBe(false)
    expect(!r.ok && r.error.code).toBe('NO_DATABASE')
  })
})
