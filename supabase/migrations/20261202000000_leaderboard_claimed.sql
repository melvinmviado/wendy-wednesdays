-- Adds is_claimed to season_leaderboard so the leaderboard can show a Verified badge for players
-- linked to a real account. Exposes only a boolean, never players.user_id. Needs
-- 20261120000000_player_claims.sql and 20261130000000_leaderboard_role.sql. Idempotent.
--
-- ROLLBACK: create or replace cannot drop a column, so:
--   drop view public.season_leaderboard;
--   -- then recreate it from 20261130000000_leaderboard_role.sql (and re-grant select if needed)

begin;

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'players' and column_name = 'user_id'
  ) then
    raise exception 'Apply 20261120000000_player_claims.sql first (players.user_id is missing)';
  end if;
  if to_regclass('public.player_roles') is null then
    raise exception 'Apply 20261129000000_player_roles.sql first';
  end if;
end $$;

-- Same columns and order as 20261130000000_leaderboard_role.sql, is_claimed appended last.
create or replace view public.season_leaderboard as
select
  p.id,
  p.name,
  count(w.week_number) filter (where w.attended = true)::integer as weeks_played,
  coalesce(sum(w.points) filter (where w.attended = true), 0)::integer as total_points,
  coalesce(pr.avatar_url, p.avatar_url) as avatar_url,
  prl.role_key,
  (p.user_id is not null) as is_claimed
from public.players p
left join public.weekly_scores w on p.id = w.player_id
left join public.profiles pr on pr.id = p.user_id
left join public.player_roles prl on prl.player_id = p.id
where p.archived_at is null
group by p.id, p.name, pr.id, pr.avatar_url, p.avatar_url, prl.role_key, p.user_id
order by total_points desc, weeks_played desc, p.name asc;

commit;
