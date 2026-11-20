-- Test for player roles. Run in the Supabase SQL Editor AFTER applying, in order:
--   20261118000000_profiles_foundation.sql, 20261119000000_player_admin.sql,
--   20261129000000_player_roles.sql, 20261130000000_leaderboard_role.sql
-- One transaction, ROLLED BACK at the end. A failed check raises; "PASS ..." shows in Messages.

begin;

create temp table t_ids as
select gen_random_uuid() as player_id, gen_random_uuid() as admin_uid, gen_random_uuid() as user_uid,
       'roles-test-' || substr(gen_random_uuid()::text, 1, 8) as suffix;
grant select on t_ids to anon, authenticated;

insert into auth.users (id, aud, role, email)
select admin_uid, 'authenticated', 'authenticated', 'admin-' || suffix || '@test.local' from t_ids
union all
select user_uid, 'authenticated', 'authenticated', 'user-' || suffix || '@test.local' from t_ids;
update public.profiles set role = 'admin' where id = (select admin_uid from t_ids);
insert into public.players (id, name) select player_id, 'Role ' || suffix from t_ids;

-- ------------------------------------------------------------ anonymous: read only
set local role anon;
do $$
declare t t_ids%rowtype; n int;
begin
  select * into t from t_ids;
  select count(*) into n from public.roles;
  if n < 2 then raise exception 'FAIL anon cannot read the roles lookup'; end if;
  begin
    perform public.set_player_role(t.player_id, 'developer');
    raise exception 'FAIL anon called set_player_role';
  exception when insufficient_privilege then
    raise notice 'PASS anon can read roles but cannot call set_player_role';
  end;
end $$;

-- ------------------------------------------------------------ signed-in non-admin
reset role;
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', (select user_uid from t_ids), 'role', 'authenticated')::text, true);
do $$
declare t t_ids%rowtype;
begin
  select * into t from t_ids;
  begin
    perform public.set_player_role(t.player_id, 'organizer');
    raise exception 'FAIL non-admin set a role through the RPC';
  exception when insufficient_privilege then
    raise notice 'PASS non-admin rejected by set_player_role';
  end;
  begin
    insert into public.player_roles (player_id, role_key) values (t.player_id, 'organizer');
    raise exception 'FAIL non-admin inserted into player_roles';
  exception when insufficient_privilege then
    raise notice 'PASS non-admin rejected by RLS on player_roles';
  end;
  if public.is_admin() then raise exception 'FAIL a non-admin became admin'; end if;
end $$;

-- ------------------------------------------------------------ admin
reset role;
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', (select admin_uid from t_ids), 'role', 'authenticated')::text, true);
do $$
declare t t_ids%rowtype; r text;
begin
  select * into t from t_ids;

  perform public.set_player_role(t.player_id, 'developer');
  select role_key into r from public.player_roles where player_id = t.player_id;
  if r is distinct from 'developer' then raise exception 'FAIL admin could not set developer'; end if;
  raise notice 'PASS admin sets a role';

  perform public.set_player_role(t.player_id, 'organizer');  -- replaces: one role per player
  select role_key into r from public.player_roles where player_id = t.player_id;
  if r is distinct from 'organizer' then raise exception 'FAIL admin could not replace the role'; end if;
  raise notice 'PASS admin replaces the role (still one row)';

  select role_key into r from public.season_leaderboard where id = t.player_id;
  if r is distinct from 'organizer' then raise exception 'FAIL leaderboard view did not expose role_key'; end if;
  raise notice 'PASS season_leaderboard exposes role_key';

  begin
    perform public.set_player_role(t.player_id, 'wizard');
    raise exception 'FAIL unknown role accepted';
  exception when foreign_key_violation then
    raise notice 'PASS unknown role rejected';
  end;

  begin
    perform public.set_player_role(gen_random_uuid(), 'developer');
    raise exception 'FAIL unknown player accepted';
  exception when no_data_found then
    raise notice 'PASS unknown player rejected';
  end;

  perform public.set_player_role(t.player_id, null);
  if exists (select 1 from public.player_roles where player_id = t.player_id) then
    raise exception 'FAIL role not cleared';
  end if;
  raise notice 'PASS admin clears the role';
end $$;

reset role;
rollback;
