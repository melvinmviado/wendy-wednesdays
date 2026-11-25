-- Court assignment generation: the database half of the generate-court-assignments Edge Function,
-- and the query the pg_cron job uses to find runs that are due. Idempotent. NOT applied
-- automatically; run it yourself in the Supabase SQL Editor (staging first), then run
-- supabase/tests/court_assignment_generation.sql. The cron job is set up separately, after the
-- function is deployed: supabase/cron/court_assignments.sql and docs/court-assignments-runbook.md.
--
-- APPLY ORDER: after 20261206000000_court_assignments.sql.
--
-- How a board is generated (supabase/functions/generate-court-assignments)
--   1. court_assignment_prepare(date), once the RSVP cutoff has passed: confirmed guests become
--      players (keeping their place in line), the run gets a court range if it has none (copied
--      from the latest earlier run) and a meta row, and the locked list comes back with season
--      ranks. Its own transaction: conversions stand even if step 3 refuses.
--   2. The function runs the shared algorithm (src/lib/courtAssignment.ts) on that list.
--   3. court_assignment_apply(...): ONE transaction. Re-checks every rule, refuses if the list
--      changed since step 1 (CA013; the function goes round once more), replaces the run's rows,
--      sets the meta row and writes the audit log.
--   Both are for service_role (the Edge Function) only: nobody can call them through the API.
--
-- Definitions reused, not redefined
--   * Lock time: public.rsvp_cutoff_at(date), the cutoff set_rsvp already enforces: the admin's
--     event_settings cutoff for the current run (the "Cutoff 24h before start" button fills it
--     in), else Wednesday 6 PM.
--   * Confirmed list: 'in' rows at queue positions 1..rsvp_capacity() (public.rsvp_queue).
--   * Rank: competition rank by season points over season_leaderboard (rank(): 1, 2, 2, 4), the
--     rule rankPlayers() uses in src/utils/ranking.ts. Unranked (null) = no attended week yet.
--
-- Rules, enforced inside apply's transaction
--   * Nothing before the cutoff (CA011), admins included.
--   * The automatic run (actor 'auto') only fills a run whose state is 'none'; otherwise it does
--     nothing and says so ({"skipped": true}).
--   * A board edited by hand is only replaced with force (CA012 otherwise), and only an admin can
--     force. A replacement is logged as 'regenerate' (after.forced says whether it was forced),
--     the first board as 'generate', both with before / after snapshots.
--   * A new board is a draft, or published at once when the run's auto_publish is on (then also
--     logged as 'publish'). Regenerating a published board starts it over as a draft.
--
-- Also here
--   * event_court_settings.auto_publish ("Auto-publish on generate"), default off. It is carried
--     forward with the court range.
--   * published_at restarts when a new board is generated and published in one step.
--   * court_assignment_due_sessions(): the runs the cron job should generate.
--
-- Error codes: CA010 a confirmed guest has a roster player's name; CA011 RSVPs are still open;
-- CA012 changed by hand, needs force; CA013 the list changed, generate again; CA014 the board
-- does not seat exactly the confirmed players (a bug); plus CA001 / CA002 from 20261206000000.
--
-- ROLLBACK (run manually):
--   drop function if exists public.court_assignment_due_sessions(timestamptz),
--     public.court_assignment_apply(date, text, boolean, jsonb, jsonb, jsonb),
--     public.court_assignment_prepare(date), public.court_assignment_locked_list(date);
--   alter table public.event_court_settings drop column if exists auto_publish;

begin;

-- 0. Preconditions ---------------------------------------------------------------------
do $$
begin
  if to_regclass('public.court_assignments') is null then
    raise exception 'Apply 20261206000000_court_assignments.sql first';
  end if;
end $$;

-- 1. "Auto-publish on generate" -----------------------------------------------------------
alter table public.event_court_settings add column if not exists auto_publish boolean not null default false;
grant insert (auto_publish), update (auto_publish) on public.event_court_settings to authenticated;

-- 2. published_at restarts with a new board ----------------------------------------------
-- As in 20261206000000, except that published_at is kept only while the SAME board stays
-- published (generated_at unchanged). A board generated and published in one step is new.
create or replace function public.event_assignment_meta_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.state <> 'published' then
    new.published_at := null;
  elsif tg_op = 'UPDATE' and old.state = 'published' and new.generated_at is not distinct from old.generated_at then
    new.published_at := old.published_at;
  else
    new.published_at := now();
  end if;

  if current_user in ('anon', 'authenticated') then
    if new.generated_at is null then
      new.generated_by := null;
    elsif tg_op = 'INSERT' or new.generated_at is distinct from old.generated_at then
      new.generated_at := now();
      new.generated_by := (select auth.uid())::text;
    end if;
  end if;
  return new;
end;
$$;

-- 3. The locked list ----------------------------------------------------------------------
-- Confirmed rows only: 'in', at queue positions 1..capacity. Waitlisted players are not seated.
create or replace function public.court_assignment_locked_list(p_session date)
returns table (rsvp_id uuid, player_id uuid, guest_name text, rsvp_at timestamptz)
language sql
stable
set search_path = ''
as $$
  select r.id, r.player_id, r.guest_name, r.created_at
    from public.rsvp_queue(p_session) q
    join public.rsvps r on r.id = q.rsvp_id
   where q.queue_pos <= public.rsvp_capacity()
$$;

-- 4. Step 1: prepare --------------------------------------------------------------------
create or replace function public.court_assignment_prepare(p_session_date date)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  d         date := p_session_date;
  s         public.event_court_settings%rowtype;
  m         public.event_assignment_meta%rowtype;
  g         record;
  hit_id    uuid;
  new_id    uuid;
  converted integer := 0;
begin
  if d is null or extract(dow from d) <> 3 then
    raise exception 'That is not a Wednesday' using errcode = 'RV007';
  end if;
  if now() < public.rsvp_cutoff_at(d) then
    raise exception 'RSVPs for % are still open', d using errcode = 'CA011';
  end if;

  -- The same lock set_rsvp and the admin RSVP functions take: the list holds still while we work.
  perform pg_advisory_xact_lock(hashtextextended('rsvp:' || d::text, 0));

  -- The run's court range, else a copy of the latest earlier run's.
  insert into public.event_court_settings (session_date, top_court_number, bottom_court_number, auto_publish)
  select d, e.top_court_number, e.bottom_court_number, e.auto_publish
    from (select * from public.event_court_settings x
           where x.session_date < d
           order by x.session_date desc
           limit 1) e
  on conflict (session_date) do nothing;
  select * into s from public.event_court_settings where session_date = d;
  if not found then
    raise exception 'Set the court range in Event setup first' using errcode = 'CA001';
  end if;

  insert into public.event_assignment_meta (session_date) values (d) on conflict (session_date) do nothing;
  select * into m from public.event_assignment_meta where session_date = d;

  -- Confirmed guests become players. The RSVP row keeps its created_at, so its place in line.
  for g in
    select l.rsvp_id, l.guest_name
      from public.court_assignment_locked_list(d) l
     where l.guest_name is not null
     order by l.rsvp_at
  loop
    select p.id into hit_id
      from public.players p
     where p.archived_at is null
       and lower(btrim(regexp_replace(p.name, '\s+', ' ', 'g')))
           = lower(btrim(regexp_replace(g.guest_name, '\s+', ' ', 'g')))
     limit 1;
    if found then
      raise exception 'The guest "%" has the same name as a player on the roster', g.guest_name
        using errcode = 'CA010', detail = hit_id::text,
              hint = 'On the RSVP list, link the guest to that player or rename the guest.';
    end if;
    insert into public.players (name) values (g.guest_name) returning id into new_id;
    update public.rsvps set player_id = new_id, guest_name = null where id = g.rsvp_id;
    converted := converted + 1;
  end loop;

  return jsonb_build_object(
    'session_date', d,
    'top_court_number', s.top_court_number,
    'bottom_court_number', s.bottom_court_number,
    'auto_publish', s.auto_publish,
    'state', m.state,
    'manually_edited', m.manually_edited,
    'converted_guests', converted,
    'players', (
      select coalesce(jsonb_agg(jsonb_build_object('id', l.player_id, 'rank', st.season_rank, 'rsvp_at', l.rsvp_at)
                                order by l.rsvp_at, l.player_id), '[]'::jsonb)
        from public.court_assignment_locked_list(d) l
        left join (
          select sl.id,
                 case when sl.weeks_played > 0
                      then (rank() over (order by sl.total_points desc))::integer end as season_rank
            from public.season_leaderboard sl
        ) st on st.id = l.player_id));
end;
$$;

-- 5. Step 3: apply, in one transaction -----------------------------------------------------
-- p_actor: 'auto' (the cron job) or the admin's user id, as verified by the Edge Function.
-- p_player_ids: the list the board was built from. p_courts / p_sitting_out: the algorithm's
-- result as JSON ({courtPosition, courtNumber, playerIds} and {playerId, reason}), best seed first.
create or replace function public.court_assignment_apply(
  p_session_date date,
  p_actor        text,
  p_force        boolean,
  p_player_ids   jsonb,
  p_courts       jsonb,
  p_sitting_out  jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  d           date := p_session_date;
  is_auto     boolean := p_actor = 'auto';
  forced      boolean := coalesce(p_force, false);
  courts      jsonb := coalesce(p_courts, '[]'::jsonb);
  outs        jsonb := coalesce(p_sitting_out, '[]'::jsonb);
  actor_uuid  uuid;
  s           public.event_court_settings%rowtype;
  m           public.event_assignment_meta%rowtype;
  current_ids uuid[];
  listed      uuid[];
  placed      uuid[];
  before_rows jsonb;
  after_rows  jsonb;
  new_state   text;
  act         text;
begin
  if p_actor is null
     or not (is_auto or p_actor ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') then
    raise exception 'The actor must be ''auto'' or an admin''s user id' using errcode = '22023';
  end if;
  actor_uuid := case when is_auto then null else p_actor::uuid end;
  if forced and is_auto then
    raise exception 'Only an admin can force a regeneration' using errcode = '42501';
  end if;
  if d is null or now() < public.rsvp_cutoff_at(d) then
    raise exception 'RSVPs for % are still open', d using errcode = 'CA011';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('rsvp:' || d::text, 0));

  select * into s from public.event_court_settings where session_date = d;
  if not found then
    raise exception 'Set the court range in Event setup first' using errcode = 'CA001';
  end if;
  select * into m from public.event_assignment_meta where session_date = d for update;
  if not found then
    raise exception 'This run has not been prepared; generate again' using errcode = 'CA013';
  end if;

  if is_auto and m.state <> 'none' then
    return jsonb_build_object('skipped', true, 'state', m.state);
  end if;
  if m.state <> 'none' and m.manually_edited and not forced then
    raise exception 'This board was changed by hand' using errcode = 'CA012',
      hint = 'Regenerate with force to replace it.';
  end if;

  -- The board must be built from the list as it stands now. An unconverted confirmed guest has a
  -- null id here, so it also counts as a change.
  select coalesce(array_agg(l.player_id order by l.player_id), '{}') into current_ids
    from public.court_assignment_locked_list(d) l;
  select coalesce(array_agg(x.id::uuid order by x.id::uuid), '{}') into listed
    from jsonb_array_elements_text(coalesce(p_player_ids, '[]'::jsonb)) x(id);
  if current_ids is distinct from listed then
    raise exception 'The RSVP list changed while the board was being made; generate again' using errcode = 'CA013';
  end if;

  -- ...and seat exactly that list: everyone once, full courts of four, positions 0, 1, 2, ...
  select coalesce(array_agg(z.pid order by z.pid), '{}') into placed
    from (select c.pid::uuid as pid
            from jsonb_array_elements(courts) v(court), jsonb_array_elements_text(v.court -> 'playerIds') c(pid)
          union all
          select (o.item ->> 'playerId')::uuid from jsonb_array_elements(outs) o(item)) z;
  if placed is distinct from current_ids
     or exists (select 1 from jsonb_array_elements(courts) with ordinality v(court, i)
                 where jsonb_array_length(v.court -> 'playerIds') <> 4
                    or (v.court ->> 'courtPosition')::integer <> v.i - 1) then
    raise exception 'The board does not seat exactly the confirmed players' using errcode = 'CA014';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('player_id', a.player_id, 'court_position', a.court_position,
                                               'court_number', a.court_number, 'slot', a.slot, 'status', a.status)
                            order by a.seed_rank), '[]'::jsonb)
    into before_rows
    from public.court_assignments a
   where a.session_date = d;

  delete from public.court_assignments where session_date = d;

  -- Seed rank is the result's order: every court's players top-down, then those sitting out.
  -- court_number is filled in by the table's trigger from the run's court range.
  insert into public.court_assignments (session_date, player_id, court_position, slot, status, seed_rank)
  select d, c.pid::uuid, (v.court ->> 'courtPosition')::integer, (c.ord - 1)::integer, 'assigned',
         ((v.court ->> 'courtPosition')::integer * 4 + c.ord)::integer
    from jsonb_array_elements(courts) v(court),
         jsonb_array_elements_text(v.court -> 'playerIds') with ordinality c(pid, ord);

  insert into public.court_assignments (session_date, player_id, status, seed_rank)
  select d, (o.item ->> 'playerId')::uuid, 'sitting_out', (jsonb_array_length(courts) * 4 + o.ord)::integer
    from jsonb_array_elements(outs) with ordinality o(item, ord);

  new_state := case when s.auto_publish then 'published' else 'draft' end;
  update public.event_assignment_meta
     set state = new_state, generated_at = now(), generated_by = p_actor, manually_edited = false
   where session_date = d;

  select coalesce(jsonb_agg(jsonb_build_object('player_id', a.player_id, 'court_position', a.court_position,
                                               'court_number', a.court_number, 'slot', a.slot, 'status', a.status)
                            order by a.seed_rank), '[]'::jsonb)
    into after_rows
    from public.court_assignments a
   where a.session_date = d;

  act := case when m.state = 'none' and jsonb_array_length(before_rows) = 0 then 'generate' else 'regenerate' end;
  insert into public.assignment_audit_log (session_date, actor_id, action, before, after)
  values (d, actor_uuid, act,
          jsonb_build_object('state', m.state, 'manually_edited', m.manually_edited, 'rows', before_rows),
          jsonb_build_object('state', new_state, 'forced', forced, 'rows', after_rows));
  if new_state = 'published' then
    insert into public.assignment_audit_log (session_date, actor_id, action, before, after)
    values (d, actor_uuid, 'publish', jsonb_build_object('state', m.state),
            jsonb_build_object('state', 'published', 'auto_publish', true));
  end if;

  return jsonb_build_object(
    'skipped', false, 'action', act, 'state', new_state, 'forced', forced,
    'courts', jsonb_array_length(courts), 'sitting_out', jsonb_array_length(outs));
end;
$$;

-- 6. What the cron job generates ---------------------------------------------------------
-- Runs with someone confirmed, whose cutoff has passed and whose night has not ended, that have
-- no board yet and have (or can carry forward) a court range. p_now is for tests.
create or replace function public.court_assignment_due_sessions(p_now timestamptz default now())
returns setof date
language sql
stable
set search_path = ''
as $$
  select distinct r.session_date
    from public.rsvps r
    left join public.event_assignment_meta m on m.session_date = r.session_date
   where r.status = 'in'
     and r.session_date between (p_now at time zone 'America/Toronto')::date - 7
                            and (p_now at time zone 'America/Toronto')::date + 7
     and p_now >= public.rsvp_cutoff_at(r.session_date)
     and p_now < public.rsvp_live_end(r.session_date)
     and coalesce(m.state, 'none') = 'none'
     and exists (select 1 from public.event_court_settings s where s.session_date <= r.session_date)
   order by 1
$$;

-- 7. Not API endpoints ------------------------------------------------------------------
revoke all on function public.court_assignment_locked_list(date),
  public.court_assignment_prepare(date),
  public.court_assignment_apply(date, text, boolean, jsonb, jsonb, jsonb),
  public.court_assignment_due_sessions(timestamptz)
  from public, anon, authenticated;
grant execute on function public.court_assignment_prepare(date),
  public.court_assignment_apply(date, text, boolean, jsonb, jsonb, jsonb)
  to service_role;

commit;
