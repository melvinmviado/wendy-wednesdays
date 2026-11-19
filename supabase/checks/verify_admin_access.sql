-- READ-ONLY. Run in the Supabase SQL Editor after applying the migrations (and again after any
-- role change). It changes nothing. Each section says what a healthy result looks like.

-- 1. Who can sign in, and what they are now. Expect every real admin to show role = admin AND
--    claim = admin. Anyone you do not recognise: demote them with
--      update public.profiles set role = 'user' where id = '<uuid>';
select u.email,
       u.created_at,
       u.last_sign_in_at,
       u.email_confirmed_at is not null as email_confirmed,
       coalesce(u.is_anonymous, false)  as anonymous,
       p.role                           as profile_role,
       u.raw_app_meta_data ->> 'role'   as jwt_claim
from auth.users u
left join public.profiles p on p.id = u.id
order by (p.role = 'admin') desc, u.created_at;

-- 2. Problems. Expect ZERO rows.
select 'account without a profile' as problem, u.email as detail
from auth.users u left join public.profiles p on p.id = u.id
where p.id is null
union all
select 'admin whose JWT claim has not been mirrored', u.email
from auth.users u join public.profiles p on p.id = u.id
where p.role = 'admin' and u.raw_app_meta_data ->> 'role' is distinct from 'admin'
union all
select 'claim says admin but the profile does not', u.email
from auth.users u join public.profiles p on p.id = u.id
where p.role <> 'admin' and u.raw_app_meta_data ->> 'role' = 'admin'
union all
select 'anonymous account is an admin', u.email
from auth.users u join public.profiles p on p.id = u.id
where coalesce(u.is_anonymous, false) and p.role = 'admin';

-- 3. Admin count. Expect the number of people you intended.
select count(*) filter (where role = 'admin') as admins, count(*) as profiles from public.profiles;

-- 4. is_admin() must be the profiles-based one: SECURITY DEFINER with an empty search_path.
--    Expect one row with is_security_definer = true and config containing search_path=.
select p.proname, p.prosecdef as is_security_definer, p.proconfig as config
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'is_admin';

-- 5. Write policies that still let ANY signed-in user write. Expect ZERO rows.
--    (Select policies that are "true" are intentional: the leaderboard is public.)
select schemaname, tablename, policyname, cmd
from pg_policies
where schemaname in ('public', 'storage')
  and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')
  and (qual = 'true' or with_check = 'true')
  and not (tablename = 'objects' and policyname ilike '%public read%');

-- 6. The API roles must not be able to write these columns/tables directly. Expect ZERO rows.
select grantee, table_name, column_name, privilege_type
from information_schema.column_privileges
where table_schema = 'public'
  and table_name = 'profiles'
  and grantee in ('anon', 'authenticated')
  and privilege_type in ('UPDATE', 'INSERT')
  and column_name not in ('display_name', 'avatar_url');
