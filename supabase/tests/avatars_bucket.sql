-- Tests for the avatars bucket policies. Run in the Supabase SQL Editor AFTER applying
-- 20261118000000_profiles_foundation.sql and 20261121000000_avatars_bucket.sql.
-- One transaction, ROLLED BACK at the end. These insert straight into storage.objects, so
-- they prove the RLS rules; the size/mime limits are enforced by the Storage API and are
-- checked here only as bucket settings (verify an oversized/non-image upload in the app).

begin;

create temp table t_u (name text primary key, id uuid not null default gen_random_uuid());
insert into t_u (name) values ('alice'), ('bob'), ('adm');
grant select on t_u to anon, authenticated;

insert into auth.users (id, aud, role, email)
select id, 'authenticated', 'authenticated', name || '-' || substr(id::text, 1, 8) || '@test.local' from t_u;
update public.profiles set role = 'admin' where id = (select id from t_u where name = 'adm');

-- Bob already has an avatar (inserted as the privileged role).
insert into storage.objects (bucket_id, name, owner)
select 'avatars', id::text || '/avatar.jpg', id from t_u where name = 'bob';

do $$
declare b storage.buckets%rowtype;
begin
  select * into b from storage.buckets where id = 'avatars';
  if not found then raise exception 'FAIL avatars bucket missing'; end if;
  if not b.public then raise exception 'FAIL bucket is not public'; end if;
  if b.file_size_limit is distinct from 2097152 then raise exception 'FAIL size limit is %', b.file_size_limit; end if;
  if b.allowed_mime_types is distinct from array['image/jpeg','image/png','image/webp'] then
    raise exception 'FAIL mime types are %', b.allowed_mime_types;
  end if;
  raise notice 'PASS bucket is public, 2 MB cap, jpeg/png/webp only (no svg)';
end $$;

-- ---------------------------------------------------------------- alice
reset role;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', (select id from t_u where name = 'alice'), 'role', 'authenticated')::text, true);

do $$
declare a text := (select id::text from t_u where name = 'alice');
        b text := (select id::text from t_u where name = 'bob');
        n int;
begin
  insert into storage.objects (bucket_id, name, owner) values ('avatars', a || '/avatar.jpg', a::uuid);
  raise notice 'PASS user can upload to their own folder as avatar.<ext>';

  begin
    insert into storage.objects (bucket_id, name, owner) values ('avatars', b || '/avatar.png', a::uuid);
    raise exception 'FAIL user wrote into another user''s folder';
  exception when insufficient_privilege then raise notice 'PASS user cannot write into another folder'; end;

  begin
    insert into storage.objects (bucket_id, name, owner) values ('avatars', 'avatar.jpg', a::uuid);
    raise exception 'FAIL user wrote at the bucket root';
  exception when insufficient_privilege then raise notice 'PASS user cannot write at the bucket root'; end;

  begin
    insert into storage.objects (bucket_id, name, owner) values ('avatars', a || '/holiday.jpg', a::uuid);
    raise exception 'FAIL user wrote an arbitrary filename';
  exception when insufficient_privilege then raise notice 'PASS only avatar.<ext> is allowed (no arbitrary names)'; end;

  begin
    insert into storage.objects (bucket_id, name, owner) values ('avatars', a || '/nested/avatar.jpg', a::uuid);
    raise exception 'FAIL user wrote into a sub-folder';
  exception when insufficient_privilege then raise notice 'PASS no sub-folders'; end;

  begin
    insert into storage.objects (bucket_id, name, owner) values ('avatars', a || '/avatar.svg', a::uuid);
    raise exception 'FAIL svg path accepted';
  exception when insufficient_privilege then raise notice 'PASS svg extension rejected by policy'; end;

  update storage.objects set name = a || '/avatar.png' where bucket_id = 'avatars' and name = a || '/avatar.jpg';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL user could not replace their own avatar (% rows)', n; end if;
  raise notice 'PASS user can update their own avatar';

  update storage.objects set name = a || '/avatar.jpg' where bucket_id = 'avatars' and name = a || '/avatar.png';

  update storage.objects set metadata = '{}'::jsonb where bucket_id = 'avatars' and name = b || '/avatar.jpg';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL user updated another user''s avatar'; end if;
  raise notice 'PASS user cannot update another user''s avatar';

  select count(*) into n from storage.objects where bucket_id = 'avatars';
  if n <> 1 then raise exception 'FAIL user can see % avatar objects, expected only their own', n; end if;
  raise notice 'PASS user cannot list other users'' avatars';

  delete from storage.objects where bucket_id = 'avatars' and name = b || '/avatar.jpg';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL user deleted another user''s avatar'; end if;
  raise notice 'PASS user cannot delete another user''s avatar';

  delete from storage.objects where bucket_id = 'avatars' and name = a || '/avatar.jpg';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL user could not delete their own avatar'; end if;
  raise notice 'PASS user can delete their own avatar';

  -- Other buckets are not affected by these policies.
  begin
    insert into storage.objects (bucket_id, name, owner) values ('week-photos', 'week-1/x.jpg', a::uuid);
    raise exception 'FAIL avatar policies opened up week-photos to a normal user';
  exception when insufficient_privilege then raise notice 'PASS week-photos is still admin-only'; end;
end $$;

-- ---------------------------------------------------------------- anon
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
do $$
declare n int;
begin
  select count(*) into n from storage.objects where bucket_id = 'avatars';
  if n <> 0 then raise exception 'FAIL anon can list % avatar objects', n; end if;
  raise notice 'PASS anon cannot list the bucket (public URLs still work)';
  begin
    insert into storage.objects (bucket_id, name) values ('avatars', gen_random_uuid()::text || '/avatar.jpg');
    raise exception 'FAIL anon uploaded an avatar';
  exception when insufficient_privilege then raise notice 'PASS anon cannot upload'; end;
end $$;

-- ---------------------------------------------------------------- admin
reset role;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', (select id from t_u where name = 'adm'), 'role', 'authenticated')::text, true);
do $$
declare b text := (select id::text from t_u where name = 'bob'); n int;
begin
  update storage.objects set metadata = '{"by":"admin"}'::jsonb where bucket_id = 'avatars' and name = b || '/avatar.jpg';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL admin could not update another user''s avatar'; end if;
  raise notice 'PASS admin can update any avatar';

  delete from storage.objects where bucket_id = 'avatars' and name = b || '/avatar.jpg';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL admin could not delete another user''s avatar'; end if;
  raise notice 'PASS admin can delete any avatar';

  insert into storage.objects (bucket_id, name, owner) values ('avatars', b || '/avatar.webp', (select id from t_u where name = 'adm'));
  raise notice 'PASS admin can upload into any folder';
end $$;

reset role;
rollback;
