import { isSupabaseConfigured, supabase } from '@/lib/supabase'
import { toCourtError, type CourtResult } from '@/lib/courtSettings'

// The public Court Board's data. Only the court_assignment_board view (names, photos, seats and
// seeds; no account ids, no emails), only for a PUBLISHED run: the view also lets admins see
// drafts, so the query asks for state = 'published' itself.

export interface PublicSeat {
  playerId: string
  name: string
  avatarUrl: string | null
  seedRank: number
  /** Null while sitting out. */
  courtPosition: number | null
  courtNumber: number | null
  slot: number | null
}

export interface PublicBoard {
  sessionDate: string
  publishedAt: string | null
  seats: PublicSeat[]
}

export interface PublicBoardApi {
  /** Null data: not published (or no board, or no database). */
  load(sessionDate: string): Promise<CourtResult<PublicBoard | null>>
  /** `onChange` on any change to the run's board; `onLive` says whether Realtime is connected. */
  subscribe(sessionDate: string, onChange: () => void, onLive?: (live: boolean) => void): () => void
}

interface Row {
  player_id: string
  name: string
  avatar_url: string | null
  court_position: number | null
  court_number: number | null
  slot: number | null
  seed_rank: number
  published_at: string | null
}

let channelSeq = 0

export const supabasePublicBoardApi: PublicBoardApi = {
  async load(d) {
    try {
      const { data, error } = await supabase
        .from('court_assignment_board')
        .select('player_id, name, avatar_url, court_position, court_number, slot, seed_rank, published_at')
        .eq('session_date', d)
        .eq('state', 'published')
        .order('seed_rank')
      if (error) return { ok: false, error: toCourtError(error, "Couldn't load the courts.") }
      const rows = (data ?? []) as Row[]
      if (rows.length === 0) {
        // No rows: not published, or published with nobody on it (no one confirmed). Ask which.
        const meta = await supabase.from('event_assignment_meta').select('state, published_at').eq('session_date', d).maybeSingle()
        if (meta.error) return { ok: false, error: toCourtError(meta.error, "Couldn't load the courts.") }
        const published = meta.data?.state === 'published'
        return { ok: true, data: published ? { sessionDate: d, publishedAt: meta.data?.published_at ?? null, seats: [] } : null }
      }
      return {
        ok: true,
        data: {
          sessionDate: d,
          publishedAt: rows[0].published_at,
          seats: rows.map((r) => ({
            playerId: r.player_id, name: r.name, avatarUrl: r.avatar_url, seedRank: r.seed_rank,
            courtPosition: r.court_position, courtNumber: r.court_number, slot: r.slot,
          })),
        },
      }
    } catch (e) {
      return { ok: false, error: toCourtError(e, "Couldn't load the courts.") }
    }
  },

  // Signed-out visitors get events only for rows they may read (published runs). Unpublishing
  // hides the rows from them, so no event reaches them: the page also polls (usePublicCourtBoard).
  subscribe(d, onChange, onLive) {
    const filter = `session_date=eq.${d}`
    const channel = supabase
      .channel(`public-courts-${d}-${++channelSeq}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'court_assignments', filter }, onChange)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'court_assignments', filter }, onChange)
      // A delete event carries only the primary key, so a filter on the run never matches it
      // (taking a player off the board would be missed until the next poll): take them all.
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'court_assignments' }, onChange)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'event_assignment_meta', filter }, onChange)
      .subscribe((status) => onLive?.(status === 'SUBSCRIBED'))
    return () => {
      void supabase.removeChannel(channel)
    }
  },
}

export const demoPublicBoardApi: PublicBoardApi = {
  load: async () => ({ ok: true, data: null }),
  subscribe: () => () => {},
}

export const publicBoardApi: PublicBoardApi = isSupabaseConfigured ? supabasePublicBoardApi : demoPublicBoardApi

/** Whether a run's board is published: decides whether the RSVP dock and sheet link to it. */
export async function isBoardPublished(sessionDate: string): Promise<boolean> {
  if (!isSupabaseConfigured) return false
  try {
    const { data, error } = await supabase
      .from('event_assignment_meta')
      .select('state')
      .eq('session_date', sessionDate)
      .maybeSingle()
    return !error && data?.state === 'published'
  } catch {
    return false
  }
}

/** The board's address: /events/2026-11-25/courts (a run is identified by its date). */
export const courtBoardPath = (sessionDate: string) => `/events/${sessionDate}/courts`
