-- Storage for user avatars: a public `avatars` bucket, one folder per user.
-- Idempotent: safe to run more than once. NOT applied automatically; run it yourself in the
-- Supabase SQL Editor.
--
-- APPLY ORDER: after 20261118000000_profiles_foundation.sql (needs public.is_admin()).
-- It does not depend on the player_admin or player_claims migrations.
--
-- Layout:   avatars/{user_id}/avatar.{jpg|png|webp}
--   * Reads are public through the bucket's public URL (no policy needed, and none is given
--     for anon). Anonymous visitors therefore cannot LIST the bucket or enumerate user ids;
--     they can only fetch a URL they already know (profiles.avatar_url / public_profiles).
--   * Users write only inside their own folder and only to a file named avatar.<ext>.
--   * Admins can manage any object in the bucket.
--
-- This is separate from `week-photos` (podium photos). Nothing here touches that bucket, its
-- policies, or the podium upload code.

begin;

-- 0. Precondition ----------------------------------------------------------------------
do $$
begin
  if to_regprocedure('public.is_admin()') is null then
    raise exception 'Apply 20261118000000_profiles_foundation.sql first (public.is_admin() is missing)';
  end if;
end $$;

-- 1. Bucket ----------------------------------------------------------------------------
-- 2 MB cap. The crop modal exports a 1080 px JPEG, typically a few hundred KB.
-- SVG is deliberately NOT allowed: it can carry script and is served from the project origin.
-- Both limits are enforced by the Storage API at upload time. The mime type is the one the
-- client DECLARES (Content-Type), not a sniffed one, so keep the client-side checks too.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- 2. Policies on storage.objects -------------------------------------------------------
-- "First folder equals auth.uid()" is storage.foldername(name)[1]. A path is also required
-- to match avatar.<ext> exactly (no sub-folders, no arbitrary filenames) for writes.

-- SELECT is NOT public (see header). The owner (and admins) need it because the Storage
-- API reads the existing row for upsert, update and list.
drop policy if exists "Avatars owner or admin select" on storage.objects;
create policy "Avatars owner or admin select"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'avatars'
    and ((storage.foldername(name))[1] = (select auth.uid())::text or public.is_admin())
  );

drop policy if exists "Avatars owner or admin insert" on storage.objects;
create policy "Avatars owner or admin insert"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (
      name ~ ('^' || (select auth.uid())::text || '/avatar\.(jpg|png|webp)$')
      or public.is_admin()
    )
  );

drop policy if exists "Avatars owner or admin update" on storage.objects;
create policy "Avatars owner or admin update"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'avatars'
    and ((storage.foldername(name))[1] = (select auth.uid())::text or public.is_admin())
  )
  with check (
    bucket_id = 'avatars'
    and (
      name ~ ('^' || (select auth.uid())::text || '/avatar\.(jpg|png|webp)$')
      or public.is_admin()
    )
  );

-- DELETE needs only the folder match, so users can also remove a leftover file (e.g. the old
-- avatar.png after switching to avatar.jpg) even though they could not create it today.
drop policy if exists "Avatars owner or admin delete" on storage.objects;
create policy "Avatars owner or admin delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'avatars'
    and ((storage.foldername(name))[1] = (select auth.uid())::text or public.is_admin())
  );

commit;
