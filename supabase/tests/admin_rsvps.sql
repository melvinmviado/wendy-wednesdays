-- Tests for admin-managed RSVPs (admin_add_rsvp / admin_remove_rsvp). Run in the Supabase SQL
-- Editor AFTER applying, in order: ...profiles_foundation, ...player_admin, ...player_claims,
-- ...player_avatars, 20261124000000_rsvps.sql, 20261125000000_admin_rsvps.sql.
-- One transaction, ROLLED BACK at the end: no fixtures survive. Each check raises an exception on
-- failure; "PASS ..." notices show in the Messages tab. Personas are impersonated with
-- set local role + request.jwt.claims, like PostgREST does (same approach as rsvps.sql).
--
-- Uses the next open Wednesday and counts relative to whatever RSVPs already exist for it, so it
-- is safe on a database with real data, but run it on staging first.
--
-- NOT covered here: a true concurrent race. One SQL session cannot interleave with another. The
-- guarantee comes from both functions taking the same pg_advisory_xact_lock('rsvp:' || date) as
-- set_rsvp; see the two-session manual check in the QA notes you were given with this feature.

begin;

create temp table t_s as select 'ar-' || substr(gen_random_uuid()::text, 1, 8) as suffix;
create temp table t_u (name text primary key, id uuid not null default gen_random_uuid());
create temp table t_p (name text primary key, id uuid not null default gen_random_uuid());
create temp table t_b (n integer primary key, id uuid not null default gen_random_uuid());
create temp table t_d as
  with x as (
    select (now() at time zone 'America/Toronto')::date as today,
           extract(dow from (now() at time zone 'America/Toronto'))::integer as dow
  )
  select today + coalesce(nullif((3 - dow + 7) % 7, 0), 7) as d,
         today + coalesce(nullif((3 - dow + 7) % 7, 0), 7) - 14 as past,
         today + coalesce(nullif((3 - dow + 7) % 7, 0), 7) + 14 as far
  from x;
grant select on t_s, t_u, t_p, t_b, t_d to anon, authenticated;

insert into t_u (name) values ('alice'), ('adm');
insert into t_p (name) values ('pa'), ('pb'), ('pd');
insert into t_b (n) select g from generate_series(1, 30) g;

insert into auth.users (id, aud, role, email)
select id, 'authenticated', 'authenticated', name || '-' || (select suffix from t_s) || '@test.local' from t_u;
update public.profiles set role = 'admin' where id = (select id from t_u where name = 'adm');

-- pa: no login. pb: no login, will cancel for themselves. pd: archived.
insert into public.players (id, name) select id, 'T ' || name || ' ' || (select suffix from t_s) from t_p;
insert into public.players (id, name) select id, 'T bulk ' || n || ' ' || (select suffix from t_s) from t_b;
update public.players set archived_at = now() where id = (select id from t_p where name = 'pd');

-- ---------------------------------------------------------------- schema
do $$
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'rsvps' and column_name = 'added_by') then
    raise exception 'FAIL rsvps.added_by is missing';
  end if;
  raise notice 'PASS rsvps.added_by exists';
end $$;

-- ---------------------------------------------------------------- anon: no access at all
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
do $$
declare dd date := (select d from t_d); pa uuid := (select id from t_p where name = 'pa');
begin
  begin
    perform public.admin_add_rsvp(pa, dd);
    raise exception 'FAIL anon called admin_add_rsvp';
  exception when insufficient_privilege then raise notice 'PASS anon cannot call admin_add_rsvp'; end;
  begin
    perform public.admin_remove_rsvp(pa, dd);
    raise exception 'FAIL anon called admin_remove_rsvp';
  exception when insufficient_privilege then raise notice 'PASS anon cannot call admin_remove_rsvp'; end;
end $$;

-- ---------------------------------------------------------------- signed-in non-admin: rejected
reset role;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', (select id from t_u where name = 'alice'), 'role', 'authenticated')::text, true);
do $$
declare dd date := (select d from t_d); pa uuid := (select id from t_p where name = 'pa');
begin
  begin
    perform public.admin_add_rsvp(pa, dd);
    raise exception 'FAIL a non-admin added someone';
  exception when sqlstate '42501' then raise notice 'PASS a signed-in non-admin is refused by admin_add_rsvp (42501)'; end;
  begin
    perform public.admin_remove_rsvp(pa, dd);
    raise exception 'FAIL a non-admin removed someone';
  exception when sqlstate '42501' then raise notice 'PASS a signed-in non-admin is refused by admin_remove_rsvp (42501)'; end;
  -- Claiming to be an admin in user_metadata (which users can edit) must not help.
  perform set_config('request.jwt.claims', json_build_object('sub', (select id from t_u where name = 'alice'), 'role', 'authenticated',
                     'user_metadata', json_build_object('role', 'admin'))::text, true);
  begin
    perform public.admin_add_rsvp(pa, dd);
    raise exception 'FAIL user_metadata role=admin was honoured';
  exception when sqlstate '42501' then raise notice 'PASS user_metadata cannot grant admin'; end;
  if exists (select 1 from public.rsvps where player_id = pa and session_date = dd) then
    raise exception 'FAIL a refused call still wrote a row';
  end if;
  raise notice 'PASS refused calls write nothing';
end $$;

-- ---------------------------------------------------------------- admin: add, idempotent, who
-- (role changes happen between DO blocks, never inside one)
reset role;
create temp table t_res (k text primary key, v jsonb);
grant all on t_res to authenticated;

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', (select id from t_u where name = 'adm'), 'role', 'authenticated')::text, true);
do $$
declare dd date := (select d from t_d); pa uuid := (select id from t_p where name = 'pa'); r1 jsonb; r2 jsonb;
begin
  r1 := public.admin_add_rsvp(pa, dd);
  if r1 ->> 'status' <> 'in' or (r1 ->> 'changed')::boolean is not true then raise exception 'FAIL first add: %', r1; end if;
  raise notice 'PASS an admin can add a player who has no login and never RSVP''d';

  r2 := public.admin_add_rsvp(pa, dd);
  if (r2 ->> 'changed')::boolean is not false or r2 ->> 'rsvp_id' <> r1 ->> 'rsvp_id' or r2 ->> 'position' <> r1 ->> 'position' then
    raise exception 'FAIL repeat add changed something: % vs %', r1, r2;
  end if;
  raise notice 'PASS a repeat add is a no-op (same row, same place)';
end $$;

reset role;
do $$
declare dd date := (select d from t_d); pa uuid := (select id from t_p where name = 'pa');
begin
  if (select count(*) from public.rsvps where player_id = pa and session_date = dd) <> 1 then raise exception 'FAIL not exactly one row'; end if;
  if (select added_by from public.rsvps where player_id = pa and session_date = dd) is distinct from (select id from t_u where name = 'adm') then
    raise exception 'FAIL added_by was not recorded';
  end if;
  if (select user_id from public.rsvps where player_id = pa and session_date = dd) is not null then raise exception 'FAIL user_id set for a player with no login'; end if;
  raise notice 'PASS exactly one row, added_by is the admin';
end $$;

-- ---------------------------------------------------------------- admin: already RSVP'd or cancelled
-- pb RSVP'd for themselves from a device (as set_rsvp would have stored it); the admin then adds them.
insert into public.rsvps (session_date, player_id, device_token, status)
values ((select d from t_d), (select id from t_p where name = 'pb'), public.rsvp_hash_token('ar-token-pb-0000000001'), 'in');

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', (select id from t_u where name = 'adm'), 'role', 'authenticated')::text, true);
do $$
declare dd date := (select d from t_d); pb uuid := (select id from t_p where name = 'pb'); r jsonb;
begin
  r := public.admin_add_rsvp(pb, dd);
  if (r ->> 'changed')::boolean is not false or r ->> 'status' <> 'in' then raise exception 'FAIL adding someone who already RSVP''d: %', r; end if;
  insert into t_res values ('pb_pos', to_jsonb((r ->> 'position')::integer));
  raise notice 'PASS adding someone who already RSVP''d is a no-op, not an error';

  r := public.admin_remove_rsvp(pb, dd);
  if r ->> 'status' <> 'out' or (r ->> 'changed')::boolean is not true then raise exception 'FAIL remove: %', r; end if;
  r := public.admin_remove_rsvp(pb, dd);
  if r ->> 'status' <> 'out' or (r ->> 'changed')::boolean is not false then raise exception 'FAIL repeat remove (already cancelled): %', r; end if;
  raise notice 'PASS removing someone who already cancelled is a no-op';

  r := public.admin_remove_rsvp((select id from t_b where n = 30), dd);
  if r ->> 'rsvp_id' is not null or (r ->> 'changed')::boolean is not false then raise exception 'FAIL remove of a never-RSVP''d player: %', r; end if;
  raise notice 'PASS removing a player with no row reports no change';

  r := public.admin_add_rsvp(pb, dd);
  if (r ->> 'changed')::boolean is not true or r ->> 'status' <> 'in' then raise exception 'FAIL re-add: %', r; end if;
  if (r ->> 'position')::integer < (select (v)::integer from t_res where k = 'pb_pos') then raise exception 'FAIL re-add kept an old place: %', r; end if;
  raise notice 'PASS re-adding after a removal puts them back in, at the back';
end $$;

reset role;
do $$
begin
  if exists (select 1 from public.rsvps where player_id = (select id from t_b where n = 30)) then raise exception 'FAIL a remove created a row'; end if;
  if (select count(*) from public.rsvps where player_id = (select id from t_p where name = 'pb') and session_date = (select d from t_d)) <> 1 then
    raise exception 'FAIL duplicate rows for one player';
  end if;
  raise notice 'PASS no stray or duplicate rows';
end $$;

-- the next sections run as the admin again
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', (select id from t_u where name = 'adm'), 'role', 'authenticated')::text, true);

-- ---------------------------------------------------------------- admin: input and run checks
do $$
declare dd date := (select d from t_d); pd uuid := (select id from t_p where name = 'pd'); pa uuid := (select id from t_p where name = 'pa');
begin
  begin perform public.admin_add_rsvp(pd, dd); raise exception 'FAIL an archived player was added';
  exception when sqlstate 'RV003' then raise notice 'PASS archived player refused (RV003)'; end;
  begin perform public.admin_add_rsvp(gen_random_uuid(), dd); raise exception 'FAIL an unknown player was added';
  exception when sqlstate 'RV003' then raise notice 'PASS unknown player refused (RV003)'; end;
  begin perform public.admin_add_rsvp(null, dd); raise exception 'FAIL a null player was accepted';
  exception when sqlstate 'RV008' then raise notice 'PASS null player refused (RV008)'; end;
  begin perform public.admin_add_rsvp(pa, dd + 1); raise exception 'FAIL a non-Wednesday was accepted';
  exception when sqlstate 'RV007' then raise notice 'PASS a non-Wednesday date refused (RV007)'; end;
  -- The rollover guard: a run that has already passed, or one too far ahead, is refused for writes.
  begin perform public.admin_add_rsvp(pa, (select past from t_d)); raise exception 'FAIL a past run was written';
  exception when sqlstate 'RV007' then raise notice 'PASS a past run is refused, never redirected to the next one (RV007)'; end;
  begin perform public.admin_remove_rsvp(pa, (select past from t_d)); raise exception 'FAIL a past run was written (remove)';
  exception when sqlstate 'RV007' then raise notice 'PASS removing from a past run is refused (RV007)'; end;
  begin perform public.admin_add_rsvp(pa, (select far from t_d)); raise exception 'FAIL a run 3 weeks out was written';
  exception when sqlstate 'RV007' then raise notice 'PASS a run too far ahead is refused (RV007)'; end;
end $$;

-- ---------------------------------------------------------------- admin: capacity and waitlist
do $$
declare
  dd date := (select d from t_d); cap integer := 24; total integer; i integer; r jsonb; extra uuid;
begin
  select (s.in_count + s.waitlist_count) into total from public.get_rsvp_state(dd, null) s;
  for i in 1 .. 28 loop
    exit when total >= cap;
    r := public.admin_add_rsvp((select id from t_b where n = i), dd);
    if (r ->> 'changed')::boolean then total := total + 1; end if;
  end loop;
  if total < cap then raise exception 'FAIL could not fill the list (have %)', total; end if;
  extra := (select id from t_b where n = 29);
  r := public.admin_add_rsvp(extra, dd);
  r := public.admin_add_rsvp((select id from t_b where n = 30), dd);
  if (r ->> 'waitlist_position') is null then raise exception 'FAIL past capacity should be waitlisted: %', r; end if;
  raise notice 'PASS an add past capacity lands on the waitlist (no error, nobody bumped)';
end $$;

-- ---------------------------------------------------------------- table stays sealed
do $$
begin
  begin perform 1 from public.rsvps limit 1; raise exception 'FAIL an authenticated admin read the table directly';
  exception when insufficient_privilege then raise notice 'PASS even admins have no direct table access'; end;
end $$;

reset role;
do $$ begin raise notice 'ALL ADMIN RSVP CHECKS PASSED (rolling back)'; end $$;
rollback;
