-- Tests the November 2026 audit found missing: the guest-RSVP admin functions, non-admin writes to
-- roles / weeks / weekly_scores, the RSVP open time (RV009), the RSVP ownership hand-over when a
-- player is claimed and unlinked, and season_leaderboard.is_claimed.
-- Run in the Supabase SQL Editor AFTER applying every migration. One transaction, ROLLED BACK at the
-- end: no fixtures survive (the event_settings change included). Each check raises an exception on
-- failure; "PASS ..." notices show in the Messages tab.
-- A "cannot update/delete" check passes whether the write is refused outright (no grant) or touches
-- 0 rows (RLS hides every row), since both mean nothing changed.

begin;

-- Fixtures (SQL editor's privileged role) ----------------------------------------------
create temp table t_s as select 'ag-' || substr(gen_random_uuid()::text, 1, 8) as suffix;
create temp table t_u (name text primary key, id uuid not null default gen_random_uuid());
create temp table t_p (name text primary key, id uuid not null default gen_random_uuid());
create temp table t_d as
  with x as (
    select (now() at time zone 'America/Toronto')::date as today,
           extract(dow from (now() at time zone 'America/Toronto'))::integer as dow
  )
  select today + coalesce(nullif((3 - dow + 7) % 7, 0), 7) as d from x;
grant select on t_s, t_u, t_p, t_d to anon, authenticated;

insert into t_u (name) values ('alice'), ('adm');
insert into t_p (name) values ('pa'), ('pb'), ('pc');
insert into auth.users (id, aud, role, email)
select id, 'authenticated', 'authenticated', name || '-' || (select suffix from t_s) || '@test.local' from t_u;
update public.profiles set role = 'admin' where id = (select id from t_u where name = 'adm');
insert into public.players (id, name) select id, 'T ' || name || ' ' || (select suffix from t_s) from t_p;
insert into public.weekly_scores (player_id, week_number, attended, points) values ((select id from t_p where name = 'pa'), 1, true, 3);

-- ---------------------------------------------------------------- anonymous visitor
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
do $$
declare n integer; dd date := (select d from t_d);
begin
  begin perform public.admin_add_guest_rsvp('Anon Guest', dd); raise exception 'FAIL anon called admin_add_guest_rsvp';
  exception when insufficient_privilege then raise notice 'PASS anon cannot call admin_add_guest_rsvp'; end;
  begin perform public.admin_remove_guest_rsvp(gen_random_uuid()); raise exception 'FAIL anon called admin_remove_guest_rsvp';
  exception when insufficient_privilege then raise notice 'PASS anon cannot call admin_remove_guest_rsvp'; end;

  begin
    insert into public.weekly_scores (player_id, week_number, points) values ((select id from t_p where name = 'pb'), 2, 9);
    raise exception 'FAIL anon inserted a weekly score';
  exception when insufficient_privilege then raise notice 'PASS anon cannot insert weekly scores'; end;
  begin -- refused outright (no grant) or 0 rows (RLS): either is a pass
    update public.weekly_scores set points = 99 where player_id = (select id from t_p where name = 'pa');
    get diagnostics n = row_count;
    if n <> 0 then raise exception 'FAIL anon updated % weekly scores', n; end if;
  exception when insufficient_privilege then null; end;
  raise notice 'PASS anon cannot update weekly scores';

  begin
    insert into public.weeks (week_number, notes) values (7, 'anon');
    raise exception 'FAIL anon inserted a week';
  exception when insufficient_privilege then raise notice 'PASS anon cannot insert weeks'; end;
end $$;

-- RSVP ownership hand-over, part 1: an anonymous device RSVPs the unclaimed pc
do $$
begin
  perform public.set_rsvp((select id from t_p where name = 'pc'), null, 'handover-token-000001', 'in', (select d from t_d));
  raise notice 'PASS anonymous RSVP for an unclaimed player';
end $$;

-- ---------------------------------------------------------------- signed-in non-admin
reset role;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', (select id from t_u where name = 'alice'), 'role', 'authenticated')::text, true);
do $$
declare n integer; dd date := (select d from t_d);
begin
  begin perform public.admin_add_guest_rsvp('Alice Guest', dd); raise exception 'FAIL a non-admin added a guest';
  exception when sqlstate '42501' then raise notice 'PASS a non-admin is refused by admin_add_guest_rsvp (42501)'; end;
  begin perform public.admin_remove_guest_rsvp(gen_random_uuid()); raise exception 'FAIL a non-admin removed a guest';
  exception when sqlstate '42501' then raise notice 'PASS a non-admin is refused by admin_remove_guest_rsvp (42501)'; end;

  begin
    insert into public.roles (key, label) values ('hacker', 'Hacker');
    raise exception 'FAIL a non-admin created a role';
  exception when insufficient_privilege then raise notice 'PASS a non-admin cannot create roles'; end;
  begin -- refused outright (no grant) or 0 rows (RLS): either is a pass
    update public.roles set label = 'Pwned' where key = 'developer';
    get diagnostics n = row_count;
    if n <> 0 then raise exception 'FAIL a non-admin renamed % roles', n; end if;
  exception when insufficient_privilege then null; end;
  begin -- refused outright (no grant) or 0 rows (RLS): either is a pass
    delete from public.roles where key = 'organizer';
    get diagnostics n = row_count;
    if n <> 0 then raise exception 'FAIL a non-admin deleted % roles', n; end if;
  exception when insufficient_privilege then null; end;
  raise notice 'PASS a non-admin cannot change or delete roles';

  begin
    insert into public.weekly_scores (player_id, week_number, points) values ((select id from t_p where name = 'pb'), 2, 9);
    raise exception 'FAIL a non-admin inserted a weekly score';
  exception when insufficient_privilege then raise notice 'PASS a non-admin cannot insert weekly scores'; end;
  begin -- refused outright (no grant) or 0 rows (RLS): either is a pass
    update public.weekly_scores set points = 99 where player_id = (select id from t_p where name = 'pa');
    get diagnostics n = row_count;
    if n <> 0 then raise exception 'FAIL a non-admin updated % weekly scores', n; end if;
  exception when insufficient_privilege then null; end;
  raise notice 'PASS a non-admin cannot update weekly scores';

  begin -- refused outright (no grant) or 0 rows (RLS): either is a pass
    update public.weeks set notes = 'pwned';
    get diagnostics n = row_count;
    if n <> 0 then raise exception 'FAIL a non-admin updated % weeks', n; end if;
  exception when insufficient_privilege then null; end;
  begin -- refused outright (no grant) or 0 rows (RLS): either is a pass
    delete from public.weeks;
    get diagnostics n = row_count;
    if n <> 0 then raise exception 'FAIL a non-admin deleted % weeks', n; end if;
  exception when insufficient_privilege then null; end;
  raise notice 'PASS a non-admin cannot update or delete weeks';
end $$;

-- ---------------------------------------------------------------- admin: guest functions
select set_config('request.jwt.claims', json_build_object('sub', (select id from t_u where name = 'adm'), 'role', 'authenticated')::text, true);
do $$
declare dd date := (select d from t_d); r jsonb; player_row uuid;
begin
  r := public.admin_add_guest_rsvp('Gina ' || (select suffix from t_s), dd);
  if r ->> 'rsvp_id' is null then raise exception 'FAIL admin_add_guest_rsvp returned %', r; end if;
  raise notice 'PASS an admin can add a guest';

  r := public.admin_remove_guest_rsvp((r ->> 'rsvp_id')::uuid);
  raise notice 'PASS an admin can remove a guest';

  select id into player_row from public.rsvps where session_date = dd and player_id = (select id from t_p where name = 'pc');
  begin
    perform public.admin_remove_guest_rsvp(player_row);
    raise exception 'FAIL admin_remove_guest_rsvp removed a player''s RSVP';
  exception when sqlstate '55000' then raise notice 'PASS admin_remove_guest_rsvp refuses a player''s RSVP (55000)'; end;
end $$;

-- ---------------------------------------------------------------- ownership hand-over, part 2: claim
reset role;
update public.players set user_id = (select id from t_u where name = 'alice') where id = (select id from t_p where name = 'pc');
do $$
declare owner uuid; claimed boolean; other boolean;
begin
  select user_id into owner from public.rsvps where session_date = (select d from t_d) and player_id = (select id from t_p where name = 'pc');
  if owner is distinct from (select id from t_u where name = 'alice') then raise exception 'FAIL the upcoming RSVP did not follow the new owner'; end if;
  raise notice 'PASS claiming a player hands their upcoming RSVP to the new owner';

  select is_claimed into claimed from public.season_leaderboard where id = (select id from t_p where name = 'pc');
  select is_claimed into other from public.season_leaderboard where id = (select id from t_p where name = 'pb');
  if claimed is not true or other is not false then raise exception 'FAIL is_claimed was % / %', claimed, other; end if;
  raise notice 'PASS season_leaderboard.is_claimed';
end $$;

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
do $$
begin
  perform public.set_rsvp((select id from t_p where name = 'pc'), null, 'handover-token-000001', 'out', (select d from t_d));
  raise exception 'FAIL the old device still changed a claimed player''s RSVP';
exception when sqlstate 'RV003' then raise notice 'PASS the original device is refused once the player is claimed';
end $$;

reset role;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', (select id from t_u where name = 'alice'), 'role', 'authenticated')::text, true);
do $$
declare r jsonb;
begin
  r := public.set_rsvp(null, null, null, 'out', (select d from t_d));
  if r ->> 'rsvp_id' is null then raise exception 'FAIL the new owner could not change the RSVP: %', r; end if;
  raise notice 'PASS the new owner manages the RSVP signed in';
end $$;

-- ---------------------------------------------------------------- ownership hand-over, part 3: unlink
reset role;
update public.players set user_id = null where id = (select id from t_p where name = 'pc');
do $$
declare owner uuid;
begin
  select user_id into owner from public.rsvps where session_date = (select d from t_d) and player_id = (select id from t_p where name = 'pc');
  if owner is not null then raise exception 'FAIL unlinking left the RSVP owned by %', owner; end if;
  raise notice 'PASS unlinking clears the RSVP owner';
end $$;

-- ---------------------------------------------------------------- RSVP open time (RV009)
insert into public.event_settings (id, rsvp_cutoff_at, event_start_at, event_end_at, timezone, capacity, rsvp_open_at)
select 1,
       ((select d from t_d) + time '18:00') at time zone 'America/Toronto',
       ((select d from t_d) + time '20:00') at time zone 'America/Toronto',
       ((select d from t_d) + time '22:00') at time zone 'America/Toronto',
       'America/Toronto', 24,
       now() + interval '1 hour'
on conflict (id) do update
  set rsvp_cutoff_at = excluded.rsvp_cutoff_at, event_start_at = excluded.event_start_at,
      event_end_at = excluded.event_end_at, timezone = excluded.timezone, rsvp_open_at = excluded.rsvp_open_at;

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
do $$
begin
  perform public.set_rsvp((select id from t_p where name = 'pb'), null, 'early-token-00000001', 'in', (select d from t_d));
  raise exception 'FAIL an RSVP was accepted before the open time';
exception when sqlstate 'RV009' then raise notice 'PASS RSVPs are refused before the open time (RV009)';
end $$;

reset role;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', (select id from t_u where name = 'adm'), 'role', 'authenticated')::text, true);
do $$
begin
  perform public.set_rsvp((select id from t_p where name = 'pb'), null, null, 'in', (select d from t_d));
  raise notice 'PASS admins can RSVP someone before the open time';
end $$;

reset role;
rollback;  -- discard every fixture and change
