-- Database cleanup from the November 2026 audit (phase 3). Idempotent. NOT applied automatically;
-- run it yourself in the Supabase SQL Editor (staging first), then run
-- supabase/tests/db_cleanup.sql.
--
-- APPLY ORDER: after 20261204000000_rsvp_abuse_limits.sql (needs every earlier migration).
--
-- 1. One source of truth for player totals.
--    players.weeks_played / total_points are a cache of weekly_scores, kept by a trigger. Two
--    things could make them drift from season_leaderboard (which sums weekly_scores directly):
--      a. Moving a score to another player (UPDATE ... SET player_id) refreshed only the new
--         player; the old one kept the points. The trigger now refreshes both.
--      b. API callers (admins) could write the two columns directly, e.g. a quick-add inserted
--         weeks_played = 1. Now only the trigger can change them: an API insert always starts
--         at 0 and an API update that changes them is refused.
--    The trigger runs as SECURITY DEFINER (search_path pinned) so it can write past that guard,
--    and it skips players whose totals did not change. Every player is recomputed once below.
-- 2. touch_updated_at() gets a pinned search_path, like every other function.
-- 3. RLS policies call is_admin() once per query instead of once per row: every bare
--    is_admin() in a policy on public.* or storage.objects is wrapped as (select public.is_admin()).
--    Same result, evaluated once (Postgres can't inline a SECURITY DEFINER function).
-- 4. Indexes on foreign keys and on weekly_scores.week_number (cascading deletes from auth.users
--    and players, and the claim-history lookups, no longer scan whole tables).

begin;

do $$
begin
  if to_regprocedure('public.rsvp_client_ip_hash(date)') is null then
    raise exception 'Apply 20261204000000_rsvp_abuse_limits.sql first';
  end if;
end $$;

-- 1a. Totals trigger: refresh old and new player, as the function owner ----------------------
create or replace function public.sync_player_leaderboard_stats()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  ids uuid[];
begin
  if tg_op = 'INSERT' then
    ids := array[new.player_id];
  elsif tg_op = 'DELETE' then
    ids := array[old.player_id];
  else
    ids := array[old.player_id, new.player_id];  -- a moved score changes both players
  end if;

  with s as (
    select x.pid,
           (select count(distinct w.week_number) from public.weekly_scores w
             where w.player_id = x.pid and w.attended)::integer as wp,
           (select coalesce(sum(w.points), 0) from public.weekly_scores w
             where w.player_id = x.pid and w.attended)::integer as tp
      from (select distinct unnest(ids) as pid) x
  )
  update public.players p
     set weeks_played = s.wp, total_points = s.tp
    from s
   where p.id = s.pid
     and (p.weeks_played, p.total_points) is distinct from (s.wp, s.tp);
  return null;
end;
$$;

revoke all on function public.sync_player_leaderboard_stats() from public, anon, authenticated;

-- 1b. Only the trigger writes the totals --------------------------------------------------
-- Not security definer: current_user is the caller, so API roles are restricted while the
-- trigger above (running as the function owner), the SQL editor and service_role are not.
create or replace function public.players_totals_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('anon', 'authenticated') then
    if tg_op = 'INSERT' then
      new.weeks_played := 0;  -- totals come from weekly_scores; a new player has none
      new.total_points := 0;
    elsif (new.weeks_played, new.total_points) is distinct from (old.weeks_played, old.total_points) then
      raise exception 'players.weeks_played / total_points are computed from weekly_scores'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_players_totals_guard_ins on public.players;
create trigger trg_players_totals_guard_ins
before insert on public.players
for each row execute function public.players_totals_guard();

drop trigger if exists trg_players_totals_guard_upd on public.players;
create trigger trg_players_totals_guard_upd
before update on public.players
for each row execute function public.players_totals_guard();

-- 1c. Recompute every player once, fixing anything that drifted before this migration --------
with s as (
  select p.id,
         (select count(distinct w.week_number) from public.weekly_scores w
           where w.player_id = p.id and w.attended)::integer as wp,
         (select coalesce(sum(w.points), 0) from public.weekly_scores w
           where w.player_id = p.id and w.attended)::integer as tp
    from public.players p
)
update public.players p
   set weeks_played = s.wp, total_points = s.tp
  from s
 where p.id = s.id
   and (p.weeks_played, p.total_points) is distinct from (s.wp, s.tp);

-- 2. touch_updated_at with a pinned search_path ------------------------------------------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = timezone('utc'::text, now());
  return new;
end;
$$;

-- 3. is_admin() once per query in RLS policies ----------------------------------------------
-- Rewrites the stored expression text: every is_admin() call not already inside a scalar
-- sub-select becomes (select public.is_admin()). Re-running finds nothing left to change.
do $$
declare
  pol  record;
  -- Not already in "SELECT is_admin()" / "SELECT public.is_admin()"; \m = start of a word.
  pat  constant text := '(?<!SELECT )(?<!SELECT public\.)(public\.)?\mis_admin\(\)';
  rep  constant text := '(SELECT public.is_admin())';
  stmt text;
  n    integer := 0;
begin
  for pol in
    select schemaname, tablename, policyname, qual, with_check
      from pg_policies
     where (schemaname = 'public' or (schemaname = 'storage' and tablename = 'objects'))
       and (qual ~ pat or with_check ~ pat)
  loop
    stmt := format('alter policy %I on %I.%I', pol.policyname, pol.schemaname, pol.tablename);
    if pol.qual is not null then
      stmt := stmt || format(' using (%s)', regexp_replace(pol.qual, pat, rep, 'g'));
    end if;
    if pol.with_check is not null then
      stmt := stmt || format(' with check (%s)', regexp_replace(pol.with_check, pat, rep, 'g'));
    end if;
    execute stmt;
    n := n + 1;
  end loop;
  raise notice 'Rewrote % policies to evaluate is_admin() once per query', n;
end $$;

-- 4. Indexes ---------------------------------------------------------------------------------
create index if not exists weekly_scores_week_idx on public.weekly_scores (week_number);
create index if not exists claim_requests_player_idx on public.player_claim_requests (player_id);
create index if not exists claim_requests_user_idx on public.player_claim_requests (user_id);
create index if not exists claim_requests_resolved_by_idx on public.player_claim_requests (resolved_by) where resolved_by is not null;
create index if not exists rsvps_player_idx on public.rsvps (player_id) where player_id is not null;
create index if not exists rsvps_user_idx on public.rsvps (user_id) where user_id is not null;
create index if not exists rsvps_added_by_idx on public.rsvps (added_by) where added_by is not null;
create index if not exists player_roles_assigned_by_idx on public.player_roles (assigned_by) where assigned_by is not null;
create index if not exists event_settings_updated_by_idx on public.event_settings (updated_by) where updated_by is not null;

commit;
