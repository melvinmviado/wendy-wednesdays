-- Security model, end to end, from the point of view of an ordinary signed-in user ("mallory").
-- Run in the Supabase SQL Editor after ALL migrations (20261118 ... 20261122) are applied.
-- One transaction, ROLLED BACK at the end. Each attempt must fail, AND the stored data is
-- compared with a snapshot afterwards, so "no error" can never hide a silent change.
--
--   1. cannot set role                      4. cannot claim an already-claimed player
--   2. cannot set user_id, archived_at,     5. cannot write another user's avatar path
--      weeks_played or total_points         6. cannot escalate through auth.users or the RPCs
--   3. cannot change stats via weekly_scores

begin;

create temp table t_u (name text primary key, id uuid not null default gen_random_uuid());
create temp table t_p (name text primary key, id uuid not null default gen_random_uuid());
insert into t_u (name) values ('mallory'), ('victim'), ('adm');
insert into t_p (name) values ('free'), ('claimed');
grant select on t_u, t_p to anon, authenticated;

insert into auth.users (id, aud, role, email)
select id, 'authenticated', 'authenticated', name || '-' || substr(id::text, 1, 8) || '@test.local' from t_u;
update public.profiles set role = 'admin' where id = (select id from t_u where name = 'adm');

insert into public.players (id, name) select id, 'SM ' || name || ' ' || substr(id::text, 1, 6) from t_p;
update public.players set user_id = (select id from t_u where name = 'victim'),
                          archived_at = null
 where id = (select id from t_p where name = 'claimed');
insert into public.weekly_scores (player_id, week_number, attended, points)
  select id, 1, true, 20 from t_p where name = 'claimed';
-- the sync trigger has now set claimed.weeks_played = 1, total_points = 20

-- victim already has an avatar
insert into storage.objects (bucket_id, name, owner)
select 'avatars', id::text || '/avatar.jpg', id from t_u where name = 'victim';

-- Snapshot of everything mallory must not be able to change.
create temp table snap_players as select id, user_id, archived_at, weeks_played, total_points, name from public.players
  where id in (select id from t_p);
create temp table snap_roles as select id, role from public.profiles where id in (select id from t_u);
create temp table snap_misc as select
  (select count(*) from public.weekly_scores where player_id in (select id from t_p)) as scores,
  (select count(*) from storage.objects where bucket_id = 'avatars') as avatars;

-- ================================================================ mallory
reset role;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', (select id from t_u where name = 'mallory'), 'role', 'authenticated')::text, true);

do $$
declare
  mal uuid := (select id from t_u where name = 'mallory');
  vic uuid := (select id from t_u where name = 'victim');
  free_p uuid := (select id from t_p where name = 'free');
  held_p uuid := (select id from t_p where name = 'claimed');
  n int;
begin
  if public.is_admin() then raise exception 'FAIL mallory is an admin'; end if;

  -- 1. role ------------------------------------------------------------------------------
  begin update public.profiles set role = 'admin' where id = mal; raise exception 'FAIL set own role';
  exception when insufficient_privilege then raise notice 'PASS 1 cannot set own role'; end;
  begin update public.profiles set role = 'admin' where id = vic; raise exception 'FAIL set another user''s role';
  exception when insufficient_privilege then null; end;
  update public.profiles set display_name = 'Pwned' where id = vic;   -- an allowed column, but not their row
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL touched another profile'; end if;

  -- 2. players columns --------------------------------------------------------------------
  update public.players set user_id = mal where id = free_p;
  get diagnostics n = row_count; if n <> 0 then raise exception 'FAIL set user_id on a free player'; end if;
  update public.players set user_id = mal where id = held_p;
  get diagnostics n = row_count; if n <> 0 then raise exception 'FAIL stole a claimed player'; end if;
  update public.players set archived_at = now() where id = free_p;
  get diagnostics n = row_count; if n <> 0 then raise exception 'FAIL archived a player'; end if;
  update public.players set weeks_played = 99, total_points = 9999 where id = free_p;
  get diagnostics n = row_count; if n <> 0 then raise exception 'FAIL edited stats'; end if;
  delete from public.players where id = free_p;
  get diagnostics n = row_count; if n <> 0 then raise exception 'FAIL deleted a player'; end if;
  begin insert into public.players (name, user_id) values ('Sneaky', mal); raise exception 'FAIL inserted a pre-linked player';
  exception when insufficient_privilege then null; end;
  raise notice 'PASS 2 cannot set user_id, archived_at, weeks_played, total_points (update, delete, insert)';

  -- 3. stats through weekly_scores --------------------------------------------------------
  begin insert into public.weekly_scores (player_id, week_number, points) values (free_p, 2, 500); raise exception 'FAIL inserted a score';
  exception when insufficient_privilege then null; end;
  update public.weekly_scores set points = 500 where player_id = held_p;
  get diagnostics n = row_count; if n <> 0 then raise exception 'FAIL edited a score'; end if;
  delete from public.weekly_scores where player_id = held_p;
  get diagnostics n = row_count; if n <> 0 then raise exception 'FAIL deleted a score'; end if;
  raise notice 'PASS 3 cannot change stats through weekly_scores';

  -- 4. claims -----------------------------------------------------------------------------
  begin insert into public.player_claim_requests (player_id, user_id) values (held_p, mal); raise exception 'FAIL requested an already-claimed player';
  exception when insufficient_privilege then raise notice 'PASS 4 cannot request an already-claimed player'; end;
  insert into public.player_claim_requests (player_id, user_id) values (free_p, mal);   -- control: a legitimate request works
  update public.player_claim_requests set status = 'approved' where user_id = mal;
  get diagnostics n = row_count; if n <> 0 then raise exception 'FAIL self-approved'; end if;
  begin perform public.approve_claim_request((select id from public.player_claim_requests where user_id = mal)); raise exception 'FAIL approve rpc';
  exception when insufficient_privilege then null; end;
  begin perform public.unlink_player(held_p); raise exception 'FAIL unlink rpc';
  exception when insufficient_privilege then null; end;
  raise notice 'PASS 4 cannot self-approve, approve via RPC, or unlink the victim';

  -- 5. avatar paths -----------------------------------------------------------------------
  begin insert into storage.objects (bucket_id, name, owner) values ('avatars', vic::text || '/avatar.png', mal); raise exception 'FAIL wrote into victim folder';
  exception when insufficient_privilege then null; end;
  begin insert into storage.objects (bucket_id, name, owner) values ('avatars', vic::text || '/avatar.jpg', mal); raise exception 'FAIL overwrote victim avatar (insert)';
  exception when insufficient_privilege then null; end;
  update storage.objects set name = mal::text || '/avatar.jpg' where bucket_id = 'avatars' and name = vic::text || '/avatar.jpg';
  get diagnostics n = row_count; if n <> 0 then raise exception 'FAIL moved victim avatar into own folder'; end if;
  delete from storage.objects where bucket_id = 'avatars' and name = vic::text || '/avatar.jpg';
  get diagnostics n = row_count; if n <> 0 then raise exception 'FAIL deleted victim avatar'; end if;
  begin insert into storage.objects (bucket_id, name, owner) values ('avatars', mal::text || '/../' || vic::text || '/avatar.jpg', mal); raise exception 'FAIL path traversal';
  exception when insufficient_privilege then null; end;
  insert into storage.objects (bucket_id, name, owner) values ('avatars', mal::text || '/avatar.jpg', mal); -- control: own path works
  raise notice 'PASS 5 cannot write, replace, move, delete or traverse into another user''s avatar path';

  -- 6. around the tables ------------------------------------------------------------------
  begin update auth.users set raw_app_meta_data = '{"role":"admin"}' where id = mal; raise exception 'FAIL wrote auth.users';
  exception when insufficient_privilege then raise notice 'PASS 6 cannot write auth.users'; end;
end $$;

-- Same attempts with a REGRESSED policy (anyone may update players): the guard trigger must still stop them.
reset role;
create policy "tmp open update" on public.players for update to authenticated using (true) with check (true);
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', (select id from t_u where name = 'mallory'), 'role', 'authenticated')::text, true);
do $$
declare col text;
begin
  foreach col in array array['user_id', 'archived_at', 'weeks_played', 'total_points'] loop
    begin
      execute format('update public.players set %I = %s where id = $1', col,
        case col when 'user_id' then quote_literal((select id from t_u where name = 'mallory')) || '::uuid'
                 when 'archived_at' then 'now()' else '77' end)
        using (select id from t_p where name = 'free');
      raise exception 'FAIL guard let a non-admin write players.%', col;
    exception when insufficient_privilege then null; end;
  end loop;
  raise notice 'PASS 2b even with a regressed RLS policy, the guard blocks user_id, archived_at and stats';
end $$;
reset role;
drop policy "tmp open update" on public.players;

-- ================================================================ nothing changed
do $$
declare bad int; roles_bad int; before_m record; after_m record;
begin
  select count(*) into bad
  from snap_players sp join public.players p using (id)
  where (sp.user_id, sp.archived_at, sp.weeks_played, sp.total_points, sp.name)
        is distinct from (p.user_id, p.archived_at, p.weeks_played, p.total_points, p.name);
  if bad <> 0 then raise exception 'FAIL % player row(s) changed', bad; end if;
  if (select count(*) from public.players where id in (select id from t_p)) <> 2 then raise exception 'FAIL a player was deleted or added'; end if;

  select count(*) into roles_bad from snap_roles r join public.profiles p using (id) where r.role is distinct from p.role;
  if roles_bad <> 0 then raise exception 'FAIL a role changed'; end if;
  if (select raw_app_meta_data ->> 'role' from auth.users where id = (select id from t_u where name = 'mallory')) is not null then
    raise exception 'FAIL mallory got an app_metadata role';
  end if;

  select * into before_m from snap_misc;
  select (select count(*) from public.weekly_scores where player_id in (select id from t_p)) as scores,
         (select count(*) from storage.objects where bucket_id = 'avatars') as avatars into after_m;
  if after_m.scores <> before_m.scores then raise exception 'FAIL weekly_scores changed (% -> %)', before_m.scores, after_m.scores; end if;
  -- the only allowed difference: mallory's own avatar object
  if after_m.avatars <> before_m.avatars + 1 then raise exception 'FAIL avatar objects changed unexpectedly (% -> %)', before_m.avatars, after_m.avatars; end if;
  if not exists (select 1 from storage.objects where bucket_id = 'avatars' and name = (select id::text from t_u where name = 'victim') || '/avatar.jpg') then
    raise exception 'FAIL victim avatar is gone';
  end if;
  raise notice 'PASS snapshot: players, roles, scores and the victim''s avatar are exactly as before';
end $$;

rollback;
