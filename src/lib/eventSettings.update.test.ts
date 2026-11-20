import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { EventSettingsInput } from './eventSettings'

const maybeSingle = vi.fn()
const eq = vi.fn(() => ({ select: () => ({ maybeSingle }) }))
const update = vi.fn((_payload: Record<string, unknown>) => ({ eq }))
const upsert = vi.fn()

vi.mock('./supabase', () => ({
  isSupabaseConfigured: true,
  supabase: { from: () => ({ update, upsert }) },
}))

const { updateEventSettings } = await import('./eventSettings')

const input: EventSettingsInput = {
  rsvpOpenAt: null,
  rsvpCutoffAt: '2026-11-25T23:00:00.000Z',
  eventStartAt: '2026-11-26T01:00:00.000Z',
  eventEndAt: '2026-11-26T03:00:00.000Z',
  timezone: 'America/Toronto',
  capacity: 24,
}

const row = {
  rsvp_open_at: null,
  rsvp_cutoff_at: input.rsvpCutoffAt,
  event_start_at: input.eventStartAt,
  event_end_at: input.eventEndAt,
  timezone: input.timezone,
  capacity: 24,
  updated_at: '2026-11-20T00:00:00.000Z',
  updated_by: null,
}

describe('updateEventSettings', () => {
  beforeEach(() => vi.clearAllMocks())

  it('updates row 1 without ever writing id, and never upserts', async () => {
    maybeSingle.mockResolvedValue({ data: row, error: null })
    const res = await updateEventSettings(input)
    expect(res.ok).toBe(true)
    expect(upsert).not.toHaveBeenCalled()
    expect(eq).toHaveBeenCalledWith('id', 1)
    expect(update.mock.calls[0]?.[0]).not.toHaveProperty('id')
  })

  it('reports 0 updated rows as NOT_FOUND, not as an admin problem', async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null })
    const res = await updateEventSettings(input)
    expect(res.ok === false && res.error.code).toBe('NOT_FOUND')
    expect(res.ok === false && res.error.message).not.toMatch(/Only admins/)
  })

  it('still maps a real permission error to FORBIDDEN', async () => {
    maybeSingle.mockResolvedValue({ data: null, error: { code: '42501', message: 'denied' } })
    const res = await updateEventSettings(input)
    expect(res.ok === false && res.error.code).toBe('FORBIDDEN')
  })
})
