-- Privilege-escalation test for profiles / is_admin(). Run in the Supabase SQL Editor AFTER
-- applying, in order:
--   1. supabase/migrations/20261118000000_profiles_foundation.sql
--   2. supabase/migrations/20261119000000_player_admin.sql
-- Everything runs in one transaction that is ROLLED BACK at the end: no fixtures survive.
-- Each check raises an exception on failure; "PASS ..." notices show in the Messages tab.
-- Impersonation = set local role + request.jwt.claims, the same way PostgREST does it.

begin;

-- Fixtures (as the SQL editor's privileged role) ---------------------------------------
-- Alice signs up with user_metadata that TRIES to claim admin. Bob is a bystander.
create temp table t_ids as
select gen_random_uuid() as alice, gen_random_uuid() as bob,
       'esc-' || substr(gen_random_uuid()::text, 1, 8) as suffix;
grant select on t_ids to anon, authenticated;

insert into auth.users (id, aud, role, email, raw_user_meta_data)
select alice, 'authenticated', 'authenticated', 'alice-' || suffix || '@test.local',
       '{"role":"admin","full_name":"Alice Tester"}'::jsonb
from t_ids;
insert into auth.users (id, aud, role, email, raw_user_meta_data)
select bob, 'authenticated', 'authenticated', 'bob-' || suffix || '@test.local', '{}'::jsonb
from t_ids;

do $$
declare t t_ids%rowtype; r text; n text; claim text;
begin
  select * into t from t_ids;
  select role, display_name into r, n from public.profiles where id = t.alice;
  if r is null then raise exception 'FAIL signup trigger did not create a profile'; end if;
  if r <> 'user' then raise exception 'FAIL signup with user_metadata.role=admin got role %', r; end if;
  if n <> 'Alice Tester' then raise exception 'FAIL display_name from Google-style metadata was %', n; end if;
  select display_name into n from public.profiles where id = t.bob;
  if n <> 'bob-' || t.suffix then raise exception 'FAIL email-prefix display_name was %', n; end if;
  select raw_app_meta_data ->> 'role' into claim from auth.users where id = t.alice;
  if claim is not null then raise exception 'FAIL a plain signup got an app_metadata role: %', claim; end if;
  raise notice 'PASS signup creates role=user profile; user_metadata cannot grant admin; names derived';
end $$;

-- ---------------------------------------------------------------- Alice (normal user)
reset role;
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', (select alice from t_ids), 'role', 'authenticated',
                    -- forged: user_metadata is user-editable and must never count
                    'user_metadata', json_build_object('role', 'admin'))::text, true);

do $$
declare t t_ids%rowtype; n int; free_week int;
begin
  select * into t from t_ids;

  if public.is_admin() then raise exception 'FAIL is_admin() true for a normal user'; end if;
  raise notice 'PASS is_admin() false (forged user_metadata.role ignored)';

  select count(*) into n from public.profiles;
  if n <> 1 then raise exception 'FAIL user sees % profile rows in the full table, expected 1', n; end if;
  raise notice 'PASS user sees only their own row in profiles';

  begin
    update public.profiles set role = 'admin' where id = t.alice;
    raise exception 'FAIL user changed their own role';
  exception when insufficient_privilege then
    raise notice 'PASS user cannot update role (column grant)';
  end;

  begin
    update public.profiles set display_name = 'Mallory', role = 'admin' where id = t.alice;
    raise exception 'FAIL user changed role alongside display_name';
  exception when insufficient_privilege then
    raise notice 'PASS role cannot ride along with an allowed column';
  end;

  begin
    update public.profiles set id = t.bob where id = t.alice;
    raise exception 'FAIL user changed profile id';
  exception when insufficient_privilege then
    raise notice 'PASS user cannot change id';
  end;

  update public.profiles set display_name = 'Alice Renamed', avatar_url = 'https://example.com/a.jpg'
   where id = t.alice;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL user could not update own display_name/avatar_url'; end if;
  raise notice 'PASS user can update own display_name and avatar_url';

  begin
    update public.profiles set avatar_url = 'javascript:alert(1)' where id = t.alice;
    raise exception 'FAIL non-https avatar_url accepted';
  exception when check_violation then
    raise notice 'PASS non-https avatar_url rejected';
  end;

  update public.profiles set display_name = 'Pwned' where id = t.bob;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL user updated another user''s profile (% rows)', n; end if;
  raise notice 'PASS user cannot update someone else''s profile';

  begin
    insert into public.profiles (id, role) values (gen_random_uuid(), 'admin');
    raise exception 'FAIL user inserted a profile';
  exception when insufficient_privilege then
    raise notice 'PASS user cannot insert profiles';
  end;

  begin
    delete from public.profiles where id = t.alice;
    raise exception 'FAIL user deleted a profile';
  exception when insufficient_privilege then
    raise notice 'PASS user cannot delete profiles';
  end;

  -- Going around profiles: write the claim directly, or call the mirror function.
  begin
    update auth.users set raw_app_meta_data = '{"role":"admin"}'::jsonb where id = t.alice;
    raise exception 'FAIL user wrote auth.users';
  exception when insufficient_privilege then
    raise notice 'PASS user cannot write auth.users.raw_app_meta_data';
  end;

  begin
    perform public.sync_profile_role_to_claim();
    raise exception 'FAIL user could call the mirror function';
  exception when insufficient_privilege then
    raise notice 'PASS mirror function not callable by users';
  end;

  -- The other tables the admin check now protects.
  begin
    insert into public.weeks (week_number) values (8);
    raise exception 'FAIL normal user inserted into weeks';
  exception when insufficient_privilege then
    raise notice 'PASS normal user cannot write weeks (RLS)';
  end;

  begin
    insert into public.weekly_scores (player_id, week_number, points)
    values (gen_random_uuid(), 1, 20);
    raise exception 'FAIL normal user inserted into weekly_scores';
  exception
    when insufficient_privilege then
      raise notice 'PASS normal user cannot write weekly_scores (RLS)';
    when foreign_key_violation then
      raise exception 'FAIL weekly_scores RLS did not stop a normal user before the FK check';
  end;
end $$;

-- ---------------------------------------------------------------- guard trigger
-- Simulate a regressed grant: even if role became updatable, the guard must still refuse.
reset role;
grant update (role) on public.profiles to authenticated;
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', (select alice from t_ids), 'role', 'authenticated')::text, true);

do $$
declare t t_ids%rowtype;
begin
  select * into t from t_ids;
  begin
    update public.profiles set role = 'admin' where id = t.alice;
    raise exception 'FAIL guard trigger let role change through';
  exception when insufficient_privilege then
    if sqlerrm not like '%cannot be changed through the API%' then
      raise exception 'FAIL denied, but not by the guard trigger: %', sqlerrm;
    end if;
    raise notice 'PASS guard trigger blocks role change even with the grant present';
  end;
end $$;

reset role;
revoke update (role) on public.profiles from authenticated;

-- ---------------------------------------------------------------- anonymous visitor
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

do $$
declare n int;
begin
  begin
    perform 1 from public.profiles limit 1;
    raise exception 'FAIL anon can read the profiles table';
  exception when insufficient_privilege then
    raise notice 'PASS anon cannot read the profiles table (role stays private)';
  end;

  select count(*) into n from public.public_profiles
   where id in (select alice from t_ids union select bob from t_ids);
  if n <> 2 then raise exception 'FAIL anon sees % of 2 profiles through public_profiles', n; end if;
  raise notice 'PASS anon can read public_profiles';

  begin
    perform role from public.public_profiles limit 1;
    raise exception 'FAIL public_profiles exposes role';
  exception when undefined_column then
    raise notice 'PASS public_profiles does not expose role';
  end;

  begin
    update public.profiles set display_name = 'x';
    raise exception 'FAIL anon updated profiles';
  exception when insufficient_privilege then
    raise notice 'PASS anon cannot update profiles';
  end;
end $$;

-- ---------------------------------------------------------------- legitimate promotion
reset role;
update public.profiles set role = 'admin' where id = (select alice from t_ids);

do $$
declare t t_ids%rowtype; claim text;
begin
  select * into t from t_ids;
  select raw_app_meta_data ->> 'role' into claim from auth.users where id = t.alice;
  if claim is distinct from 'admin' then raise exception 'FAIL promotion not mirrored (claim=%)', claim; end if;
  raise notice 'PASS promoting in profiles mirrors role=admin into app_metadata';
end $$;

-- Alice's OLD token (issued before the claim existed): the profiles fallback must admit her.
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', (select alice from t_ids), 'role', 'authenticated')::text, true);
do $$
declare n int; wk int;
begin
  if not public.is_admin() then raise exception 'FAIL stale token without claim: fallback did not admit admin'; end if;
  raise notice 'PASS admin via profiles fallback (token without claim)';

  select count(*) into n from public.profiles;
  if n < 2 then raise exception 'FAIL admin should see all profiles, saw %', n; end if;
  raise notice 'PASS admin can read all profiles';

  -- Admin write on weeks (pick a week number that is free so the test does not depend on data)
  select g into wk from generate_series(1, 8) g
   where not exists (select 1 from public.weeks w where w.week_number = g) limit 1;
  if wk is null then
    raise notice 'SKIP admin weeks insert: all 8 weeks already exist';
  else
    insert into public.weeks (week_number) values (wk);
    raise notice 'PASS admin can write weeks';
  end if;
end $$;

-- A fresh token that carries the claim.
select set_config('request.jwt.claims',
  json_build_object('sub', (select alice from t_ids), 'role', 'authenticated',
                    'app_metadata', json_build_object('role', 'admin'))::text, true);
do $$
begin
  if not public.is_admin() then raise exception 'FAIL fresh token with admin claim not admitted'; end if;
  raise notice 'PASS admin via app_metadata claim';
end $$;

-- Bob is still a normal user.
select set_config('request.jwt.claims',
  json_build_object('sub', (select bob from t_ids), 'role', 'authenticated')::text, true);
do $$
begin
  if public.is_admin() then raise exception 'FAIL promoting Alice made Bob an admin'; end if;
  raise notice 'PASS promotion is per-user';
end $$;

-- ---------------------------------------------------------------- demotion
reset role;
update public.profiles set role = 'user' where id = (select alice from t_ids);

set local role authenticated;
-- Token carrying the NEW claim: must be denied.
select set_config('request.jwt.claims',
  json_build_object('sub', (select alice from t_ids), 'role', 'authenticated',
                    'app_metadata', json_build_object('role', 'user'))::text, true);
do $$
begin
  if public.is_admin() then raise exception 'FAIL demoted user with refreshed token is still admin'; end if;
  raise notice 'PASS demoted user with refreshed token is not admin';
end $$;

-- Token still carrying the OLD admin claim: documented limitation.
select set_config('request.jwt.claims',
  json_build_object('sub', (select alice from t_ids), 'role', 'authenticated',
                    'app_metadata', json_build_object('role', 'admin'))::text, true);
do $$
begin
  if public.is_admin() then
    raise notice 'KNOWN LIMITATION: a demoted admin keeps access until their token expires (stale claim = admin)';
  else
    raise notice 'NOTE: stale admin claim was rejected (is_admin() has been tightened)';
  end if;
end $$;

reset role;
rollback;  -- discard every fixture and change
