-- Event settings: admin-editable schedule and capacity for the weekly run. Idempotent. NOT applied
-- automatically; run it yourself in the Supabase SQL Editor (staging first).
--
-- APPLY ORDER (needs all of these):
--   1. 20261118000000_profiles_foundation.sql   (public.is_admin(), profiles)
--   2. 20261119000000_player_admin.sql
--   3. 20261124000000_rsvps.sql                 (the rsvp_* helpers redefined below)
--   4. 20261127000000_event_settings.sql        (this file)
--
-- Design notes
--   * One row, enforced by a primary key with check (id = 1). It describes the CURRENT event: when
--     RSVPs close, when it starts and ends (absolute instants), plus the player capacity.
--   * Everyone can read it (it is public schedule info). Only admins can insert or update, through
--     RLS with public.is_admin(), the same admin mechanism as every other admin feature. Nobody can
--     delete the row. updated_at / updated_by are set by a trigger and cannot be forged.
--   * The cutoff was ALREADY enforced server-side: set_rsvp() raises RV001 when
--     now() >= rsvp_cutoff_at(session) and the rsvps table is sealed (RLS, no policies, no grants),
--     so there is no client path around it. This migration makes rsvp_cutoff_at() read the setting,
--     so the existing enforcement follows the admin's value. Admin RPCs still bypass it on purpose
--     (an admin can fix the list after the cutoff).
--   * The setting only applies to the event whose local date matches it. Once event_end_at passes
--     (or while the event is more than 7 days away) the helpers fall back to the built-in weekly
--     rule (Wednesday, 6/8/10 PM Toronto, capacity 24), so the app never stalls on a stale row.
--   * Wednesday only, for now: rsvps has a CHECK (rsvps_wednesday) and set_rsvp()/admin RPCs refuse
--     other weekdays (RV007). The trigger below rejects a non-Wednesday start so a bad setting
--     cannot wedge RSVPs. A different weekday needs a follow-up migration touching those.

do $$
begin
  if to_regprocedure('public.is_admin()') is null then
    raise exception 'Apply 20261118000000_profiles_foundation.sql first (public.is_admin() is missing)';
  end if;
  if to_regprocedure('public.rsvp_cutoff_at(date)') is null then
    raise exception 'Apply 20261124000000_rsvps.sql first';
  end if;
end $$;

-- 1. Table ------------------------------------------------------------------------------
create table if not exists public.event_settings (
  id              integer primary key default 1,
  rsvp_cutoff_at  timestamptz not null,
  event_start_at  timestamptz not null,
  event_end_at    timestamptz not null,
  timezone        text not null default 'America/Toronto',
  capacity        integer not null default 24,
  updated_at      timestamptz not null default now(),
  updated_by      uuid null references auth.users (id) on delete set null,
  constraint event_settings_single_row check (id = 1),
  constraint event_settings_start_before_end check (event_start_at < event_end_at),
  constraint event_settings_cutoff_by_start check (rsvp_cutoff_at <= event_start_at),
  constraint event_settings_capacity check (capacity between 1 and 200)
);

-- 2. Trigger: stamp the editor, validate the zone and weekday -------------------------------
create or replace function public.event_settings_before_write()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.updated_at := now();
  new.updated_by := (select auth.uid());   -- null when run from the SQL editor / service role
  if not exists (select 1 from pg_catalog.pg_timezone_names n where n.name = new.timezone) then
    raise exception 'Unknown time zone: %', new.timezone using errcode = '22023';
  end if;
  if extract(dow from (new.event_start_at at time zone new.timezone)) <> 3 then
    raise exception 'The event must start on a Wednesday (RSVP rules are Wednesday-only for now)'
      using errcode = '22023';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_event_settings_before_write on public.event_settings;
create trigger trg_event_settings_before_write
  before insert or update on public.event_settings
  for each row execute function public.event_settings_before_write();

revoke all on function public.event_settings_before_write() from public, anon, authenticated;

-- 3. RLS: public read, admin write -------------------------------------------------------
alter table public.event_settings enable row level security;
revoke all on public.event_settings from public, anon, authenticated;
grant select on public.event_settings to anon, authenticated;
-- Column grants keep updated_at / updated_by out of reach (the trigger owns them).
grant insert (id, rsvp_cutoff_at, event_start_at, event_end_at, timezone, capacity)
  on public.event_settings to authenticated;
grant update (rsvp_cutoff_at, event_start_at, event_end_at, timezone, capacity)
  on public.event_settings to authenticated;
-- No delete grant: the single row can be edited, never removed.

drop policy if exists event_settings_select on public.event_settings;
create policy event_settings_select on public.event_settings
  for select to anon, authenticated using (true);

drop policy if exists event_settings_admin_insert on public.event_settings;
create policy event_settings_admin_insert on public.event_settings
  for insert to authenticated with check (public.is_admin());

drop policy if exists event_settings_admin_update on public.event_settings;
create policy event_settings_admin_update on public.event_settings
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- 4. The RSVP helpers now read the setting (same signatures, so set_rsvp & co. are untouched)
-- Dates for the setting are the event's LOCAL date in its own time zone.
create or replace function public.rsvp_capacity() returns integer
language sql stable set search_path = '' as $$
  select coalesce((select s.capacity from public.event_settings s where s.id = 1), 24)
$$;

create or replace function public.rsvp_cutoff_at(p_session date) returns timestamptz
language sql stable set search_path = '' as $$
  select coalesce(
    (select s.rsvp_cutoff_at from public.event_settings s
      where (s.event_start_at at time zone s.timezone)::date = p_session),
    (p_session + time '18:00') at time zone 'America/Toronto')
$$;

create or replace function public.rsvp_live_start(p_session date) returns timestamptz
language sql stable set search_path = '' as $$
  select coalesce(
    (select s.event_start_at from public.event_settings s
      where (s.event_start_at at time zone s.timezone)::date = p_session),
    (p_session + time '20:00') at time zone 'America/Toronto')
$$;

create or replace function public.rsvp_live_end(p_session date) returns timestamptz
language sql stable set search_path = '' as $$
  select coalesce(
    (select s.event_end_at from public.event_settings s
      where (s.event_start_at at time zone s.timezone)::date = p_session),
    (p_session + time '22:00') at time zone 'America/Toronto')
$$;

-- The setting wins while its event is current: from 7 days before it starts (the same window
-- writes are open for) until it ends. Otherwise the built-in rule: today if it is Wednesday and
-- before the live window ends, else the next Wednesday.
create or replace function public.rsvp_session_date(p_now timestamptz default now()) returns date
language sql stable set search_path = '' as $$
  select coalesce(
    (select (s.event_start_at at time zone s.timezone)::date
       from public.event_settings s
      where p_now >= s.event_start_at - interval '7 days' and p_now < s.event_end_at),
    (select case
        when extract(dow from l.ts) = 3 and p_now < ((l.ts::date + time '22:00') at time zone 'America/Toronto')
          then l.ts::date
        else l.ts::date + coalesce(nullif((3 - extract(dow from l.ts)::integer + 7) % 7, 0), 7)
      end
      from (select p_now at time zone 'America/Toronto' as ts) l))
$$;

revoke all on function public.rsvp_capacity(), public.rsvp_cutoff_at(date), public.rsvp_live_start(date),
  public.rsvp_live_end(date), public.rsvp_session_date(timestamptz) from public, anon, authenticated;

-- 5. Seed: the current default behavior ---------------------------------------------------
-- The upcoming Wednesday (or today, if it is still running): cutoff 6 PM, 8-10 PM Toronto, 24 players.
-- Skipped if a row already exists, so re-running never overwrites an admin's edits.
insert into public.event_settings (id, rsvp_cutoff_at, event_start_at, event_end_at, timezone, capacity)
select 1,
       public.rsvp_cutoff_at(d), public.rsvp_live_start(d), public.rsvp_live_end(d),
       'America/Toronto', 24
from (select public.rsvp_session_date() as d) x
on conflict (id) do nothing;
