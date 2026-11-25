import { isSupabaseConfigured, supabase } from '@/lib/supabase'
import { toCourtError, type CourtResult } from '@/lib/courtSettings'
import type { AuditAction } from '@/utils/courtActivity'
import type { BoardEdit, BoardEntry, PlayerRef } from '@/utils/courtBoardModel'

// The court assignment editor's data: the run's board (court_assignment_board view, which admins
// read in any state), its edits (one RPC each, 20261208000000_court_assignment_editing.sql),
// the activity feed, the players the seat picker offers, and Realtime.

export interface BoardData {
  sessionDate: string
  /** The facility's courts, top court first. */
  courtNumbers: number[]
  autoPublish: boolean
  state: 'draft' | 'published'
  manuallyEdited: boolean
  generatedAt: string | null
  publishedAt: string | null
  entries: BoardEntry[]
  /** Where the RSVP list no longer matches the board (an admin changed it after the cutoff). */
  rsvpChanges: RsvpChange[]
}

/**
 * not_confirmed: on the board, no longer confirmed. not_on_board: confirmed, not on the board
 * (id null: a guest, who joins the roster when the board is regenerated).
 */
export interface RsvpChange {
  kind: 'not_confirmed' | 'not_on_board'
  id: string | null
  name: string
}

/** A player the seat picker offers. `rsvpd`: confirmed or waitlisted 'in' for this run. */
export interface Candidate extends PlayerRef {
  rsvpd: boolean
}

export interface ActivityEntry {
  id: string
  action: AuditAction
  /** Null for the automatic run, or an admin account deleted since. */
  actorId: string | null
  actorName: string | null
  before: unknown
  after: unknown
  createdAt: string
}

export interface CourtBoardApi {
  /** Null data: the run has no board yet (or there is no database). */
  load(sessionDate: string): Promise<CourtResult<BoardData | null>>
  edit(sessionDate: string, edit: BoardEdit): Promise<CourtResult<null>>
  setPublished(sessionDate: string, published: boolean): Promise<CourtResult<'draft' | 'published'>>
  activity(sessionDate: string): Promise<CourtResult<ActivityEntry[]>>
  candidates(sessionDate: string): Promise<CourtResult<Candidate[]>>
  /** Calls `onChange` whenever the run's board or status may have changed. Returns the unsubscribe. */
  subscribe(sessionDate: string, onChange: () => void): () => void
}

const ok = <T>(data: T): CourtResult<T> => ({ ok: true, data })

interface BoardRow {
  player_id: string
  name: string
  avatar_url: string | null
  court_position: number | null
  slot: number | null
  seed_rank: number
}

const toEntry = (r: BoardRow): BoardEntry => ({
  id: r.player_id,
  name: r.name,
  avatarUrl: r.avatar_url,
  seat: r.court_position === null || r.slot === null ? null : { courtPosition: r.court_position, slot: r.slot },
  seedRank: r.seed_rank,
})

async function attempt<T>(fallback: string, run: () => Promise<CourtResult<T>>): Promise<CourtResult<T>> {
  try {
    return await run()
  } catch (e) {
    return { ok: false, error: toCourtError(e, fallback) }
  }
}

let channelSeq = 0

export const supabaseCourtBoardApi: CourtBoardApi = {
  load: (d) =>
    attempt("Couldn't load the board.", async () => {
      const [m, s, b, c] = await Promise.all([
        supabase.from('event_assignment_meta').select('state, generated_at, published_at, manually_edited').eq('session_date', d).maybeSingle(),
        supabase.from('event_court_settings').select('court_numbers, auto_publish').eq('session_date', d).maybeSingle(),
        supabase
          .from('court_assignment_board')
          .select('player_id, name, avatar_url, court_position, slot, seed_rank')
          .eq('session_date', d)
          .order('seed_rank'),
        // 20261209000000: a warning only, so a missing function or a failure is not an error here.
        supabase.rpc('court_assignment_rsvp_changes', { p_session_date: d }),
      ])
      const error = m.error ?? s.error ?? b.error
      if (error) return { ok: false, error: toCourtError(error, "Couldn't load the board.") }
      if (!m.data || m.data.state === 'none' || !s.data) return ok(null)
      return ok({
        sessionDate: d,
        courtNumbers: s.data.court_numbers,
        autoPublish: s.data.auto_publish,
        state: m.data.state,
        manuallyEdited: m.data.manually_edited,
        generatedAt: m.data.generated_at,
        publishedAt: m.data.published_at,
        entries: ((b.data ?? []) as BoardRow[]).map(toEntry),
        rsvpChanges: c.error ? [] : ((c.data ?? []) as { kind: RsvpChange['kind']; player_id: string | null; name: string }[])
          .map((r) => ({ kind: r.kind, id: r.player_id, name: r.name })),
      })
    }),

  edit: (d, e) =>
    attempt("Couldn't save that change.", async () => {
      const { error } =
        e.kind === 'swap'
          ? await supabase.rpc('court_assignment_swap', { p_session_date: d, p_player_a: e.a, p_player_b: e.b })
          : await supabase.rpc('court_assignment_move', {
              p_session_date: d,
              p_player_id: e.kind === 'drop' ? e.playerId : e.player.id,
              p_court_position: e.kind === 'move' ? (e.to?.courtPosition ?? null) : null,
              p_slot: e.kind === 'move' ? (e.to?.slot ?? null) : null,
              p_remove: e.kind === 'drop',
            })
      return error ? { ok: false, error: toCourtError(error, "Couldn't save that change.") } : ok(null)
    }),

  setPublished: (d, published) =>
    attempt("Couldn't change who can see the board.", async () => {
      const { data, error } = await supabase.rpc('court_assignment_set_published', { p_session_date: d, p_published: published })
      if (error) return { ok: false, error: toCourtError(error, "Couldn't change who can see the board.") }
      return ok(data === 'published' ? 'published' : 'draft')
    }),

  activity: (d) =>
    attempt("Couldn't load the activity.", async () => {
      const { data, error } = await supabase.rpc('court_assignment_activity', { p_session_date: d, p_limit: 100 })
      if (error) return { ok: false, error: toCourtError(error, "Couldn't load the activity.") }
      type Row = { id: string; action: AuditAction; actor_id: string | null; actor_name: string | null; before: unknown; after: unknown; created_at: string }
      return ok(((data ?? []) as Row[]).map((r) => ({
        id: r.id, action: r.action, actorId: r.actor_id, actorName: r.actor_name, before: r.before, after: r.after, createdAt: r.created_at,
      })))
    }),

  candidates: (d) =>
    attempt("Couldn't load the players.", async () => {
      const [players, roster] = await Promise.all([
        supabase.from('season_leaderboard').select('id, name, avatar_url'),
        supabase.rpc('get_rsvp_roster', { p_session_date: d }),
      ])
      if (players.error) return { ok: false, error: toCourtError(players.error, "Couldn't load the players.") }
      // The RSVP list only sorts the picker: without it, everyone is still offered.
      const rows = (roster.error ? [] : (roster.data ?? [])) as { player_id: string | null; status: string }[]
      const rsvpd = new Set(rows.filter((r) => r.player_id && r.status === 'in').map((r) => r.player_id))
      return ok(((players.data ?? []) as { id: string; name: string; avatar_url: string | null }[]).map((p) => ({
        id: p.id, name: p.name, avatarUrl: p.avatar_url, rsvpd: rsvpd.has(p.id),
      })))
    }),

  subscribe(d, onChange) {
    const filter = `session_date=eq.${d}`
    const channel = supabase
      .channel(`court-board-${d}-${++channelSeq}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'court_assignments', filter }, onChange)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'court_assignments', filter }, onChange)
      // A delete event carries only the primary key, so it cannot be filtered by run: take them all.
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'court_assignments' }, onChange)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'event_assignment_meta', filter }, onChange)
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  },
}

const NO_DATABASE = { code: 'NO_DATABASE', message: 'Court assignments need the database. Connect Supabase to use them.' }

/** Without a database there is never a board: the editor shows its empty state. */
export const demoCourtBoardApi: CourtBoardApi = {
  load: async () => ok(null),
  edit: async () => ({ ok: false, error: NO_DATABASE }),
  setPublished: async () => ({ ok: false, error: NO_DATABASE }),
  activity: async () => ok([]),
  candidates: async () => ok([]),
  subscribe: () => () => {},
}

export const courtBoardApi: CourtBoardApi = isSupabaseConfigured ? supabaseCourtBoardApi : demoCourtBoardApi
