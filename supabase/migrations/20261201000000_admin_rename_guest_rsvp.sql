-- Admin rename of a guest RSVP. Idempotent (create or replace). NOT applied automatically; run it
-- yourself in the Supabase SQL Editor (staging first).
--
-- APPLY ORDER: after 20261126000000_admin_guest_rsvps.sql (and everything before it).
--
-- Design notes
--   * public.rsvps stays sealed (RLS on, no policies, no grants). Like the other admin RSVP
--     functions this is SECURITY DEFINER with search_path = '' and checks public.is_admin() first,
--     so admin status is enforced in the database, not in React. anon is never granted.
--   * A guest's name lives only in rsvps.guest_name; nothing else copies it. Leaderboard, results
--     and stats are keyed by players.id, so a rename cannot touch them.
--   * Renames one row, by id. created_at, device_token and status are untouched: the guest keeps
--     their place in line and their device can still manage the row.
--   * Name rules match set_rsvp / admin_add_guest_rsvp, plus a same-session duplicate check.
--   * Same advisory lock and window (today .. today + 7, Toronto) as the other admin RSVP functions.
--
-- Error codes (SQLSTATE):
--   42501 not an admin                       RV004 invalid name
--   RV005 matches an active player (HINT = "Did you mean ...", DETAIL = player id)
--   RV007 date is not an open Wednesday      RV008 bad input
--   RV010 another guest on that session's list already has that name (new)
--   P0002 guest not found                    55000 that RSVP belongs to a player

begin;

do $$
begin
  if to_regprocedure('public.admin_remove_guest_rsvp(uuid)') is null then
    raise exception 'Apply 20261126000000_admin_guest_rsvps.sql first';
  end if;
end $$;

create or replace function public.admin_rename_guest_rsvp(p_rsvp_id uuid, p_guest_name text)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
#variable_conflict use_column
declare
  today    date := (now() at time zone 'America/Toronto')::date;
  d        date;
  guest    text;
  hit_id   uuid;
  hit_name text;
  r        public.rsvps%rowtype;
begin
  if not public.is_admin() then
    raise exception 'Admins only' using errcode = '42501';
  end if;
  if p_rsvp_id is null or p_guest_name is null then
    raise exception 'A guest and a name are required' using errcode = 'RV008';
  end if;

  guest := btrim(regexp_replace(p_guest_name, '\s+', ' ', 'g'));
  if char_length(guest) not between 2 and 40 or guest ~ '[[:cntrl:]]' then
    raise exception 'Guest names are 2 to 40 characters' using errcode = 'RV004';
  end if;

  select x.session_date into d from public.rsvps x where x.id = p_rsvp_id;
  if not found then
    raise exception 'That guest is no longer on the list' using errcode = 'P0002';
  end if;
  if extract(dow from d) <> 3 or d < today or d > today + 7 then
    raise exception 'That is not an open RSVP date' using errcode = 'RV007';
  end if;

  -- Session lock before the row, same order as set_rsvp, so none of them can deadlock.
  perform pg_advisory_xact_lock(hashtextextended('rsvp:' || d::text, 0));

  select * into r from public.rsvps x where x.id = p_rsvp_id for update;
  if not found then
    raise exception 'That guest is no longer on the list' using errcode = 'P0002';
  end if;
  if r.guest_name is null then
    raise exception 'That RSVP belongs to a player' using errcode = '55000';
  end if;
  if r.guest_name = guest then
    return jsonb_build_object('rsvp_id', r.id, 'session_date', d, 'name', guest, 'changed', false);
  end if;

  select p.id, p.name into hit_id, hit_name
    from public.players p
   where p.archived_at is null
     and lower(btrim(regexp_replace(p.name, '\s+', ' ', 'g'))) = lower(guest)
   limit 1;
  if found then
    raise exception 'That name matches an existing player'
      using errcode = 'RV005', hint = format('Did you mean %s?', hit_name), detail = hit_id::text;
  end if;

  -- Other rows only: changing just the case of this guest's own name is allowed.
  if exists (select 1 from public.rsvps x
              where x.session_date = d and x.id <> r.id and lower(x.guest_name) = lower(guest)) then
    raise exception 'That name is already on the list' using errcode = 'RV010';
  end if;

  update public.rsvps x set guest_name = guest where x.id = r.id;
  return jsonb_build_object('rsvp_id', r.id, 'session_date', d, 'name', guest,
                            'previous_name', r.guest_name, 'changed', true);
end;
$$;

revoke all on function public.admin_rename_guest_rsvp(uuid, text) from public, anon, authenticated;
grant execute on function public.admin_rename_guest_rsvp(uuid, text) to authenticated;

commit;

-- TEST CHECKLIST (SQL Editor; wrap each block in begin; ... rollback;) -------------------------
--  set local role authenticated;
--  set local request.jwt.claims = '{"sub":"<uuid>","role":"authenticated","app_metadata":{"role":"admin"}}';
--  1. select public.admin_add_guest_rsvp('Jon Smith');  select public.admin_rename_guest_rsvp('<rsvp_id>', 'John Smith');
--       -> changed true, name 'John Smith'. Repeat -> changed false. 'J' -> RV004.
--  2. A real active player's name -> RV005.  Another guest's name (any case) -> RV010.
--  3. A player's rsvp_id -> 55000. An unknown id -> P0002.
--  4. Non-admin (no app_metadata role): 42501.  set local role anon: permission denied.
--  5. created_at / device_token / status unchanged after a rename.
