import { FunctionsFetchError, FunctionsHttpError } from '@supabase/supabase-js'
import { buildCourtOrder } from '@/lib/courtAssignment'
import { isSupabaseConfigured, supabase } from '@/lib/supabase'
import { errorMessage } from '@/utils/errorMessage'

// Court settings for a run (event_court_settings) and its board status (event_assignment_meta),
// plus "Generate now" (the generate-court-assignments Edge Function). Supabase or, with no
// database, a localStorage demo that keeps the settings but cannot generate.

export interface CourtSettings {
  sessionDate: string // YYYY-MM-DD, the run's Wednesday
  /** The facility's courts in play, top court first: [10, 9, 8, 7, 3, 2]. */
  courtNumbers: number[]
  autoPublish: boolean
}

export type BoardState = 'none' | 'draft' | 'published'

export interface BoardMeta {
  state: BoardState
  generatedAt: string | null
  publishedAt: string | null
  manuallyEdited: boolean
}

export interface CourtSettingsSnapshot {
  /** The run's own settings, or the latest earlier run's (which generation carries forward). Null = never set. */
  settings: CourtSettings | null
  /** True when `settings` came from an earlier run because this one has none yet. */
  inherited: boolean
  /** Null until the run has been prepared or generated. */
  meta: BoardMeta | null
}

export interface GenerateSummary {
  skipped: boolean
  action: 'generate' | 'regenerate' | null
  state: BoardState
  courts: number
  sittingOut: number
  convertedGuests: number
}

export interface CourtSettingsError {
  /** UNAVAILABLE: the migrations are not applied. NOT_DEPLOYED: the Edge Function is not deployed. CA0xx: database rules. */
  code: string
  message: string
}

export type CourtResult<T> = { ok: true; data: T } | { ok: false; error: CourtSettingsError }

export interface CourtAssignmentsApi {
  load(sessionDate: string): Promise<CourtResult<CourtSettingsSnapshot>>
  save(input: CourtSettings): Promise<CourtResult<CourtSettings>>
  generate(sessionDate: string, force: boolean): Promise<CourtResult<GenerateSummary>>
}

const ok = <T>(data: T): CourtResult<T> => ({ ok: true, data })
const fail = (code: string, message: string): CourtResult<never> => ({ ok: false, error: { code, message } })

const FRIENDLY: Record<string, string> = {
  UNAVAILABLE: "Court assignments aren't set up on this database yet. Apply the court assignment migrations.",
  NOT_DEPLOYED: "The generate-court-assignments function isn't deployed yet.",
  NETWORK: "Can't reach the server. Check your connection and try again.",
  FORBIDDEN: 'Only admins can change court settings or generate assignments.',
  CA002: 'Some players are on courts this list drops. Generate the board again, or keep as many courts.',
  '23514': 'Check the court numbers: 1 to 50 different whole numbers of 1 or more.',
  CA011: 'RSVPs are still open. You can generate once they close.',
  CA013: 'The RSVP list kept changing. Try again in a moment.',
  CA020: "There's no board for this run yet.",
  CA021: 'Another admin just changed the board, so it has been refreshed. Try again.',
  CA022: 'That seat was just taken, so the board has been refreshed. Try again.',
  CA023: 'That player is no longer on the roster.',
}

const codeOf = (e: unknown): string =>
  typeof e === 'object' && e !== null && 'code' in e ? String((e as { code: unknown }).code) : ''

// Table, column or function not there yet (a migration not applied).
const MISSING = new Set(['42P01', 'PGRST205', '42703', 'PGRST204', '42883', 'PGRST202'])

/** A database or network error as a code and a message an admin can act on. Shared with lib/courtBoard.ts. */
export function toCourtError(e: unknown, fallback: string): CourtSettingsError {
  const code = codeOf(e)
  if (MISSING.has(code)) return { code: 'UNAVAILABLE', message: FRIENDLY.UNAVAILABLE }
  if (code === '42501') return { code: 'FORBIDDEN', message: FRIENDLY.FORBIDDEN }
  if (FRIENDLY[code]) return { code, message: FRIENDLY[code] }
  if (e instanceof TypeError) return { code: 'NETWORK', message: FRIENDLY.NETWORK }
  return { code: code || 'UNKNOWN', message: errorMessage(e, fallback) }
}

interface SettingsRow {
  session_date: string
  court_numbers: number[]
  auto_publish: boolean
}

interface MetaRow {
  state: BoardState
  generated_at: string | null
  published_at: string | null
  manually_edited: boolean
}

// court_numbers needs 20261210000000_court_numbers_list.sql; without it, loading reports UNAVAILABLE.
const SETTINGS_COLUMNS = 'session_date, court_numbers, auto_publish'

const toSettings = (r: SettingsRow): CourtSettings => ({
  sessionDate: r.session_date,
  courtNumbers: r.court_numbers,
  autoPublish: r.auto_publish,
})

export const supabaseCourtAssignmentsApi: CourtAssignmentsApi = {
  async load(sessionDate) {
    try {
      const [s, m] = await Promise.all([
        supabase
          .from('event_court_settings')
          .select(SETTINGS_COLUMNS)
          .lte('session_date', sessionDate)
          .order('session_date', { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from('event_assignment_meta')
          .select('state, generated_at, published_at, manually_edited')
          .eq('session_date', sessionDate)
          .maybeSingle(),
      ])
      if (s.error) return { ok: false, error: toCourtError(s.error, "Couldn't load the court settings.") }
      if (m.error) return { ok: false, error: toCourtError(m.error, "Couldn't load the board status.") }
      const row = s.data as SettingsRow | null
      const meta = m.data as MetaRow | null
      return ok({
        settings: row ? toSettings(row) : null,
        inherited: !!row && row.session_date !== sessionDate,
        meta: meta
          ? { state: meta.state, generatedAt: meta.generated_at, publishedAt: meta.published_at, manuallyEdited: meta.manually_edited }
          : null,
      })
    } catch (e) {
      return { ok: false, error: toCourtError(e, "Couldn't load the court settings.") }
    }
  },

  async save(input) {
    try {
      const { data, error } = await supabase
        .from('event_court_settings')
        .upsert(
          {
            session_date: input.sessionDate,
            court_numbers: input.courtNumbers,
            auto_publish: input.autoPublish,
          },
          { onConflict: 'session_date' }
        )
        .select(SETTINGS_COLUMNS)
        .maybeSingle()
      if (error) return { ok: false, error: toCourtError(error, "Couldn't save the court settings.") }
      if (!data) return fail('FORBIDDEN', FRIENDLY.FORBIDDEN) // RLS hid the row instead of erroring
      return ok(toSettings(data as SettingsRow))
    } catch (e) {
      return { ok: false, error: toCourtError(e, "Couldn't save the court settings.") }
    }
  },

  async generate(sessionDate, force) {
    const { data, error } = await supabase.functions.invoke('generate-court-assignments', {
      body: { eventId: sessionDate, force },
    })
    if (error) {
      if (error instanceof FunctionsFetchError) return fail('NETWORK', FRIENDLY.NETWORK)
      if (error instanceof FunctionsHttpError) {
        const response = error.context as Response
        if (response.status === 404) return fail('NOT_DEPLOYED', FRIENDLY.NOT_DEPLOYED)
        const body = (await response.json().catch(() => null)) as { code?: string; message?: string; hint?: string } | null
        const code = body?.code ?? 'UNKNOWN'
        if (code === 'FORBIDDEN' || code === 'UNAUTHORIZED') return fail(code, body?.message ?? FRIENDLY.FORBIDDEN)
        const message = FRIENDLY[code] ?? [body?.message, body?.hint].filter(Boolean).join(' ')
        return fail(code, message || "Couldn't generate the assignments.")
      }
      return fail('UNKNOWN', errorMessage(error, "Couldn't generate the assignments."))
    }
    const d = data as Partial<GenerateSummary> & { ok?: boolean }
    return ok({
      skipped: d.skipped === true,
      action: d.action ?? null,
      state: d.state ?? 'draft',
      courts: d.courts ?? 0,
      sittingOut: d.sittingOut ?? 0,
      convertedGuests: d.convertedGuests ?? 0,
    })
  },
}

// ---- Demo (no database) ----

const DEMO_KEY = 'wendy_court_settings'

type StoredDemo = CourtSettings & { top?: number; bottom?: number }

/** Saved demo settings. Ones saved before court lists (top and bottom only) read as that range. */
function readDemo(): Record<string, CourtSettings> {
  try {
    const raw = JSON.parse(localStorage.getItem(DEMO_KEY) ?? '{}') as Record<string, StoredDemo>
    const out: Record<string, CourtSettings> = {}
    for (const [date, s] of Object.entries(raw)) {
      const courtNumbers = Array.isArray(s.courtNumbers) ? s.courtNumbers : buildCourtOrder(Number(s.top), Number(s.bottom))
      out[date] = { sessionDate: s.sessionDate, courtNumbers, autoPublish: !!s.autoPublish }
    }
    return out
  } catch {
    return {}
  }
}

export const demoCourtAssignmentsApi: CourtAssignmentsApi = {
  async load(sessionDate) {
    const all = readDemo()
    const latest = Object.keys(all).filter((d) => d <= sessionDate).sort().pop()
    const settings = latest ? all[latest] : null
    return ok({ settings, inherited: !!settings && latest !== sessionDate, meta: null })
  },
  async save(input) {
    localStorage.setItem(DEMO_KEY, JSON.stringify({ ...readDemo(), [input.sessionDate]: input }))
    return ok(input)
  },
  async generate() {
    return fail('NO_DATABASE', 'Generating court assignments needs the database. Connect Supabase to try it.')
  },
}

/** The API for this run: Supabase when configured, otherwise the demo. */
export const courtAssignmentsApi: CourtAssignmentsApi = isSupabaseConfigured
  ? supabaseCourtAssignmentsApi
  : demoCourtAssignmentsApi
