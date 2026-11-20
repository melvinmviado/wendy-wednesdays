-- Tests for admin_rename_guest_rsvp. Run in the Supabase SQL Editor AFTER applying, in order:
-- ...profiles_foundation, ...player_admin, ...player_claims, ...player_avatars, 20261124000000_rsvps,
-- 20261125000000_admin_rsvps, 20261126000000_admin_guest_rsvps, 20261201000000_admin_rename_guest_rsvp.
-- One transaction, ROLLED BACK at the end: no fixtures survive. Each check raises on failure;
-- "PASS ..." notices show in the Messages tab. Personas are impersonated with set local role +
-- request.jwt.claims, like PostgREST does (same approach as admin_rsvps.sql). Run on staging first.

begin;

create temp table t_s as select 'rg-' || substr(gen_random_uuid()::text, 1, 8) as suffix;
create temp table t_u (name text primary key, id uuid not null default gen_random_uuid());
create temp table t_x (k text primary key, v text);
create temp table t_d as
  with x as (
    select (now() at time zone 'America/Toronto')::date as today,
           extract(dow from (now() at time zone 'America/Toronto'))::integer as dow
  )
  select today + coalesce(nullif((3 - dow + 7) % 7, 0), 7) as d,
         today + coalesce(nullif((3 - dow + 7) % 7, 0), 7) + 14 as far
  from x;
grant select on t_s, t_u, t_x, t_d to anon, authenticated;
grant insert, update, select on t_x to authenticated;

insert into t_u (name) values ('adm'), ('member');
insert into auth.users (id, aud, role, email)
select id, 'authenticated', 'authenticated', name || '-' || (select suffix from t_s) || '@test.local' from t_u;
update public.profiles set role = 'admin' where id = (select id from t_u where name = 'adm');
insert into public.players (name) values ('T Player ' || (select suffix from t_s));

-- ---------------------------------------------------------------- anon: no access at all
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
do $$
begin
  begin
    perform public.admin_rename_guest_rsvp(gen_random_uuid(), 'Anybody');
    raise exception 'FAIL anon called admin_rename_guest_rsvp';
  exception when insufficient_privilege then raise notice 'PASS anon cannot call admin_rename_guest_rsvp'; end;
end $$;

-- ---------------------------------------------------------------- signed-in non-admin: refused
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', (select id from t_u where name = 'member'), 'role', 'authenticated')::text, true);
do $$
begin
  begin
    perform public.admin_rename_guest_rsvp(gen_random_uuid(), 'Anybody');
    raise exception 'FAIL a non-admin renamed a guest';
  exception when sqlstate '42501' then raise notice 'PASS a non-admin gets 42501'; end;
end $$;

-- ---------------------------------------------------------------- admin
select set_config('request.jwt.claims',
  json_build_object('sub', (select id from t_u where name = 'adm'), 'role', 'authenticated',
                    'app_metadata', json_build_object('role', 'admin'))::text, true);
do $$
declare
  dd   date := (select d from t_d);
  sfx  text := (select suffix from t_s);
  a    jsonb; b jsonb; r jsonb;
  ida  uuid; idb uuid;
  before_row public.rsvps%rowtype; after_row public.rsvps%rowtype;
begin
  a := public.admin_add_guest_rsvp('Jon ' || sfx, dd);
  b := public.admin_add_guest_rsvp('Other ' || sfx, dd);
  ida := (a ->> 'rsvp_id')::uuid; idb := (b ->> 'rsvp_id')::uuid;
  select * into before_row from public.rsvps where id = ida;

  r := public.admin_rename_guest_rsvp(ida, '  John   ' || sfx || ' ');
  if (r ->> 'changed') <> 'true' or (r ->> 'name') <> 'John ' || sfx then raise exception 'FAIL rename: %', r; end if;
  raise notice 'PASS rename trims, collapses spaces and reports changed';

  select * into after_row from public.rsvps where id = ida;
  if after_row.created_at is distinct from before_row.created_at
     or after_row.status is distinct from before_row.status
     or after_row.device_token is distinct from before_row.device_token then
    raise exception 'FAIL rename touched created_at / status / device_token';
  end if;
  raise notice 'PASS place in line, status and device binding are unchanged';

  r := public.admin_rename_guest_rsvp(ida, 'John ' || sfx);
  if (r ->> 'changed') <> 'false' then raise exception 'FAIL repeat should be a no-op: %', r; end if;
  r := public.admin_rename_guest_rsvp(ida, upper('John ' || sfx));
  if (r ->> 'changed') <> 'true' then raise exception 'FAIL case-only change should work: %', r; end if;
  raise notice 'PASS repeat is a no-op and a case-only change is allowed';

  begin perform public.admin_rename_guest_rsvp(ida, lower('OTHER ' || sfx));
    raise exception 'FAIL duplicate guest name accepted';
  exception when sqlstate 'RV010' then raise notice 'PASS duplicate guest name (any case) -> RV010'; end;

  begin perform public.admin_rename_guest_rsvp(ida, (select name from public.players where name = 'T Player ' || sfx));
    raise exception 'FAIL active player name accepted';
  exception when sqlstate 'RV005' then raise notice 'PASS active player name -> RV005'; end;

  begin perform public.admin_rename_guest_rsvp(ida, ' ');
    raise exception 'FAIL blank name accepted';
  exception when sqlstate 'RV004' then raise notice 'PASS blank name -> RV004'; end;
  begin perform public.admin_rename_guest_rsvp(ida, repeat('x', 41));
    raise exception 'FAIL 41-character name accepted';
  exception when sqlstate 'RV004' then raise notice 'PASS 41 characters -> RV004'; end;

  begin perform public.admin_rename_guest_rsvp(gen_random_uuid(), 'Nobody Here');
    raise exception 'FAIL unknown id accepted';
  exception when sqlstate 'P0002' then raise notice 'PASS unknown id -> P0002'; end;

  perform public.admin_add_rsvp((select id from public.players where name = 'T Player ' || sfx), dd);
  begin perform public.admin_rename_guest_rsvp(
          (select id from public.rsvps where session_date = dd and player_id = (select id from public.players where name = 'T Player ' || sfx)),
          'Someone Else');
    raise exception 'FAIL renamed a player row';
  exception when sqlstate '55000' then raise notice 'PASS a player row -> 55000'; end;

  perform idb;
end $$;

rollback;
