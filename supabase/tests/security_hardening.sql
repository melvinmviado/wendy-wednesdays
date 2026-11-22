-- Tests for supabase/migrations/20261203000000_security_hardening.sql. Run in the Supabase SQL
-- Editor AFTER applying every migration. Everything runs in one transaction that is ROLLED
-- BACK at the end: no fixtures survive. Each check raises on failure; "PASS ..." notices show
-- in the Messages tab. Impersonation = set local role + request.jwt.claims, as PostgREST does.

begin;

create temp table t_ids as
select gen_random_uuid() as alice, gen_random_uuid() as bob,
       'sec-' || substr(gen_random_uuid()::text, 1, 8) as suffix;
grant select on t_ids to anon, authenticated;

insert into auth.users (id, aud, role, email, raw_user_meta_data)
select alice, 'authenticated', 'authenticated', 'alice-' || suffix || '@test.local', '{}'::jsonb from t_ids;
insert into auth.users (id, aud, role, email, raw_user_meta_data)
select bob, 'authenticated', 'authenticated', 'bob-' || suffix || '@test.local', '{}'::jsonb from t_ids;

-- ---------------------------------------------------------------- bucket limits
do $$
declare b storage.buckets%rowtype;
begin
  select * into b from storage.buckets where id = 'week-photos';
  if b.id is null then raise exception 'FAIL week-photos bucket missing'; end if;
  if b.file_size_limit is distinct from 5242880 then
    raise exception 'FAIL week-photos size limit is %', b.file_size_limit;
  end if;
  if 'image/svg+xml' = any (b.allowed_mime_types) or not ('image/jpeg' = any (b.allowed_mime_types)) then
    raise exception 'FAIL week-photos mime types are %', b.allowed_mime_types;
  end if;
  raise notice 'PASS week-photos is limited to 5 MB of jpeg/png/webp';
end $$;

-- ---------------------------------------------------------------- anonymous visitor
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

do $$
begin
  begin
    perform 1 from public.public_profiles limit 1;
    raise exception 'FAIL anon can read public_profiles (lists every account)';
  exception when insufficient_privilege then
    raise notice 'PASS anon cannot read public_profiles';
  end;
end $$;

-- ---------------------------------------------------------------- signed-in user (alice)
reset role;
select set_config('request.jwt.claims',
  json_build_object('sub', (select alice from t_ids), 'role', 'authenticated')::text, true);
set local role authenticated;

do $$
declare t t_ids%rowtype;
begin
  select * into t from t_ids;

  begin
    perform 1 from public.public_profiles limit 1;
    raise exception 'FAIL a signed-in user can read public_profiles';
  exception when insufficient_privilege then
    raise notice 'PASS signed-in users cannot read public_profiles';
  end;

  -- Her own avatar file: accepted, with and without the cache-busting version
  update public.profiles
     set avatar_url = 'https://abcdefghijklmnop.supabase.co/storage/v1/object/public/avatars/' || t.alice || '/avatar.jpg?v=1732300000000'
   where id = t.alice;
  update public.profiles
     set avatar_url = 'https://abcdefghijklmnop.supabase.co/storage/v1/object/public/avatars/' || t.alice || '/avatar.webp'
   where id = t.alice;
  raise notice 'PASS own avatar URL accepted';

  begin
    update public.profiles set avatar_url = 'https://evil.example/pixel.gif' where id = t.alice;
    raise exception 'FAIL an arbitrary https avatar_url was accepted';
  exception when check_violation then
    raise notice 'PASS arbitrary avatar host rejected';
  end;

  begin
    update public.profiles
       set avatar_url = 'https://abcdefghijklmnop.supabase.co/storage/v1/object/public/avatars/' || t.bob || '/avatar.jpg'
     where id = t.alice;
    raise exception 'FAIL avatar_url pointing at another user''s file was accepted';
  exception when check_violation then
    raise notice 'PASS another user''s avatar file rejected';
  end;

  begin
    update public.profiles
       set avatar_url = 'https://abcdefghijklmnop.supabase.co/storage/v1/object/public/avatars/' || t.alice || '/avatar.svg'
     where id = t.alice;
    raise exception 'FAIL an svg avatar_url was accepted';
  exception when check_violation then
    raise notice 'PASS non-image avatar path rejected';
  end;

  begin
    update public.profiles
       set avatar_url = 'https://abcdefghijklmnop.supabase.co.evil.example/storage/v1/object/public/avatars/' || t.alice || '/avatar.jpg'
     where id = t.alice;
    raise exception 'FAIL a look-alike host was accepted';
  exception when check_violation then
    raise notice 'PASS look-alike host rejected';
  end;

  update public.profiles set avatar_url = null where id = t.alice;
  raise notice 'PASS avatar can be cleared';
end $$;

reset role;
rollback;  -- discard every fixture and change
