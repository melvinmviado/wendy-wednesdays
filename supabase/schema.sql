-- 1. Create the players table for Wendy Wednesdays leaderboard
create table if not exists public.players (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  weeks_played integer not null default 1 check (weeks_played >= 1),
  total_points integer not null default 0 check (total_points >= 0),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 2. Enable Row Level Security (RLS)
alter table public.players enable row level security;

-- 3. Policy: Anyone can view the season leaderboard (public read)
create policy "Allow public read access to leaderboard"
  on public.players
  for select
  using (true);

-- 4. Policy: Only authenticated admin users can insert new players
create policy "Allow authenticated admin users to insert players"
  on public.players
  for insert
  to authenticated
  with check (true);

-- 5. Policy: Only authenticated admin users can update players
create policy "Allow authenticated admin users to update players"
  on public.players
  for update
  to authenticated
  using (true)
  with check (true);

-- 6. Policy: Only authenticated admin users can delete players
create policy "Allow authenticated admin users to delete players"
  on public.players
  for delete
  to authenticated
  using (true);

-- 7. Insert initial seed data
insert into public.players (name, weeks_played, total_points) values
  ('Wendy Mitchell', 10, 1240),
  ('Marcus Chen', 10, 1185),
  ('Sarah Jenkins', 9, 1120),
  ('Devon Vance', 10, 1045),
  ('Elena Rostova', 8, 980),
  ('Jordan Hayes', 9, 935),
  ('Aaliyah Patel', 8, 890),
  ('Liam Gallagher', 7, 820),
  ('Carlos Mendez', 8, 795),
  ('Taylor Brooks', 6, 710),
  ('Chloe Kim', 6, 680),
  ('Noah Washington', 5, 590)
on conflict do nothing;
