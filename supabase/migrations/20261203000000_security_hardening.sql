-- Security hardening from the November 2026 audit (phase 1).
-- Idempotent: safe to run more than once. NOT applied automatically; run it yourself in the
-- Supabase SQL Editor, then run supabase/tests/security_hardening.sql.
--
-- APPLY ORDER: after every earlier migration (needs profiles, the avatars bucket and
-- public.is_admin()).
--
-- 1. public_profiles is no longer readable by API callers. It listed every account's id and
--    display name (which defaults to the email prefix) to anonymous visitors, and nothing in
--    the app reads it: season_leaderboard and get_rsvp_roster resolve avatars themselves.
-- 2. profiles.avatar_url must point at the caller's own file in a Supabase project's public
--    `avatars` bucket. Before, any https URL was accepted, so a user could show a tracking
--    pixel or an offensive image on the public leaderboard. The Content-Security-Policy in
--    public/_headers pins images to this project's host in the browser.
-- 3. The week-photos bucket gets the same kind of limits as avatars: 5 MB, jpeg/png/webp only
--    (SVG can carry script). The app always uploads a cropped JPEG.

begin;

-- 0. Preconditions ---------------------------------------------------------------------
do $$
begin
  if to_regprocedure('public.is_admin()') is null or to_regclass('public.profiles') is null then
    raise exception 'Apply 20261118000000_profiles_foundation.sql first';
  end if;
end $$;

-- 1. public_profiles: no API access --------------------------------------------------
-- Kept (not dropped) so nothing that depends on it breaks; the SQL editor can still read it.
revoke all on public.public_profiles from anon, authenticated;

-- 2. profiles.avatar_url: only your own file in an `avatars` bucket ---------------------
-- Matches what src/data/avatars.ts writes: <project>.supabase.co/.../avatars/<uid>/avatar.<ext>?v=<n>
-- If the project uses a Supabase custom domain, widen the host part of this pattern.
-- NOT VALID: existing rows are not checked (and not changed); every new write is. List any
-- existing offenders with:
--   select id, avatar_url from public.profiles
--   where avatar_url is not null and avatar_url !~ ('^https://[a-z0-9-]+\.supabase\.co/storage/v1/object/public/avatars/' || id::text || '/avatar\.(jpg|png|webp)(\?v=[0-9]+)?$');
alter table public.profiles drop constraint if exists profiles_avatar_url_own_storage;
alter table public.profiles
  add constraint profiles_avatar_url_own_storage
  check (
    avatar_url is null
    or avatar_url ~ ('^https://[a-z0-9-]+\.supabase\.co/storage/v1/object/public/avatars/'
                     || id::text || '/avatar\.(jpg|png|webp)(\?v=[0-9]+)?$')
  ) not valid;

-- 3. week-photos bucket limits ---------------------------------------------------------
-- Enforced by the Storage API on upload, against the Content-Type the client declares.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('week-photos', 'week-photos', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

commit;
