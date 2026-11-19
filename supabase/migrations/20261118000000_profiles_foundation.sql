-- Profiles foundation: profiles table, role mirroring, is_admin(), admin policies, backfill.
-- Idempotent: safe to run more than once. NOT applied automatically; run it yourself in the
-- Supabase SQL Editor.
--
-- APPLY ORDER (the timestamps already sort this way):
--   1. 20261118000000_profiles_foundation.sql   (this file: defines public.is_admin())
--   2. 20261119000000_player_admin.sql          (uses public.is_admin(); refuses to run without it)
--
-- Source of truth: public.profiles.role. It is mirrored ONE WAY into
-- auth.users.raw_app_meta_data->'role' (the JWT app_metadata claim). Nothing flows back.
-- Never read the role from user_metadata: users can edit that themselves.
--
-- BACKFILL WARNING: today every account in auth.users has full write access (policies only
-- check "authenticated"). Section 8 therefore promotes EVERY existing non-anonymous account
-- to admin the first time it runs, so nobody loses access. Review the list it prints, and
-- demote strays afterwards:  update public.profiles set role = 'user' where id = '<uuid>';
-- (the mirror trigger updates the claim). Re-running never promotes anyone again.

begin;

-- 1. profiles --------------------------------------------------------------------------
create table if not exists public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  avatar_url   text,
  role         text not null default 'user' check (role in ('user', 'admin')),
  created_at   timestamptz not null default timezone('utc'::text, now()),
  updated_at   timestamptz not null default timezone('utc'::text, now()),
  constraint profiles_display_name_len
    check (display_name is null or char_length(btrim(display_name)) between 1 and 60),
  -- https only, bounded length. (Pinning to your own storage URL needs the project ref, so
  -- do that in the avatar-upload migration.)
  constraint profiles_avatar_url_https
    check (avatar_url is null or (avatar_url ~* '^https://' and char_length(avatar_url) <= 2048))
);

-- 2. Display-name derivation + signup trigger -------------------------------------------
-- Google name (full_name / name) first, then the email prefix. user_metadata is user-editable,
-- which is fine for a display name; it is never used for authorization.
create or replace function public.derive_display_name(p_email text, p_meta jsonb)
returns text
language sql
immutable
set search_path = ''
as $$
  select left(btrim(coalesce(
    nullif(btrim(p_meta ->> 'full_name'), ''),
    nullif(btrim(p_meta ->> 'name'), ''),
    nullif(split_part(coalesce(p_email, ''), '@', 1), ''),
    'Player'
  )), 60);
$$;

-- SECURITY DEFINER so the new user (who has no insert rights on profiles) still gets a row.
-- Always inserts role 'user': a signup can never choose its own role.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name, role)
  values (new.id, public.derive_display_name(new.email, new.raw_user_meta_data), 'user')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- 3. One-way mirror: profiles.role -> auth.users.raw_app_meta_data.role -----------------
-- Runs when a profile is created with a non-default role, and whenever role changes.
-- (A plain 'user' insert is skipped: no claim means "user", and it keeps signup light.)
create or replace function public.sync_profile_role_to_claim()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update auth.users u
     set raw_app_meta_data =
           coalesce(u.raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('role', new.role)
   where u.id = new.id
     and u.raw_app_meta_data ->> 'role' is distinct from new.role;
  return new;
end;
$$;

drop trigger if exists trg_profiles_sync_role_ins on public.profiles;
create trigger trg_profiles_sync_role_ins
after insert on public.profiles
for each row when (new.role <> 'user')
execute function public.sync_profile_role_to_claim();

drop trigger if exists trg_profiles_sync_role_upd on public.profiles;
create trigger trg_profiles_sync_role_upd
after update of role on public.profiles
for each row when (old.role is distinct from new.role)
execute function public.sync_profile_role_to_claim();

-- 4. Guard + updated_at ----------------------------------------------------------------
-- Defence in depth behind the column GRANTs in section 6. If a grant or policy ever regresses,
-- API callers (anon / authenticated) still cannot change role, id or created_at. The SQL
-- editor, migrations and service_role run as other roles and are not affected.
-- Deliberately NOT security definer: current_user must be the caller.
create or replace function public.profiles_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('anon', 'authenticated') then
    if new.role is distinct from old.role then
      raise exception 'profiles.role cannot be changed through the API' using errcode = '42501';
    end if;
    if new.id is distinct from old.id or new.created_at is distinct from old.created_at then
      raise exception 'profiles.id and created_at are immutable' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.profiles_touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = timezone('utc'::text, now());
  return new;
end;
$$;

-- BEFORE triggers fire alphabetically: the guard runs before the touch.
drop trigger if exists trg_profiles_guard on public.profiles;
create trigger trg_profiles_guard
before update on public.profiles
for each row execute function public.profiles_guard();

drop trigger if exists trg_profiles_touch on public.profiles;
create trigger trg_profiles_touch
before update on public.profiles
for each row execute function public.profiles_touch_updated_at();

-- Trigger functions are never meant to be called directly.
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.sync_profile_role_to_claim() from public, anon, authenticated;

-- 5. is_admin() ------------------------------------------------------------------------
-- True when the JWT's app_metadata.role is 'admin' OR profiles.role is 'admin'.
--   * app_metadata is only writable server-side (never by the user), so the claim is trusted.
--   * The profiles fallback covers tokens minted before the claim existed (existing sessions
--     after the backfill) and a freshly promoted user whose token has not refreshed yet.
--   * SECURITY DEFINER so the lookup ignores profiles RLS (no recursion with the profiles
--     policies below). It only ever answers about the caller (auth.uid()).
-- Known trade-off: a DEMOTED admin keeps working until their access token expires (Supabase
-- default 1 hour), because the stale claim still says 'admin'.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
    or exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid()) and p.role = 'admin'
    ),
    false
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated, service_role;

-- 6. RLS + grants on profiles ----------------------------------------------------------
alter table public.profiles enable row level security;

-- Supabase grants new public tables to anon/authenticated by default. Start from nothing.
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;                       -- rows limited by RLS below
grant update (display_name, avatar_url) on public.profiles to authenticated;  -- NOT role/id/created_at

-- Full table (including role): your own row, or any row if you are an admin. Anonymous
-- visitors get nothing here; they use public_profiles.
drop policy if exists "Profiles read own or admin" on public.profiles;
create policy "Profiles read own or admin"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()) or public.is_admin());

-- A user may update ONLY their own row. Column GRANTs above limit which columns, the guard
-- trigger backs that up, and WITH CHECK stops re-pointing the row at someone else.
drop policy if exists "Profiles update own" on public.profiles;
create policy "Profiles update own"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- No INSERT policy or grant (the signup trigger creates rows) and no DELETE (cascade from
-- auth.users only). Role changes happen in the SQL editor / service_role for now.

-- Public, narrow projection for avatars on the leaderboard. A plain view runs with its
-- owner's rights, so it intentionally bypasses profiles RLS but exposes ONLY these three
-- columns; role and timestamps are never public. (Supabase's linter flags security-definer
-- views; that is expected here.)
create or replace view public.public_profiles
with (security_invoker = false) as
select id, display_name, avatar_url
from public.profiles;

revoke all on public.public_profiles from anon, authenticated;
grant select on public.public_profiles to anon, authenticated;

-- 7. Admin policies on the existing tables ---------------------------------------------
-- Replaces "to authenticated using (true)" on weekly_scores, weeks and the week-photos
-- bucket. (players is handled by 20261119000000_player_admin.sql.) Old and new policy names
-- are both dropped so re-runs and partially-applied databases converge.

-- weekly_scores
drop policy if exists "Allow authenticated admin insert weekly scores" on public.weekly_scores;
drop policy if exists "Allow authenticated admin update weekly scores" on public.weekly_scores;
drop policy if exists "Allow authenticated admin delete weekly scores" on public.weekly_scores;
drop policy if exists "Admins insert weekly scores" on public.weekly_scores;
drop policy if exists "Admins update weekly scores" on public.weekly_scores;
drop policy if exists "Admins delete weekly scores" on public.weekly_scores;

create policy "Admins insert weekly scores"
  on public.weekly_scores for insert to authenticated with check (public.is_admin());
create policy "Admins update weekly scores"
  on public.weekly_scores for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy "Admins delete weekly scores"
  on public.weekly_scores for delete to authenticated using (public.is_admin());

-- weeks
drop policy if exists "Allow authenticated admin insert weeks" on public.weeks;
drop policy if exists "Allow authenticated admin update weeks" on public.weeks;
drop policy if exists "Allow authenticated admin delete weeks" on public.weeks;
drop policy if exists "Admins insert weeks" on public.weeks;
drop policy if exists "Admins update weeks" on public.weeks;
drop policy if exists "Admins delete weeks" on public.weeks;

create policy "Admins insert weeks"
  on public.weeks for insert to authenticated with check (public.is_admin());
create policy "Admins update weeks"
  on public.weeks for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy "Admins delete weeks"
  on public.weeks for delete to authenticated using (public.is_admin());

-- week-photos storage (public read policy is unchanged)
drop policy if exists "Admin insert week photos" on storage.objects;
drop policy if exists "Admin update week photos" on storage.objects;
drop policy if exists "Admin delete week photos" on storage.objects;

create policy "Admin insert week photos"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'week-photos' and public.is_admin());
create policy "Admin update week photos"
  on storage.objects for update to authenticated
  using (bucket_id = 'week-photos' and public.is_admin())
  with check (bucket_id = 'week-photos' and public.is_admin());
create policy "Admin delete week photos"
  on storage.objects for delete to authenticated
  using (bucket_id = 'week-photos' and public.is_admin());

-- 8. Backfill --------------------------------------------------------------------------
-- (a) Profiles for every existing account. Only accounts WITHOUT a profile are touched, so
--     re-runs never re-promote someone you later demoted. Existing accounts have admin access
--     today, so they start as 'admin'; anonymous sign-ins (if enabled) start as 'user'.
--     The insert trigger mirrors role -> app_metadata for each admin.
insert into public.profiles (id, display_name, role)
select u.id,
       public.derive_display_name(u.email, u.raw_user_meta_data),
       case when coalesce(u.is_anonymous, false) then 'user' else 'admin' end
from auth.users u
where not exists (select 1 from public.profiles p where p.id = u.id);

-- (b) Converge the claim for every profile (idempotent; fixes any drift, e.g. a profile that
--     already existed). Existing sessions keep working before they refresh because is_admin()
--     falls back to profiles.role.
update auth.users u
   set raw_app_meta_data =
         coalesce(u.raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('role', p.role)
  from public.profiles p
 where p.id = u.id
   and p.role = 'admin'
   and u.raw_app_meta_data ->> 'role' is distinct from p.role;

-- (c) Show who is admin now, so you can demote strays.
do $$
declare admins text;
begin
  select string_agg(coalesce(u.email, u.id::text), ', ' order by u.created_at)
    into admins
  from public.profiles p join auth.users u on u.id = p.id
  where p.role = 'admin';
  raise notice 'Admins after backfill: %', coalesce(admins, '(none)');
end $$;

commit;
