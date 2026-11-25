-- Tests for court assignments. Run in the Supabase SQL Editor AFTER applying
-- 20261206000000_court_assignments.sql (and everything before it).
-- One transaction, ROLLED BACK at the end. A failed check raises; "PASS ..." shows in Messages.
-- Personas are impersonated with set local role + request.jwt.claims, like PostgREST. The claims
-- are set for every persona, anon included: they outlive a role switch inside the transaction.

begin;

create temp table t_ids as
select gen_random_uuid() as admin_uid, gen_random_uuid() as user_uid,
       gen_random_uuid() as p1, gen_random_uuid() as p2, gen_random_uuid() as p3, gen_random_uuid() as p4,
       date '2099-12-30' as d,   -- far ahead, so it never meets a real run
       'courts-' || substr(gen_random_uuid()::text, 1, 8) as suffix;
grant select on t_ids to anon, authenticated;

insert into auth.users (id, aud, role, email)
select admin_uid, 'authenticated', 'authenticated', 'admin-' || suffix || '@test.local' from t_ids
union all
select user_uid, 'authenticated', 'authenticated', 'user-' || suffix || '@test.local' from t_ids;
update public.profiles set role = 'admin' where id = (select admin_uid from t_ids);
insert into public.players (id, name)
select p1, 'Court A ' || suffix from t_ids union all
select p2, 'Court B ' || suffix from t_ids union all
select p3, 'Court C ' || suffix from t_ids union all
select p4, 'Court D ' || suffix from t_ids;

-- ------------------------------------------------------------ admin: build a draft board
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', (select admin_uid from t_ids), 'role', 'authenticated')::text, true);
do $$
declare t t_ids%rowtype; n int; c int;
begin
  select * into t from t_ids;

  begin
    insert into public.event_court_settings (session_date, top_court_number, bottom_court_number) values (t.d, 0, 4);
    raise exception 'FAIL court number 0 accepted';
  exception when check_violation then
    raise notice 'PASS court numbers must be positive';
  end;

  insert into public.event_court_settings (session_date, top_court_number, bottom_court_number) values (t.d, 10, 4);
  select courts_in_use into n from public.event_court_settings where session_date = t.d;
  if n <> 7 then raise exception 'FAIL courts_in_use is %, expected 7', n; end if;
  raise notice 'PASS courts 10 -> 4 is 7 courts in use';

  insert into public.event_assignment_meta (session_date, state, generated_at) values (t.d, 'draft', now());

  insert into public.court_assignments (session_date, player_id, court_position, slot, status, seed_rank) values
    (t.d, t.p1, 0, 0, 'assigned', 1),
    (t.d, t.p2, 2, 1, 'assigned', 2),
    (t.d, t.p3, null, null, 'sitting_out', 3);
  select court_number into c from public.court_assignments where session_date = t.d and player_id = t.p1;
  if c is distinct from 10 then raise exception 'FAIL top court is %, expected 10', c; end if;
  select court_number into c from public.court_assignments where session_date = t.d and player_id = t.p2;
  if c is distinct from 8 then raise exception 'FAIL position 2 is court %, expected 8', c; end if;
  select court_number into c from public.court_assignments where session_date = t.d and player_id = t.p3;
  if c is not null then raise exception 'FAIL sitting out has court %', c; end if;
  raise notice 'PASS court_number counts down from 10, and is null when sitting out';

  begin
    update public.court_assignments set court_position = 7 where session_date = t.d and player_id = t.p2;
    raise exception 'FAIL position past the bottom court accepted';
  exception when sqlstate 'CA002' then
    raise notice 'PASS position past the bottom court refused (CA002)';
  end;

  begin
    update public.court_assignments set court_position = null where session_date = t.d and player_id = t.p2;
    raise exception 'FAIL an assigned row without a court accepted';
  exception when check_violation then
    raise notice 'PASS assigned rows need a court and a slot';
  end;

  begin
    update public.court_assignments set court_position = 0, slot = 0 where session_date = t.d and player_id = t.p2;
    raise exception 'FAIL two players in one seat';
  exception when unique_violation then
    raise notice 'PASS one player per seat';
  end;

  update public.court_assignments
     set court_position = case when player_id = t.p1 then 2 else 0 end,
         slot = case when player_id = t.p1 then 1 else 0 end
   where session_date = t.d and player_id in (t.p1, t.p2);
  select court_number into c from public.court_assignments where session_date = t.d and player_id = t.p1;
  if c is distinct from 8 then raise exception 'FAIL swap left p1 on court %', c; end if;
  raise notice 'PASS two players swap seats in one update';

  update public.event_court_settings set top_court_number = 4, bottom_court_number = 10 where session_date = t.d;
  select court_number into c from public.court_assignments where session_date = t.d and player_id = t.p2;
  if c is distinct from 4 then raise exception 'FAIL after renumbering the top court is %, expected 4', c; end if;
  select court_number into c from public.court_assignments where session_date = t.d and player_id = t.p1;
  if c is distinct from 6 then raise exception 'FAIL after renumbering position 2 is court %, expected 6', c; end if;
  raise notice 'PASS renumbering to 4 -> 10 renumbers the board';

  begin
    update public.event_court_settings set bottom_court_number = 5 where session_date = t.d;  -- 2 courts; p1 is on the 3rd
    raise exception 'FAIL shrank the range under an assigned player';
  exception when sqlstate 'CA002' then
    raise notice 'PASS the range cannot shrink under an assigned player';
  end;

  begin
    update public.court_assignments set court_number = 99 where session_date = t.d;
    raise exception 'FAIL court_number written through the API';
  exception when insufficient_privilege then
    raise notice 'PASS court_number is not writable through the API';
  end;

  begin
    update public.event_assignment_meta set generated_by = 'auto' where session_date = t.d;
    raise exception 'FAIL generated_by written through the API';
  exception when insufficient_privilege then
    raise notice 'PASS generated_by is not writable through the API';
  end;

  if (select generated_by from public.event_assignment_meta where session_date = t.d) is distinct from t.admin_uid::text then
    raise exception 'FAIL admin cannot read generated_by on a draft';
  end if;
  raise notice 'PASS admin reads generated_by on a draft';

  select count(*) into n from public.court_assignment_board where session_date = t.d;
  if n <> 3 then raise exception 'FAIL admin sees % draft rows on the board, expected 3', n; end if;
  raise notice 'PASS admin sees the draft board';

  insert into public.assignment_audit_log (session_date, action, after) values (t.d, 'generate', '{"rows": 3}');
  if (select actor_id from public.assignment_audit_log where session_date = t.d) is distinct from t.admin_uid then
    raise exception 'FAIL audit actor_id is not the admin';
  end if;
  raise notice 'PASS audit rows record the admin as the actor';

  begin
    insert into public.assignment_audit_log (session_date, action) values (t.d, 'shuffle');
    raise exception 'FAIL unknown audit action accepted';
  exception when check_violation then
    raise notice 'PASS unknown audit actions refused';
  end;

  begin
    update public.assignment_audit_log set action = 'move' where session_date = t.d;
    raise exception 'FAIL admin edited the audit log';
  exception when insufficient_privilege then
    raise notice 'PASS the audit log cannot be edited';
  end;

  begin
    delete from public.assignment_audit_log where session_date = t.d;
    raise exception 'FAIL admin deleted from the audit log';
  exception when insufficient_privilege then
    raise notice 'PASS the audit log cannot be deleted from';
  end;
end $$;

-- ------------------------------------------------------------ database stamps (as the owner)
reset role;
do $$
declare t t_ids%rowtype; m public.event_assignment_meta%rowtype;
begin
  select * into t from t_ids;
  select * into m from public.event_assignment_meta where session_date = t.d;
  if m.generated_by is distinct from t.admin_uid::text then
    raise exception 'FAIL generated_by is %, expected the admin', m.generated_by;
  end if;
  if m.published_at is not null then raise exception 'FAIL a draft has published_at'; end if;
  raise notice 'PASS generated_by stamped with the admin; a draft has no published_at';

  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'court_assignment_board'
                and column_name in ('user_id', 'generated_by', 'actor_id')) then
    raise exception 'FAIL court_assignment_board exposes an account id';
  end if;
  raise notice 'PASS court_assignment_board has no account ids';
end $$;

-- ------------------------------------------------------------ anonymous: a draft is invisible
set local role anon;
select set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
do $$
declare t t_ids%rowtype; n int;
begin
  select * into t from t_ids;
  select count(*) into n from public.court_assignments where session_date = t.d;
  if n <> 0 then raise exception 'FAIL anon sees % draft assignments', n; end if;
  select count(*) into n from public.event_assignment_meta where session_date = t.d;
  if n <> 0 then raise exception 'FAIL anon sees the draft meta'; end if;
  select count(*) into n from public.court_assignment_board where session_date = t.d;
  if n <> 0 then raise exception 'FAIL anon sees % draft rows on the board', n; end if;
  raise notice 'PASS anon sees nothing of a draft';

  begin
    insert into public.court_assignments (session_date, player_id, status, seed_rank) values (t.d, t.p4, 'sitting_out', 4);
    raise exception 'FAIL anon wrote an assignment';
  exception when insufficient_privilege then
    raise notice 'PASS anon cannot write assignments';
  end;
  begin
    perform 1 from public.event_court_settings;
    raise exception 'FAIL anon read court settings';
  exception when insufficient_privilege then
    raise notice 'PASS anon cannot read court settings';
  end;
  begin
    perform 1 from public.assignment_audit_log;
    raise exception 'FAIL anon read the audit log';
  exception when insufficient_privilege then
    raise notice 'PASS anon cannot read the audit log';
  end;
end $$;

-- ------------------------------------------------------------ signed-in non-admin, draft
reset role;
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', (select user_uid from t_ids), 'role', 'authenticated')::text, true);
do $$
declare t t_ids%rowtype; n int;
begin
  select * into t from t_ids;
  select count(*) into n from public.court_assignments where session_date = t.d;
  if n <> 0 then raise exception 'FAIL non-admin sees % draft assignments', n; end if;
  select count(*) into n from public.event_assignment_meta where session_date = t.d;
  if n <> 0 then raise exception 'FAIL non-admin sees the draft meta'; end if;
  raise notice 'PASS non-admin sees nothing of a draft';

  begin
    insert into public.court_assignments (session_date, player_id, status, seed_rank) values (t.d, t.p4, 'sitting_out', 4);
    raise exception 'FAIL non-admin wrote an assignment';
  exception when insufficient_privilege then
    raise notice 'PASS non-admin rejected by RLS on court_assignments';
  end;
  begin
    insert into public.assignment_audit_log (session_date, action) values (t.d, 'move');
    raise exception 'FAIL non-admin wrote to the audit log';
  exception when insufficient_privilege then
    raise notice 'PASS non-admin rejected by RLS on the audit log';
  end;
  select count(*) into n from public.event_court_settings where session_date = t.d;
  if n <> 0 then raise exception 'FAIL non-admin reads court settings'; end if;
  raise notice 'PASS non-admin cannot see court settings';
end $$;

-- ------------------------------------------------------------ admin publishes
reset role;
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', (select admin_uid from t_ids), 'role', 'authenticated')::text, true);
do $$
declare t t_ids%rowtype;
begin
  select * into t from t_ids;
  update public.event_assignment_meta set state = 'published' where session_date = t.d;
  if (select published_at from public.event_assignment_meta where session_date = t.d) is null then
    raise exception 'FAIL publishing did not stamp published_at';
  end if;
  raise notice 'PASS publishing stamps published_at';
end $$;

-- ------------------------------------------------------------ anonymous: published is public
reset role;
set local role anon;
select set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
do $$
declare t t_ids%rowtype; n int; nm text;
begin
  select * into t from t_ids;
  select count(*) into n from public.court_assignments where session_date = t.d;
  if n <> 3 then raise exception 'FAIL anon sees % published assignments, expected 3', n; end if;
  select count(*) into n from public.event_assignment_meta where session_date = t.d;
  if n <> 1 then raise exception 'FAIL anon cannot see the published meta'; end if;
  select name into nm from public.court_assignment_board where session_date = t.d and player_id = t.p1;
  if nm is distinct from 'Court A ' || t.suffix then raise exception 'FAIL board name is %', nm; end if;
  raise notice 'PASS anon sees the published board with names';

  begin
    perform generated_by from public.event_assignment_meta where session_date = t.d;
    raise exception 'FAIL anon read generated_by';
  exception when insufficient_privilege then
    raise notice 'PASS anon cannot read generated_by';
  end;
end $$;

-- ------------------------------------------------------------ signed-in non-admin, published
reset role;
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', (select user_uid from t_ids), 'role', 'authenticated')::text, true);
do $$
declare t t_ids%rowtype; n int;
begin
  select * into t from t_ids;
  select count(*) into n from public.court_assignments where session_date = t.d;
  if n <> 3 then raise exception 'FAIL non-admin sees % published assignments, expected 3', n; end if;
  if (select generated_by from public.event_assignment_meta where session_date = t.d) is distinct from t.admin_uid::text then
    raise exception 'FAIL non-admin cannot read generated_by on a published run';
  end if;
  raise notice 'PASS non-admin reads generated_by on a published run';
  update public.court_assignments set seed_rank = 9 where session_date = t.d;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL non-admin updated % published assignments', n; end if;
  delete from public.court_assignments where session_date = t.d;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL non-admin deleted % published assignments', n; end if;
  raise notice 'PASS non-admin can read a published board but not change it';
end $$;

-- ------------------------------------------------------------ admin unpublishes, then clears
reset role;
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', (select admin_uid from t_ids), 'role', 'authenticated')::text, true);
do $$
declare t t_ids%rowtype; n int;
begin
  select * into t from t_ids;
  update public.event_assignment_meta set state = 'draft' where session_date = t.d;
  if (select published_at from public.event_assignment_meta where session_date = t.d) is not null then
    raise exception 'FAIL unpublishing kept published_at';
  end if;
  raise notice 'PASS unpublishing clears published_at';

  begin
    delete from public.event_court_settings where session_date = t.d;
    raise exception 'FAIL court settings deleted under a board';
  exception when foreign_key_violation then
    raise notice 'PASS court settings cannot be deleted while the run has a board';
  end;

  delete from public.event_assignment_meta where session_date = t.d;
  select count(*) into n from public.court_assignments where session_date = t.d;
  if n <> 0 then raise exception 'FAIL deleting the meta left % assignments', n; end if;
  raise notice 'PASS deleting the meta clears the board';
end $$;

-- ------------------------------------------------------------ anonymous: unpublished is hidden again
reset role;
set local role anon;
select set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
do $$
declare t t_ids%rowtype;
begin
  select * into t from t_ids;
  if exists (select 1 from public.court_assignment_board where session_date = t.d) then
    raise exception 'FAIL anon still sees the board';
  end if;
  raise notice 'PASS anon sees nothing once it is unpublished and cleared';
end $$;

-- ------------------------------------------------------------ Realtime publication
reset role;
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    raise notice 'PASS (skipped) no supabase_realtime publication in this database';
    return;
  end if;
  if (select count(*) from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public'
         and tablename in ('court_assignments', 'event_assignment_meta')) <> 2 then
    raise exception 'FAIL court_assignments / event_assignment_meta are not in supabase_realtime';
  end if;
  raise notice 'PASS both tables are in the supabase_realtime publication';
end $$;

reset role;
rollback;
