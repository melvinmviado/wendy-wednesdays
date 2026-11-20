-- Tests for weekly RSVPs. Run in the Supabase SQL Editor AFTER applying, in order:
--   20261118000000_profiles_foundation.sql
--   20261119000000_player_admin.sql
--   20261120000000_player_claims.sql
--   20261122000000_player_avatars.sql
--   20261124000000_rsvps.sql
-- One transaction, ROLLED BACK at the end: no fixtures survive. Each check raises an exception
-- on failure; "PASS ..." notices show in the Messages tab. Personas are impersonated with
-- set local role + request.jwt.claims, like PostgREST does.
--
-- The tests use the next open Wednesday and count relative to whatever RSVPs already exist for
-- it, so they are safe on a database with real data. They need fewer than 20 existing
-- 'in' RSVPs for that Wednesday; otherwise run them on an empty/staging database.

begin;

-- Fixtures (SQL editor's privileged role) ----------------------------------------------
create temp table t_s as select 'rv-' || substr(gen_random_uuid()::text, 1, 8) as suffix;
create temp table t_u (name text primary key, id uuid not null default gen_random_uuid());
create temp table t_p (name text primary key, id uuid not null default gen_random_uuid());
create temp table t_b (n integer primary key, id uuid not null default gen_random_uuid());
create temp table t_x (k text primary key, v integer);
create temp table t_r (k text primary key, id uuid);
-- d: next Wednesday strictly after today (Toronto), always inside the open window. past: two weeks earlier.
create temp table t_d as
  with x as (
    select (now() at time zone 'America/Toronto')::date as today,
           extract(dow from (now() at time zone 'America/Toronto'))::integer as dow
  )
  select today + coalesce(nullif((3 - dow + 7) % 7, 0), 7) as d,
         today + coalesce(nullif((3 - dow + 7) % 7, 0), 7) - 14 as past
  from x;
grant select on t_s, t_u, t_p, t_b, t_d to anon, authenticated;
grant all on t_x, t_r to anon, authenticated;

insert into t_u (name) values ('alice'), ('bob'), ('carol'), ('adm');
insert into t_p (name) values ('pa'), ('pb'), ('pc'), ('pd'), ('pe'), ('pg'), ('k1'), ('k2'), ('k3'), ('k4');
insert into t_b (n) select g from generate_series(1, 30) g;

insert into auth.users (id, aud, role, email)
select id, 'authenticated', 'authenticated', name || '-' || (select suffix from t_s) || '@test.local' from t_u;
update public.profiles set role = 'admin' where id = (select id from t_u where name = 'adm');

insert into public.players (id, name) select id, 'T ' || name || ' ' || (select suffix from t_s) from t_p;
insert into public.players (id, name) select id, 'T bulk ' || n || ' ' || (select suffix from t_s) from t_b;
update public.players set user_id = (select id from t_u where name = 'alice') where id = (select id from t_p where name = 'pc');
update public.players set archived_at = now() where id = (select id from t_p where name = 'pd');

-- A past session where pa already RSVP'd from a known device: used by the cutoff tests.
insert into public.rsvps (session_date, player_id, device_token, status)
values ((select past from t_d), (select id from t_p where name = 'pa'), public.rsvp_hash_token('frozen-token-0000000001'), 'in');

-- ---------------------------------------------------------------- schema rules (privileged)
do $$
declare dd date := (select d from t_d); pe uuid := (select id from t_p where name = 'pe');
begin
  begin
    insert into public.rsvps (session_date, status) values (dd, 'in');
    raise exception 'FAIL a row with neither player nor guest was accepted';
  exception when check_violation then raise notice 'PASS a row needs exactly one of player or guest'; end;

  begin
    insert into public.rsvps (session_date, player_id, guest_name, status) values (dd, pe, 'Both Set', 'in');
    raise exception 'FAIL a row with both player and guest was accepted';
  exception when check_violation then raise notice 'PASS a row cannot have both player and guest'; end;

  begin
    insert into public.rsvps (session_date, guest_name, status) values (dd + 1, 'Not Wednesday', 'in');
    raise exception 'FAIL a non-Wednesday session date was accepted';
  exception when check_violation then raise notice 'PASS session_date must be a Wednesday'; end;

  begin
    insert into public.rsvps (session_date, guest_name, status) values (dd, 'Bad Status', 'maybe');
    raise exception 'FAIL status maybe was accepted';
  exception when check_violation then raise notice 'PASS status is in or out'; end;

  begin
    insert into public.rsvps (session_date, player_id, status) values (dd, pe, 'in');
    insert into public.rsvps (session_date, player_id, status) values (dd, pe, 'in');
    raise exception 'FAIL the same player twice in one session';
  exception when unique_violation then raise notice 'PASS unique (session_date, player_id)'; end;

  begin
    insert into public.rsvps (session_date, guest_name, status) values (dd, 'Dup Guest', 'in');
    insert into public.rsvps (session_date, guest_name, status) values (dd, 'DUP guest', 'in');
    raise exception 'FAIL guest names differing only by case were both accepted';
  exception when unique_violation then raise notice 'PASS unique (session_date, lower(guest_name))'; end;
end $$;

-- ---------------------------------------------------------------- schedule functions (privileged)
do $$
begin
  if public.rsvp_cutoff_at(date '2026-11-25') <> timestamptz '2026-11-25 23:00:00+00' then raise exception 'FAIL cutoff in winter'; end if;
  if public.rsvp_cutoff_at(date '2026-03-04') <> timestamptz '2026-03-04 23:00:00+00' then raise exception 'FAIL cutoff before spring DST'; end if;
  if public.rsvp_cutoff_at(date '2026-03-11') <> timestamptz '2026-03-11 22:00:00+00' then raise exception 'FAIL cutoff after spring DST'; end if;
  if public.rsvp_live_start(date '2026-11-25') <> timestamptz '2026-11-26 01:00:00+00' then raise exception 'FAIL live start'; end if;
  if public.rsvp_live_end(date '2026-11-25') <> timestamptz '2026-11-26 03:00:00+00' then raise exception 'FAIL live end'; end if;
  raise notice 'PASS cutoff and live window follow Toronto time across DST';

  if public.rsvp_session_date(timestamptz '2026-11-26 02:59:00+00') <> date '2026-11-25' then raise exception 'FAIL 9:59 PM Wednesday'; end if;
  if public.rsvp_session_date(timestamptz '2026-11-26 03:00:00+00') <> date '2026-12-02' then raise exception 'FAIL 10:00 PM Wednesday rolls over'; end if;
  if public.rsvp_session_date(timestamptz '2026-11-19 15:00:00+00') <> date '2026-11-25' then raise exception 'FAIL Thursday looks ahead'; end if;
  if public.rsvp_session_date(timestamptz '2026-03-08 07:00:00+00') <> date '2026-03-11' then raise exception 'FAIL DST Sunday'; end if;
  raise notice 'PASS session date matches the TypeScript rules';
end $$;

-- ---------------------------------------------------------------- anon: no direct table access
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

do $$
begin
  begin
    perform 1 from public.rsvps limit 1;
    raise exception 'FAIL anon can read the rsvps table';
  exception when insufficient_privilege then raise notice 'PASS anon cannot read rsvps directly'; end;

  begin
    insert into public.rsvps (session_date, guest_name, status) values ((select d from t_d), 'Direct Write', 'in');
    raise exception 'FAIL anon can insert into rsvps directly';
  exception when insufficient_privilege then raise notice 'PASS anon cannot write rsvps directly'; end;

  begin
    perform public.admin_convert_guest_rsvp(gen_random_uuid(), gen_random_uuid());
    raise exception 'FAIL anon can call the admin convert function';
  exception when insufficient_privilege then raise notice 'PASS anon cannot call admin_convert_guest_rsvp'; end;
end $$;

-- ---------------------------------------------------------------- anon: roster taps, token binding
do $$
declare
  dd date := (select d from t_d);
  pa uuid := (select id from t_p where name = 'pa');
  pc uuid := (select id from t_p where name = 'pc');
  pd uuid := (select id from t_p where name = 'pd');
  r jsonb;
begin
  r := public.set_rsvp(pa, null, 'token-pa-0000000001', 'in', dd);
  if r ->> 'status' <> 'in' then raise exception 'FAIL anon roster tap did not RSVP'; end if;
  raise notice 'PASS anon can RSVP by tapping an unclaimed player';

  begin
    perform public.set_rsvp(pa, null, 'token-xx-0000000002', 'out', dd);
    raise exception 'FAIL another device changed the RSVP';
  exception when sqlstate 'RV002' then raise notice 'PASS token mismatch: another device cannot change it'; end;

  r := public.set_rsvp(pa, null, 'token-pa-0000000001', 'out', dd);
  if r ->> 'status' <> 'out' then raise exception 'FAIL same device could not cancel'; end if;
  r := public.set_rsvp(pa, null, 'token-pa-0000000001', 'in', dd);
  if r ->> 'status' <> 'in' then raise exception 'FAIL same device could not rejoin'; end if;
  raise notice 'PASS the same device can cancel and rejoin';

  begin
    perform public.set_rsvp(pc, null, 'token-pc-0000000003', 'in', dd);
    raise exception 'FAIL a claimed name was accepted from an anonymous device';
  exception when sqlstate 'RV003' then raise notice 'PASS claimed name rejected server-side'; end;

  begin
    perform public.set_rsvp(pd, null, 'token-pd-0000000004', 'in', dd);
    raise exception 'FAIL an archived player was accepted';
  exception when sqlstate 'RV003' then raise notice 'PASS archived player rejected'; end;

  r := public.set_rsvp(pa, null, 'token-pa-0000000001', 'out', dd);
  r := public.set_rsvp(pa, null, 'token-pa-0000000001', 'in', dd);
end $$;

-- ---------------------------------------------------------------- anon: input checks, caps
do $$
declare
  dd date := (select d from t_d);
  pb uuid := (select id from t_p where name = 'pb');
  pa uuid := (select id from t_p where name = 'pa');
  pname text := (select name from public.players where id = (select id from t_p where name = 'pa'));
  h text; bad text; r jsonb;
begin
  begin perform public.set_rsvp(null, null, 'token-zz-0000000005', 'in', dd); raise exception 'FAIL neither player nor guest';
  exception when sqlstate 'RV008' then raise notice 'PASS neither player nor guest rejected'; end;
  begin perform public.set_rsvp(pb, 'Also Guest', 'token-zz-0000000005', 'in', dd); raise exception 'FAIL both player and guest';
  exception when sqlstate 'RV008' then raise notice 'PASS both player and guest rejected'; end;
  begin perform public.set_rsvp(pb, null, 'short', 'in', dd); raise exception 'FAIL short token accepted';
  exception when sqlstate 'RV008' then raise notice 'PASS a missing or short device token is rejected'; end;
  begin perform public.set_rsvp(pb, null, 'token-zz-0000000005', 'maybe', dd); raise exception 'FAIL bad status';
  exception when sqlstate 'RV008' then raise notice 'PASS bad status rejected'; end;
  begin perform public.set_rsvp(pb, null, 'token-zz-0000000005', 'in', dd + 7); raise exception 'FAIL a date beyond the window';
  exception when sqlstate 'RV007' then raise notice 'PASS a date more than a week ahead is rejected'; end;
  begin perform public.set_rsvp(pb, null, 'token-zz-0000000005', 'in', dd + 1); raise exception 'FAIL a non-Wednesday';
  exception when sqlstate 'RV007' then raise notice 'PASS a non-Wednesday is rejected'; end;

  -- guest names
  foreach bad in array array['', '   ', 'x', repeat('x', 41), E'Tab\tName' || chr(7)] loop
    begin
      perform public.set_rsvp(null, bad, 'token-gn-0000000006', 'in', dd);
      raise exception 'FAIL guest name % was accepted', quote_literal(bad);
    exception when sqlstate 'RV004' then null; end;
  end loop;
  raise notice 'PASS blank, short, long and control-character guest names rejected';

  begin
    perform public.set_rsvp(null, upper(pname), 'token-gn-0000000006', 'in', dd);
    raise exception 'FAIL a guest named like an existing player was accepted';
  exception when sqlstate 'RV005' then
    get stacked diagnostics h = pg_exception_hint;
    if h is null or h not like '%' || pname || '%' then raise exception 'FAIL no "did you mean" hint: %', h; end if;
    raise notice 'PASS guest matching a player is rejected with a "did you mean" hint';
  end;

  r := public.set_rsvp(null, E'  Zed \t  Guest  ', 'token-zg-0000000007', 'in', dd);
  if r ->> 'status' <> 'in' then raise exception 'FAIL guest RSVP'; end if;
  if not exists (select 1 from public.get_rsvp_roster(dd) x where x.is_guest and x.name = 'Zed Guest') then
    raise exception 'FAIL guest name was not trimmed and collapsed';
  end if;
  raise notice 'PASS guest names are trimmed and whitespace-collapsed';

  begin
    perform public.set_rsvp(null, 'zed GUEST', 'token-other-000000008', 'out', dd);
    raise exception 'FAIL another device changed a guest';
  exception when sqlstate 'RV002' then raise notice 'PASS a guest name belongs to the device that made it'; end;

  perform public.set_rsvp(null, 'Gus Guest', 'token-gg-0000000009', 'in', dd);

  -- per-device cap: 3 rows per device per session
  perform public.set_rsvp((select id from t_p where name = 'k1'), null, 'token-cap-00000000010', 'in', dd);
  perform public.set_rsvp((select id from t_p where name = 'k2'), null, 'token-cap-00000000010', 'in', dd);
  perform public.set_rsvp((select id from t_p where name = 'k3'), null, 'token-cap-00000000010', 'in', dd);
  begin
    perform public.set_rsvp((select id from t_p where name = 'k4'), null, 'token-cap-00000000010', 'in', dd);
    raise exception 'FAIL a fourth RSVP from one device was accepted';
  exception when sqlstate 'RV006' then raise notice 'PASS per-device cap'; end;

  -- cancelling something that never existed creates nothing
  r := public.set_rsvp(pb, null, 'token-zz-0000000005', 'out', dd);
  if r ->> 'status' is not null or exists (select 1 from public.get_rsvp_roster(dd) x where x.player_id = pb) then
    raise exception 'FAIL cancelling a non-existent RSVP created a row';
  end if;
  raise notice 'PASS cancelling a non-existent RSVP is a no-op';
end $$;

-- ---------------------------------------------------------------- cutoff freeze (non-admin)
do $$
declare pdate date := (select past from t_d);
  pb uuid := (select id from t_p where name = 'pb'); pa uuid := (select id from t_p where name = 'pa');
begin
  begin perform public.set_rsvp(pb, null, 'token-pb-00000000011', 'in', pdate); raise exception 'FAIL insert after cutoff';
  exception when sqlstate 'RV001' then raise notice 'PASS cutoff freezes new RSVPs'; end;
  begin perform public.set_rsvp(null, 'Late Guest', 'token-pb-00000000011', 'in', pdate); raise exception 'FAIL guest insert after cutoff';
  exception when sqlstate 'RV001' then raise notice 'PASS cutoff freezes new guests'; end;
  begin perform public.set_rsvp(pa, null, 'frozen-token-0000000001', 'out', pdate); raise exception 'FAIL cancel after cutoff';
  exception when sqlstate 'RV001' then raise notice 'PASS cutoff freezes cancellations, even from the right device'; end;
  if (select status from public.get_rsvp_roster(pdate) x where x.player_id = pa) <> 'in' then
    raise exception 'FAIL a frozen RSVP changed';
  end if;
  if (select my_status from public.get_rsvp_state(pdate, 'frozen-token-0000000001')) <> 'in' then
    raise exception 'FAIL state does not show the frozen RSVP';
  end if;
end $$;

-- ---------------------------------------------------------------- full -> waitlist -> promotion
do $$
declare
  dd date := (select d from t_d);
  cap integer; base integer; need integer; i integer; st record; r jsonb; tok text;
  bulk uuid[] := array(select id from t_b order by n);
begin
  select s.capacity, s.in_count + s.waitlist_count into cap, base from public.get_rsvp_state(dd, null) s;
  if base >= cap then raise exception 'Precondition: the session already has % RSVPs; run on an empty database', base; end if;
  need := cap - base;

  -- Fill every remaining place, then two more people.
  for i in 1 .. need + 2 loop
    r := public.set_rsvp(bulk[i], null, 'bulk-token-' || lpad(i::text, 8, '0'), 'in', dd);
    if i <= need and (r ->> 'waitlist_position') is not null then raise exception 'FAIL person % was waitlisted too early', i; end if;
  end loop;
  select * into st from public.get_rsvp_state(dd, 'bulk-token-' || lpad((need + 1)::text, 8, '0'));
  if st.in_count <> cap or st.waitlist_count <> 2 then raise exception 'FAIL counts after filling: in %, waitlist %', st.in_count, st.waitlist_count; end if;
  if st.my_position <> cap + 1 then raise exception 'FAIL first extra player is at position %', st.my_position; end if;
  select * into st from public.get_rsvp_state(dd, 'bulk-token-' || lpad((need + 2)::text, 8, '0'));
  if st.my_position <> cap + 2 then raise exception 'FAIL second extra player is at position %', st.my_position; end if;
  raise notice 'PASS full: players past capacity are waitlisted in order (in %, waitlist %)', cap, 2;

  -- Player 1 (confirmed) cancels: the first waitlisted player moves up with no action from anyone.
  r := public.set_rsvp(bulk[1], null, 'bulk-token-00000001', 'out', dd);
  select * into st from public.get_rsvp_state(dd, 'bulk-token-' || lpad((need + 1)::text, 8, '0'));
  if st.my_position <> cap then raise exception 'FAIL waitlist #1 was not promoted (position %)', st.my_position; end if;
  select * into st from public.get_rsvp_state(dd, 'bulk-token-' || lpad((need + 2)::text, 8, '0'));
  if st.my_position <> cap + 1 or st.waitlist_count <> 1 or st.in_count <> cap then
    raise exception 'FAIL waitlist did not shift: position %, waitlist %', st.my_position, st.waitlist_count;
  end if;
  raise notice 'PASS cancel promotes the first waitlisted player automatically';

  -- Rejoining goes to the back of the line, not back to the old place.
  r := public.set_rsvp(bulk[1], null, 'bulk-token-00000001', 'in', dd);
  if (r ->> 'position')::integer <> cap + 2 or (r ->> 'waitlist_position')::integer <> 2 then
    raise exception 'FAIL a rejoining player kept their old place: %', r;
  end if;
  raise notice 'PASS cancel and rejoin goes to the back of the queue';
end $$;

-- ---------------------------------------------------------------- roster exposes no private fields
do $$
declare dd date := (select d from t_d); k text;
begin
  for k in select distinct jsonb_object_keys(to_jsonb(x)) from public.get_rsvp_roster(dd) x loop
    if k not in ('rsvp_id', 'name', 'avatar_url', 'player_id', 'is_guest', 'status', 'position') then
      raise exception 'FAIL roster exposes %', k;
    end if;
  end loop;
  raise notice 'PASS the roster exposes only name, photo, player, guest flag, status and position';
end $$;

-- ---------------------------------------------------------------- alice: signed in, claimed player
reset role;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', (select id from t_u where name = 'alice'), 'role', 'authenticated')::text, true);

do $$
declare
  dd date := (select d from t_d);
  pa uuid := (select id from t_p where name = 'pa');
  pc uuid := (select id from t_p where name = 'pc');
  r jsonb; st record;
begin
  r := public.set_rsvp(null, null, null, 'in', dd);   -- "me", no token needed
  if r ->> 'status' <> 'in' then raise exception 'FAIL claimed user could not RSVP as themselves'; end if;
  if not exists (select 1 from public.get_rsvp_roster(dd) x where x.player_id = pc and x.status = 'in') then
    raise exception 'FAIL the claimed player is not on the roster';
  end if;
  select * into st from public.get_rsvp_state(dd, null);
  if st.my_status <> 'in' then raise exception 'FAIL state does not know the claimed user is in'; end if;
  raise notice 'PASS a claimed user RSVPs as their own player without a token';

  begin perform public.set_rsvp(pa, null, 'token-al-00000000012', 'in', dd); raise exception 'FAIL claimed user RSVP''d as someone else';
  exception when sqlstate '42501' then raise notice 'PASS a claimed user cannot RSVP as another player'; end;
  begin perform public.set_rsvp(null, 'Alice Friend', 'token-al-00000000012', 'in', dd); raise exception 'FAIL claimed user added a guest';
  exception when sqlstate '42501' then raise notice 'PASS a claimed user cannot add guests'; end;
  begin perform public.set_rsvp(null, null, null, 'out', (select past from t_d)); raise exception 'FAIL claimed user changed a closed session';
  exception when sqlstate 'RV001' then raise notice 'PASS cutoff applies to signed-in users too'; end;
  begin perform public.admin_convert_guest_rsvp(gen_random_uuid(), pa); raise exception 'FAIL non-admin converted a guest';
  exception when sqlstate '42501' then raise notice 'PASS only admins can convert guest RSVPs'; end;
end $$;

-- ---------------------------------------------------------------- admin: bypass and conversion
reset role;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', (select id from t_u where name = 'adm'), 'role', 'authenticated')::text, true);

do $$
declare
  dd date := (select d from t_d); pdate date := (select past from t_d);
  pa uuid := (select id from t_p where name = 'pa');
  pc uuid := (select id from t_p where name = 'pc');
  pg uuid := (select id from t_p where name = 'pg');
  r jsonb; guest_id uuid; before_pos integer; after_pos integer;
begin
  r := public.set_rsvp(pa, null, null, 'out', pdate);
  if r ->> 'status' <> 'out' then raise exception 'FAIL admin could not change a closed session'; end if;
  raise notice 'PASS admins bypass the cutoff (and need no device token)';

  r := public.set_rsvp(pc, null, null, 'out', dd);
  r := public.set_rsvp(pc, null, null, 'in', dd);
  if r ->> 'status' <> 'in' then raise exception 'FAIL admin could not RSVP for a claimed player'; end if;
  raise notice 'PASS admins can RSVP for claimed players';

  select x.rsvp_id, x."position" into guest_id, before_pos from public.get_rsvp_roster(dd) x where x.is_guest and x.name = 'Zed Guest';
  perform public.admin_convert_guest_rsvp(guest_id, pg);
  select x."position" into after_pos from public.get_rsvp_roster(dd) x where x.rsvp_id = guest_id and x.player_id = pg and not x.is_guest;
  if after_pos is distinct from before_pos then raise exception 'FAIL conversion moved the RSVP: % -> %', before_pos, after_pos; end if;
  raise notice 'PASS converting a guest to a player keeps their place in line';

  select x.rsvp_id into guest_id from public.get_rsvp_roster(dd) x where x.is_guest and x.name = 'Gus Guest';
  begin perform public.admin_convert_guest_rsvp(guest_id, pa); raise exception 'FAIL converted onto a player already in';
  exception when sqlstate '55000' then raise notice 'PASS cannot convert onto a player who is already in'; end;
  begin perform public.admin_convert_guest_rsvp(gen_random_uuid(), pa); raise exception 'FAIL unknown rsvp';
  exception when sqlstate 'P0002' then raise notice 'PASS unknown RSVP id is reported'; end;
end $$;

-- ---------------------------------------------------------------- a claim keeps existing RSVPs valid
reset role;
insert into t_r (k, id)
select 'req', gen_random_uuid();
insert into public.player_claim_requests (id, player_id, user_id)
select (select id from t_r where k = 'req'), (select id from t_p where name = 'pe'), (select id from t_u where name = 'carol');

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
do $$
declare dd date := (select d from t_d); pe uuid := (select id from t_p where name = 'pe'); st record;
begin
  perform public.set_rsvp(pe, null, 'token-pe-00000000013', 'in', dd);
  select * into st from public.get_rsvp_state(dd, 'token-pe-00000000013');
  insert into t_x values ('pe_pos', st.my_position);
end $$;

reset role;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', (select id from t_u where name = 'adm'), 'role', 'authenticated')::text, true);
select public.approve_claim_request((select id from t_r where k = 'req'));

reset role;
do $$
declare dd date := (select d from t_d); pe uuid := (select id from t_p where name = 'pe'); x public.rsvps%rowtype;
begin
  select * into x from public.rsvps where session_date = dd and player_id = pe;
  if not found or x.status <> 'in' then raise exception 'FAIL the RSVP did not survive the claim'; end if;
  if x.user_id is distinct from (select id from t_u where name = 'carol') then raise exception 'FAIL the RSVP was not handed to the new owner'; end if;
  raise notice 'PASS approving a claim keeps the RSVP and hands it to the new owner';
end $$;

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
do $$
declare dd date := (select d from t_d); pe uuid := (select id from t_p where name = 'pe');
begin
  begin perform public.set_rsvp(pe, null, 'token-pe-00000000013', 'out', dd); raise exception 'FAIL the old device changed a now-claimed RSVP';
  exception when sqlstate 'RV003' then raise notice 'PASS after a claim the old device is refused'; end;
end $$;

reset role;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', (select id from t_u where name = 'carol'), 'role', 'authenticated')::text, true);
do $$
declare dd date := (select d from t_d); st record; r jsonb;
begin
  select * into st from public.get_rsvp_state(dd, null);
  if st.my_status <> 'in' or st.my_position is distinct from (select v from t_x where k = 'pe_pos') then
    raise exception 'FAIL the new owner does not see the same RSVP and place: %, %', st.my_status, st.my_position;
  end if;
  r := public.set_rsvp(null, null, null, 'out', dd);
  if r ->> 'status' <> 'out' then raise exception 'FAIL the new owner could not cancel'; end if;
  raise notice 'PASS the new owner sees the same place and can manage it';
end $$;

-- ---------------------------------------------------------------- guest cap
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
do $$
declare dd date := (select d from t_d); g integer; i integer;
begin
  select count(*) into g from public.get_rsvp_roster(dd) x where x.is_guest and x.status = 'in';
  for i in 1 .. greatest(8 - g, 0) loop
    perform public.set_rsvp(null, 'Cap Guest ' || i, 'cap-guest-token-' || lpad(i::text, 6, '0'), 'in', dd);
  end loop;
  begin
    perform public.set_rsvp(null, 'One Guest Too Many', 'cap-guest-token-999999', 'in', dd);
    raise exception 'FAIL the guest cap was exceeded';
  exception when sqlstate 'RV006' then raise notice 'PASS guest cap'; end;
end $$;

reset role;
do $$ begin raise notice 'ALL RSVP CHECKS PASSED (rolling back)'; end $$;
rollback;
