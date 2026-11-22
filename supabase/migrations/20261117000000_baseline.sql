-- Baseline: the original tables every later migration builds on (players, weekly_scores, the
-- season_leaderboard view, the totals trigger, weeks and the week-photos bucket).
-- Replaces supabase/schema.sql. Idempotent and safe to re-run at any point.
--
-- A NEW database: run every file in supabase/migrations in filename order, starting with this one.
-- An EXISTING database (built from the old schema.sql): you do not need to run this file.
--
-- Unlike the old schema.sql, this creates NO write policies. Until
-- 20261118000000_profiles_foundation.sql and 20261119000000_player_admin.sql add the admin-only
-- ones, nobody can write through the API at all. (schema.sql gave every signed-in user full
-- write access, and re-running it brought that back.)
--
-- The view and the trigger function are created only when missing: later migrations replace
-- them, and re-running this file must never roll those changes back.

begin;

-- 1. players -----------------------------------------------------------------------------
create table if not exists public.players (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  weeks_played integer not null default 0,
  total_points integer not null default 0,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  constraint players_weeks_played_check check (weeks_played >= 0)
);

-- 2. weekly_scores -----------------------------------------------------------------------
create table if not exists public.weekly_scores (
  id uuid default gen_random_uuid() primary key,
  player_id uuid references public.players(id) on delete cascade not null,
  week_number integer not null check (week_number between 1 and 8),
  attended boolean not null default true,
  court_number integer check (court_number >= 1),
  finish_order integer check (finish_order between 1 and 4),
  points integer not null default 0 check (points >= 0),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  constraint unique_player_week unique (player_id, week_number)
);

-- 3. season_leaderboard (only if missing; later migrations replace it) --------------------
do $$
begin
  if to_regclass('public.season_leaderboard') is null then
    execute $v$
      create view public.season_leaderboard as
      select
        p.id,
        p.name,
        count(w.week_number) filter (where w.attended = true)::integer as weeks_played,
        coalesce(sum(w.points) filter (where w.attended = true), 0)::integer as total_points
      from public.players p
      left join public.weekly_scores w on p.id = w.player_id
      group by p.id, p.name
      order by total_points desc, weeks_played desc, p.name asc
    $v$;
  end if;
end $$;

-- 4. Totals trigger (only if missing; 20261205000000_db_cleanup.sql replaces the function) -----
do $$
begin
  if to_regprocedure('public.sync_player_leaderboard_stats()') is null then
    execute $f$
      create function public.sync_player_leaderboard_stats()
      returns trigger language plpgsql set search_path = '' as $body$
      begin
        update public.players p
           set weeks_played = coalesce((select count(distinct w.week_number) from public.weekly_scores w
                                         where w.player_id = p.id and w.attended), 0),
               total_points = coalesce((select sum(w.points) from public.weekly_scores w
                                         where w.player_id = p.id and w.attended), 0)
         where p.id = coalesce(new.player_id, old.player_id);
        return null;
      end;
      $body$
    $f$;
  end if;
  if not exists (select 1 from pg_trigger
                  where tgname = 'trg_sync_player_leaderboard' and tgrelid = 'public.weekly_scores'::regclass) then
    create trigger trg_sync_player_leaderboard
    after insert or update or delete on public.weekly_scores
    for each row execute function public.sync_player_leaderboard_stats();
  end if;
end $$;

-- 5. Row level security: public read only (admin writes come in later migrations) ---------
alter table public.players enable row level security;
alter table public.weekly_scores enable row level security;

drop policy if exists "Allow public read players" on public.players;
create policy "Allow public read players"
  on public.players for select using (true);

drop policy if exists "Allow public read weekly scores" on public.weekly_scores;
create policy "Allow public read weekly scores"
  on public.weekly_scores for select using (true);

-- 6. weeks: one row per week with metadata and a single podium photo -----------------------
create table if not exists public.weeks (
  week_number integer primary key check (week_number between 1 and 8),
  played_on date,
  notes text,
  podium_photo_url text,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.weeks enable row level security;

drop policy if exists "Allow public read weeks" on public.weeks;
create policy "Allow public read weeks"
  on public.weeks for select using (true);

-- 7. week-photos bucket (public read; limits and admin writes come in later migrations) ---
insert into storage.buckets (id, name, public)
values ('week-photos', 'week-photos', true)
on conflict (id) do nothing;

drop policy if exists "Public read week photos" on storage.objects;
create policy "Public read week photos"
  on storage.objects for select using (bucket_id = 'week-photos');

commit;
