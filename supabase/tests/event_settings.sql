-- Tests for event_settings. Run in the Supabase SQL Editor AFTER applying 20261127000000_event_settings.sql.
-- One transaction, ROLLED BACK at the end: nothing survives, including the edits made to the
-- settings row. Personas are impersonated with set local role + request.jwt.claims, like PostgREST.

begin;

create temp table t_u (name text primary key, id uuid not null default gen_random_uuid());
insert into t_u (name) values ('adm'), ('pleb');
grant select on t_u to anon, authenticated;

insert into auth.users (id, aud, role, email)
select id, 'authenticated', 'authenticated', name || '-es@example.test' from t_u;
-- profiles are created by the signup trigger; promote the admin the way you would in the SQL editor
update public.profiles set role = 'admin' where id = (select id from t_u where name = 'adm');

-- Start from a known row: next Wednesday 6 PM cutoff, 8-10 PM, capacity 24 (what the seed makes).
create temp table t_d as select public.rsvp_session_date() as d;
grant select on t_d to anon, authenticated;
delete from public.event_settings;
insert into public.event_settings (id, rsvp_cutoff_at, event_start_at, event_end_at)
select 1, (d + time '18:00') at time zone 'America/Toronto',
          (d + time '20:00') at time zone 'America/Toronto',
          (d + time '22:00') at time zone 'America/Toronto' from t_d;

do $$ begin
  if (select capacity from public.event_settings) <> 24 then raise exception 'FAIL default capacity'; end if;
  if (select timezone from public.event_settings) <> 'America/Toronto' then raise exception 'FAIL default timezone'; end if;
  raise notice 'PASS seed shape';
end $$;

-- Constraints (privileged role) ---------------------------------------------------------------
do $$ begin
  begin insert into public.event_settings (id, rsvp_cutoff_at, event_start_at, event_end_at)
    values (2, now(), now(), now() + interval '1 hour');
    raise exception 'FAIL second row allowed';
  exception when check_violation or unique_violation then null; end;
  raise notice 'PASS single row';

  begin update public.event_settings set event_end_at = event_start_at;
    raise exception 'FAIL start < end not enforced';
  exception when check_violation then null; end;
  begin update public.event_settings set rsvp_cutoff_at = event_start_at + interval '1 minute';
    raise exception 'FAIL cutoff <= start not enforced';
  exception when check_violation then null; end;
  begin update public.event_settings set timezone = 'Mars/Olympus';
    raise exception 'FAIL bad time zone accepted';
  exception when sqlstate '22023' then null; end;
  begin update public.event_settings set event_start_at = event_start_at + interval '1 day',
                                         event_end_at = event_end_at + interval '1 day';
    raise exception 'FAIL non-Wednesday accepted';
  exception when sqlstate '22023' then null; end;
  raise notice 'PASS constraints';
end $$;

-- Helpers follow the setting -------------------------------------------------------------------
do $$
declare d date := (select d from t_d);
begin
  if public.rsvp_cutoff_at(d) <> (d + time '18:00') at time zone 'America/Toronto' then
    raise exception 'FAIL cutoff default'; end if;
  update public.event_settings set rsvp_cutoff_at = rsvp_cutoff_at - interval '2 hours', capacity = 10;
  if public.rsvp_cutoff_at(d) <> (d + time '16:00') at time zone 'America/Toronto' then
    raise exception 'FAIL cutoff follows setting'; end if;
  if public.rsvp_capacity() <> 10 then raise exception 'FAIL capacity follows setting'; end if;
  -- an unrelated Wednesday keeps the built-in rule
  if public.rsvp_cutoff_at(d + 7) <> ((d + 7) + time '18:00') at time zone 'America/Toronto' then
    raise exception 'FAIL other weeks keep default'; end if;
  -- once the event is over the setting stops applying
  if public.rsvp_session_date(public.rsvp_live_end(d)) <> d + 7 then raise exception 'FAIL rollover after event'; end if;
  raise notice 'PASS helpers follow setting';
end $$;

-- RLS ------------------------------------------------------------------------------------------
set local role anon;
do $$ begin
  if (select count(*) from public.event_settings) <> 1 then raise exception 'FAIL anon cannot read'; end if;
  begin update public.event_settings set capacity = 99;
    raise exception 'FAIL anon updated';
  exception when insufficient_privilege then null; end;
  raise notice 'PASS anon read-only';
end $$;
reset role;

select set_config('request.jwt.claims',
  json_build_object('sub', (select id from t_u where name = 'pleb'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare n integer;
begin
  update public.event_settings set capacity = 99;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL non-admin updated % row(s)', n; end if;
  raise notice 'PASS non-admin blocked by RLS';
end $$;
reset role;

select set_config('request.jwt.claims',
  json_build_object('sub', (select id from t_u where name = 'adm'), 'role', 'authenticated',
                    'app_metadata', json_build_object('role', 'admin'))::text, true);
set local role authenticated;
do $$
declare n integer;
begin
  update public.event_settings set capacity = 30;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL admin could not update'; end if;
  if (select updated_by from public.event_settings) <> (select id from t_u where name = 'adm') then
    raise exception 'FAIL updated_by not stamped'; end if;
  begin update public.event_settings set updated_by = null;
    raise exception 'FAIL updated_by writable';
  exception when insufficient_privilege then null; end;
  begin delete from public.event_settings;
    raise exception 'FAIL delete allowed';
  exception when insufficient_privilege then null; end;
  raise notice 'PASS admin can edit, audit stamped, no delete';
end $$;
reset role;

rollback;
