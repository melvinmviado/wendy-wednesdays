-- Court assignments: the facility's courts as a list, top court first (10, 9, 8, 7, 3, 2), not only
-- a range of consecutive numbers. Idempotent. NOT applied automatically; run it yourself in the
-- Supabase SQL Editor (staging first), then run supabase/tests/court_numbers_list.sql.
--
-- APPLY ORDER: after 20261209000000_court_assignment_rsvp_changes.sql. Apply it BEFORE deploying
-- the app version that edits "Court numbers" as a list (that app reads court_numbers).
--
-- What changes
--   * event_court_settings.court_numbers integer[]: the courts in play, top court first, in any
--     order: 1 to 50 different whole numbers of 1 or more. A board's court_number is
--     court_numbers[court_position + 1].
--   * top_court_number / bottom_court_number stay, kept equal to the first and last entries by a
--     trigger, so anything that still reads them keeps working. A writer that sets only those two
--     (the app before this change) still gets the whole range between them, as before.
--   * courts_in_use becomes cardinality(court_numbers). It is a computed column, so it is dropped
--     and added again with the new formula; no data is lost.
--   * court_assignment_prepare copies court_numbers to a run that has none, and returns it to the
--     Edge Function (redeploy generate-court-assignments so it uses the list).
--   * DATA: every run saved as 10 -> 5 becomes 10, 9, 8, 7, 3, 2, the facility's courts. Players
--     already on court 6 or 5 on such a run move to court 3 or 2 (same position, so same seeding).
--
-- ROLLBACK (run manually, in this order):
--   drop trigger if exists trg_event_court_settings_sync on public.event_court_settings;
--   alter table public.event_court_settings drop column courts_in_use;
--   alter table public.event_court_settings add column courts_in_use integer
--     generated always as (abs(top_court_number - bottom_court_number) + 1) stored;
--   Re-run 20261206000000_court_assignments.sql and 20261207000000_court_assignment_generation.sql
--   (both idempotent: they restore the range-based functions and triggers), then:
--   alter table public.event_court_settings drop constraint if exists event_court_settings_court_numbers;
--   alter table public.event_court_settings drop column if exists court_numbers;
--   drop function if exists public.event_court_settings_sync(), public.court_numbers_valid(integer[]),
--     public.court_numbers_from_range(integer, integer);
--   Runs saved as 10, 9, 8, 7, 3, 2 then read as the range 10 -> 2 (9 courts): save them again.

begin;

-- 0. Preconditions ---------------------------------------------------------------------
do $$
begin
  if to_regprocedure('public.court_assignment_rsvp_changes(date)') is null then
    raise exception 'Apply 20261209000000_court_assignment_rsvp_changes.sql first';
  end if;
  if exists (select 1 from public.event_court_settings
              where abs(top_court_number - bottom_court_number) + 1 > 50) then
    raise exception 'A run has more than 50 courts saved; fix its top and bottom court numbers first';
  end if;
end $$;

-- 1. Helpers ---------------------------------------------------------------------------
-- 1 to 50 different whole numbers of 1 or more, as a plain list (one dimension, from index 1).
create or replace function public.court_numbers_valid(p integer[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    array_ndims(p) = 1
    and array_lower(p, 1) = 1
    and cardinality(p) between 1 and 50
    and array_position(p, null) is null
    and 0 < all (p)
    and cardinality(p) = (select count(distinct x) from unnest(p) x),
    false)
$$;

-- (10, 7) -> {10,9,8,7}; (4, 6) -> {4,5,6}. Empty when either end is null.
create or replace function public.court_numbers_from_range(p_top integer, p_bottom integer)
returns integer[]
language sql
immutable
set search_path = ''
as $$
  select array(select generate_series(p_top, p_bottom, case when p_bottom >= p_top then 1 else -1 end))
$$;

-- Writers (admins through the API, generation as service_role) need these: the trigger and the
-- check below call them as the writer. They only compute, so exposing them reveals nothing.
revoke all on function public.court_numbers_valid(integer[]), public.court_numbers_from_range(integer, integer)
  from public, anon;
grant execute on function public.court_numbers_valid(integer[]), public.court_numbers_from_range(integer, integer)
  to authenticated, service_role;

-- 2. The column and its sync trigger ---------------------------------------------------
alter table public.event_court_settings add column if not exists court_numbers integer[];

-- court_numbers and top/bottom describe the same courts. A write that changes the list sets
-- top/bottom from it; a write that changes only top/bottom (older code) sets the list to that
-- range. An invalid list is refused here, as a check violation with a plain message (left to the
-- constraints, it would surface as a confusing "null value in top_court_number"). Not SECURITY DEFINER.
create or replace function public.event_court_settings_sync()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (tg_op = 'INSERT' and new.court_numbers is null)
     or (tg_op = 'UPDATE' and new.court_numbers is not distinct from old.court_numbers
         and (new.top_court_number is distinct from old.top_court_number
              or new.bottom_court_number is distinct from old.bottom_court_number)) then
    new.court_numbers := public.court_numbers_from_range(new.top_court_number, new.bottom_court_number);
  end if;
  if not public.court_numbers_valid(new.court_numbers) then
    raise exception 'Court numbers must be 1 to 50 different whole numbers of 1 or more, got %',
      coalesce(new.court_numbers::text, 'none') using errcode = '23514';
  end if;
  new.top_court_number := new.court_numbers[1];
  new.bottom_court_number := new.court_numbers[cardinality(new.court_numbers)];
  return new;
end;
$$;

revoke all on function public.event_court_settings_sync() from public, anon, authenticated;

drop trigger if exists trg_event_court_settings_sync on public.event_court_settings;
create trigger trg_event_court_settings_sync
  before insert or update on public.event_court_settings
  for each row execute function public.event_court_settings_sync();

-- 3. Board numbering from the list -----------------------------------------------------
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
    raise exception 'Set the court numbers for % first', new.session_date using errcode = 'CA001';
  end if;
  if new.court_position >= coalesce(cardinality(s.court_numbers), 0) then
    raise exception 'Court position % is past the bottom court (% courts in use)',
      new.court_position, coalesce(cardinality(s.court_numbers), 0) using errcode = 'CA002';
  end if;
  new.court_number := s.court_numbers[new.court_position + 1];
  return new;
end;
$$;

-- Changing a run's courts renumbers its board. The update fires the trigger above, which refuses
-- the whole change if a player's court position is past the end of the new list.
create or replace function public.event_court_settings_after_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.court_assignments a
     set court_number = new.court_numbers[a.court_position + 1]
   where a.session_date = new.session_date
     and a.court_position is not null;
  return null;
end;
$$;

drop trigger if exists trg_event_court_settings_renumber on public.event_court_settings;
create trigger trg_event_court_settings_renumber
  after update of court_numbers, top_court_number, bottom_court_number on public.event_court_settings
  for each row
  when (old.court_numbers is distinct from new.court_numbers)
  execute function public.event_court_settings_after_update();

-- 4. Backfill, then the rules ----------------------------------------------------------
update public.event_court_settings
   set court_numbers = public.court_numbers_from_range(top_court_number, bottom_court_number)
 where court_numbers is null;

alter table public.event_court_settings alter column court_numbers set not null;
alter table public.event_court_settings drop constraint if exists event_court_settings_court_numbers;
alter table public.event_court_settings add constraint event_court_settings_court_numbers
  check (public.court_numbers_valid(court_numbers));

do $$
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'event_court_settings'
                    and column_name = 'courts_in_use'
                    and generation_expression like '%court_numbers%') then
    alter table public.event_court_settings drop column if exists courts_in_use;
    alter table public.event_court_settings
      add column courts_in_use integer generated always as (cardinality(court_numbers)) stored;
  end if;
end $$;

grant insert (court_numbers), update (court_numbers) on public.event_court_settings to authenticated;

-- 5. Data: the facility's courts are 10, 9, 8, 7, 3, 2 (there are no courts 6 and 5) -------
update public.event_court_settings
   set court_numbers = '{10,9,8,7,3,2}'
 where court_numbers = '{10,9,8,7,6,5}';

-- 6. Generation carries the list forward and hands it to the Edge Function ---------------
-- Same as 20261207000000 except the court settings copy and the returned court_numbers.
create or replace function public.court_assignment_prepare(p_session_date date)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  d         date := p_session_date;
  s         public.event_court_settings%rowtype;
  m         public.event_assignment_meta%rowtype;
  g         record;
  hit_id    uuid;
  new_id    uuid;
  converted integer := 0;
begin
  if d is null or extract(dow from d) <> 3 then
    raise exception 'That is not a Wednesday' using errcode = 'RV007';
  end if;
  if now() < public.rsvp_cutoff_at(d) then
    raise exception 'RSVPs for % are still open', d using errcode = 'CA011';
  end if;

  -- The same lock set_rsvp and the admin RSVP functions take: the list holds still while we work.
  perform pg_advisory_xact_lock(hashtextextended('rsvp:' || d::text, 0));

  -- The run's courts, else a copy of the latest earlier run's.
  insert into public.event_court_settings (session_date, court_numbers, auto_publish)
  select d, e.court_numbers, e.auto_publish
    from (select * from public.event_court_settings x
           where x.session_date < d
           order by x.session_date desc
           limit 1) e
  on conflict (session_date) do nothing;
  select * into s from public.event_court_settings where session_date = d;
  if not found then
    raise exception 'Set the court numbers in Event setup first' using errcode = 'CA001';
  end if;

  insert into public.event_assignment_meta (session_date) values (d) on conflict (session_date) do nothing;
  select * into m from public.event_assignment_meta where session_date = d;

  -- Confirmed guests become players. The RSVP row keeps its created_at, so its place in line.
  for g in
    select l.rsvp_id, l.guest_name
      from public.court_assignment_locked_list(d) l
     where l.guest_name is not null
     order by l.rsvp_at
  loop
    select p.id into hit_id
      from public.players p
     where p.archived_at is null
       and lower(btrim(regexp_replace(p.name, '\s+', ' ', 'g')))
           = lower(btrim(regexp_replace(g.guest_name, '\s+', ' ', 'g')))
     limit 1;
    if found then
      raise exception 'The guest "%" has the same name as a player on the roster', g.guest_name
        using errcode = 'CA010', detail = hit_id::text,
              hint = 'On the RSVP list, link the guest to that player or rename the guest.';
    end if;
    insert into public.players (name) values (g.guest_name) returning id into new_id;
    update public.rsvps set player_id = new_id, guest_name = null where id = g.rsvp_id;
    converted := converted + 1;
  end loop;

  return jsonb_build_object(
    'session_date', d,
    'court_numbers', to_jsonb(s.court_numbers),
    'top_court_number', s.top_court_number,
    'bottom_court_number', s.bottom_court_number,
    'auto_publish', s.auto_publish,
    'state', m.state,
    'manually_edited', m.manually_edited,
    'converted_guests', converted,
    'players', (
      select coalesce(jsonb_agg(jsonb_build_object('id', l.player_id, 'rank', st.season_rank, 'rsvp_at', l.rsvp_at)
                                order by l.rsvp_at, l.player_id), '[]'::jsonb)
        from public.court_assignment_locked_list(d) l
        left join (
          select sl.id,
                 case when sl.weeks_played > 0
                      then (rank() over (order by sl.total_points desc))::integer end as season_rank
            from public.season_leaderboard sl
        ) st on st.id = l.player_id));
end;
$$;

revoke all on function public.court_assignment_prepare(date) from public, anon, authenticated;
grant execute on function public.court_assignment_prepare(date) to service_role;

commit;
