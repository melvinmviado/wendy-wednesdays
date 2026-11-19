-- Player admin management: rename, archive, delete.
-- Idempotent: safe to run more than once. NOT applied automatically; run it yourself
-- in the Supabase SQL Editor.
--
-- Decisions this encodes:
--   * Archived players are hidden from the leaderboard.
--   * Only the name is editable.
--   * Hard delete is always allowed at the DB level (weekly_scores rows cascade). The
--     "strong confirmation" lives in the UI.
--   * Admin identity is public.is_admin(), defined in 20261118000000_profiles_foundation.sql
--     (JWT app_metadata role, falling back to profiles.role). THAT MIGRATION MUST BE APPLIED
--     FIRST; section 2 below refuses to run without it.

begin;

-- 1. Columns ---------------------------------------------------------------------------
alter table public.players add column if not exists archived_at timestamptz null;
alter table public.players add column if not exists updated_at timestamptz not null default timezone('utc'::text, now());

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc'::text, now());
  return new;
end;
$$;

drop trigger if exists trg_players_touch_updated_at on public.players;
create trigger trg_players_touch_updated_at
before update on public.players
for each row execute function public.touch_updated_at();
-- Note: the weekly_scores sync trigger also updates players (weeks_played / total_points),
-- so updated_at moves on score changes too. It means "row last changed", not "last renamed".

-- 2. Admin identity --------------------------------------------------------------------
-- Not defined here any more: a second definition would fight the profiles migration. Fail
-- early with a readable message if the prerequisite migration has not been applied.
do $$
begin
  if to_regprocedure('public.is_admin()') is null
     or to_regclass('public.profiles') is null then
    raise exception
      'Apply 20261118000000_profiles_foundation.sql first (public.is_admin() / public.profiles are missing)';
  end if;
end $$;

-- 3. RLS on players --------------------------------------------------------------------
alter table public.players enable row level security;

-- Replace the old "to authenticated using (true)" policies with is_admin()-based ones.
drop policy if exists "Allow public read players" on public.players;
drop policy if exists "Allow authenticated admin insert players" on public.players;
drop policy if exists "Allow authenticated admin update players" on public.players;
drop policy if exists "Allow authenticated admin delete players" on public.players;
-- The new names too, so the migration can be re-run.
drop policy if exists "Admins insert players" on public.players;
drop policy if exists "Admins update players" on public.players;
drop policy if exists "Admins delete players" on public.players;

-- Everyone (including anonymous visitors) can read, archived rows included. The app and
-- the leaderboard view filter archived players; past weekly results still need their names.
create policy "Allow public read players"
  on public.players for select using (true);

create policy "Admins insert players"
  on public.players for insert to authenticated with check (public.is_admin());

create policy "Admins update players"
  on public.players for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy "Admins delete players"
  on public.players for delete to authenticated using (public.is_admin());

-- 4. Name integrity --------------------------------------------------------------------
-- Preflight: the unique index below fails if active duplicates already exist. Fail with a
-- readable list instead of an opaque error. Resolve (rename or archive one) and re-run.
do $$
declare
  dupes text;
begin
  select string_agg(format('"%s" x%s', n, c), ', ')
    into dupes
  from (
    select min(btrim(name)) as n, count(*) as c
    from public.players
    where archived_at is null
    group by lower(btrim(name))
    having count(*) > 1
  ) d;

  if dupes is not null then
    raise exception 'Duplicate active player names must be resolved first: %', dupes;
  end if;
end $$;

-- No two ACTIVE players may share a name (case- and whitespace-insensitive).
-- Archived players are exempt. Restoring one whose name is now taken will fail on this index.
create unique index if not exists players_active_name_unique
  on public.players (lower(btrim(name)))
  where archived_at is null;

-- Blank names are never valid. NOT VALID skips checking old rows; new/changed rows are enforced.
alter table public.players drop constraint if exists players_name_not_blank;
alter table public.players
  add constraint players_name_not_blank check (btrim(name) <> '') not valid;

-- 5. Leaderboard hides archived players ------------------------------------------------
-- Same columns and order as before, so create or replace is allowed.
-- Skipped when 20261122000000_player_avatars.sql has already added avatar_url to the view:
-- Postgres cannot drop a view column, and re-running this older file must not regress it.
do $view$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'season_leaderboard' and column_name = 'avatar_url'
  ) then
    raise notice 'season_leaderboard already has avatar_url; leaving the newer definition in place';
  else
    create or replace view public.season_leaderboard as
    select
      p.id,
      p.name,
      count(w.week_number) filter (where w.attended = true)::integer as weeks_played,
      coalesce(sum(w.points) filter (where w.attended = true), 0)::integer as total_points
    from public.players p
    left join public.weekly_scores w on p.id = w.player_id
    where p.archived_at is null
    group by p.id, p.name
    order by total_points desc, weeks_played desc, p.name asc;
  end if;
end $view$;

commit;
