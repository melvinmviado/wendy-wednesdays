-- Tests for court assignment generation. Run in the Supabase SQL Editor AFTER applying
-- 20261207000000_court_assignment_generation.sql (and everything before it).
-- One transaction, ROLLED BACK at the end. A failed check raises; "PASS ..." shows in Messages.
-- The runs are dated 2020, long past their cutoff, so nothing here depends on today's date.

begin;

create temp table t_ids as
select gen_random_uuid() as admin_uid,
       gen_random_uuid() as p1, gen_random_uuid() as p2, gen_random_uuid() as p3,
       gen_random_uuid() as p4, gen_random_uuid() as p5, gen_random_uuid() as p6,
       date '2020-01-01' as d,    -- the run under test
       date '2020-01-08' as d2,   -- a run whose guest has a roster player's name
       'gen-' || substr(gen_random_uuid()::text, 1, 8) as suffix;
create temp table t_prep (r jsonb);
grant select on t_ids to anon, authenticated, service_role;
grant select, insert on t_prep to service_role;

insert into auth.users (id, aud, role, email)
select admin_uid, 'authenticated', 'authenticated', 'gen-admin-' || suffix || '@test.local' from t_ids;
update public.profiles set role = 'admin' where id = (select admin_uid from t_ids);

insert into public.players (id, name)
select x.id, x.n || ' ' || t.suffix
  from t_ids t,
       lateral (values (t.p1, 'Gen One'), (t.p2, 'Gen Two'), (t.p3, 'Gen Three'),
                       (t.p4, 'Gen Four'), (t.p5, 'Gen Five'), (t.p6, 'Gen Six')) x(id, n);

-- Points far above any real player's, so p1..p4 rank in that order; p5 and p6 have never played.
insert into public.weekly_scores (player_id, week_number, attended, points)
select x.id, 1, true, x.pts
  from t_ids t, lateral (values (t.p1, 10004), (t.p2, 10003), (t.p3, 10002), (t.p4, 10001)) x(id, pts);

-- The week before has a court range (10 -> 9); the run under test has none, so it is carried forward.
insert into public.event_court_settings (session_date, top_court_number, bottom_court_number)
select d - 7, 10, 9 from t_ids;

-- The locked list, in RSVP order: p6 first, the guest last.
insert into public.rsvps (session_date, player_id, guest_name, status, created_at)
select t.d, x.id, x.g, 'in', timestamptz '2019-12-30 12:00+00' + x.i * interval '1 minute'
  from t_ids t,
       lateral (values (t.p6, null::text, 1), (t.p1, null, 2), (t.p2, null, 3), (t.p3, null, 4),
                       (t.p4, null, 5), (t.p5, null, 6), (null::uuid, 'Gina ' || t.suffix, 7)) x(id, g, i);
-- The next run: a guest named exactly like a roster player.
insert into public.rsvps (session_date, guest_name, status)
select d2, 'Gen One ' || suffix, 'in' from t_ids;

-- ------------------------------------------------------------ API roles cannot call any of it
set local role anon;
select set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
do $$
declare t t_ids%rowtype;
begin
  select * into t from t_ids;
  begin
    perform public.court_assignment_prepare(t.d);
    raise exception 'FAIL anon called prepare';
  exception when insufficient_privilege then
    raise notice 'PASS anon cannot call prepare';
  end;
end $$;

reset role;
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', (select admin_uid from t_ids), 'role', 'authenticated')::text, true);
do $$
declare t t_ids%rowtype;
begin
  select * into t from t_ids;
  begin
    perform public.court_assignment_apply(t.d, t.admin_uid::text, true, '[]', '[]', '[]');
    raise exception 'FAIL an admin called apply directly';
  exception when insufficient_privilege then
    raise notice 'PASS even an admin cannot call apply directly (only the Edge Function can)';
  end;
  begin
    perform public.court_assignment_due_sessions();
    raise exception 'FAIL an admin called due_sessions';
  exception when insufficient_privilege then
    raise notice 'PASS due_sessions is not an API endpoint';
  end;
end $$;

-- ------------------------------------------------------------ service_role: prepare, then generate
reset role;
set local role service_role;
select set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
do $$
declare t t_ids%rowtype; r jsonb; ids jsonb; courts jsonb; outs jsonb; res jsonb;
begin
  select * into t from t_ids;

  begin
    perform public.court_assignment_prepare(date '2099-12-30');
    raise exception 'FAIL prepared a run whose RSVPs are still open';
  exception when sqlstate 'CA011' then
    raise notice 'PASS nothing happens before the cutoff (CA011)';
  end;

  begin
    perform public.court_assignment_prepare(t.d2);
    raise exception 'FAIL a guest with a roster name was turned into a second player';
  exception when sqlstate 'CA010' then
    raise notice 'PASS a guest with a roster player''s name stops generation (CA010)';
  end;

  r := public.court_assignment_prepare(t.d);
  insert into t_prep values (r);
  if (r ->> 'converted_guests')::integer <> 1 then raise exception 'FAIL converted % guests, expected 1', r ->> 'converted_guests'; end if;
  if jsonb_array_length(r -> 'players') <> 7 then raise exception 'FAIL % players listed, expected 7', jsonb_array_length(r -> 'players'); end if;
  if (r ->> 'top_court_number')::integer <> 10 or (r ->> 'bottom_court_number')::integer <> 9 then
    raise exception 'FAIL court range not carried forward: %', r;
  end if;
  if r ->> 'state' <> 'none' then raise exception 'FAIL new run state is %', r ->> 'state'; end if;
  raise notice 'PASS prepare converts the guest, carries the court range forward and lists all 7';

  -- A board as the algorithm would send it: p1-p4 on the top court, the other three sitting out.
  ids := (select jsonb_agg(p -> 'id') from jsonb_array_elements(r -> 'players') p);
  courts := jsonb_build_array(jsonb_build_object('courtPosition', 0, 'courtNumber', 10,
                                                 'playerIds', jsonb_build_array(t.p1, t.p2, t.p3, t.p4)));
  outs := (select jsonb_agg(jsonb_build_object('playerId', p ->> 'id', 'reason', 'remainder'))
             from jsonb_array_elements(r -> 'players') p
            where (p ->> 'id')::uuid not in (t.p1, t.p2, t.p3, t.p4));

  begin
    perform public.court_assignment_apply(t.d, 'auto', false, ids - 0, courts, outs);
    raise exception 'FAIL a board built from an old list was saved';
  exception when sqlstate 'CA013' then
    raise notice 'PASS a board built from a list that has since changed is refused (CA013)';
  end;

  begin
    perform public.court_assignment_apply(t.d, 'auto', false, ids, courts, outs - 0);
    raise exception 'FAIL a board missing a confirmed player was saved';
  exception when sqlstate 'CA014' then
    raise notice 'PASS a board must seat exactly the confirmed players (CA014)';
  end;

  begin
    perform public.court_assignment_apply(t.d, 'auto', true, ids, courts, outs);
    raise exception 'FAIL the automatic run forced a regeneration';
  exception when insufficient_privilege then
    raise notice 'PASS only an admin can force';
  end;

  res := public.court_assignment_apply(t.d, 'auto', false, ids, courts, outs);
  if res ->> 'action' <> 'generate' or res ->> 'state' <> 'draft' then raise exception 'FAIL first run returned %', res; end if;
  raise notice 'PASS the automatic run generates a draft';

  res := public.court_assignment_apply(t.d, 'auto', false, ids, courts, outs);
  if not (res ->> 'skipped')::boolean then raise exception 'FAIL the automatic run replaced an existing board'; end if;
  raise notice 'PASS the automatic run never touches a board that already exists';
end $$;

-- ------------------------------------------------------------ what was written (as the owner)
reset role;
do $$
declare t t_ids%rowtype; r jsonb; n integer; rk1 integer; rk2 integer; rk4 integer;
begin
  select * into t from t_ids;
  select tp.r into r from t_prep tp;

  select (p ->> 'rank')::integer into rk1 from jsonb_array_elements(r -> 'players') p where (p ->> 'id')::uuid = t.p1;
  select (p ->> 'rank')::integer into rk2 from jsonb_array_elements(r -> 'players') p where (p ->> 'id')::uuid = t.p2;
  select (p ->> 'rank')::integer into rk4 from jsonb_array_elements(r -> 'players') p where (p ->> 'id')::uuid = t.p4;
  if not (rk1 < rk2 and rk2 < rk4) then raise exception 'FAIL ranks out of order: %, %, %', rk1, rk2, rk4; end if;
  if exists (select 1 from jsonb_array_elements(r -> 'players') p
              where (p ->> 'id')::uuid not in (t.p1, t.p2, t.p3, t.p4) and p ->> 'rank' is not null) then
    raise exception 'FAIL a player with no results has a rank';
  end if;
  raise notice 'PASS ranks follow season points; players with no results are unranked';

  if exists (select 1 from public.rsvps where session_date = t.d and guest_name is not null) then
    raise exception 'FAIL the guest RSVP was not converted';
  end if;
  if (select created_at from public.rsvps x join public.players p on p.id = x.player_id
       where x.session_date = t.d and p.name = 'Gina ' || t.suffix) <> timestamptz '2019-12-30 12:07+00' then
    raise exception 'FAIL the converted guest lost their place in line';
  end if;
  raise notice 'PASS the guest is now a player and keeps their place in line';

  select count(*) into n from public.court_assignments where session_date = t.d;
  if n <> 7 then raise exception 'FAIL % rows written, expected 7', n; end if;
  if (select array_agg(court_number order by slot) from public.court_assignments
       where session_date = t.d and status = 'assigned') <> array[10, 10, 10, 10] then
    raise exception 'FAIL the top court is not court 10';
  end if;
  if (select array_agg(seed_rank order by seed_rank) from public.court_assignments where session_date = t.d)
     <> array[1, 2, 3, 4, 5, 6, 7] then
    raise exception 'FAIL seed ranks are not 1..7';
  end if;
  raise notice 'PASS the board is written: 4 on court 10, 3 sitting out, seeds 1..7';

  if (select generated_by from public.event_assignment_meta where session_date = t.d) <> 'auto' then
    raise exception 'FAIL generated_by is not auto';
  end if;
  if not exists (select 1 from public.assignment_audit_log
                  where session_date = t.d and action = 'generate' and actor_id is null) then
    raise exception 'FAIL no automatic generate row in the audit log';
  end if;
  raise notice 'PASS meta and audit log record the automatic run';

  update public.event_assignment_meta set manually_edited = true where session_date = t.d;
end $$;

-- ------------------------------------------------------------ hand-edited board: force only
set local role service_role;
do $$
declare t t_ids%rowtype; r jsonb; ids jsonb; courts jsonb; outs jsonb; res jsonb;
begin
  select * into t from t_ids;
  r := public.court_assignment_prepare(t.d);
  ids := (select jsonb_agg(p -> 'id') from jsonb_array_elements(r -> 'players') p);
  courts := jsonb_build_array(jsonb_build_object('courtPosition', 0, 'courtNumber', 10,
                                                 'playerIds', jsonb_build_array(t.p4, t.p3, t.p2, t.p1)));
  outs := (select jsonb_agg(jsonb_build_object('playerId', p ->> 'id', 'reason', 'remainder'))
             from jsonb_array_elements(r -> 'players') p
            where (p ->> 'id')::uuid not in (t.p1, t.p2, t.p3, t.p4));

  begin
    perform public.court_assignment_apply(t.d, t.admin_uid::text, false, ids, courts, outs);
    raise exception 'FAIL a hand-edited board was replaced without force';
  exception when sqlstate 'CA012' then
    raise notice 'PASS a hand-edited board needs force (CA012)';
  end;

  res := public.court_assignment_apply(t.d, t.admin_uid::text, true, ids, courts, outs);
  if res ->> 'action' <> 'regenerate' or not (res ->> 'forced')::boolean then
    raise exception 'FAIL forced regeneration returned %', res;
  end if;
  raise notice 'PASS an admin can force a regeneration';
end $$;

reset role;
do $$
declare t t_ids%rowtype;
begin
  select * into t from t_ids;
  if not exists (select 1 from public.assignment_audit_log
                  where session_date = t.d and action = 'regenerate' and actor_id = t.admin_uid
                    and (after ->> 'forced')::boolean and jsonb_array_length(before -> 'rows') = 7) then
    raise exception 'FAIL the forced regeneration is not in the audit log with its before rows';
  end if;
  if (select manually_edited from public.event_assignment_meta where session_date = t.d) then
    raise exception 'FAIL regenerating did not clear manually_edited';
  end if;
  raise notice 'PASS the forced regeneration is logged with the admin and the old board';

  update public.event_court_settings set auto_publish = true where session_date = t.d;
end $$;

-- ------------------------------------------------------------ auto-publish
set local role service_role;
do $$
declare t t_ids%rowtype; r jsonb; ids jsonb; courts jsonb; outs jsonb; res jsonb;
begin
  select * into t from t_ids;
  r := public.court_assignment_prepare(t.d);
  ids := (select jsonb_agg(p -> 'id') from jsonb_array_elements(r -> 'players') p);
  courts := jsonb_build_array(jsonb_build_object('courtPosition', 0, 'courtNumber', 10,
                                                 'playerIds', jsonb_build_array(t.p1, t.p2, t.p3, t.p4)));
  outs := (select jsonb_agg(jsonb_build_object('playerId', p ->> 'id', 'reason', 'remainder'))
             from jsonb_array_elements(r -> 'players') p
            where (p ->> 'id')::uuid not in (t.p1, t.p2, t.p3, t.p4));
  res := public.court_assignment_apply(t.d, t.admin_uid::text, false, ids, courts, outs);
  if res ->> 'state' <> 'published' then raise exception 'FAIL auto-publish left the board %', res ->> 'state'; end if;
  raise notice 'PASS with auto-publish on, a new board is published at once';
end $$;

reset role;
do $$
declare t t_ids%rowtype;
begin
  select * into t from t_ids;
  if (select published_at from public.event_assignment_meta where session_date = t.d) is null then
    raise exception 'FAIL published board has no published_at';
  end if;
  if not exists (select 1 from public.assignment_audit_log where session_date = t.d and action = 'publish') then
    raise exception 'FAIL auto-publish not logged';
  end if;
  raise notice 'PASS auto-publish stamps published_at and is logged as publish';

  -- Cron: d2 is due between its cutoff (6 PM) and the end of its night (10 PM), d is not (it has a board).
  if not exists (select 1 from public.court_assignment_due_sessions(timestamptz '2020-01-08 19:00 America/Toronto') x
                  where x = t.d2) then
    raise exception 'FAIL d2 is not due after its cutoff';
  end if;
  if exists (select 1 from public.court_assignment_due_sessions(timestamptz '2020-01-08 17:00 America/Toronto') x
              where x = t.d2) then
    raise exception 'FAIL d2 is due before its cutoff';
  end if;
  if exists (select 1 from public.court_assignment_due_sessions(timestamptz '2020-01-08 23:00 America/Toronto') x
              where x = t.d2) then
    raise exception 'FAIL d2 is still due after its night ended';
  end if;
  if exists (select 1 from public.court_assignment_due_sessions(timestamptz '2020-01-01 19:00 America/Toronto') x
              where x = t.d) then
    raise exception 'FAIL a run with a board is due again';
  end if;
  raise notice 'PASS due_sessions: after the cutoff, before the night ends, only runs with no board';
end $$;

reset role;
rollback;
