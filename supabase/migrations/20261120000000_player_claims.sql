-- Player claims: link a signed-in user to at most one player, via admin-approved requests.
-- Idempotent: safe to run more than once. NOT applied automatically; run it yourself in the
-- Supabase SQL Editor.
--
-- APPLY ORDER:
--   1. 20261118000000_profiles_foundation.sql   (public.is_admin(), profiles)
--   2. 20261119000000_player_admin.sql          (players.archived_at, is_admin() policies)
--   3. 20261120000000_player_claims.sql         (this file)
--
-- Design notes
--   * players.user_id can only be changed by the RPCs below (they run as the function owner).
--     API callers, admins included, are blocked by a guard trigger. This keeps the invariants
--     (unclaimed, active, one player per user) in one place. To allow raw admin edits, delete
--     the user_id check in players_claim_guard().
--   * players is publicly readable, so user_id (an auth user UUID) is publicly visible. That
--     is what lets the UI show "claimed". It is not a secret, but it does link a player to an
--     account id. Hiding it would mean column-level SELECT grants, which break select('*').

begin;

-- 0. Preconditions ---------------------------------------------------------------------
do $$
begin
  if to_regprocedure('public.is_admin()') is null or to_regclass('public.profiles') is null then
    raise exception 'Apply 20261118000000_profiles_foundation.sql first';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'players' and column_name = 'archived_at'
  ) then
    raise exception 'Apply 20261119000000_player_admin.sql first (players.archived_at is missing)';
  end if;
end $$;

-- 1. players.user_id -------------------------------------------------------------------
alter table public.players
  add column if not exists user_id uuid null references auth.users (id) on delete set null;

-- One user can claim at most one player. (NULLs never collide; the predicate is for clarity.)
create unique index if not exists players_user_id_unique
  on public.players (user_id) where user_id is not null;

-- 2. player_claim_requests -------------------------------------------------------------
create table if not exists public.player_claim_requests (
  id          uuid primary key default gen_random_uuid(),
  player_id   uuid not null references public.players (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  status      text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  message     text null,
  created_at  timestamptz not null default timezone('utc'::text, now()),
  resolved_by uuid null references auth.users (id) on delete set null,
  resolved_at timestamptz null,
  constraint claim_requests_message_len
    check (message is null or char_length(btrim(message)) between 1 and 500),
  -- A request is resolved exactly when it is no longer pending.
  constraint claim_requests_resolved_consistent
    check ((status = 'pending') = (resolved_at is null))
);

-- One pending request per user, and one per player. Resolved rows are history and unrestricted.
create unique index if not exists claim_requests_one_pending_per_user
  on public.player_claim_requests (user_id) where status = 'pending';
create unique index if not exists claim_requests_one_pending_per_player
  on public.player_claim_requests (player_id) where status = 'pending';

-- 3. Guards ----------------------------------------------------------------------------
-- Same convention as profiles_guard(): trigger functions are NOT security definer, so
-- current_user is the caller. API roles are restricted; the SQL editor, service_role and
-- the security-definer RPCs below (which run as the function owner) are not.

-- players: non-admins cannot update at all (RLS already says so; this is the backstop if a
-- policy ever regresses), and nobody can set user_id through the API.
create or replace function public.players_claim_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('anon', 'authenticated') then
    if tg_op = 'UPDATE' then
      if not public.is_admin() then
        raise exception 'Only admins can update players' using errcode = '42501';
      end if;
      if new.user_id is distinct from old.user_id then
        raise exception 'players.user_id changes only via approve_claim_request() / unlink_player()'
          using errcode = '42501';
      end if;
    elsif new.user_id is not null then
      raise exception 'players.user_id cannot be set on insert; use the claim flow'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

-- Names sort before trg_players_touch_updated_at, so the guard runs first.
drop trigger if exists trg_players_claim_guard_upd on public.players;
create trigger trg_players_claim_guard_upd
before update on public.players
for each row execute function public.players_claim_guard();

drop trigger if exists trg_players_claim_guard_ins on public.players;
create trigger trg_players_claim_guard_ins
before insert on public.players
for each row execute function public.players_claim_guard();

-- requests: API callers can only move a pending request to 'rejected'. Approval goes through
-- the RPC (it must also link the player). Resolved rows are immutable. The resolution stamp is
-- filled in here so a direct reject is recorded the same way as the RPC's.
create or replace function public.claim_requests_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('anon', 'authenticated') then
    if old.status <> 'pending' then
      raise exception 'Resolved claim requests are immutable' using errcode = '42501';
    end if;
    if new.status = 'approved' then
      raise exception 'Approve claims with approve_claim_request()' using errcode = '42501';
    end if;
    if new.id is distinct from old.id or new.player_id is distinct from old.player_id
       or new.user_id is distinct from old.user_id or new.message is distinct from old.message
       or new.created_at is distinct from old.created_at then
      raise exception 'Only status can change on a claim request' using errcode = '42501';
    end if;
    if new.status = 'rejected' then
      new.resolved_by := (select auth.uid());
      new.resolved_at := timezone('utc'::text, now());
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_claim_requests_guard on public.player_claim_requests;
create trigger trg_claim_requests_guard
before update on public.player_claim_requests
for each row execute function public.claim_requests_guard();

-- 4. RLS + grants on player_claim_requests ---------------------------------------------
alter table public.player_claim_requests enable row level security;

-- Start from nothing (Supabase grants new public tables to anon/authenticated by default).
revoke all on public.player_claim_requests from anon, authenticated;
grant select on public.player_claim_requests to authenticated;
grant insert (player_id, user_id, message) on public.player_claim_requests to authenticated;
grant update (status) on public.player_claim_requests to authenticated;  -- admin-only by policy

-- SELECT: your own requests, or everything if you are an admin.
drop policy if exists "Claims read own or admin" on public.player_claim_requests;
create policy "Claims read own or admin"
  on public.player_claim_requests for select to authenticated
  using (user_id = (select auth.uid()) or public.is_admin());

-- INSERT: only for yourself, only as a pending request, only if you are not anonymous, have
-- no claimed player, and the target is an unclaimed, non-archived player. The unique indexes
-- then enforce one pending request per user and per player (race-safe).
drop policy if exists "Claims insert own" on public.player_claim_requests;
create policy "Claims insert own"
  on public.player_claim_requests for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and status = 'pending'
    and resolved_by is null
    and resolved_at is null
    and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
    and not exists (
      select 1 from public.players mine where mine.user_id = (select auth.uid())
    )
    and exists (
      select 1 from public.players p
      where p.id = player_claim_requests.player_id
        and p.user_id is null
        and p.archived_at is null
    )
  );

-- UPDATE: admins only (and the guard trigger limits what they can do directly).
drop policy if exists "Claims admin update" on public.player_claim_requests;
create policy "Claims admin update"
  on public.player_claim_requests for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- No DELETE grant or policy: requests are history.

-- 5. RPCs (admin only) -----------------------------------------------------------------
-- SECURITY DEFINER so they can write players.user_id past the guard and RLS; each one checks
-- is_admin() for the CALLER first (auth.uid()/auth.jwt() still reflect the caller).
-- SQLSTATEs: 42501 not an admin, P0002 not found, 55000 request/player not in a valid state.

create or replace function public.approve_claim_request(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r     public.player_claim_requests%rowtype;
  pl    public.players%rowtype;
  actor uuid := (select auth.uid());
begin
  if not public.is_admin() then
    raise exception 'Admins only' using errcode = '42501';
  end if;

  select * into r from public.player_claim_requests where id = p_request_id for update;
  if not found then
    raise exception 'Claim request not found' using errcode = 'P0002';
  end if;
  if r.status <> 'pending' then
    raise exception 'Claim request is already %', r.status using errcode = '55000';
  end if;

  -- Lock the player, then re-check everything the insert policy checked at request time.
  select * into pl from public.players where id = r.player_id for update;
  if not found then
    raise exception 'Player not found' using errcode = 'P0002';
  end if;
  if pl.archived_at is not null then
    raise exception 'Player is archived' using errcode = '55000';
  end if;
  if pl.user_id is not null then
    raise exception 'Player is already claimed' using errcode = '55000';
  end if;
  if exists (select 1 from public.players where user_id = r.user_id) then
    raise exception 'User already has a claimed player' using errcode = '55000';
  end if;

  update public.players set user_id = r.user_id where id = pl.id;

  update public.player_claim_requests
     set status = 'approved', resolved_by = actor, resolved_at = timezone('utc'::text, now())
   where id = r.id;

  -- Defensive: the unique index normally allows only one pending request per player.
  update public.player_claim_requests
     set status = 'rejected', resolved_by = actor, resolved_at = timezone('utc'::text, now())
   where player_id = pl.id and status = 'pending' and id <> r.id;
end;
$$;

create or replace function public.reject_claim_request(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.player_claim_requests%rowtype;
begin
  if not public.is_admin() then
    raise exception 'Admins only' using errcode = '42501';
  end if;

  select * into r from public.player_claim_requests where id = p_request_id for update;
  if not found then
    raise exception 'Claim request not found' using errcode = 'P0002';
  end if;
  if r.status <> 'pending' then
    raise exception 'Claim request is already %', r.status using errcode = '55000';
  end if;

  update public.player_claim_requests
     set status = 'rejected', resolved_by = (select auth.uid()),
         resolved_at = timezone('utc'::text, now())
   where id = r.id;
end;
$$;

create or replace function public.unlink_player(p_player_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  pl public.players%rowtype;
begin
  if not public.is_admin() then
    raise exception 'Admins only' using errcode = '42501';
  end if;

  select * into pl from public.players where id = p_player_id for update;
  if not found then
    raise exception 'Player not found' using errcode = 'P0002';
  end if;
  if pl.user_id is null then
    raise exception 'Player is not claimed' using errcode = '55000';
  end if;

  update public.players set user_id = null where id = pl.id;
end;
$$;

revoke all on function public.approve_claim_request(uuid) from public, anon;
revoke all on function public.reject_claim_request(uuid) from public, anon;
revoke all on function public.unlink_player(uuid) from public, anon;
grant execute on function public.approve_claim_request(uuid) to authenticated;
grant execute on function public.reject_claim_request(uuid) to authenticated;
grant execute on function public.unlink_player(uuid) to authenticated;

commit;
