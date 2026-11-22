-- Abuse limits for anonymous RSVPs and claim requests (audit phase 2). Idempotent. NOT applied
-- automatically; run it yourself in the Supabase SQL Editor (staging first), then run
-- supabase/tests/rsvp_abuse_limits.sql.
--
-- APPLY ORDER: after 20261203000000_security_hardening.sql (needs everything before it, in
-- particular 20261128000000_rsvp_open_at.sql, whose set_rsvp this replaces).
--
-- Why
--   Device tokens are made up by the browser, so the 3-per-device cap only slows a script down:
--   minting a fresh token every 3 calls let one person fill all 24 spots and lock every real
--   player out of their own RSVP ("made on another device"). And a row an admin added has no
--   device token, so the first anonymous caller to touch it could take it over and cancel it.
--
-- What changes in set_rsvp (otherwise identical to 20261128000000_rsvp_open_at.sql)
--   1. A spot an admin added (added_by set, no device token) can no longer be bound or changed
--      by an anonymous caller. RV011. The player can still sign in, or ask an organizer.
--      Admin writes through set_rsvp now record added_by too.
--   2. Per-network cap: new anonymous RSVPs are counted per client IP per session (Cloudflare's
--      cf-connecting-ip header, which clients cannot set themselves). Over rsvp_max_per_ip()
--      -> RV012. Generous on purpose: phones on one carrier can share an IP. Signed-in players
--      and admins are not counted. If the header is missing (local dev), there is no IP cap.
--   3. The IP is stored only as a salted SHA-256 (session date + IP), and cleared a week after
--      the session.
--
-- Claim requests
--   4. Several people may now have a pending request for the same player (one pending request
--      per USER is unchanged). Before, one sign-up per player could block every real owner.
--      approve_claim_request already rejects the other pending requests for that player.
--   5. After a rejection, the same user must wait 7 days to ask for that player again. CL001.
--
-- VERIFY AFTER APPLYING: RSVP once from the live site as a signed-out visitor, then
--   select client_ip_hash is not null as ip_seen from public.rsvps order by created_at desc limit 1;
-- If ip_seen is false, Supabase did not pass cf-connecting-ip and the IP cap is not active.
--
-- Error codes added: RV011 (spot added by an organizer), RV012 (too many from this network),
-- CL001 (claim asked again too soon after a rejection).

begin;

do $$
begin
  if to_regprocedure('public.rsvp_open_at(date)') is null then
    raise exception 'Apply 20261128000000_rsvp_open_at.sql first';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'rsvps' and column_name = 'added_by') then
    raise exception 'Apply 20261125000000_admin_rsvps.sql first (rsvps.added_by is missing)';
  end if;
  if to_regclass('public.player_claim_requests') is null then
    raise exception 'Apply 20261120000000_player_claims.sql first';
  end if;
end $$;

-- 1. Per-network bookkeeping ----------------------------------------------------------------
alter table public.rsvps add column if not exists client_ip_hash text null;
alter table public.rsvps drop constraint if exists rsvps_client_ip_hash_hex;
alter table public.rsvps add constraint rsvps_client_ip_hash_hex
  check (client_ip_hash is null or client_ip_hash ~ '^[0-9a-f]{64}$');

create index if not exists rsvps_session_ip
  on public.rsvps (session_date, client_ip_hash) where client_ip_hash is not null;

create or replace function public.rsvp_max_per_ip() returns integer
language sql immutable set search_path = '' as $$ select 8 $$;

-- The caller's IP for session p_session, salted and hashed; NULL when the header is absent.
create or replace function public.rsvp_client_ip_hash(p_session date) returns text
language plpgsql stable set search_path = '' as $$
declare
  headers text := current_setting('request.headers', true);
  ip      text;
begin
  if headers is null or headers = '' then
    return null;
  end if;
  ip := nullif(btrim(headers::json ->> 'cf-connecting-ip'), '');
  if ip is null then
    return null;
  end if;
  return encode(sha256(convert_to('rsvp-ip:' || p_session::text || ':' || ip, 'utf8')), 'hex');
end;
$$;

revoke all on function public.rsvp_max_per_ip(), public.rsvp_client_ip_hash(date)
  from public, anon, authenticated;

-- 2. set_rsvp --------------------------------------------------------------------------------
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
  ip        text;
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

  -- [CHANGE 1] ...except a row an admin added: no anonymous caller may take that one over.
  if had_row and not is_adm and not claimed
     and r.device_token is null and r.added_by is not null then
    raise exception 'An organizer added this RSVP' using errcode = 'RV011';
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
      -- [CHANGE 2] Per-network cap for anonymous callers (fresh device tokens don't reset it).
      if bind is not null then
        ip := public.rsvp_client_ip_hash(d);
        if ip is not null and (select count(*) from public.rsvps x
                                where x.session_date = d and x.client_ip_hash = ip) >= public.rsvp_max_per_ip() then
          raise exception 'Too many RSVPs from this network' using errcode = 'RV012';
        end if;
      end if;
      if guest is not null and (select count(*) from public.rsvps x
                                 where x.session_date = d and x.guest_name is not null and x.status = 'in') >= public.rsvp_max_guests() then
        raise exception 'The guest list is full' using errcode = 'RV006';
      end if;
    end if;
    insert into public.rsvps (session_date, player_id, guest_name, device_token, user_id, status, created_at,
                              client_ip_hash, added_by)
    values (d, pl.id, guest, bind, case when claimed then actor else pl.user_id end, 'in', clock_timestamp(),
            ip, case when is_adm then actor end)
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
             user_id = case when claimed then actor else x.user_id end,
             added_by = case when is_adm then actor else x.added_by end
       where x.id = r.id
      returning * into r;
    end if;
  end if;

  -- [CHANGE 3] Hashed IPs are only needed while a session is open; drop them a week later.
  update public.rsvps x set client_ip_hash = null
   where x.client_ip_hash is not null and x.session_date < today - 7;

  select q.queue_pos into pos from public.rsvp_queue(d) q where q.rsvp_id = r.id;
  return jsonb_build_object(
    'rsvp_id', r.id, 'session_date', d, 'status', r.status, 'position', pos,
    'waitlist_position', case when pos > cap then pos - cap end);
end;
$$;

revoke all on function public.set_rsvp(uuid, text, text, text, date) from public, anon, authenticated;
grant execute on function public.set_rsvp(uuid, text, text, text, date) to anon, authenticated;

-- 3. Claim requests ---------------------------------------------------------------------------
-- (4) Several users may ask for the same player; still one pending request per user.
drop index if exists public.claim_requests_one_pending_per_player;

-- (5) A 7-day wait before asking again for a player you were refused. Not security definer:
-- the caller can read their own requests (RLS), which is all this needs.
create or replace function public.claim_requests_cooldown()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.player_claim_requests prev
     where prev.user_id = new.user_id
       and prev.player_id = new.player_id
       and prev.status = 'rejected'
       and prev.resolved_at > timezone('utc'::text, now()) - interval '7 days'
  ) then
    raise exception 'Your last request for this player was declined less than 7 days ago'
      using errcode = 'CL001';
  end if;
  return new;
end;
$$;

drop trigger if exists claim_requests_cooldown on public.player_claim_requests;
create trigger claim_requests_cooldown
before insert on public.player_claim_requests
for each row execute function public.claim_requests_cooldown();

commit;
