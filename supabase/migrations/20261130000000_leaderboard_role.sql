-- Adds role_key to season_leaderboard so the roster and the player profile get a player's role
-- in the same query (no N+1). Needs 20261129000000_player_roles.sql. Idempotent.
--
-- ROLLBACK: create or replace cannot drop a column, so:
--   drop view public.season_leaderboard;
--   -- then recreate it from 20261122000000_player_avatars.sql (and re-grant select if needed)

begin;

do $$
begin
  if to_regclass('public.player_roles') is null then
    raise exception 'Apply 20261129000000_player_roles.sql first';
  end if;
end $$;

-- Same columns and order as 20261122000000_player_avatars.sql, role_key appended last.
create or replace view public.season_leaderboard as
select
  p.id,
  p.name,
  count(w.week_number) filter (where w.attended = true)::integer as weeks_played,
  coalesce(sum(w.points) filter (where w.attended = true), 0)::integer as total_points,
  coalesce(pr.avatar_url, p.avatar_url) as avatar_url,
  prl.role_key
from public.players p
left join public.weekly_scores w on p.id = w.player_id
left join public.profiles pr on pr.id = p.user_id
left join public.player_roles prl on prl.player_id = p.id
where p.archived_at is null
group by p.id, p.name, pr.id, pr.avatar_url, p.avatar_url, prl.role_key
order by total_points desc, weeks_played desc, p.name asc;

commit;
