-- admin_pending_claims(): only admins can read requester emails. Rolled back at the end.
-- Run after migrations 20261118 ... 20261123.

begin;

create temp table t_u (name text primary key, id uuid not null default gen_random_uuid());
insert into t_u (name) values ('adm'), ('req'), ('other'), ('done');
grant select on t_u to anon, authenticated;
create temp table t_p (name text primary key, id uuid not null default gen_random_uuid());
insert into t_p (name) values ('p1'), ('p2');
grant select on t_p to anon, authenticated;

insert into auth.users (id, aud, role, email)
select id, 'authenticated', 'authenticated', name || '@verify.test' from t_u;
update public.profiles set role = 'admin' where id = (select id from t_u where name = 'adm');
update public.profiles set display_name = 'Requester R' where id = (select id from t_u where name = 'req');
insert into public.players (id, name) select id, 'EM ' || name || ' ' || substr(id::text, 1, 6) from t_p;

-- one pending request, one already resolved
insert into public.player_claim_requests (player_id, user_id, message)
  values ((select id from t_p where name = 'p1'), (select id from t_u where name = 'req'), 'court 2');
insert into public.player_claim_requests (player_id, user_id, status, resolved_by, resolved_at)
  values ((select id from t_p where name = 'p2'), (select id from t_u where name = 'done'), 'rejected',
          (select id from t_u where name = 'adm'), now());

-- ---- admin
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', (select id from t_u where name = 'adm'), 'role', 'authenticated')::text, true);
do $$
declare r record; n int;
begin
  select count(*) into n from public.admin_pending_claims();
  if n <> 1 then raise exception 'FAIL admin sees % rows, expected 1 (resolved requests must not appear)', n; end if;
  select * into r from public.admin_pending_claims();
  if r.email <> 'req@verify.test' then raise exception 'FAIL wrong email %', r.email; end if;
  if r.display_name <> 'Requester R' or r.message <> 'court 2' then raise exception 'FAIL missing name or message'; end if;
  if r.user_id <> (select id from t_u where name = 'req') or r.player_id <> (select id from t_p where name = 'p1') then
    raise exception 'FAIL wrong ids';
  end if;
  raise notice 'PASS admin gets the pending request with the requester email, name and message';
  raise notice 'PASS resolved requests are not returned';
end $$;

-- ---- the requester themself, and an unrelated signed-in user
reset role;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', (select id from t_u where name = 'req'), 'role', 'authenticated')::text, true);
do $$
begin
  begin perform * from public.admin_pending_claims(); raise exception 'FAIL requester called the function';
  exception when insufficient_privilege then raise notice 'PASS the requester cannot call it'; end;
end $$;

reset role;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', (select id from t_u where name = 'other'), 'role', 'authenticated')::text, true);
do $$
begin
  begin perform * from public.admin_pending_claims(); raise exception 'FAIL ordinary user called the function';
  exception when insufficient_privilege then raise notice 'PASS an ordinary signed-in user cannot call it'; end;
end $$;

-- ---- a stale/forged-looking token: claims 'admin' in a non-app_metadata place must not count
reset role;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', (select id from t_u where name = 'other'), 'role', 'authenticated', 'user_metadata', json_build_object('role', 'admin'))::text, true);
do $$
begin
  begin perform * from public.admin_pending_claims(); raise exception 'FAIL user_metadata role granted access';
  exception when insufficient_privilege then raise notice 'PASS user_metadata.role does not grant access'; end;
end $$;

-- ---- visitors
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
do $$
begin
  begin perform * from public.admin_pending_claims(); raise exception 'FAIL anon called the function';
  exception when insufficient_privilege then raise notice 'PASS anon cannot execute it'; end;
end $$;

-- ---- the function is the only door: auth.users itself is still closed
reset role;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', (select id from t_u where name = 'adm'), 'role', 'authenticated')::text, true);
do $$
begin
  begin perform email from auth.users; raise exception 'FAIL even an admin can read auth.users directly';
  exception when insufficient_privilege then raise notice 'PASS auth.users is still not readable through the API roles'; end;
end $$;

reset role;
rollback;
