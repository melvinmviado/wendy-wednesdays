-- Tests for supabase/migrations/20261204000000_rsvp_abuse_limits.sql. Run in the Supabase SQL Editor
-- AFTER applying every migration. One transaction, ROLLED BACK at the end: no fixtures survive.
-- Each check raises an exception on failure; "PASS ..." notices show in the Messages tab.
-- Personas are impersonated with set local role + request.jwt.claims (+ request.headers for the
-- client IP), like PostgREST does.
--
-- Uses the next open Wednesday and counts relative to existing RSVPs, so it is safe on a database
-- with real data; it adds about a dozen RSVPs for that Wednesday inside the rolled-back transaction.

begin;

-- Fixtures (SQL editor's privileged role) ----------------------------------------------
create temp table t_s as select 'ab-' || substr(gen_random_uuid()::text, 1, 8) as suffix;
create temp table t_u (name text primary key, id uuid not null default gen_random_uuid());
create temp table t_p (name text primary key, id uuid not null default gen_random_uuid());
create temp table t_b (n integer primary key, id uuid not null default gen_random_uuid());
create temp table t_d as
  with x as (
    select (now() at time zone 'America/Toronto')::date as today,
           extract(dow from (now() at time zone 'America/Toronto'))::integer as dow
  )
  select today + coalesce(nullif((3 - dow + 7) % 7, 0), 7) as d from x;
grant select on t_s, t_u, t_p, t_b, t_d to anon, authenticated;

insert into t_u (name) values ('alice'), ('bob'), ('carol'), ('adm');
insert into t_p (name) values ('owned'), ('added'), ('pe'), ('pg');
insert into t_b (n) select g from generate_series(1, 12) g;

insert into auth.users (id, aud, role, email)
select id, 'authenticated', 'authenticated', name || '-' || (select suffix from t_s) || '@test.local' from t_u;
update public.profiles set role = 'admin' where id = (select id from t_u where name = 'adm');

insert into public.players (id, name) select id, 'T ' || name || ' ' || (select suffix from t_s) from t_p;
insert into public.players (id, name) select id, 'T bulk ' || n || ' ' || (select suffix from t_s) from t_b;
update public.players set user_id = (select id from t_u where name = 'alice') where id = (select id from t_p where name = 'owned');

-- A spot an admin added for 'added' (no device token), as admin_add_rsvp writes it.
insert into public.rsvps (session_date, player_id, status, added_by)
values ((select d from t_d), (select id from t_p where name = 'added'), 'in', (select id from t_u where name = 'adm'));

-- Bob was refused 'pe' yesterday.
insert into public.player_claim_requests (player_id, user_id, status, resolved_at)
values ((select id from t_p where name = 'pe'), (select id from t_u where name = 'bob'), 'rejected', now() - interval '1 day');

-- ---------------------------------------------------------------- anonymous visitor, network A
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select set_config('request.headers', '{"cf-connecting-ip":"203.0.113.5"}', true);

do $$
declare dd date := (select d from t_d); i integer; cap integer := 8;
begin
  -- An admin-added spot cannot be taken over or cancelled anonymously
  begin
    perform public.set_rsvp((select id from t_p where name = 'added'), null, 'takeover-token-00000001', 'out', dd);
    raise exception 'FAIL an anonymous caller cancelled a spot an admin added';
  exception when sqlstate 'RV011' then raise notice 'PASS admin-added spot is protected (RV011)'; end;

  -- Fresh device tokens no longer get around the cap: 8 from one network, the 9th is refused
  for i in 1..cap loop
    perform public.set_rsvp((select id from t_b where n = i), null, 'fresh-token-' || lpad(i::text, 12, '0'), 'in', dd);
  end loop;
  raise notice 'PASS % RSVPs from one network with fresh tokens are allowed', cap;

  begin
    perform public.set_rsvp((select id from t_b where n = cap + 1), null, 'fresh-token-' || lpad((cap + 1)::text, 12, '0'), 'in', dd);
    raise exception 'FAIL RSVP number % from one network was accepted', cap + 1;
  exception when sqlstate 'RV012' then raise notice 'PASS the next one from that network is refused (RV012)'; end;

  -- Cancelling and re-joining an existing spot is not a new RSVP, so it is never capped
  perform public.set_rsvp((select id from t_b where n = 1), null, 'fresh-token-' || lpad('1', 12, '0'), 'out', dd);
  perform public.set_rsvp((select id from t_b where n = 1), null, 'fresh-token-' || lpad('1', 12, '0'), 'in', dd);
  raise notice 'PASS changing an existing spot is not capped';
end $$;

-- ---------------------------------------------------------------- network B is unaffected
select set_config('request.headers', '{"cf-connecting-ip":"198.51.100.7"}', true);
do $$
begin
  perform public.set_rsvp((select id from t_b where n = 10), null, 'other-network-token-01', 'in', (select d from t_d));
  raise notice 'PASS another network can still RSVP';
end $$;

-- ---------------------------------------------------------------- no header (local dev): no IP cap
select set_config('request.headers', '', true);
do $$
begin
  perform public.set_rsvp((select id from t_b where n = 11), null, 'no-header-token-000001', 'in', (select d from t_d));
  raise notice 'PASS no cf-connecting-ip header means no IP cap';
end $$;

-- ---------------------------------------------------------------- signed-in owner on network A
reset role;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', (select id from t_u where name = 'alice'), 'role', 'authenticated')::text, true);
select set_config('request.headers', '{"cf-connecting-ip":"203.0.113.5"}', true);
do $$
begin
  perform public.set_rsvp(null, null, null, 'in', (select d from t_d));
  raise notice 'PASS a signed-in player is not counted against the network cap';
end $$;

-- ---------------------------------------------------------------- admin can still change the added spot
select set_config('request.jwt.claims', json_build_object('sub', (select id from t_u where name = 'adm'), 'role', 'authenticated')::text, true);
do $$
begin
  perform public.set_rsvp((select id from t_p where name = 'added'), null, null, 'out', (select d from t_d));
  raise notice 'PASS admins can still change a spot they added';
end $$;

-- ---------------------------------------------------------------- storage of the IP (privileged)
reset role;
do $$
declare n integer; bad integer; ip_text integer;
begin
  select count(*) into n from public.rsvps r join t_b b on b.id = r.player_id where r.client_ip_hash is not null;
  if n < 8 then raise exception 'FAIL expected the network RSVPs to carry an IP hash, found %', n; end if;
  select count(*) into ip_text from public.rsvps where client_ip_hash like '%203.0.113.5%';
  if ip_text <> 0 then raise exception 'FAIL a raw IP was stored'; end if;
  select count(*) into bad from public.rsvps r
   where r.player_id = (select id from t_p where name = 'owned') and r.client_ip_hash is not null;
  if bad <> 0 then raise exception 'FAIL a signed-in player''s RSVP stored an IP hash'; end if;
  select count(*) into bad from public.rsvps r
   where r.player_id = (select id from t_p where name = 'added') and r.added_by is distinct from (select id from t_u where name = 'adm');
  if bad <> 0 then raise exception 'FAIL an admin change through set_rsvp lost added_by'; end if;
  raise notice 'PASS only a salted hash is stored, and only for anonymous RSVPs';
end $$;

-- ---------------------------------------------------------------- claim requests
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', (select id from t_u where name = 'bob'), 'role', 'authenticated')::text, true);
do $$
begin
  begin
    insert into public.player_claim_requests (player_id, user_id) values ((select id from t_p where name = 'pe'), (select id from t_u where name = 'bob'));
    raise exception 'FAIL bob asked for pe again one day after a rejection';
  exception when sqlstate 'CL001' then raise notice 'PASS 7-day wait after a rejection (CL001)'; end;

  insert into public.player_claim_requests (player_id, user_id) values ((select id from t_p where name = 'pg'), (select id from t_u where name = 'bob'));
  raise notice 'PASS bob can ask for a different player';
end $$;

select set_config('request.jwt.claims', json_build_object('sub', (select id from t_u where name = 'carol'), 'role', 'authenticated')::text, true);
do $$
begin
  insert into public.player_claim_requests (player_id, user_id) values ((select id from t_p where name = 'pg'), (select id from t_u where name = 'carol'));
  raise notice 'PASS a second person can ask for a player who already has a pending request';
  begin
    insert into public.player_claim_requests (player_id, user_id) values ((select id from t_p where name = 'pe'), (select id from t_u where name = 'carol'));
    raise exception 'FAIL carol has two pending requests';
  exception when unique_violation then raise notice 'PASS still one pending request per user'; end;
end $$;

-- Approving one request for pg rejects the other
reset role;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', (select id from t_u where name = 'adm'), 'role', 'authenticated')::text, true);
do $$
declare pending integer;
begin
  perform public.approve_claim_request((select id from public.player_claim_requests
                                         where player_id = (select id from t_p where name = 'pg')
                                           and user_id = (select id from t_u where name = 'carol')));
  select count(*) into pending from public.player_claim_requests
   where player_id = (select id from t_p where name = 'pg') and status = 'pending';
  if pending <> 0 then raise exception 'FAIL % requests for pg still pending after approval', pending; end if;
  raise notice 'PASS approving one request resolves the others for that player';
end $$;

reset role;
rollback;  -- discard every fixture and change
