-- RSVP open time: the admin can say when RSVPs open, not just when they close. Idempotent. NOT applied
-- automatically; run it yourself in the Supabase SQL Editor (staging first).
--
-- APPLY ORDER: after 20261127000000_event_settings.sql (which needs everything before it).
--
-- Design notes
--   * event_settings.rsvp_open_at is NULLABLE. NULL means "open right away", which is how every
--     existing row (and the built-in weekly schedule) already behaves, so applying this changes nothing
--     until an admin sets a time.
--   * When set it must be before the cutoff (CHECK). The cutoff <= event start rule is unchanged.
--   * set_rsvp() (the only non-admin write path) refuses before the open time with RV009. Admins bypass
--     it, as they do the cutoff. set_rsvp is otherwise identical to 20261124000000_rsvps.sql.
--   * Still Wednesday-only: the start-day trigger from 20261127000000 is untouched.
--   * Reads are unchanged: the client reads rsvp_open_at from event_settings (public read) to show
--     "RSVPs open ..." instead of the I'm-In button.
--
-- Error code added: RV009 RSVPs have not opened yet.

begin;

do $$
begin
  if to_regclass('public.event_settings') is null then
    raise exception 'Apply 20261127000000_event_settings.sql first';
  end if;
  if to_regprocedure('public.set_rsvp(uuid, text, text, text, date)') is null then
    raise exception 'Apply 20261124000000_rsvps.sql first';
  end if;
end $$;

-- 1. Column + rule ------------------------------------------------------------------------
alter table public.event_settings add column if not exists rsvp_open_at timestamptz null;

alter table public.event_settings drop constraint if exists event_settings_open_before_cutoff;
alter table public.event_settings add constraint event_settings_open_before_cutoff
  check (rsvp_open_at is null or rsvp_open_at < rsvp_cutoff_at);

-- Same column-level grants as the other editable columns (RLS still limits writes to admins).
grant insert (rsvp_open_at) on public.event_settings to authenticated;
grant update (rsvp_open_at) on public.event_settings to authenticated;

-- 2. Helper: the open time for a session, or NULL (open already) -----------------------------
create or replace function public.rsvp_open_at(p_session date) returns timestamptz
language sql stable set search_path = '' as $$
  select s.rsvp_open_at from public.event_settings s
   where (s.event_start_at at time zone s.timezone)::date = p_session
$$;

revoke all on function public.rsvp_open_at(date) from public, anon, authenticated;

-- 3. set_rsvp with the open check -----------------------------------------------------------
create or replace function public.set_rsvp(
  p_player_id uuid, p_guest_name text, p_device_token text, p_status text, p_session_date date default null
)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
#variable_conflict use_column
declare
  actor     uuid := (select auth.uid());
  is_adm    boolean := public.is_admin();
  d         date := coalesce(p_session_date, public.rsvp_session_date());
  today     date := (now() at time zone 'America/Toronto')::date;
  cap       integer := public.rsvp_capacity();
  my_player public.players%rowtype;
  claimed   boolean := false;
  hash      text;
  bind      text;
  guest     text;
  pl        public.players%rowtype;
  r         public.rsvps%rowtype;
  had_row   boolean := false;
  hit_id    uuid;
  hit_name  text;
  pos       integer;
begin
  if p_status is null or p_status not in ('in', 'out') then
    raise exception 'Status must be in or out' using errcode = 'RV008';
  end if;
  -- Writes are only for upcoming sessions. A past date is allowed through to the cutoff check,
  -- which rejects it for everyone but admins.
  if extract(dow from d) <> 3 or d > today + 7 then
    raise exception 'That is not an open RSVP date' using errcode = 'RV007';
  end if;

  -- Who is calling. Admins act freely; a signed-in user with a claimed player acts only as it.
  if actor is not null and not is_adm then
    select * into my_player from public.players where user_id = actor;
    claimed := found;
  end if;

  if claimed then
    if p_guest_name is not null or (p_player_id is not null and p_player_id <> my_player.id) then
      raise exception 'You can only RSVP as your own player' using errcode = '42501';
    end if;
    p_player_id := my_player.id;
  elsif (p_player_id is null) = (p_guest_name is null) then
    raise exception 'Give either a player or a guest name' using errcode = 'RV008';
  end if;

  if not is_adm and not claimed
     and (p_device_token is null or p_device_token !~ '^[A-Za-z0-9_-]{16,128}$') then
    raise exception 'A device token of 16 to 128 letters, digits, - or _ is required' using errcode = 'RV008';
  end if;
  if p_device_token ~ '^[A-Za-z0-9_-]{16,128}$' then
    hash := public.rsvp_hash_token(p_device_token);
  end if;
  if not is_adm and not claimed then
    bind := hash;   -- the token a new or unbound row gets tied to
  end if;

  -- The cutoff freezes inserts, updates and cancels alike. Admins bypass it.
  if not is_adm and now() >= public.rsvp_cutoff_at(d) then
    raise exception 'RSVPs for this session are closed' using errcode = 'RV001';
  end if;

  -- RSVPs are not open until the admin's open time. Admins bypass it, like the cutoff.
  if not is_adm and public.rsvp_open_at(d) is not null and now() < public.rsvp_open_at(d) then
    raise exception 'RSVPs for this session have not opened yet' using errcode = 'RV009';
  end if;

  -- One writer per session at a time: the per-device and guest caps cannot be raced past.
  perform pg_advisory_xact_lock(hashtextextended('rsvp:' || d::text, 0));

  if p_player_id is not null then
    select * into pl from public.players where id = p_player_id;
    if not found or pl.archived_at is not null then
      raise exception 'That player is not available' using errcode = 'RV003';
    end if;
    if pl.user_id is not null and not is_adm and not claimed then
      raise exception 'That name belongs to a signed-in player' using errcode = 'RV003';
    end if;
    select * into r from public.rsvps x where x.session_date = d and x.player_id = pl.id for update;
    had_row := found;
  else
    guest := btrim(regexp_replace(p_guest_name, '\s+', ' ', 'g'));
    if char_length(guest) not between 2 and 40 or guest ~ '[[:cntrl:]]' then
      raise exception 'Guest names are 2 to 40 characters' using errcode = 'RV004';
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
    select * into r from public.rsvps x where x.session_date = d and lower(x.guest_name) = lower(guest) for update;
    had_row := found;
  end if;

  -- An existing row can only be changed from the device it was made on (admins, and the
  -- claimed owner of the player, excepted). A row with no token yet binds to the first caller.
  if had_row and not is_adm and not claimed
     and r.device_token is not null and r.device_token is distinct from hash then
    raise exception 'This RSVP was made on another device' using errcode = 'RV002';
  end if;

  if not had_row then
    if p_status = 'out' then
      return jsonb_build_object('rsvp_id', null, 'session_date', d, 'status', null, 'position', null, 'waitlist_position', null);
    end if;
    if not is_adm then
      if bind is not null and (select count(*) from public.rsvps x
                                where x.session_date = d and x.device_token = bind) >= public.rsvp_max_per_device() then
        raise exception 'Too many RSVPs from this device' using errcode = 'RV006';
      end if;
      if guest is not null and (select count(*) from public.rsvps x
                                 where x.session_date = d and x.guest_name is not null and x.status = 'in') >= public.rsvp_max_guests() then
        raise exception 'The guest list is full' using errcode = 'RV006';
      end if;
    end if;
    insert into public.rsvps (session_date, player_id, guest_name, device_token, user_id, status, created_at)
    values (d, pl.id, guest, bind, case when claimed then actor else pl.user_id end, 'in', clock_timestamp())
    returning * into r;
  else
    if p_status = 'in' and r.status = 'out' and r.guest_name is not null and not is_adm
       and (select count(*) from public.rsvps x
             where x.session_date = d and x.guest_name is not null and x.status = 'in') >= public.rsvp_max_guests() then
      raise exception 'The guest list is full' using errcode = 'RV006';
    end if;
    if r.status is distinct from p_status
       or (r.device_token is null and bind is not null)
       or (claimed and r.user_id is distinct from actor) then
      update public.rsvps x
         set status = p_status,
             created_at = case when p_status = 'in' and x.status <> 'in' then clock_timestamp() else x.created_at end,
             device_token = coalesce(x.device_token, bind),
             user_id = case when claimed then actor else x.user_id end
       where x.id = r.id
      returning * into r;
    end if;
  end if;

  select q.queue_pos into pos from public.rsvp_queue(d) q where q.rsvp_id = r.id;
  return jsonb_build_object(
    'rsvp_id', r.id, 'session_date', d, 'status', r.status, 'position', pos,
    'waitlist_position', case when pos > cap then pos - cap end);
end;
$$;

revoke all on function public.set_rsvp(uuid, text, text, text, date) from public, anon, authenticated;
grant execute on function public.set_rsvp(uuid, text, text, text, date) to anon, authenticated;

-- Quick checks (run as needed) -------------------------------------------------------------
--  1. update public.event_settings set rsvp_open_at = now() + interval '1 hour' where id = 1;
--     As a non-admin: set_rsvp(...) -> RV009. As an admin: works.
--  2. set rsvp_open_at = rsvp_cutoff_at -> check violation (23514).
--  3. set rsvp_open_at = null -> RSVPs open again immediately.

commit;
