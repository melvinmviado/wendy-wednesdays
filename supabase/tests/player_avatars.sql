-- Tests for player avatars in season_leaderboard. Run in the Supabase SQL Editor AFTER
-- applying every migration up to 20261122000000_player_avatars.sql.
-- One transaction, ROLLED BACK at the end. "PASS ..." notices show in the Messages tab.

begin;

create temp table t_ids as
select gen_random_uuid() as u_with, gen_random_uuid() as u_without,
       gen_random_uuid() as p_linked, gen_random_uuid() as p_linked_nophoto,
       gen_random_uuid() as p_admin_photo, gen_random_uuid() as p_plain,
       'av-' || substr(gen_random_uuid()::text, 1, 8) as suffix;
grant select on t_ids to anon, authenticated;

insert into auth.users (id, aud, role, email)
select u_with, 'authenticated', 'authenticated', 'with-' || suffix || '@test.local' from t_ids
union all
select u_without, 'authenticated', 'authenticated', 'without-' || suffix || '@test.local' from t_ids;

update public.profiles set avatar_url = 'https://example.com/profile.jpg?v=1' where id = (select u_with from t_ids);

insert into public.players (id, name, user_id, avatar_url)
select p_linked, 'Linked ' || suffix, u_with, 'https://example.com/admin-set.jpg' from t_ids;       -- profile wins
insert into public.players (id, name, user_id, avatar_url)
select p_linked_nophoto, 'LinkedNoPhoto ' || suffix, u_without, 'https://example.com/fallback.jpg' from t_ids; -- falls through
insert into public.players (id, name, avatar_url)
select p_admin_photo, 'AdminPhoto ' || suffix, 'https://example.com/admin-only.jpg' from t_ids;     -- players.avatar_url
insert into public.players (id, name)
select p_plain, 'Plain ' || suffix from t_ids;                                                      -- initials

-- Two score rows for one player: the join to profiles must not double-count points.
insert into public.weekly_scores (player_id, week_number, attended, points)
select p_linked, 1, true, 20 from t_ids;
insert into public.weekly_scores (player_id, week_number, attended, points)
select p_linked, 2, true, 10 from t_ids;

-- ---------------------------------------------------------------- anonymous visitor
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

do $$
declare t t_ids%rowtype; r record;
begin
  select * into t from t_ids;

  select * into r from public.season_leaderboard where id = t.p_linked;
  if r.avatar_url is distinct from 'https://example.com/profile.jpg?v=1' then
    raise exception 'FAIL linked player should show the profile photo, got %', r.avatar_url;
  end if;
  if r.total_points <> 30 or r.weeks_played <> 2 then
    raise exception 'FAIL profile join changed the totals: % pts / % weeks', r.total_points, r.weeks_played;
  end if;
  raise notice 'PASS linked profile photo wins, totals unchanged';

  select * into r from public.season_leaderboard where id = t.p_linked_nophoto;
  if r.avatar_url is distinct from 'https://example.com/fallback.jpg' then
    raise exception 'FAIL linked user without a photo should fall back to players.avatar_url, got %', r.avatar_url;
  end if;
  raise notice 'PASS linked profile without a photo falls back to players.avatar_url';

  select * into r from public.season_leaderboard where id = t.p_admin_photo;
  if r.avatar_url is distinct from 'https://example.com/admin-only.jpg' then
    raise exception 'FAIL unclaimed player should show players.avatar_url, got %', r.avatar_url;
  end if;
  raise notice 'PASS unclaimed player uses players.avatar_url';

  select * into r from public.season_leaderboard where id = t.p_plain;
  if r.avatar_url is not null then raise exception 'FAIL player with no photo returned %', r.avatar_url; end if;
  raise notice 'PASS no photo anywhere -> NULL (app shows initials)';

  begin
    perform 1 from public.profiles limit 1;
    raise exception 'FAIL anon can read the profiles table';
  exception when insufficient_privilege then
    raise notice 'PASS anon still cannot read profiles directly';
  end;
end $$;

-- ---------------------------------------------------------------- players.avatar_url constraint
reset role;
do $$
begin
  begin
    update public.players set avatar_url = 'javascript:alert(1)' where id = (select p_plain from t_ids);
    raise exception 'FAIL non-https players.avatar_url accepted';
  exception when check_violation then
    raise notice 'PASS players.avatar_url must be https';
  end;
end $$;

-- ---------------------------------------------------------------- archived players stay hidden
update public.players set archived_at = now() where id = (select p_linked from t_ids);
do $$
begin
  if exists (select 1 from public.season_leaderboard where id = (select p_linked from t_ids)) then
    raise exception 'FAIL archived player is back on the leaderboard';
  end if;
  raise notice 'PASS archived players are still hidden';
end $$;

rollback;
