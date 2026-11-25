-- Court assignments: each confirmed player's starting court for a run, as a draft the admin can
-- publish. Idempotent. NOT applied automatically; run it yourself in the Supabase SQL Editor
-- (staging first), then run supabase/tests/court_assignments.sql.
--
-- APPLY ORDER: after 20261205000000_db_cleanup.sql (needs every earlier migration).
--
-- What "event" means here
--   There is no events table. A run is identified by its Wednesday date, the key public.rsvps
--   already uses, so every table below has session_date where a design might say event_id.
--   public.event_settings is one row for the CURRENT run only, so the court range lives in its
--   own per-run table and past runs keep their numbering.
--
-- Tables
--   event_court_settings   one row per run: the facility's top and bottom court numbers, either
--                          direction (10 -> 4 and 4 -> 10 are both valid). courts_in_use is
--                          |top - bottom| + 1, computed by the database.
--   event_assignment_meta  one row per run: none / draft / published, and when and by whom it was
--                          generated. Needs the run's court range (FK, ON DELETE RESTRICT).
--   court_assignments      one row per player per run. court_position 0 = top court, null = not
--                          on a court (sitting out). court_number (the facility's number) is
--                          computed by a trigger, never written by the client. Needs the run's
--                          meta row (FK, ON DELETE CASCADE: deleting the meta clears the board).
--                          player_id is required: guests on the RSVP list are turned into players
--                          when RSVPs close, before the board is generated (the generator's job).
--   assignment_audit_log   append-only history (generate / swap / move / publish / unpublish /
--                          regenerate) with before / after snapshots. No FK, so it outlives a board.
--
-- Who can do what
--   * Everyone (anon and signed-in) reads court_assignments and event_assignment_meta for a
--     PUBLISHED run only, and the court_assignment_board view (names and photos, no account ids).
--   * Admins (public.is_admin(), as everywhere else) read drafts and write all four tables.
--     Nobody can change or delete the audit log through the API, admins included.
--   * Owned by the database, never the client: court_number, published_at, generated_by and
--     generated_at for API callers, the audit row's actor_id and created_at, updated_at.
--   * generated_by holds an account id: signed-in users can read it (on published runs; admins on
--     every run), anon cannot (column grants). The SQL editor and service_role (a future
--     automatic generator, which writes generated_by = 'auto') are not limited by any of this.
--
-- Realtime
--   court_assignments and event_assignment_meta join the supabase_realtime publication. Realtime
--   applies the same RLS, so anon subscribers only hear about published runs. For the client:
--     * Publishing changes the meta row, not the assignment rows: listen to meta, then refetch.
--     * UNPUBLISHING is not delivered to anon: once the row says 'draft' they may no longer see
--       it. The public page should also re-check on a timer (as the RSVP sheet does).
--     * Signed-out clients must select explicit columns from event_assignment_meta (select=*
--       includes generated_by, which anon is not granted, and fails).
--
-- Error codes: CA001 no court range for the run; CA002 court position past the bottom court.
--
-- ROLLBACK (run manually, in this order):
--   alter publication supabase_realtime drop table public.court_assignments, public.event_assignment_meta;
--   drop view if exists public.court_assignment_board;
--   drop table if exists public.assignment_audit_log, public.court_assignments,
--     public.event_assignment_meta, public.event_court_settings;
--   drop function if exists public.court_assignments_before_write(),
--     public.event_court_settings_after_update(), public.event_assignment_meta_before_write(),
--     public.court_number_at(integer, integer, integer);

begin;

-- 0. Preconditions ---------------------------------------------------------------------
do $$
begin
  if to_regprocedure('public.players_totals_guard()') is null then
    raise exception 'Apply 20261205000000_db_cleanup.sql first';
  end if;
end $$;

-- 1. event_court_settings ----------------------------------------------------------------
create table if not exists public.event_court_settings (
  session_date        date primary key,
  top_court_number    integer not null,
  bottom_court_number integer not null,
  courts_in_use       integer generated always as (abs(top_court_number - bottom_court_number) + 1) stored,
  updated_at          timestamptz not null default now(),
  constraint event_court_settings_positive check (top_court_number > 0 and bottom_court_number > 0)
);

drop trigger if exists trg_event_court_settings_touch on public.event_court_settings;
create trigger trg_event_court_settings_touch
  before update on public.event_court_settings
  for each row execute function public.touch_updated_at();

-- 2. event_assignment_meta ---------------------------------------------------------------
create table if not exists public.event_assignment_meta (
  session_date    date primary key references public.event_court_settings (session_date) on delete restrict,
  state           text not null default 'none',
  generated_at    timestamptz null,
  generated_by    text null,   -- 'auto' or the generating admin's auth.users id
  published_at    timestamptz null,
  manually_edited boolean not null default false,
  constraint event_assignment_meta_state check (state in ('none', 'draft', 'published')),
  constraint event_assignment_meta_generated_by check (
    generated_by is null or generated_by = 'auto'
    or generated_by ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'),
  constraint event_assignment_meta_published_at check ((state = 'published') = (published_at is not null))
);

-- published_at follows state for every writer. API callers who (re)generate are recorded as
-- themselves, at the database's clock, so 'auto' and other admins' ids cannot be claimed.
-- Not SECURITY DEFINER: current_user must be the caller.
create or replace function public.event_assignment_meta_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.state <> 'published' then
    new.published_at := null;
  elsif tg_op = 'UPDATE' and old.state = 'published' then
    new.published_at := old.published_at;
  else
    new.published_at := now();
  end if;

  if current_user in ('anon', 'authenticated') then
    if new.generated_at is null then
      new.generated_by := null;
    elsif tg_op = 'INSERT' or new.generated_at is distinct from old.generated_at then
      new.generated_at := now();
      new.generated_by := (select auth.uid())::text;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_event_assignment_meta_before_write on public.event_assignment_meta;
create trigger trg_event_assignment_meta_before_write
  before insert or update on public.event_assignment_meta
  for each row execute function public.event_assignment_meta_before_write();

-- 3. court_assignments -------------------------------------------------------------------
create table if not exists public.court_assignments (
  id             uuid primary key default gen_random_uuid(),
  session_date   date not null references public.event_assignment_meta (session_date) on delete cascade,
  player_id      uuid not null references public.players (id) on delete cascade,
  court_position integer null,   -- 0 = top court; null = not on a court
  court_number   integer null,   -- the facility's number, set by the trigger below
  slot           integer null,   -- 0-3 on the court
  status         text not null,
  seed_rank      integer not null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint court_assignments_status check (status in ('assigned', 'sitting_out')),
  constraint court_assignments_position check (court_position >= 0),
  constraint court_assignments_slot check (slot between 0 and 3),
  constraint court_assignments_seed_rank check (seed_rank >= 1),
  -- On a court exactly when assigned: a player sitting out has neither a position nor a slot.
  constraint court_assignments_placement check (
    (status = 'assigned' and court_position is not null and slot is not null)
    or (status = 'sitting_out' and court_position is null and slot is null)),
  constraint court_assignments_player_unique unique (session_date, player_id),
  -- One player per seat. NULLs never collide, so rows that are not on a court are ignored: the
  -- same rule as a partial index "where court_position is not null", but as a constraint it can
  -- be DEFERRABLE, so swapping two players in one UPDATE is not refused halfway through (and an
  -- RPC can SET CONSTRAINTS ... DEFERRED to move several rows across statements).
  constraint court_assignments_seat_unique unique (session_date, court_position, slot)
    deferrable initially immediate
);

create index if not exists court_assignments_player_idx on public.court_assignments (player_id);

-- The facility number of the court at a position: position 0 is the top court, and numbers run
-- toward the bottom court in whichever direction the facility's numbering goes.
create or replace function public.court_number_at(p_top integer, p_bottom integer, p_position integer)
returns integer
language sql immutable set search_path = '' as $$
  select case when p_bottom >= p_top then p_top + p_position else p_top - p_position end
$$;

-- court_number is computed here and nothing else: a position past the bottom court is refused.
-- SECURITY DEFINER so it reads the run's court range whoever writes; RLS still decides who may
-- write at all.
create or replace function public.court_assignments_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.event_court_settings%rowtype;
begin
  if new.court_position is null then
    new.court_number := null;
    return new;
  end if;
  select * into s from public.event_court_settings where session_date = new.session_date;
  if not found then
    raise exception 'Set the court range for % first', new.session_date using errcode = 'CA001';
  end if;
  if new.court_position >= s.courts_in_use then
    raise exception 'Court position % is past the bottom court (% courts in use)',
      new.court_position, s.courts_in_use using errcode = 'CA002';
  end if;
  new.court_number := public.court_number_at(s.top_court_number, s.bottom_court_number, new.court_position);
  return new;
end;
$$;

drop trigger if exists trg_court_assignments_before_write on public.court_assignments;
create trigger trg_court_assignments_before_write
  before insert or update on public.court_assignments
  for each row execute function public.court_assignments_before_write();

drop trigger if exists trg_court_assignments_touch on public.court_assignments;
create trigger trg_court_assignments_touch
  before update on public.court_assignments
  for each row execute function public.touch_updated_at();

-- Renumbering a run's courts renumbers its board. The update fires the trigger above, which
-- refuses the whole change if a player's court would fall outside the new range.
create or replace function public.event_court_settings_after_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.court_assignments a
     set court_number = public.court_number_at(new.top_court_number, new.bottom_court_number, a.court_position)
   where a.session_date = new.session_date
     and a.court_position is not null;
  return null;
end;
$$;

drop trigger if exists trg_event_court_settings_renumber on public.event_court_settings;
create trigger trg_event_court_settings_renumber
  after update of top_court_number, bottom_court_number on public.event_court_settings
  for each row
  when (old.top_court_number is distinct from new.top_court_number
     or old.bottom_court_number is distinct from new.bottom_court_number)
  execute function public.event_court_settings_after_update();

-- 4. assignment_audit_log ----------------------------------------------------------------
-- actor_id defaults to the caller and is not granted for insert, so it cannot be forged. Null
-- means an automatic run (no signed-in caller), or an admin account deleted since.
create table if not exists public.assignment_audit_log (
  id           uuid primary key default gen_random_uuid(),
  session_date date not null,
  actor_id     uuid null default auth.uid() references auth.users (id) on delete set null,
  action       text not null,
  before       jsonb null,
  after        jsonb null,
  created_at   timestamptz not null default now(),
  constraint assignment_audit_log_action
    check (action in ('generate', 'swap', 'move', 'publish', 'unpublish', 'regenerate'))
);

create index if not exists assignment_audit_log_session_idx
  on public.assignment_audit_log (session_date, created_at);
create index if not exists assignment_audit_log_actor_idx
  on public.assignment_audit_log (actor_id) where actor_id is not null;

-- 5. Grants ------------------------------------------------------------------------------
-- Start from nothing (Supabase grants new tables to anon/authenticated by default), then give
-- back only what each role needs. Column lists leave out what a trigger or default owns.
alter table public.event_court_settings enable row level security;
alter table public.event_assignment_meta enable row level security;
alter table public.court_assignments enable row level security;
alter table public.assignment_audit_log enable row level security;

revoke all on public.event_court_settings, public.event_assignment_meta,
  public.court_assignments, public.assignment_audit_log from public, anon, authenticated;

-- Court range: signed-in only (RLS: admins). The public never needs it: every assignment row
-- carries its court_number.
grant select, delete on public.event_court_settings to authenticated;
grant insert (session_date, top_court_number, bottom_court_number),
      update (session_date, top_court_number, bottom_court_number)
  on public.event_court_settings to authenticated;

-- Meta (RLS: published rows, or every row for admins). generated_by is an account id, so it is
-- for signed-in users only.
grant select (session_date, state, generated_at, published_at, manually_edited)
  on public.event_assignment_meta to anon, authenticated;
grant select (generated_by) on public.event_assignment_meta to authenticated;
grant insert (session_date, state, generated_at, manually_edited),
      update (session_date, state, generated_at, manually_edited)
  on public.event_assignment_meta to authenticated;
grant delete on public.event_assignment_meta to authenticated;

-- Assignments: nothing private in them (player ids are public through players already).
grant select on public.court_assignments to anon, authenticated;
grant insert (session_date, player_id, court_position, slot, status, seed_rank),
      update (session_date, player_id, court_position, slot, status, seed_rank)
  on public.court_assignments to authenticated;
grant delete on public.court_assignments to authenticated;

-- Audit log: read and append only. No update or delete grant for anyone.
grant select on public.assignment_audit_log to authenticated;
grant insert (session_date, action, before, after) on public.assignment_audit_log to authenticated;

-- 6. RLS policies ------------------------------------------------------------------------
-- (select public.is_admin()) is evaluated once per query (see 20261205000000_db_cleanup.sql).
drop policy if exists "Admins manage court settings" on public.event_court_settings;
create policy "Admins manage court settings" on public.event_court_settings
  for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

drop policy if exists "Public read published assignment meta" on public.event_assignment_meta;
create policy "Public read published assignment meta" on public.event_assignment_meta
  for select to anon, authenticated
  using (state = 'published');

drop policy if exists "Admins manage assignment meta" on public.event_assignment_meta;
create policy "Admins manage assignment meta" on public.event_assignment_meta
  for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

drop policy if exists "Public read published court assignments" on public.court_assignments;
create policy "Public read published court assignments" on public.court_assignments
  for select to anon, authenticated
  using (exists (select 1 from public.event_assignment_meta m
                  where m.session_date = court_assignments.session_date
                    and m.state = 'published'));

drop policy if exists "Admins manage court assignments" on public.court_assignments;
create policy "Admins manage court assignments" on public.court_assignments
  for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

drop policy if exists "Admins read assignment audit log" on public.assignment_audit_log;
create policy "Admins read assignment audit log" on public.assignment_audit_log
  for select to authenticated
  using ((select public.is_admin()));

drop policy if exists "Admins append to assignment audit log" on public.assignment_audit_log;
create policy "Admins append to assignment audit log" on public.assignment_audit_log
  for insert to authenticated
  with check ((select public.is_admin()));

-- 7. court_assignment_board view ---------------------------------------------------------
-- What the app shows: one row per player with name and photo. An owner's-rights view like
-- season_leaderboard, so it can resolve profile photos past profiles RLS. That also means it
-- bypasses the RLS above, so its WHERE clause is the guard: published runs for everyone, every
-- run for admins. No account ids (players.user_id, generated_by) appear in it. (Supabase's linter
-- flags security-definer views; that is expected here.)
create or replace view public.court_assignment_board
with (security_invoker = false) as
select
  a.id,
  a.session_date,
  m.state,
  m.published_at,
  a.court_position,
  a.court_number,
  a.slot,
  a.status,
  a.seed_rank,
  a.player_id,
  p.name,
  coalesce(pr.avatar_url, p.avatar_url) as avatar_url
from public.court_assignments a
join public.event_assignment_meta m on m.session_date = a.session_date
join public.players p on p.id = a.player_id
left join public.profiles pr on pr.id = p.user_id
where m.state = 'published' or (select public.is_admin());

revoke all on public.court_assignment_board from public, anon, authenticated;
grant select on public.court_assignment_board to anon, authenticated;

-- 8. Functions are not API endpoints -------------------------------------------------------
revoke all on function public.court_number_at(integer, integer, integer),
  public.court_assignments_before_write(), public.event_court_settings_after_update(),
  public.event_assignment_meta_before_write() from public, anon, authenticated;

-- 9. Realtime -----------------------------------------------------------------------------
-- Skipped with a notice where the publication does not exist (plain Postgres, not Supabase).
do $$
declare
  t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    raise notice 'No supabase_realtime publication: Realtime not enabled for court assignments';
    return;
  end if;
  foreach t in array array['court_assignments', 'event_assignment_meta'] loop
    if not exists (select 1 from pg_publication_tables
                    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

commit;
