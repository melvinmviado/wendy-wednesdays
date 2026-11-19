-- Tests for player claims. Run in the Supabase SQL Editor AFTER applying, in order:
--   20261118000000_profiles_foundation.sql
--   20261119000000_player_admin.sql
--   20261120000000_player_claims.sql
-- One transaction, ROLLED BACK at the end: no fixtures survive. Each check raises an
-- exception on failure; "PASS ..." notices show in the Messages tab.
-- Personas are impersonated with set local role + request.jwt.claims, like PostgREST does.

begin;

-- Fixtures (SQL editor's privileged role) ----------------------------------------------
create temp table t_s as select 'cl-' || substr(gen_random_uuid()::text, 1, 8) as suffix;
create temp table t_u (name text primary key, id uuid not null default gen_random_uuid());
create temp table t_p (name text primary key, id uuid not null default gen_random_uuid());
grant select on t_s, t_u, t_p to anon, authenticated;

insert into t_u (name) values
  ('alice'), ('bob'), ('carol'), ('adm'), ('erin'), ('frank'), ('gina'),
  ('hank'), ('ivan'), ('jon'), ('kim'), ('dave');
insert into t_p (name) values
  ('p1'), ('p2'), ('p3'), ('p4'), ('p5'), ('p6'), ('p7'), ('p8'), ('p9'), ('pd');

insert into auth.users (id, aud, role, email)
select id, 'authenticated', 'authenticated', name || '-' || (select suffix from t_s) || '@test.local'
from t_u;
update public.profiles set role = 'admin' where id = (select id from t_u where name = 'adm');

insert into public.players (id, name)
select id, 'T ' || name || ' ' || (select suffix from t_s) from t_p;
update public.players set archived_at = now() where id = (select id from t_p where name = 'p3');
update public.players set user_id = (select id from t_u where name = 'carol')
 where id = (select id from t_p where name = 'p4');

-- ---------------------------------------------------------------- schema rules (privileged)
do $$
begin
  begin
    update public.players set user_id = (select id from t_u where name = 'carol')
     where id = (select id from t_p where name = 'p1');
    raise exception 'FAIL one user claimed two players';
  exception when unique_violation then
    raise notice 'PASS unique index: a user can claim at most one player';
  end;

  begin
    insert into public.player_claim_requests (player_id, user_id, status, resolved_at)
    values ((select id from t_p where name = 'p1'), (select id from t_u where name = 'jon'), 'pending', now());
    raise exception 'FAIL pending request with resolved_at was accepted';
  exception when check_violation then
    raise notice 'PASS a request is resolved exactly when it is not pending';
  end;
end $$;

-- ---------------------------------------------------------------- alice (normal user): RLS
reset role;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', (select id from t_u where name = 'alice'), 'role', 'authenticated')::text, true);

do $$
declare n int;
begin
  insert into public.player_claim_requests (player_id, user_id, message)
  values ((select id from t_p where name = 'p1'), (select id from t_u where name = 'alice'), 'That is me');
  raise notice 'PASS user can request an unclaimed player for themselves';

  begin
    insert into public.player_claim_requests (player_id, user_id)
    values ((select id from t_p where name = 'p2'), (select id from t_u where name = 'bob'));
    raise exception 'FAIL user inserted a request on behalf of someone else';
  exception when insufficient_privilege then
    raise notice 'PASS cannot request on behalf of another user';
  end;

  begin
    insert into public.player_claim_requests (player_id, user_id)
    values ((select id from t_p where name = 'p2'), (select id from t_u where name = 'alice'));
    raise exception 'FAIL second pending request by the same user';
  exception when unique_violation then
    raise notice 'PASS one pending request per user';
  end;

  begin
    insert into public.player_claim_requests (player_id, user_id, status)
    values ((select id from t_p where name = 'p2'), (select id from t_u where name = 'alice'), 'approved');
    raise exception 'FAIL user inserted an approved request';
  exception when insufficient_privilege then
    raise notice 'PASS user cannot set status on insert (column grant)';
  end;

  select count(*) into n from public.player_claim_requests;
  if n <> 1 then raise exception 'FAIL alice sees % requests, expected 1', n; end if;
  raise notice 'PASS user sees only their own requests';

  update public.player_claim_requests set status = 'approved';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL user updated % request rows', n; end if;
  raise notice 'PASS user cannot update requests (no self-approval)';

  begin
    delete from public.player_claim_requests;
    raise exception 'FAIL user deleted requests';
  exception when insufficient_privilege then
    raise notice 'PASS user cannot delete requests';
  end;

  update public.players set name = 'Hacked' where id = (select id from t_p where name = 'p1');
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL non-admin updated % players', n; end if;
  update public.players set user_id = (select id from t_u where name = 'alice')
   where id = (select id from t_p where name = 'p2');
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL non-admin self-linked a player'; end if;
  raise notice 'PASS non-admin cannot update players or set user_id';

  begin
    insert into public.players (name, user_id)
    values ('Sneaky ' || (select suffix from t_s), (select id from t_u where name = 'alice'));
    raise exception 'FAIL non-admin inserted a player';
  exception when insufficient_privilege then
    raise notice 'PASS non-admin cannot insert players (with or without user_id)';
  end;
end $$;

-- ---------------------------------------------------------------- other users: insert rules
reset role;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', (select id from t_u where name = 'bob'), 'role', 'authenticated')::text, true);

do $$
begin
  begin
    insert into public.player_claim_requests (player_id, user_id)
    values ((select id from t_p where name = 'p1'), (select id from t_u where name = 'bob'));
    raise exception 'FAIL second pending request for the same player';
  exception when unique_violation then
    raise notice 'PASS one pending request per player';
  end;

  begin
    insert into public.player_claim_requests (player_id, user_id)
    values ((select id from t_p where name = 'p3'), (select id from t_u where name = 'bob'));
    raise exception 'FAIL requested an archived player';
  exception when insufficient_privilege then
    raise notice 'PASS cannot request an archived player';
  end;

  begin
    insert into public.player_claim_requests (player_id, user_id)
    values ((select id from t_p where name = 'p4'), (select id from t_u where name = 'bob'));
    raise exception 'FAIL requested an already-claimed player';
  exception when insufficient_privilege then
    raise notice 'PASS cannot request a claimed player';
  end;
end $$;

-- Anonymous-provider session (is_anonymous claim): must not be able to request.
select set_config('request.jwt.claims', json_build_object('sub', (select id from t_u where name = 'bob'), 'role', 'authenticated', 'is_anonymous', true)::text, true);
do $$
begin
  begin
    insert into public.player_claim_requests (player_id, user_id)
    values ((select id from t_p where name = 'p2'), (select id from t_u where name = 'bob'));
    raise exception 'FAIL anonymous-provider user created a request';
  exception when insufficient_privilege then
    raise notice 'PASS anonymous sign-in users cannot request';
  end;
end $$;

-- Legit requests used by the admin tests below (bob->p2, frank->p6, gina->p5, hank->p8).
select set_config('request.jwt.claims', json_build_object('sub', (select id from t_u where name = 'bob'), 'role', 'authenticated')::text, true);
insert into public.player_claim_requests (player_id, user_id) values ((select id from t_p where name = 'p2'), (select id from t_u where name = 'bob'));
select set_config('request.jwt.claims', json_build_object('sub', (select id from t_u where name = 'frank'), 'role', 'authenticated')::text, true);
insert into public.player_claim_requests (player_id, user_id) values ((select id from t_p where name = 'p6'), (select id from t_u where name = 'frank'));
select set_config('request.jwt.claims', json_build_object('sub', (select id from t_u where name = 'gina'), 'role', 'authenticated')::text, true);
insert into public.player_claim_requests (player_id, user_id) values ((select id from t_p where name = 'p5'), (select id from t_u where name = 'gina'));

select set_config('request.jwt.claims', json_build_object('sub', (select id from t_u where name = 'hank'), 'role', 'authenticated')::text, true);
do $$
begin
  begin
    insert into public.player_claim_requests (player_id, user_id, message)
    values ((select id from t_p where name = 'p8'), (select id from t_u where name = 'hank'), repeat('x', 501));
    raise exception 'FAIL 501-character message accepted';
  exception when check_violation then
    raise notice 'PASS message length capped at 500';
  end;
end $$;
insert into public.player_claim_requests (player_id, user_id) values ((select id from t_p where name = 'p8'), (select id from t_u where name = 'hank'));

select set_config('request.jwt.claims', json_build_object('sub', (select id from t_u where name = 'carol'), 'role', 'authenticated')::text, true);
do $$
begin
  begin
    insert into public.player_claim_requests (player_id, user_id)
    values ((select id from t_p where name = 'p2'), (select id from t_u where name = 'carol'));
    raise exception 'FAIL user who already has a player requested another';
  exception when insufficient_privilege then
    raise notice 'PASS a user with a claimed player cannot request another';
  end;
end $$;

-- ---------------------------------------------------------------- anonymous visitor
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
do $$
begin
  begin
    perform 1 from public.player_claim_requests limit 1;
    raise exception 'FAIL anon can read requests';
  exception when insufficient_privilege then
    raise notice 'PASS anon cannot read requests';
  end;
  begin
    insert into public.player_claim_requests (player_id, user_id)
    values ((select id from t_p where name = 'p2'), gen_random_uuid());
    raise exception 'FAIL anon inserted a request';
  exception when insufficient_privilege then
    raise notice 'PASS anon cannot insert requests';
  end;
  begin
    perform public.approve_claim_request(gen_random_uuid());
    raise exception 'FAIL anon can execute approve_claim_request';
  exception when insufficient_privilege then
    raise notice 'PASS anon cannot execute the RPCs';
  end;
end $$;

-- ---------------------------------------------------------------- non-admin calls the RPCs
reset role;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', (select id from t_u where name = 'alice'), 'role', 'authenticated')::text, true);
do $$
declare rid uuid;
begin
  select id into rid from public.player_claim_requests where user_id = (select id from t_u where name = 'alice');
  begin perform public.approve_claim_request(rid); raise exception 'FAIL non-admin approved';
  exception when insufficient_privilege then raise notice 'PASS non-admin cannot approve'; end;
  begin perform public.reject_claim_request(rid); raise exception 'FAIL non-admin rejected';
  exception when insufficient_privilege then raise notice 'PASS non-admin cannot reject'; end;
  begin perform public.unlink_player((select id from t_p where name = 'p4')); raise exception 'FAIL non-admin unlinked';
  exception when insufficient_privilege then raise notice 'PASS non-admin cannot unlink'; end;
end $$;

-- ---------------------------------------------------------------- admin
reset role;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', (select id from t_u where name = 'adm'), 'role', 'authenticated')::text, true);

do $$
declare n int; rid uuid; r public.player_claim_requests%rowtype; uid uuid;
begin
  select count(*) into n from public.player_claim_requests;
  if n < 5 then raise exception 'FAIL admin sees only % requests', n; end if;
  raise notice 'PASS admin can read all requests';

  -- approve
  select id into rid from public.player_claim_requests where user_id = (select id from t_u where name = 'alice');
  perform public.approve_claim_request(rid);
  select user_id into uid from public.players where id = (select id from t_p where name = 'p1');
  if uid is distinct from (select id from t_u where name = 'alice') then raise exception 'FAIL approve did not link the player'; end if;
  select * into r from public.player_claim_requests where id = rid;
  if r.status <> 'approved' or r.resolved_by is distinct from (select id from t_u where name = 'adm') or r.resolved_at is null then
    raise exception 'FAIL approve did not stamp the request: %', row_to_json(r);
  end if;
  raise notice 'PASS admin approve links the player and stamps the request';

  begin perform public.approve_claim_request(rid); raise exception 'FAIL approved twice';
  exception when object_not_in_prerequisite_state then raise notice 'PASS cannot approve an already-resolved request'; end;
  begin perform public.reject_claim_request(rid); raise exception 'FAIL rejected a resolved request';
  exception when object_not_in_prerequisite_state then raise notice 'PASS cannot reject an already-resolved request'; end;
  begin perform public.approve_claim_request(gen_random_uuid()); raise exception 'FAIL approved a missing request';
  exception when no_data_found then raise notice 'PASS unknown request id is reported'; end;
end $$;

-- Alice now has a player, so she cannot request another.
select set_config('request.jwt.claims', json_build_object('sub', (select id from t_u where name = 'alice'), 'role', 'authenticated')::text, true);
do $$
begin
  begin
    insert into public.player_claim_requests (player_id, user_id)
    values ((select id from t_p where name = 'p9'), (select id from t_u where name = 'alice'));
    raise exception 'FAIL alice requested a second player after approval';
  exception when insufficient_privilege then
    raise notice 'PASS after approval the user cannot request another player';
  end;
end $$;

-- Re-checks at approval time. State changes below happen "behind the request's back".
reset role;
-- S1: bob asked for p2, but erin got p2 meanwhile.
update public.players set user_id = (select id from t_u where name = 'erin') where id = (select id from t_p where name = 'p2');
-- S2: frank asked for p6, but frank got p7 meanwhile.
update public.players set user_id = (select id from t_u where name = 'frank') where id = (select id from t_p where name = 'p7');
-- S3: gina asked for p5, but p5 was archived meanwhile.
update public.players set archived_at = now() where id = (select id from t_p where name = 'p5');

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', (select id from t_u where name = 'adm'), 'role', 'authenticated')::text, true);
do $$
declare st text;
begin
  begin perform public.approve_claim_request((select id from public.player_claim_requests where user_id = (select id from t_u where name = 'bob')));
    raise exception 'FAIL approved a player claimed in the meantime';
  exception when object_not_in_prerequisite_state then raise notice 'PASS approve re-checks: player already claimed'; end;

  begin perform public.approve_claim_request((select id from public.player_claim_requests where user_id = (select id from t_u where name = 'frank')));
    raise exception 'FAIL approved for a user who already has a player';
  exception when object_not_in_prerequisite_state then raise notice 'PASS approve re-checks: user already has a player'; end;

  begin perform public.approve_claim_request((select id from public.player_claim_requests where user_id = (select id from t_u where name = 'gina')));
    raise exception 'FAIL approved an archived player';
  exception when object_not_in_prerequisite_state then raise notice 'PASS approve re-checks: player archived'; end;

  select status into st from public.player_claim_requests where user_id = (select id from t_u where name = 'bob');
  if st <> 'pending' then raise exception 'FAIL failed approval changed the request to %', st; end if;
  raise notice 'PASS failed approvals leave the request pending';

  -- reject
  perform public.reject_claim_request((select id from public.player_claim_requests where user_id = (select id from t_u where name = 'bob')));
  select status into st from public.player_claim_requests where user_id = (select id from t_u where name = 'bob');
  if st <> 'rejected' then raise exception 'FAIL reject left status %', st; end if;
  raise notice 'PASS admin reject';

  perform public.reject_claim_request((select id from public.player_claim_requests where user_id = (select id from t_u where name = 'hank')));
end $$;

-- A rejected request frees the player for someone else.
select set_config('request.jwt.claims', json_build_object('sub', (select id from t_u where name = 'ivan'), 'role', 'authenticated')::text, true);
insert into public.player_claim_requests (player_id, user_id) values ((select id from t_p where name = 'p8'), (select id from t_u where name = 'ivan'));
do $$ begin raise notice 'PASS a rejected request frees the player for another user'; end $$;

-- unlink
select set_config('request.jwt.claims', json_build_object('sub', (select id from t_u where name = 'adm'), 'role', 'authenticated')::text, true);
do $$
declare uid uuid;
begin
  perform public.unlink_player((select id from t_p where name = 'p1'));
  select user_id into uid from public.players where id = (select id from t_p where name = 'p1');
  if uid is not null then raise exception 'FAIL unlink left user_id set'; end if;
  raise notice 'PASS admin unlink clears user_id';

  begin perform public.unlink_player((select id from t_p where name = 'p1')); raise exception 'FAIL unlinked an unclaimed player';
  exception when object_not_in_prerequisite_state then raise notice 'PASS cannot unlink an unclaimed player'; end;
  begin perform public.unlink_player(gen_random_uuid()); raise exception 'FAIL unlinked a missing player';
  exception when no_data_found then raise notice 'PASS unlink of unknown player is reported'; end;
end $$;

-- After unlink, alice may request again (she is back to having no player).
select set_config('request.jwt.claims', json_build_object('sub', (select id from t_u where name = 'alice'), 'role', 'authenticated')::text, true);
insert into public.player_claim_requests (player_id, user_id) values ((select id from t_p where name = 'p1'), (select id from t_u where name = 'alice'));
do $$ begin raise notice 'PASS after unlink the user can request again'; end $$;

-- ---------------------------------------------------------------- admin direct writes + guards
select set_config('request.jwt.claims', json_build_object('sub', (select id from t_u where name = 'adm'), 'role', 'authenticated')::text, true);
do $$
declare n int; r public.player_claim_requests%rowtype; rid uuid;
begin
  select id into rid from public.player_claim_requests
   where user_id = (select id from t_u where name = 'alice') and status = 'pending';

  begin update public.player_claim_requests set status = 'approved' where id = rid;
    raise exception 'FAIL admin approved by direct UPDATE (would skip linking the player)';
  exception when insufficient_privilege then raise notice 'PASS approval is only possible through the RPC'; end;

  update public.player_claim_requests set status = 'rejected' where id = rid;
  select * into r from public.player_claim_requests where id = rid;
  if r.status <> 'rejected' or r.resolved_by is distinct from (select id from t_u where name = 'adm') or r.resolved_at is null then
    raise exception 'FAIL direct reject was not stamped: %', row_to_json(r);
  end if;
  raise notice 'PASS admin can reject by direct UPDATE; trigger stamps resolved_by/at';

  begin update public.player_claim_requests set status = 'pending' where id = rid;
    raise exception 'FAIL resolved request was re-opened';
  exception when insufficient_privilege then raise notice 'PASS resolved requests are immutable'; end;

  begin
    update public.players set user_id = (select id from t_u where name = 'alice')
     where id = (select id from t_p where name = 'p1');
    raise exception 'FAIL admin set players.user_id directly';
  exception when insufficient_privilege then raise notice 'PASS even admins change user_id only through the RPCs'; end;

  update public.players set name = 'T renamed ' || (select suffix from t_s) where id = (select id from t_p where name = 'p1');
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL admin can no longer update players'; end if;
  raise notice 'PASS admin can still edit players (name etc.)';

  begin
    insert into public.players (name, user_id)
    values ('Sneaky2 ' || (select suffix from t_s), (select id from t_u where name = 'alice'));
    raise exception 'FAIL admin inserted a player with user_id';
  exception when insufficient_privilege then raise notice 'PASS players cannot be created pre-linked'; end;
end $$;

-- Guard trigger as a backstop: simulate a regressed policy that lets everyone update players.
reset role;
create policy "tmp open update" on public.players for update to authenticated using (true) with check (true);
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', (select id from t_u where name = 'alice'), 'role', 'authenticated')::text, true);
do $$
begin
  begin
    update public.players set name = 'Hacked2' where id = (select id from t_p where name = 'p1');
    raise exception 'FAIL guard trigger let a non-admin update players';
  exception when insufficient_privilege then
    if sqlerrm not like '%Only admins can update players%' then
      raise exception 'FAIL denied, but not by the guard trigger: %', sqlerrm;
    end if;
    raise notice 'PASS guard trigger blocks non-admin player updates even if RLS regresses';
  end;
end $$;
reset role;
drop policy "tmp open update" on public.players;

-- ---------------------------------------------------------------- auto-reject + deletion
-- The one-pending-per-player index normally makes a second pending request impossible, so
-- drop it (inside this rolled-back transaction) to exercise the defensive auto-reject.
drop index public.claim_requests_one_pending_per_player;
insert into public.player_claim_requests (player_id, user_id)
select (select id from t_p where name = 'p9'), id from t_u where name in ('jon', 'kim');

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', (select id from t_u where name = 'adm'), 'role', 'authenticated')::text, true);
do $$
declare st text;
begin
  perform public.approve_claim_request((select id from public.player_claim_requests where user_id = (select id from t_u where name = 'jon')));
  select status into st from public.player_claim_requests where user_id = (select id from t_u where name = 'kim');
  if st <> 'rejected' then raise exception 'FAIL other pending request for the player was %, expected rejected', st; end if;
  if (select resolved_at from public.player_claim_requests where user_id = (select id from t_u where name = 'kim')) is null then
    raise exception 'FAIL auto-rejected request has no resolved_at';
  end if;
  raise notice 'PASS approve auto-rejects other pending requests for the same player';
end $$;
reset role;

-- Deleting an auth user releases their player (on delete set null) and drops their requests.
update public.players set user_id = (select id from t_u where name = 'dave') where id = (select id from t_p where name = 'pd');
delete from auth.users where id = (select id from t_u where name = 'dave');
do $$
declare uid uuid;
begin
  select user_id into uid from public.players where id = (select id from t_p where name = 'pd');
  if uid is not null then raise exception 'FAIL deleting the auth user left players.user_id set'; end if;
  raise notice 'PASS deleting a user sets players.user_id to null';
end $$;

rollback;  -- discard every fixture and change
