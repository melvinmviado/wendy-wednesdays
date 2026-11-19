-- Player avatars on the leaderboard: players.avatar_url + avatars in season_leaderboard.
-- Idempotent: safe to run more than once. NOT applied automatically; run it yourself in the
-- Supabase SQL Editor.
--
-- APPLY ORDER: after 20261118000000_profiles_foundation.sql, 20261119000000_player_admin.sql
-- and 20261120000000_player_claims.sql (needs profiles, players.archived_at, players.user_id).
--
-- Which photo a player shows, resolved once in the view (no per-row lookups in the app):
--   1. the linked profile's avatar_url   (players.user_id -> profiles.avatar_url)
--   2. otherwise players.avatar_url      (set by an admin, for players nobody has claimed)
--   3. otherwise NULL, and the app draws initials.
-- A linked user with no photo of their own falls through to players.avatar_url.
--
-- The view runs with its owner's rights (as before), so it can read profiles.avatar_url for
-- anonymous visitors without opening the profiles table. It exposes only the resolved URL,
-- never a profile id, role or user id.

begin;

-- 0. Preconditions --------------------------------------------------------------------
do $$
begin
  if to_regclass('public.profiles') is null then
    raise exception 'Apply 20261118000000_profiles_foundation.sql first';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'players' and column_name = 'user_id'
  ) then
    raise exception 'Apply 20261120000000_player_claims.sql first (players.user_id is missing)';
  end if;
end $$;

-- 1. players.avatar_url ---------------------------------------------------------------
-- Writable by admins only, through the existing players policies. No app UI sets it yet.
alter table public.players add column if not exists avatar_url text null;

alter table public.players drop constraint if exists players_avatar_url_https;
alter table public.players
  add constraint players_avatar_url_https
  check (avatar_url is null or (avatar_url ~* '^https://' and char_length(avatar_url) <= 2048));

-- 2. season_leaderboard ---------------------------------------------------------------
-- Same columns, same order, same archived filter as 20261119000000_player_admin.sql, plus
-- avatar_url appended last (create or replace only allows new columns at the end).
create or replace view public.season_leaderboard as
select
  p.id,
  p.name,
  count(w.week_number) filter (where w.attended = true)::integer as weeks_played,
  coalesce(sum(w.points) filter (where w.attended = true), 0)::integer as total_points,
  coalesce(pr.avatar_url, p.avatar_url) as avatar_url
from public.players p
left join public.weekly_scores w on p.id = w.player_id
left join public.profiles pr on pr.id = p.user_id
where p.archived_at is null
group by p.id, p.name, pr.id, pr.avatar_url, p.avatar_url
order by total_points desc, weeks_played desc, p.name asc;

commit;
