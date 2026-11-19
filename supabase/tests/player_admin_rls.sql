-- RLS test for player admin. Run in the Supabase SQL Editor AFTER applying, in order:
--   supabase/migrations/20261118000000_profiles_foundation.sql
--   supabase/migrations/20261119000000_player_admin.sql
-- "Admin" means profiles.role = 'admin' (via public.is_admin()), not "any signed-in user".
-- Everything runs in one transaction that is ROLLED BACK at the end: nothing is kept.
-- Each check raises an exception on failure; "PASS ..." notices show in the Messages tab.

begin;

-- Fixtures (as the SQL editor's privileged role)
create temp table t_ids as
select gen_random_uuid() as active_id, gen_random_uuid() as other_id, gen_random_uuid() as archived_id,
       gen_random_uuid() as admin_uid, gen_random_uuid() as user_uid,
       'rls-test-' || substr(gen_random_uuid()::text, 1, 8) as suffix;
grant select on t_ids to anon, authenticated;

-- One admin and one ordinary signed-in user (the signup trigger gives both a 'user' profile first).
insert into auth.users (id, aud, role, email)
select admin_uid, 'authenticated', 'authenticated', 'admin-' || suffix || '@test.local' from t_ids
union all
select user_uid, 'authenticated', 'authenticated', 'user-' || suffix || '@test.local' from t_ids;
update public.profiles set role = 'admin' where id = (select admin_uid from t_ids);

insert into public.players (id, name) select active_id, 'Active ' || suffix from t_ids;
insert into public.players (id, name) select other_id, 'Other ' || suffix from t_ids;
insert into public.players (id, name, archived_at) select archived_id, 'Archived ' || suffix, now() from t_ids;
insert into public.weekly_scores (player_id, week_number, attended, points)
  select active_id, 1, true, 20 from t_ids;

-- ---------------------------------------------------------------- anonymous visitor
set local role anon;

do $$
declare n int; t t_ids%rowtype;
begin
  select * into t from t_ids;

  if public.is_admin() then raise exception 'FAIL is_admin() true for anon'; end if;

  select count(*) into n from public.players where id in (t.active_id, t.archived_id);
  if n <> 2 then raise exception 'FAIL anon should read active AND archived players, saw %', n; end if;
  raise notice 'PASS anon can read players (archived rows included)';

  select count(*) into n from public.season_leaderboard where id = t.archived_id;
  if n <> 0 then raise exception 'FAIL leaderboard view shows an archived player'; end if;
  raise notice 'PASS leaderboard view hides archived players';

  update public.players set name = 'hacked' where id = t.active_id;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL anon updated % rows', n; end if;
  raise notice 'PASS anon cannot rename';

  update public.players set archived_at = now() where id = t.active_id;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL anon archived % rows', n; end if;
  raise notice 'PASS anon cannot archive';

  delete from public.players where id = t.active_id;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL anon deleted % rows', n; end if;
  raise notice 'PASS anon cannot delete';

  begin
    insert into public.players (name) values ('anon insert');
    raise exception 'FAIL anon inserted a player';
  exception when insufficient_privilege then
    raise notice 'PASS anon cannot insert';
  end;

  delete from public.weekly_scores where player_id = t.active_id;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL anon deleted % score rows', n; end if;
  raise notice 'PASS anon cannot delete weekly_scores';
end $$;

-- ---------------------------------------------------------------- signed-in user who is NOT an admin
reset role;
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', (select user_uid from t_ids), 'role', 'authenticated')::text, true);

do $$
declare n int; t t_ids%rowtype;
begin
  select * into t from t_ids;
  if public.is_admin() then raise exception 'FAIL is_admin() true for an ordinary signed-in user'; end if;

  update public.players set name = 'Hacked ' || t.suffix where id = t.active_id;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL ordinary user renamed % players', n; end if;

  update public.players set archived_at = now() where id = t.active_id;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL ordinary user archived % players', n; end if;

  delete from public.players where id = t.active_id;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL ordinary user deleted % players', n; end if;

  begin
    insert into public.players (name) values ('Sneaky ' || t.suffix);
    raise exception 'FAIL ordinary user inserted a player';
  exception when insufficient_privilege then
    raise notice 'PASS ordinary signed-in user cannot rename, archive, delete or insert players';
  end;
end $$;

-- ---------------------------------------------------------------- admin
reset role;
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', (select admin_uid from t_ids), 'role', 'authenticated')::text, true);

do $$
declare n int; t t_ids%rowtype;
begin
  select * into t from t_ids;

  if not public.is_admin() then raise exception 'FAIL is_admin() false for an admin'; end if;

  update public.players set name = 'Renamed ' || t.suffix where id = t.active_id;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL admin rename affected % rows', n; end if;
  raise notice 'PASS admin can rename';

  begin
    update public.players set name = upper('Other ' || t.suffix) where id = t.active_id;
    raise exception 'FAIL duplicate active name was allowed';
  exception when unique_violation then
    raise notice 'PASS duplicate active name (case-insensitive) rejected';
  end;

  begin
    update public.players set name = '   ' where id = t.active_id;
    raise exception 'FAIL blank name was allowed';
  exception when check_violation then
    raise notice 'PASS blank name rejected';
  end;

  -- An ARCHIVED player may share a name with an active one...
  update public.players set name = 'Other ' || t.suffix where id = t.archived_id;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL could not give an archived player a taken name'; end if;
  -- ...but cannot be restored into the clash.
  begin
    update public.players set archived_at = null where id = t.archived_id;
    raise exception 'FAIL restore into a taken name was allowed';
  exception when unique_violation then
    raise notice 'PASS restore into a taken name rejected';
  end;

  update public.players set archived_at = now() where id = t.active_id;
  select count(*) into n from public.season_leaderboard where id = t.active_id;
  if n <> 0 then raise exception 'FAIL archived player still on leaderboard'; end if;
  raise notice 'PASS admin archive hides player from leaderboard';

  update public.players set archived_at = null where id = t.active_id;
  raise notice 'PASS admin restore';

  delete from public.players where id = t.active_id;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL admin delete removed % rows', n; end if;
  select count(*) into n from public.weekly_scores where player_id = t.active_id;
  if n <> 0 then raise exception 'FAIL weekly_scores did not cascade'; end if;
  raise notice 'PASS admin delete (weekly_scores cascaded, as the UI warns)';
end $$;

reset role;
rollback;  -- discard every fixture and change
