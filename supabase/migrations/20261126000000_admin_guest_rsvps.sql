-- Admin-managed guests: an admin can add a named guest to a session's list, or delete one.
-- Idempotent. NOT applied automatically; run it yourself in the Supabase SQL Editor.
--
-- APPLY ORDER (needs all of these):
--   1. 20261118000000_profiles_foundation.sql   (public.is_admin())
--   2. 20261119000000_player_admin.sql          (players.archived_at)
--   3. 20261124000000_rsvps.sql                 (rsvps table, rsvp_* helpers, set_rsvp)
--   4. 20261125000000_admin_rsvps.sql           (rsvps.added_by, admin_add_rsvp / admin_remove_rsvp)
--   5. 20261126000000_admin_guest_rsvps.sql     (this file)
--
-- Design notes
--   * Why SECURITY DEFINER RPCs and not an RLS DELETE policy: public.rsvps is deliberately
--     sealed (RLS on, NO policies, every grant revoked) because it holds device-token hashes and
--     user ids. A policy would require granting table access to `authenticated`, exposing those
--     columns to every signed-in user. These functions follow the existing pattern
--     (set_rsvp, admin_convert_guest_rsvp, admin_add_rsvp, admin_remove_rsvp): SECURITY DEFINER,
--     search_path = '', and public.is_admin() checked first inside the function. The table stays
--     sealed, so admin status is enforced in the database, not in React.
--   * Guests already have a stable ID: a guest is an rsvps row, and rsvps.id (uuid primary key)
--     is exposed to the client as get_rsvp_roster.rsvp_id. No new column and no backfill are
--     needed. Removal targets that id, never the name, so two guests with similar names cannot
--     be confused. (Within one session the unique index on lower(guest_name) already stops two
--     identical names.)
--   * "Remove" here DELETES the guest row (a mistyped guest should vanish and free the name).
--     This differs on purpose from admin_remove_rsvp, which sets a player's status to 'out'.
--   * Counts, cap and waitlist need no bookkeeping: queue position is derived from the 'in' rows
--     ordered by created_at (rsvp_queue), and in_count / waitlist_count are computed from it.
--     Deleting a row therefore shifts everyone behind up one place, and the first waitlisted
--     person (player or guest) is promoted automatically. The per-session guest cap counts
--     status = 'in' guest rows, so it frees up as well.
--   * Same advisory lock as set_rsvp, so a delete cannot race a player's own tap.
--   * Same window as the player admin functions: the session must be a Wednesday from today
--     through today + 7 days (Toronto). Past sessions are refused (RV007).
--   * Members are unchanged: set_rsvp is not touched. An anonymous device can still cancel only
--     its own guests (RV002 otherwise), and a signed-in member with a claimed player still cannot
--     add guests at all (42501). Only admins can add a guest on someone else's behalf, or delete.
--   * Guests added here have no device_token. As with admin_add_rsvp rows, the first anonymous
--     device to tap that guest name afterwards binds to the row.
--
-- Error codes (SQLSTATE), matching set_rsvp:
--   42501 not an admin                          RV004 invalid guest name
--   RV005 name is an existing player (HINT = "Did you mean ...", DETAIL = player id)
--   RV007 date is not an open Wednesday         RV008 bad input
--   55000 that RSVP belongs to a player (use admin_remove_rsvp)

begin;

-- 0. Preconditions ---------------------------------------------------------------------
do $$
begin
  if to_regprocedure('public.is_admin()') is null then
    raise exception 'Apply 20261118000000_profiles_foundation.sql first';
  end if;
  if to_regclass('public.rsvps') is null
     or to_regprocedure('public.rsvp_queue(date)') is null
     or to_regprocedure('public.set_rsvp(uuid, text, text, text, date)') is null then
    raise exception 'Apply 20261124000000_rsvps.sql first';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'rsvps' and column_name = 'added_by') then
    raise exception 'Apply 20261125000000_admin_rsvps.sql first (rsvps.added_by is missing)';
  end if;
end $$;

-- 1. admin_remove_guest_rsvp -------------------------------------------------------------
-- Deletes one guest RSVP by id. Returns {rsvp_id, session_date, changed}.
-- Idempotent: an id that no longer exists (already removed, or never existed) returns
-- changed = false and success. A row that belongs to a player is refused (55000), so this can
-- never delete a player's RSVP.
create or replace function public.admin_remove_guest_rsvp(p_rsvp_id uuid)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
#variable_conflict use_column
declare
  today date := (now() at time zone 'America/Toronto')::date;
  d     date;
  r     public.rsvps%rowtype;
begin
  if not public.is_admin() then
    raise exception 'Admins only' using errcode = '42501';
  end if;
  if p_rsvp_id is null then
    raise exception 'A guest RSVP id is required' using errcode = 'RV008';
  end if;

  -- Find the session first so the lock can be taken before the row (same order as set_rsvp
  -- and admin_convert_guest_rsvp, so none of them can deadlock).
  select x.session_date into d from public.rsvps x where x.id = p_rsvp_id;
  if not found then
    return jsonb_build_object('rsvp_id', p_rsvp_id, 'session_date', null, 'changed', false);
  end if;
  if extract(dow from d) <> 3 or d < today or d > today + 7 then
    raise exception 'That is not an open RSVP date' using errcode = 'RV007';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('rsvp:' || d::text, 0));

  select * into r from public.rsvps x where x.id = p_rsvp_id for update;
  if not found then   -- removed by someone else while we waited for the lock
    return jsonb_build_object('rsvp_id', p_rsvp_id, 'session_date', d, 'changed', false);
  end if;
  if r.guest_name is null then
    raise exception 'That RSVP belongs to a player; use admin_remove_rsvp' using errcode = '55000';
  end if;

  delete from public.rsvps x where x.id = r.id;
  return jsonb_build_object('rsvp_id', r.id, 'session_date', d, 'changed', true);
end;
$$;

-- 2. admin_add_guest_rsvp ----------------------------------------------------------------
-- Puts a named guest on a session's list. Returns
-- {rsvp_id, session_date, status, changed, position, waitlist_position}.
-- changed = false when that guest was already 'in'. Re-adding a guest who was 'out' puts them
-- at the back of the line, like any rejoin. Past capacity the guest lands on the waitlist and
-- nobody already on the list is bumped. Admins bypass the 8-guest cap and the cutoff, as in
-- set_rsvp. Name rules are identical to set_rsvp.
create or replace function public.admin_add_guest_rsvp(p_guest_name text, p_session_date date default null)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
#variable_conflict use_column
declare
  actor    uuid := (select auth.uid());
  d        date := coalesce(p_session_date, public.rsvp_session_date());
  today    date := (now() at time zone 'America/Toronto')::date;
  cap      integer := public.rsvp_capacity();
  guest    text;
  hit_id   uuid;
  hit_name text;
  r        public.rsvps%rowtype;
  changed  boolean := false;
  pos      integer;
begin
  if not public.is_admin() then
    raise exception 'Admins only' using errcode = '42501';
  end if;
  if p_guest_name is null then
    raise exception 'A guest name is required' using errcode = 'RV008';
  end if;
  if extract(dow from d) <> 3 or d < today or d > today + 7 then
    raise exception 'That is not an open RSVP date' using errcode = 'RV007';
  end if;

  guest := btrim(regexp_replace(p_guest_name, '\s+', ' ', 'g'));
  if char_length(guest) not between 2 and 40 or guest ~ '[[:cntrl:]]' then
    raise exception 'Guest names are 2 to 40 characters' using errcode = 'RV004';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('rsvp:' || d::text, 0));

  select p.id, p.name into hit_id, hit_name
    from public.players p
   where p.archived_at is null
     and lower(btrim(regexp_replace(p.name, '\s+', ' ', 'g'))) = lower(guest)
   limit 1;
  if found then
    raise exception 'That name matches an existing player'
      using errcode = 'RV005', hint = format('Did you mean %s?', hit_name), detail = hit_id::text;
  end if;

  select * into r from public.rsvps x where x.session_date = d and lower(x.guest_name) = lower(guest) for update;
  if not found then
    insert into public.rsvps (session_date, guest_name, status, created_at, added_by)
    values (d, guest, 'in', clock_timestamp(), actor)
    returning * into r;
    changed := true;
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

-- 3. Execute grants ----------------------------------------------------------------------
-- Signed-in users only can call them, and each function re-checks is_admin() itself.
-- anon is never granted: an unauthenticated call fails with "permission denied".
revoke all on function public.admin_remove_guest_rsvp(uuid), public.admin_add_guest_rsvp(text, date)
  from public, anon, authenticated;
grant execute on function public.admin_remove_guest_rsvp(uuid) to authenticated;
grant execute on function public.admin_add_guest_rsvp(text, date) to authenticated;

commit;

-- TEST CHECKLIST (Supabase SQL Editor; run each block inside begin; ... rollback;) -----------
-- The editor runs as postgres, so impersonate a role per block:
--   set local role authenticated;
--   set local request.jwt.claims = '{"sub":"<uuid>","role":"authenticated","app_metadata":{"role":"admin"}}';
-- For a non-admin member use a sub that has no admin profile and no app_metadata role.
-- For a plain anonymous device: set local role anon; set local request.jwt.claims = '{}';
--
--  1. Admin adds a guest:   select public.admin_add_guest_rsvp('Test Guest');
--       -> changed true, status 'in'. Repeat -> changed false. 'a' -> RV004. A real player's
--       name -> RV005. A non-admin caller -> 42501.
--  2. Admin removes it:     select public.admin_remove_guest_rsvp('<rsvp_id from step 1>');
--       -> changed true. Confirm (as postgres) the row is gone from public.rsvps.
--  3. Idempotent:           run step 2 again -> success, changed false, no error.
--  4. Counts and waitlist:  fill the session to capacity (24 'in') plus one waitlisted row,
--       delete an in-list guest, then select * from public.get_rsvp_state(null, null)
--       -> in_count 24, waitlist_count 0, and the waitlisted person now has position 24.
--  5. Player rows are safe: select public.admin_remove_guest_rsvp('<a player's rsvp_id>');
--       -> 55000, row untouched.
--  6. Member removes their own guest (existing behaviour, unchanged): as anon with token T,
--       select public.set_rsvp(null, 'My Guest', T, 'in');  then
--       select public.set_rsvp(null, 'My Guest', T, 'out'); -> status 'out' (cancel, as before).
--  7. Member tries someone else's guest (must fail):
--       a. anon with a different token T2: select public.set_rsvp(null, 'My Guest', T2, 'out');
--          -> RV002.
--       b. anon: select public.admin_remove_guest_rsvp('<id>');  -> permission denied.
--       c. signed-in non-admin: select public.admin_remove_guest_rsvp('<id>');  -> 42501,
--          and the row still exists.
--  8. Signed-in member with a claimed player cannot add guests:
--       select public.set_rsvp(null, 'Guest X', null, 'in'); -> 42501 (unchanged).
--  9. Window: with a row dated in the past, or > 7 days ahead, as admin -> RV007.
