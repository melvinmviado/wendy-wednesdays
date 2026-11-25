// generate-court-assignments: builds the starting-court board for one run (Supabase Edge Function, Deno).
//
// POST { "eventId": "YYYY-MM-DD", "force"?: boolean }   eventId is the run's Wednesday (rsvps.session_date)
// Callers:
//   * an admin: Authorization: Bearer <their access token> (supabase.functions.invoke sends it). The
//     admin check is the database's own public.is_admin(), called with the caller's token.
//   * the pg_cron job: x-cron-secret: <CRON_SECRET>. It can never force.
// Deploy with --no-verify-jwt: this function does its own auth (see docs/court-assignments-runbook.md).
//
// The work is in the database (20261207000000_court_assignment_generation.sql):
//   court_assignment_prepare -> the shared algorithm -> court_assignment_apply (one transaction).
// The algorithm is src/lib/courtAssignment.ts; ../_shared has a generated copy (npm run sync:functions).
import { createClient, type PostgrestError } from 'npm:@supabase/supabase-js@2'
import { buildCourtOrder, generateStartingAssignment } from '../_shared/courtAssignment.ts'

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

const fail = (status: number, code: string, message: string, hint?: string) =>
  json(status, { ok: false, code, message, ...(hint ? { hint } : {}) })

// Database error codes (see the migrations) and the HTTP status each one becomes.
const DB_STATUS: Record<string, number> = {
  CA001: 409, // no court range for the run
  CA002: 409, // court position past the bottom court
  CA010: 409, // a confirmed guest has a roster player's name
  CA011: 409, // RSVPs are still open
  CA012: 409, // changed by hand: needs force
  CA013: 409, // the list changed: generate again
  CA014: 500, // the board does not match the list (a bug)
  RV007: 400, // not a Wednesday
  '22023': 400,
  '42501': 403,
}

const dbFail = (e: PostgrestError) => fail(DB_STATUS[e.code] ?? 500, e.code || 'DB', e.message, e.hint || undefined)

/** Compares secrets in time that does not depend on where they differ. */
function sameSecret(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a)
  const y = new TextEncoder().encode(b)
  let diff = x.length ^ y.length
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0)
  return diff === 0
}

interface Prepared {
  /** The facility's courts, top court first (20261210000000). Older databases send only the range. */
  court_numbers?: number[]
  top_court_number: number
  bottom_court_number: number
  state: 'none' | 'draft' | 'published'
  manually_edited: boolean
  converted_guests: number
  players: { id: string; rank: number | null; rsvp_at: string }[]
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return fail(405, 'METHOD', 'Use POST.')

  const url = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const cronSecret = Deno.env.get('CRON_SECRET') ?? ''
  if (!url || !anonKey || !serviceKey) return fail(500, 'CONFIG', 'The function is missing its Supabase settings.')

  let body: { eventId?: unknown; force?: unknown }
  try {
    body = await req.json()
  } catch {
    return fail(400, 'BAD_REQUEST', 'Send a JSON body: { "eventId": "YYYY-MM-DD" }.')
  }
  const eventId = body?.eventId
  if (typeof eventId !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(eventId) || Number.isNaN(Date.parse(eventId))) {
    return fail(400, 'BAD_REQUEST', 'eventId must be the run date, YYYY-MM-DD.')
  }
  if (body.force !== undefined && typeof body.force !== 'boolean') {
    return fail(400, 'BAD_REQUEST', 'force must be true or false.')
  }
  const force = body.force === true

  // Who is asking: the cron job (shared secret) or a signed-in admin.
  let actor: string
  const presented = req.headers.get('x-cron-secret')
  if (presented !== null) {
    if (!cronSecret || !sameSecret(presented, cronSecret)) return fail(401, 'UNAUTHORIZED', 'Wrong cron secret.')
    if (force) return fail(403, 'FORBIDDEN', 'Only an admin can force a regeneration.')
    actor = 'auto'
  } else {
    const authorization = req.headers.get('Authorization') ?? ''
    const token = /^Bearer\s+(\S+)$/i.exec(authorization)?.[1]
    if (!token) return fail(401, 'UNAUTHORIZED', 'Sign in as an admin.')
    const asCaller = createClient(url, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { data: userData, error: userError } = await asCaller.auth.getUser(token)
    if (userError || !userData.user) return fail(401, 'UNAUTHORIZED', 'Your session has expired. Sign in again.')
    const { data: isAdmin, error: adminError } = await asCaller.rpc('is_admin')
    if (adminError) return dbFail(adminError)
    if (isAdmin !== true) return fail(403, 'FORBIDDEN', 'Only admins can generate court assignments.')
    actor = userData.user.id
  }

  const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })

  // Read the locked list, seed it, save it. If the list changed in between (an admin edited the RSVPs
  // after the lock), apply refuses with CA013 and we go round once more with the fresh list.
  for (let attempt = 1; attempt <= 2; attempt++) {
    const prepared = await db.rpc('court_assignment_prepare', { p_session_date: eventId })
    if (prepared.error) return dbFail(prepared.error)
    const input = prepared.data as Prepared

    // Cheap early answers; court_assignment_apply enforces the same rules inside its transaction.
    if (actor === 'auto' && input.state !== 'none') {
      return json(200, { ok: true, skipped: true, state: input.state, convertedGuests: input.converted_guests })
    }
    if (input.state !== 'none' && input.manually_edited && !force) {
      return fail(409, 'CA012', 'This board was changed by hand.', 'Regenerate with force to replace it.')
    }

    let result: ReturnType<typeof generateStartingAssignment>
    try {
      result = generateStartingAssignment({
        players: input.players.map((p) => ({ id: p.id, rank: p.rank, rsvpAt: p.rsvp_at })),
        courtOrder: input.court_numbers ?? buildCourtOrder(input.top_court_number, input.bottom_court_number),
      })
    } catch (e) {
      return fail(500, 'ALGORITHM', e instanceof Error ? e.message : String(e))
    }

    const applied = await db.rpc('court_assignment_apply', {
      p_session_date: eventId,
      p_actor: actor,
      p_force: force,
      p_player_ids: input.players.map((p) => p.id),
      p_courts: result.courts,
      p_sitting_out: result.sittingOut,
    })
    if (applied.error?.code === 'CA013' && attempt === 1) continue
    if (applied.error) return dbFail(applied.error)

    const summary = applied.data as Record<string, unknown>
    console.log(JSON.stringify({ eventId, by: actor === 'auto' ? 'cron' : 'admin', ...summary }))
    return json(200, {
      ok: true,
      skipped: summary.skipped === true,
      action: summary.action ?? null,
      state: summary.state,
      forced: summary.forced === true,
      courts: summary.courts ?? 0,
      sittingOut: summary.sitting_out ?? 0,
      convertedGuests: input.converted_guests,
    })
  }
  return fail(409, 'CA013', 'The RSVP list kept changing. Try again in a moment.')
})
