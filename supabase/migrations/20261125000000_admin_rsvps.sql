-- Admin-managed RSVPs: an admin can put any roster player on a session's list, or take them
-- off, whether or not that player has a login or has RSVP'd themselves. Idempotent. NOT applied
-- automatically; run it yourself in the Supabase SQL Editor.
--
-- APPLY ORDER (needs all of these):
--   1. 20261118000000_profiles_foundation.sql   (public.is_admin())
--   2. 20261119000000_player_admin.sql          (players.archived_at, touch_updated_at())
--   3. 20261120000000_player_claims.sql         (players.user_id)
--   4. 20261122000000_player_avatars.sql        (players.avatar_url)
--   5. 20261124000000_rsvps.sql                 (rsvps table, rsvp_* helpers)
--   6. 20261125000000_admin_rsvps.sql           (this file)
--
-- Design notes
--   * Why RPCs and not RLS policies: public.rsvps is deliberately sealed (RLS on, NO policies,
--     all grants revoked) because it holds device-token hashes and user ids. Policies would mean
--     granting table access to `authenticated`, which would expose those columns to every
--     signed-in user and let an admin write rows that skip the queue rules. These two functions
--     follow the existing pattern (set_rsvp, admin_convert_guest_rsvp): SECURITY DEFINER,
--     search_path = '', and public.is_admin() checked first inside the function. The table
--     stays sealed.
--   * Queue rules are reused, not re-implemented. Position is derived from created_at ('in'
--     rows), 1..rsvp_capacity() play, the rest are the waitlist. There is no hard cap to
--     refuse: an admin add past capacity simply lands on the waitlist, exactly as a player's own
--     RSVP would, and nobody already on the list is bumped. Re-adding someone who was 'out'
--     resets created_at (back of the line), same as set_rsvp.
--   * Admins bypass the 6:00 PM cutoff, the per-device cap and the guest cap, as in set_rsvp.
--     Past sessions and dates more than 7 days ahead are still refused (RV007).
--   * Same advisory lock as set_rsvp, so a double-click or a race with the player's own tap is
--     serialised. Both functions are idempotent: repeating a call changes nothing and returns
--     changed = false.
--   * "Remove" sets status = 'out' (what a self-cancel does) rather than deleting the row, so
--     the roster still shows the player as out and a later re-add behaves like any rejoin.
--   * Rows added here have no device_token. Like a row created by admin_convert_guest_rsvp, the
--     first anonymous device to tap that player's name afterwards binds to it (unclaimed
--     players only; a claimed player's row is owned by their user_id).
--
-- Error codes (SQLSTATE), matching set_rsvp:
--   42501 not an admin        RV003 player missing or archived
--   RV007 date is not an open Wednesday        RV008 bad input

begin;

-- 0. Preconditions ---------------------------------------------------------------------
do $$
begin
  if to_regprocedure('public.is_admin()') is null then
    raise exception 'Apply 20261118000000_profiles_foundation.sql first';
  end if;
  if to_regclass('public.rsvps') is null
     or to_regprocedure('public.set_rsvp(uuid, text, text, text, date)') is null
     or to_regprocedure('public.rsvp_queue(date)') is null then
    raise exception 'Apply 20261124000000_rsvps.sql first';
  end if;
end $$;

-- 1. Who made the change ----------------------------------------------------------------
-- The admin who last added this row (or re-added it). Null for self-service RSVPs and for rows
-- that existed before this migration. Stays null-safe if the admin's auth user is deleted.
alter table public.rsvps
  add column if not exists added_by uuid null references auth.users (id) on delete set null;

-- 2. admin_add_rsvp ---------------------------------------------------------------------
-- Returns {rsvp_id, session_date, status, changed, position, waitlist_position}.
-- changed = false when the player was already 'in' (nothing was touched).
create or replace function public.admin_add_rsvp(p_player_id uuid, p_session_date date default null)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
#variable_conflict use_column
declare
  actor   uuid := (select auth.uid());
  d       date := coalesce(p_session_date, public.rsvp_session_date());
  today   date := (now() at time zone 'America/Toronto')::date;
  cap     integer := public.rsvp_capacity();
  pl      public.players%rowtype;
  r       public.rsvps%rowtype;
  changed boolean := false;
  pos     integer;
begin
  if not public.is_admin() then
    raise exception 'Admins only' using errcode = '42501';
  end if;
  if p_player_id is null then
    raise exception 'A player is required' using errcode = 'RV008';
  end if;
  if extract(dow from d) <> 3 or d < today or d > today + 7 then
    raise exception 'That is not an open RSVP date' using errcode = 'RV007';
  end if;

  -- One writer per session at a time (same key as set_rsvp / admin_convert_guest_rsvp).
  perform pg_advisory_xact_lock(hashtextextended('rsvp:' || d::text, 0));

  select * into pl from public.players where id = p_player_id;
  if not found or pl.archived_at is not null then
    raise exception 'That player is not available' using errcode = 'RV003';
  end if;

  select * into r from public.rsvps x where x.session_date = d and x.player_id = pl.id for update;
  if not found then
    insert into public.rsvps (session_date, player_id, user_id, status, created_at, added_by)
    values (d, pl.id, pl.user_id, 'in', clock_timestamp(), actor)
    on conflict (session_date, player_id) do nothing
    returning * into r;
    changed := found;
    if not changed then   -- cannot happen under the lock; kept so a regression never errors
      select * into r from public.rsvps x where x.session_date = d and x.player_id = pl.id;
    end if;
  elsif r.status = 'out' then
    update public.rsvps x
       set status = 'in', created_at = clock_timestamp(), added_by = actor
     where x.id = r.id
    returning * into r;
    changed := true;
  end if;

  select q.queue_pos into pos from public.rsvp_queue(d) q where q.rsvp_id = r.id;
  return jsonb_build_object(
    'rsvp_id', r.id, 'session_date', d, 'status', r.status, 'changed', changed,
    'position', pos, 'waitlist_position', case when pos > cap then pos - cap end);
end;
$$;

-- 3. admin_remove_rsvp ------------------------------------------------------------------
-- Takes a player off the list (status 'out'). Everyone behind them moves up automatically.
-- No row, or already 'out' -> changed = false and nothing is created or touched.
create or replace function public.admin_remove_rsvp(p_player_id uuid, p_session_date date default null)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
#variable_conflict use_column
declare
  d       date := coalesce(p_session_date, public.rsvp_session_date());
  today   date := (now() at time zone 'America/Toronto')::date;
  r       public.rsvps%rowtype;
  changed boolean := false;
begin
  if not public.is_admin() then
    raise exception 'Admins only' using errcode = '42501';
  end if;
  if p_player_id is null then
    raise exception 'A player is required' using errcode = 'RV008';
  end if;
  if extract(dow from d) <> 3 or d < today or d > today + 7 then
    raise exception 'That is not an open RSVP date' using errcode = 'RV007';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('rsvp:' || d::text, 0));

  -- Unlike add, removal does not require the player to be active: an archived player's row
  -- must still be removable.
  select * into r from public.rsvps x where x.session_date = d and x.player_id = p_player_id for update;
  if found and r.status = 'in' then
    update public.rsvps x set status = 'out' where x.id = r.id returning * into r;
    changed := true;
  end if;

  return jsonb_build_object(
    'rsvp_id', case when r.id is not null then r.id end, 'session_date', d,
    'status', case when r.id is not null then r.status end, 'changed', changed);
end;
$$;

-- 4. Execute grants ---------------------------------------------------------------------
-- Signed-in users only can call them, and each function re-checks is_admin() itself.
revoke all on function public.admin_add_rsvp(uuid, date), public.admin_remove_rsvp(uuid, date)
  from public, anon, authenticated;
grant execute on function public.admin_add_rsvp(uuid, date) to authenticated;
grant execute on function public.admin_remove_rsvp(uuid, date) to authenticated;

commit;
