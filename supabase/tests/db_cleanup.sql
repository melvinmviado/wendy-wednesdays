-- Tests for supabase/migrations/20261205000000_db_cleanup.sql. Run in the Supabase SQL Editor AFTER
-- applying every migration. One transaction, ROLLED BACK at the end: no fixtures survive. Each
-- check raises an exception on failure; "PASS ..." notices show in the Messages tab.

begin;

create temp table t_s as select 'dc-' || substr(gen_random_uuid()::text, 1, 8) as suffix;
create temp table t_u (name text primary key, id uuid not null default gen_random_uuid());
create temp table t_p (name text primary key, id uuid not null default gen_random_uuid());
grant select on t_s, t_u, t_p to anon, authenticated;

insert into t_u (name) values ('adm');
insert into t_p (name) values ('from'), ('to');
insert into auth.users (id, aud, role, email)
select id, 'authenticated', 'authenticated', name || '-' || (select suffix from t_s) || '@test.local' from t_u;
update public.profiles set role = 'admin' where id = (select id from t_u where name = 'adm');
insert into public.players (id, name) select id, 'T ' || name || ' ' || (select suffix from t_s) from t_p;

-- ---------------------------------------------------------------- totals follow weekly_scores
do $$
declare f uuid := (select id from t_p where name = 'from'); t uuid := (select id from t_p where name = 'to');
        fp integer; fw integer; tp integer; tw integer;
begin
  insert into public.weekly_scores (player_id, week_number, attended, points) values (f, 1, true, 5), (f, 2, true, 3);
  select total_points, weeks_played into fp, fw from public.players where id = f;
  if (fp, fw) <> (8, 2) then raise exception 'FAIL totals after insert were %/%', fp, fw; end if;

  -- Move week 2 to the other player: both players must be refreshed
  update public.weekly_scores set player_id = t where player_id = f and week_number = 2;
  select total_points, weeks_played into fp, fw from public.players where id = f;
  select total_points, weeks_played into tp, tw from public.players where id = t;
  if (fp, fw) <> (5, 1) then raise exception 'FAIL the old player kept moved points: %/%', fp, fw; end if;
  if (tp, tw) <> (3, 1) then raise exception 'FAIL the new player got %/%', tp, tw; end if;
  raise notice 'PASS moving a score refreshes both players';

  delete from public.weekly_scores where player_id = t;
  select total_points, weeks_played into tp, tw from public.players where id = t;
  if (tp, tw) <> (0, 0) then raise exception 'FAIL totals after delete were %/%', tp, tw; end if;
  raise notice 'PASS deleting a score refreshes the totals';
end $$;

-- ---------------------------------------------------------------- admins cannot write totals
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', (select id from t_u where name = 'adm'), 'role', 'authenticated')::text, true);

do $$
declare nid uuid; wp integer; tp integer; f uuid := (select id from t_p where name = 'from');
begin
  insert into public.players (name, weeks_played, total_points)
  values ('T quick ' || (select suffix from t_s), 1, 99)
  returning id, weeks_played, total_points into nid, wp, tp;
  if (wp, tp) <> (0, 0) then raise exception 'FAIL an API insert stored totals %/%', wp, tp; end if;
  raise notice 'PASS an API insert always starts at 0 weeks / 0 points';

  begin
    update public.players set total_points = 500 where id = f;
    raise exception 'FAIL an admin wrote total_points directly';
  exception when insufficient_privilege then raise notice 'PASS totals cannot be written through the API'; end;

  update public.players set name = 'T renamed ' || (select suffix from t_s) where id = f;
  raise notice 'PASS other player edits still work';

  -- Scores saved by an admin still update the totals (the trigger runs as its owner)
  insert into public.weekly_scores (player_id, week_number, attended, points) values (f, 3, true, 4);
  select total_points into tp from public.players where id = f;
  if tp <> 9 then raise exception 'FAIL an admin score save left total_points at %', tp; end if;
  raise notice 'PASS admin score saves still refresh the totals';
end $$;

-- ---------------------------------------------------------------- catalog checks
reset role;
do $$
declare n integer;
begin
  select count(*) into n from pg_policies
   where (schemaname = 'public' or (schemaname = 'storage' and tablename = 'objects'))
     and (qual ~ '(?<!SELECT )(?<!SELECT public\.)(public\.)?\mis_admin\(\)'
          or with_check ~ '(?<!SELECT )(?<!SELECT public\.)(public\.)?\mis_admin\(\)');
  if n <> 0 then raise exception 'FAIL % policies still call is_admin() per row', n; end if;
  raise notice 'PASS every policy evaluates is_admin() once per query';

  select count(*) into n from pg_proc
   where oid in ('public.touch_updated_at()'::regprocedure, 'public.sync_player_leaderboard_stats()'::regprocedure,
                 'public.players_totals_guard()'::regprocedure)
     and not exists (select 1 from unnest(proconfig) c where c like 'search_path=%');
  if n <> 0 then raise exception 'FAIL % trigger functions have no pinned search_path', n; end if;
  raise notice 'PASS trigger functions pin search_path';

  select count(*) into n from pg_indexes
   where schemaname = 'public'
     and indexname in ('weekly_scores_week_idx', 'claim_requests_player_idx', 'claim_requests_user_idx',
                       'claim_requests_resolved_by_idx', 'rsvps_player_idx', 'rsvps_user_idx', 'rsvps_added_by_idx',
                       'player_roles_assigned_by_idx', 'event_settings_updated_by_idx');
  if n <> 9 then raise exception 'FAIL only % of 9 new indexes exist', n; end if;
  raise notice 'PASS foreign-key indexes exist';
end $$;

-- ---------------------------------------------------------------- admin policies still work
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', (select id from t_u where name = 'adm'), 'role', 'authenticated')::text, true);
do $$
begin
  -- insert-or-update exercises the rewritten admin insert and update policies on weeks
  insert into public.weeks (week_number, notes) values (8, 'db_cleanup test')
  on conflict (week_number) do update set notes = 'db_cleanup test';
  raise notice 'PASS rewritten admin policies still admit admins';
end $$;

reset role;
rollback;  -- discard every fixture and change
