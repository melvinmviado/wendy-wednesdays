-- RLS test for player admin. Run in the Supabase SQL Editor AFTER applying
-- supabase/migrations/20261119000000_player_admin.sql.
-- Everything runs in one transaction that is ROLLED BACK at the end: nothing is kept.
-- Each check raises an exception on failure; "PASS ..." notices show in the Messages tab.

begin;

-- Fixtures (as the SQL editor's privileged role)
create temp table t_ids as
select gen_random_uuid() as active_id, gen_random_uuid() as other_id, gen_random_uuid() as archived_id,
       'rls-test-' || substr(gen_random_uuid()::text, 1, 8) as suffix;
grant select on t_ids to anon, authenticated;

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

-- ---------------------------------------------------------------- signed-in user ("admin")
reset role;
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', gen_random_uuid(), 'role', 'authenticated')::text, true);

do $$
declare n int; t t_ids%rowtype;
begin
  select * into t from t_ids;

  if not public.is_admin() then raise exception 'FAIL is_admin() false for a signed-in user'; end if;

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
