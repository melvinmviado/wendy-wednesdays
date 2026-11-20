-- Weekly RSVPs ("Playing this Wednesday?"): roster taps, named guests, a 24-player cap with an
-- automatic waitlist, and a 6:00 PM Wednesday cutoff. Idempotent. NOT applied automatically;
-- run it yourself in the Supabase SQL Editor.
--
-- APPLY ORDER (needs all of these):
--   1. 20261118000000_profiles_foundation.sql   (public.is_admin(), profiles)
--   2. 20261119000000_player_admin.sql          (players.archived_at, touch_updated_at())
--   3. 20261120000000_player_claims.sql         (players.user_id, approve_claim_request)
--   4. 20261122000000_player_avatars.sql        (players.avatar_url)
--   5. 20261124000000_rsvps.sql                 (this file)
--
-- Design notes
--   * The table is sealed. RLS is on with NO policies and every grant is revoked, so anon and
--     authenticated cannot read or write it directly (device tokens and user ids live in it).
--     All access is through the SECURITY DEFINER functions below (search_path = '').
--   * Queue position is derived, never stored: 'in' rows ordered by created_at. Positions 1..24
--     are playing, 25+ are the waitlist. Cancelling promotes everyone behind automatically.
--     created_at is reset when someone goes out -> in again, so cancelling and rejoining sends
--     you to the back (otherwise a cancel/rejoin would be a free place in line).
--   * Device tokens are random strings the browser makes up. Only their SHA-256 is stored.
--     They are a convenience, not authentication: see the limits in the notes at the bottom.
--   * Constants live in the rsvp_* config functions below. Keep them in step with
--     src/utils/rsvpSchedule.ts (CAPACITY, 6:00 / 8:00 / 10:00 PM, America/Toronto).
--
-- Error codes raised by set_rsvp (SQLSTATE):
--   RV001 closed (past the cutoff)      RV002 not your RSVP (other device / name already taken)
--   RV003 player unavailable or claimed RV004 invalid guest name
--   RV005 guest name is an existing player (HINT = "Did you mean ...", DETAIL = player id)
--   RV006 rate limit                    RV007 date is not an open Wednesday
--   RV008 bad input                     42501 not allowed (claimed users / admins only)

begin;

-- 0. Preconditions ---------------------------------------------------------------------
do $$
begin
  if to_regprocedure('public.is_admin()') is null or to_regclass('public.profiles') is null then
    raise exception 'Apply 20261118000000_profiles_foundation.sql first';
  end if;
  if to_regprocedure('public.touch_updated_at()') is null then
    raise exception 'Apply 20261119000000_player_admin.sql first (touch_updated_at() is missing)';
  end if;
  if (select count(*) from information_schema.columns
       where table_schema = 'public' and table_name = 'players'
         and column_name in ('archived_at', 'user_id', 'avatar_url')) < 3 then
    raise exception 'Apply the player_admin, player_claims and player_avatars migrations first';
  end if;
end $$;

-- 1. Configuration and schedule helpers -------------------------------------------------
-- Private: nobody but the function owner (and the SECURITY DEFINER functions) can call them.
create or replace function public.rsvp_capacity() returns integer
language sql immutable set search_path = '' as $$ select 24 $$;

create or replace function public.rsvp_max_per_device() returns integer
language sql immutable set search_path = '' as $$ select 3 $$;   -- rows one device may hold per session

create or replace function public.rsvp_max_guests() returns integer
language sql immutable set search_path = '' as $$ select 8 $$;   -- guests allowed 'in' per session

-- Wall-clock times are converted with the zone database, so daylight saving is handled.
create or replace function public.rsvp_cutoff_at(p_session date) returns timestamptz
language sql stable set search_path = '' as $$ select (p_session + time '18:00') at time zone 'America/Toronto' $$;

create or replace function public.rsvp_live_start(p_session date) returns timestamptz
language sql stable set search_path = '' as $$ select (p_session + time '20:00') at time zone 'America/Toronto' $$;

create or replace function public.rsvp_live_end(p_session date) returns timestamptz
language sql stable set search_path = '' as $$ select (p_session + time '22:00') at time zone 'America/Toronto' $$;

-- Mirrors getSessionDate(): today if it is Wednesday and before the live window ends, else the next Wednesday.
create or replace function public.rsvp_session_date(p_now timestamptz default now()) returns date
language sql stable set search_path = '' as $$
  select case
    when extract(dow from l.ts) = 3 and p_now < public.rsvp_live_end(l.ts::date) then l.ts::date
    else l.ts::date + coalesce(nullif((3 - extract(dow from l.ts)::integer + 7) % 7, 0), 7)
  end
  from (select p_now at time zone 'America/Toronto' as ts) l
$$;

create or replace function public.rsvp_hash_token(p_token text) returns text
language sql immutable set search_path = '' as $$ select encode(sha256(convert_to(p_token, 'utf8')), 'hex') $$;

-- 2. The table -------------------------------------------------------------------------
create table if not exists public.rsvps (
  id           uuid primary key default gen_random_uuid(),
  session_date date not null,
  player_id    uuid null references public.players (id) on delete cascade,
  guest_name   text null,
  device_token text null,   -- SHA-256 hex of the browser's token, never the token itself
  user_id      uuid null references auth.users (id) on delete set null,
  status       text not null default 'in',
  created_at   timestamptz not null default now(),   -- queue time: reset on out -> in
  updated_at   timestamptz not null default timezone('utc'::text, now()),
  constraint rsvps_status_check check (status in ('in', 'out')),
  constraint rsvps_one_identity check (num_nonnulls(player_id, guest_name) = 1),
  constraint rsvps_wednesday check (extract(dow from session_date) = 3),
  constraint rsvps_guest_name_clean
    check (guest_name is null or (guest_name = btrim(guest_name) and char_length(guest_name) between 2 and 40)),
  constraint rsvps_token_hash check (device_token is null or device_token ~ '^[0-9a-f]{64}$'),
  constraint rsvps_session_player_unique unique (session_date, player_id)
);

create unique index if not exists rsvps_session_guest_unique
  on public.rsvps (session_date, lower(guest_name)) where guest_name is not null;
create index if not exists rsvps_queue_idx
  on public.rsvps (session_date, created_at, id) where status = 'in';
create index if not exists rsvps_device_idx
  on public.rsvps (session_date, device_token) where device_token is not null;

drop trigger if exists trg_rsvps_touch_updated_at on public.rsvps;
create trigger trg_rsvps_touch_updated_at
  before update on public.rsvps
  for each row execute function public.touch_updated_at();

-- 3. Lock the table down ----------------------------------------------------------------
-- Supabase grants new tables to anon/authenticated by default; take that back. RLS with no
-- policies is a second lock: even if a grant came back, every row would still be invisible.
alter table public.rsvps enable row level security;
revoke all on public.rsvps from public, anon, authenticated;

-- 4. Queue helper -----------------------------------------------------------------------
-- 1-based position among 'in' rows by created_at. Archived players do not hold a place
-- (restoring one puts them back where they were). Not callable through the API.
create or replace function public.rsvp_queue(p_session date)
returns table (rsvp_id uuid, queue_pos integer)
language sql stable set search_path = '' as $$
  select r.id, (row_number() over (order by r.created_at, r.id))::integer
  from public.rsvps r
  left join public.players p on p.id = r.player_id
  where r.session_date = p_session
    and r.status = 'in'
    and (r.player_id is null or p.archived_at is null)
$$;

-- 5. get_rsvp_state ---------------------------------------------------------------------
-- One row describing the session, with times as absolute instants and the server clock so the
-- client can correct for a wrong device clock. in_count is capped at capacity; the rest is
-- waitlist_count. "Mine" = the caller's claimed player (signed in) or rows bound to the token.
-- my_status / my_position describe the first of those rows; my_rsvps lists all of them.
create or replace function public.get_rsvp_state(p_session_date date default null, p_device_token text default null)
returns table (
  session_date date, capacity integer, cutoff_at timestamptz, live_start timestamptz, live_end timestamptz,
  server_now timestamptz, in_count integer, waitlist_count integer,
  my_status text, my_position integer, my_rsvps jsonb
)
language plpgsql stable security definer set search_path = ''
as $$
#variable_conflict use_column
declare
  d     date := coalesce(p_session_date, public.rsvp_session_date());
  cap   integer := public.rsvp_capacity();
  actor uuid := (select auth.uid());
  hash  text := case when p_device_token ~ '^[A-Za-z0-9_-]{16,128}$' then public.rsvp_hash_token(p_device_token) end;
  total integer;
  mine  jsonb;
begin
  if extract(dow from d) <> 3 then
    raise exception 'Not a Wednesday' using errcode = 'RV007';
  end if;

  select count(*)::integer into total from public.rsvp_queue(d);

  select coalesce(jsonb_agg(jsonb_build_object(
           'rsvp_id', x.id, 'player_id', x.player_id, 'name', coalesce(p.name, x.guest_name),
           'is_guest', x.guest_name is not null, 'status', x.status, 'position', q.queue_pos
         ) order by x.created_at, x.id), '[]'::jsonb)
    into mine
  from public.rsvps x
  left join public.players p on p.id = x.player_id
  left join public.rsvp_queue(d) q on q.rsvp_id = x.id
  where x.session_date = d
    and ((actor is not null and p.user_id = actor)
      or (hash is not null and x.device_token = hash and (x.player_id is null or p.user_id is null)));

  return query select
    d, cap, public.rsvp_cutoff_at(d), public.rsvp_live_start(d), public.rsvp_live_end(d), now(),
    least(total, cap), greatest(total - cap, 0),
    mine -> 0 ->> 'status', (mine -> 0 ->> 'position')::integer, mine;
end;
$$;

-- 6. get_rsvp_roster --------------------------------------------------------------------
-- Public list for the sheet: names and photos only. No tokens, no user ids. position is the
-- queue position for 'in' rows (null for 'out'); anything above capacity is the waitlist.
create or replace function public.get_rsvp_roster(p_session_date date default null)
returns table (rsvp_id uuid, name text, avatar_url text, player_id uuid, is_guest boolean, status text, "position" integer)
language sql stable security definer set search_path = ''
as $$
  select x.id,
         coalesce(p.name, x.guest_name),
         case when x.player_id is not null then coalesce(pr.avatar_url, p.avatar_url) end,
         x.player_id,
         x.guest_name is not null,
         x.status,
         q.queue_pos
  from public.rsvps x
  left join public.players p on p.id = x.player_id
  left join public.profiles pr on pr.id = p.user_id
  left join public.rsvp_queue(coalesce(p_session_date, public.rsvp_session_date())) q on q.rsvp_id = x.id
  where x.session_date = coalesce(p_session_date, public.rsvp_session_date())
    and (x.player_id is null or p.archived_at is null)
  order by (x.status = 'in') desc, q.queue_pos, x.updated_at desc
$$;

-- 7. set_rsvp ---------------------------------------------------------------------------
-- Sets one person's status for one session. Exactly one of p_player_id / p_guest_name, except
-- a signed-in user with a claimed player, who may pass neither (it means "me").
-- Returns {rsvp_id, session_date, status, position, waitlist_position}; status is null when
-- cancelling something that was never RSVP'd (no row is created for that).
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

-- 8. admin_convert_guest_rsvp -----------------------------------------------------------
-- Turns a guest RSVP into a real player's, keeping its place in line (created_at is untouched).
-- If that player already has an 'out' row for the session it is replaced; an 'in' row is a conflict.
create or replace function public.admin_convert_guest_rsvp(p_rsvp_id uuid, p_player_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  r  public.rsvps%rowtype;
  pl public.players%rowtype;
  ex public.rsvps%rowtype;
begin
  if not public.is_admin() then
    raise exception 'Admins only' using errcode = '42501';
  end if;

  select * into r from public.rsvps where id = p_rsvp_id;
  if not found then
    raise exception 'RSVP not found' using errcode = 'P0002';
  end if;
  -- Same lock order as set_rsvp (session lock first, then rows) so the two cannot deadlock.
  perform pg_advisory_xact_lock(hashtextextended('rsvp:' || r.session_date::text, 0));
  select * into r from public.rsvps where id = p_rsvp_id for update;
  if not found then
    raise exception 'RSVP not found' using errcode = 'P0002';
  end if;
  if r.guest_name is null then
    raise exception 'That RSVP is already linked to a player' using errcode = '55000';
  end if;

  select * into pl from public.players where id = p_player_id;
  if not found then
    raise exception 'Player not found' using errcode = 'P0002';
  end if;
  if pl.archived_at is not null then
    raise exception 'Player is archived' using errcode = '55000';
  end if;

  select * into ex from public.rsvps where session_date = r.session_date and player_id = pl.id for update;
  if found then
    if ex.status = 'in' then
      raise exception 'That player is already on the list' using errcode = '55000';
    end if;
    delete from public.rsvps where id = ex.id;
  end if;

  update public.rsvps set player_id = pl.id, guest_name = null, user_id = pl.user_id where id = r.id;
end;
$$;

-- 9. Claims keep their RSVPs --------------------------------------------------------------
-- Rows are keyed by player_id, so a claim (approve_claim_request) never orphans or drops an
-- RSVP: it keeps its place in line. This trigger only hands ownership over: upcoming rows get
-- the new owner's user_id, so the claimed user manages them through the signed-in path.
-- From then on the original device is refused (the name is claimed). An unlink clears it again.
create or replace function public.rsvps_follow_player_owner()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  update public.rsvps
     set user_id = new.user_id
   where player_id = new.id
     and session_date >= (now() at time zone 'America/Toronto')::date;
  return null;
end;
$$;

drop trigger if exists trg_players_rsvp_owner on public.players;
create trigger trg_players_rsvp_owner
  after update of user_id on public.players
  for each row
  when (old.user_id is distinct from new.user_id)
  execute function public.rsvps_follow_player_owner();

-- 10. Execute grants ----------------------------------------------------------------------
revoke all on function public.rsvp_capacity(), public.rsvp_max_per_device(), public.rsvp_max_guests(),
  public.rsvp_cutoff_at(date), public.rsvp_live_start(date), public.rsvp_live_end(date),
  public.rsvp_session_date(timestamptz), public.rsvp_hash_token(text), public.rsvp_queue(date),
  public.rsvps_follow_player_owner() from public, anon, authenticated;

revoke all on function public.get_rsvp_state(date, text), public.get_rsvp_roster(date),
  public.set_rsvp(uuid, text, text, text, date), public.admin_convert_guest_rsvp(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.get_rsvp_state(date, text) to anon, authenticated;
grant execute on function public.get_rsvp_roster(date) to anon, authenticated;
grant execute on function public.set_rsvp(uuid, text, text, text, date) to anon, authenticated;
grant execute on function public.admin_convert_guest_rsvp(uuid, uuid) to authenticated;

-- Limits worth knowing ---------------------------------------------------------------------
--   * A device token is self-issued, so someone who clears storage or scripts the API gets a
--     fresh identity. The per-device cap, the guest cap and "claimed names refuse anonymous
--     taps" bound the damage; admins can still correct the list. Real abuse protection (CAPTCHA,
--     Supabase auth rate limits) belongs at the API edge.
--   * An unclaimed player can be toggled by anyone who taps their name first (their token
--     binds). That is the product choice for unclaimed names; claiming a player ends it.
--   * Table realtime cannot reach anon clients (no SELECT policy by design). Poll
--     get_rsvp_state, or add a content-free broadcast ping from a trigger later.

commit;
