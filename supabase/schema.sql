-- 1. Create the players table
create table if not exists public.players (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  weeks_played integer not null default 0,
  total_points integer not null default 0,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  constraint players_weeks_played_check check (weeks_played >= 0)
);

-- For databases created before this constraint was relaxed (allows 0 weeks played)
alter table public.players drop constraint if exists players_weeks_played_check;
alter table public.players add constraint players_weeks_played_check check (weeks_played >= 0);

-- 2. Create the weekly_scores table with court & finish order
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

-- Add columns if table already existed previously
alter table public.weekly_scores add column if not exists court_number integer check (court_number >= 1);
alter table public.weekly_scores add column if not exists finish_order integer check (finish_order between 1 and 4);

-- 3. Database computed leaderboard view
create or replace view public.season_leaderboard as
select
  p.id,
  p.name,
  count(w.week_number) filter (where w.attended = true)::integer as weeks_played,
  coalesce(sum(w.points) filter (where w.attended = true), 0)::integer as total_points
from public.players p
left join public.weekly_scores w on p.id = w.player_id
group by p.id, p.name
order by total_points desc, weeks_played desc, p.name asc;

-- 4. Automatic database trigger to keep players summary updated on any weekly score change
create or replace function public.sync_player_leaderboard_stats()
returns trigger as $$
begin
  update public.players p
  set
    weeks_played = coalesce((
      select count(distinct week_number)
      from public.weekly_scores
      where player_id = p.id and attended = true
    ), 0),
    total_points = coalesce((
      select sum(points)
      from public.weekly_scores
      where player_id = p.id and attended = true
    ), 0)
  where p.id = coalesce(new.player_id, old.player_id);
  return null;
end;
$$ language plpgsql;

drop trigger if exists trg_sync_player_leaderboard on public.weekly_scores;
create trigger trg_sync_player_leaderboard
after insert or update or delete on public.weekly_scores
for each row execute function public.sync_player_leaderboard_stats();

-- 5. Enable Row Level Security (RLS)
alter table public.players enable row level security;
alter table public.weekly_scores enable row level security;

-- 6. RLS Policies: Players
create policy "Allow public read players"
  on public.players for select using (true);

create policy "Allow authenticated admin insert players"
  on public.players for insert to authenticated with check (true);

create policy "Allow authenticated admin update players"
  on public.players for update to authenticated using (true) with check (true);

create policy "Allow authenticated admin delete players"
  on public.players for delete to authenticated using (true);

-- 7. RLS Policies: Weekly Scores
create policy "Allow public read weekly scores"
  on public.weekly_scores for select using (true);

create policy "Allow authenticated admin insert weekly scores"
  on public.weekly_scores for insert to authenticated with check (true);

create policy "Allow authenticated admin update weekly scores"
  on public.weekly_scores for update to authenticated using (true) with check (true);

create policy "Allow authenticated admin delete weekly scores"
  on public.weekly_scores for delete to authenticated using (true);

-- 8. Weeks: one row per week holding metadata and a single podium photo.
-- Not required for scoring; the row is created on demand (upsert) when a photo or note is saved.
-- Weeks stay editable after the fact, so there is intentionally no "finalized" flag.
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

drop policy if exists "Allow authenticated admin insert weeks" on public.weeks;
create policy "Allow authenticated admin insert weeks"
  on public.weeks for insert to authenticated with check (true);

drop policy if exists "Allow authenticated admin update weeks" on public.weeks;
create policy "Allow authenticated admin update weeks"
  on public.weeks for update to authenticated using (true) with check (true);

drop policy if exists "Allow authenticated admin delete weeks" on public.weeks;
create policy "Allow authenticated admin delete weeks"
  on public.weeks for delete to authenticated using (true);

-- 9. Storage bucket for podium photos (public read, admin write)
insert into storage.buckets (id, name, public)
values ('week-photos', 'week-photos', true)
on conflict (id) do nothing;

drop policy if exists "Public read week photos" on storage.objects;
create policy "Public read week photos"
  on storage.objects for select using (bucket_id = 'week-photos');

drop policy if exists "Admin insert week photos" on storage.objects;
create policy "Admin insert week photos"
  on storage.objects for insert to authenticated with check (bucket_id = 'week-photos');

drop policy if exists "Admin update week photos" on storage.objects;
create policy "Admin update week photos"
  on storage.objects for update to authenticated
  using (bucket_id = 'week-photos') with check (bucket_id = 'week-photos');

drop policy if exists "Admin delete week photos" on storage.objects;
create policy "Admin delete week photos"
  on storage.objects for delete to authenticated using (bucket_id = 'week-photos');
