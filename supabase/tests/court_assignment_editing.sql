-- Tests for court assignment editing. Run in the Supabase SQL Editor AFTER applying
-- 20261208000000_court_assignment_editing.sql (and everything before it).
-- One transaction, ROLLED BACK at the end. A failed check raises; "PASS ..." shows in Messages.
--
-- The board (2 courts: 10 then 9):  court 10: p1 p2 p3 p4   court 9: empty   sitting out: p5
-- p6 is an active player who is not on the board; p7 is archived.

begin;

create temp table t_ids as
select gen_random_uuid() as admin_uid, gen_random_uuid() as user_uid,
       gen_random_uuid() as p1, gen_random_uuid() as p2, gen_random_uuid() as p3,
       gen_random_uuid() as p4, gen_random_uuid() as p5, gen_random_uuid() as p6, gen_random_uuid() as p7,
       date '2099-12-30' as d,      -- a run with a draft board
       date '2099-12-23' as d_none, -- a run with no board yet
       'ed-' || substr(gen_random_uuid()::text, 1, 8) as suffix;
grant select on t_ids to anon, authenticated;

insert into auth.users (id, aud, role, email)
select x.id, 'authenticated', 'authenticated', x.n || '-' || t.suffix || '@test.local'
  from t_ids t, lateral (values (t.admin_uid, 'ed-admin'), (t.user_uid, 'ed-user')) x(id, n);
update public.profiles set role = 'admin', display_name = 'Edie Admin' where id = (select admin_uid from t_ids);

insert into public.players (id, name)
select x.id, x.n || ' ' || t.suffix
  from t_ids t,
       lateral (values (t.p1, 'Ed One'), (t.p2, 'Ed Two'), (t.p3, 'Ed Three'),
                       (t.p4, 'Ed Four'), (t.p5, 'Ed Five'), (t.p6, 'Ed Six'), (t.p7, 'Ed Seven')) x(id, n);
update public.players set archived_at = now() where id = (select p7 from t_ids);

insert into public.event_court_settings (session_date, top_court_number, bottom_court_number)
select x.d, 10, 9 from t_ids t, lateral (values (t.d), (t.d_none)) x(d);
insert into public.event_assignment_meta (session_date, state, generated_at, generated_by)
select d, 'draft', now(), 'auto' from t_ids;
insert into public.event_assignment_meta (session_date) select d_none from t_ids;
insert into public.court_assignments (session_date, player_id, court_position, slot, status, seed_rank)
select t.d, x.id, x.pos, x.slot, x.st, x.seed
  from t_ids t,
       lateral (values (t.p1, 0, 0, 'assigned', 1), (t.p2, 0, 1, 'assigned', 2), (t.p3, 0, 2, 'assigned', 3),
                       (t.p4, 0, 3, 'assigned', 4), (t.p5, null, null, 'sitting_out', 5)) x(id, pos, slot, st, seed);

-- ------------------------------------------------------------ who may call
set local role anon;
select set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
do $$
declare t t_ids%rowtype;
begin
  select * into t from t_ids;
  begin
    perform public.court_assignment_swap(t.d, t.p1, t.p5);
    raise exception 'FAIL anon swapped';
  exception when insufficient_privilege then
    raise notice 'PASS anon cannot edit';
  end;
end $$;

reset role;
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', (select user_uid from t_ids), 'role', 'authenticated')::text, true);
do $$
declare t t_ids%rowtype;
begin
  select * into t from t_ids;
  begin
    perform public.court_assignment_move(t.d, t.p1);
    raise exception 'FAIL a non-admin moved a player';
  exception when insufficient_privilege then
    raise notice 'PASS a signed-in non-admin cannot edit';
  end;
  begin
    perform public.court_assignment_activity(t.d);
    raise exception 'FAIL a non-admin read the activity log';
  exception when insufficient_privilege then
    raise notice 'PASS a signed-in non-admin cannot read the activity log';
  end;
end $$;

-- ------------------------------------------------------------ admin edits
select set_config('request.jwt.claims',
  json_build_object('sub', (select admin_uid from t_ids), 'role', 'authenticated')::text, true);
do $$
declare t t_ids%rowtype; r public.court_assignments%rowtype; n integer;
begin
  select * into t from t_ids;

  begin
    perform public.court_assignment_swap(t.d_none, t.p1, t.p5);
    raise exception 'FAIL edited a run with no board';
  exception when sqlstate 'CA020' then
    raise notice 'PASS a run with no board cannot be edited (CA020)';
  end;

  -- seat <-> sitting out
  perform public.court_assignment_swap(t.d, t.p1, t.p5);
  select * into r from public.court_assignments where session_date = t.d and player_id = t.p5;
  if r.status <> 'assigned' or r.court_position <> 0 or r.slot <> 0 or r.court_number <> 10 then
    raise exception 'FAIL p5 did not take p1''s seat: %', row_to_json(r);
  end if;
  select * into r from public.court_assignments where session_date = t.d and player_id = t.p1;
  if r.status <> 'sitting_out' or r.court_position is not null or r.seed_rank <> 1 then
    raise exception 'FAIL p1 is not sitting out with their seed kept: %', row_to_json(r);
  end if;
  raise notice 'PASS swap: a seated player and a sitting-out player trade places, seeds kept';

  -- seat <-> seat on the same court, in one statement
  perform public.court_assignment_swap(t.d, t.p2, t.p3);
  if (select slot from public.court_assignments where session_date = t.d and player_id = t.p2) <> 2
     or (select slot from public.court_assignments where session_date = t.d and player_id = t.p3) <> 1 then
    raise exception 'FAIL p2 and p3 did not trade seats';
  end if;
  raise notice 'PASS swap: two seated players trade seats';

  begin
    perform public.court_assignment_swap(t.d, t.p1, t.p1);
    raise exception 'FAIL swapped a player with themselves';
  exception when sqlstate '22023' then
    raise notice 'PASS a swap needs two different players';
  end;
  begin
    perform public.court_assignment_swap(t.d, t.p2, t.p6);
    raise exception 'FAIL swapped with a player who is not on the board';
  exception when sqlstate 'CA021' then
    raise notice 'PASS a swap with someone no longer on the board is refused (CA021)';
  end;

  -- move to an empty seat on the bottom court, then try a taken seat
  perform public.court_assignment_move(t.d, t.p4, 1, 0);
  if (select court_number from public.court_assignments where session_date = t.d and player_id = t.p4) <> 9 then
    raise exception 'FAIL p4 is not on court 9';
  end if;
  raise notice 'PASS move: to an empty seat on another court, numbered by the court range';
  begin
    perform public.court_assignment_move(t.d, t.p1, 0, 0);
    raise exception 'FAIL moved onto a taken seat';
  exception when sqlstate 'CA022' then
    raise notice 'PASS a taken seat is refused, not overwritten (CA022)';
  end;
  begin
    perform public.court_assignment_move(t.d, t.p1, 2, 0);
    raise exception 'FAIL moved past the bottom court';
  exception when sqlstate 'CA002' then
    raise notice 'PASS there is no third court (CA002)';
  end;
  begin
    perform public.court_assignment_move(t.d, t.p1, 1, null);
    raise exception 'FAIL moved with a court but no seat';
  exception when sqlstate '22023' then
    raise notice 'PASS a move needs a court and a seat, or neither';
  end;

  -- to sitting out, then add someone new into the gap, then take them off again (undo of an add)
  perform public.court_assignment_move(t.d, t.p2);
  if (select status from public.court_assignments where session_date = t.d and player_id = t.p2) <> 'sitting_out' then
    raise exception 'FAIL p2 is not sitting out';
  end if;
  raise notice 'PASS move: remove from court leaves the seat empty and the player sitting out';

  perform public.court_assignment_move(t.d, t.p6, 0, 2);
  select * into r from public.court_assignments where session_date = t.d and player_id = t.p6;
  if r.status <> 'assigned' or r.seed_rank <> 6 then
    raise exception 'FAIL p6 was not added after the last seed: %', row_to_json(r);
  end if;
  raise notice 'PASS move: an active player not on the board is added, seeded last';

  perform public.court_assignment_move(t.d, t.p6, null, null, true);
  if exists (select 1 from public.court_assignments where session_date = t.d and player_id = t.p6) then
    raise exception 'FAIL p6 is still on the board';
  end if;
  perform public.court_assignment_move(t.d, t.p6, null, null, true); -- again: nothing to do
  raise notice 'PASS move with remove takes a player off the board, and repeating it is harmless';

  begin
    perform public.court_assignment_move(t.d, t.p7, 0, 2);
    raise exception 'FAIL an archived player was added';
  exception when sqlstate 'CA023' then
    raise notice 'PASS an archived player cannot be added (CA023)';
  end;

  -- the log and the flag
  if not (select manually_edited from public.event_assignment_meta where session_date = t.d) then
    raise exception 'FAIL edits did not set manually_edited';
  end if;
  select count(*) into n from public.assignment_audit_log
   where session_date = t.d and actor_id = t.admin_uid and action in ('swap', 'move');
  if n <> 6 then raise exception 'FAIL % edit rows in the audit log, expected 6', n; end if;
  if not exists (select 1 from public.assignment_audit_log
                  where session_date = t.d and action = 'swap'
                    and before -> 0 ->> 'name' = 'Ed One ' || t.suffix and before -> 0 ->> 'status' = 'assigned'
                    and after -> 0 ->> 'status' = 'sitting_out') then
    raise exception 'FAIL the first swap is not logged with names and places';
  end if;
  if not exists (select 1 from public.assignment_audit_log
                  where session_date = t.d and action = 'move' and before ->> 'player_id' = t.p6::text and after is null) then
    raise exception 'FAIL taking p6 off the board is not logged';
  end if;
  raise notice 'PASS every edit sets manually_edited and is logged with the admin, names and places';

  -- publish / unpublish
  if public.court_assignment_set_published(t.d, true) <> 'published'
     or (select published_at from public.event_assignment_meta where session_date = t.d) is null then
    raise exception 'FAIL publish';
  end if;
  perform public.court_assignment_set_published(t.d, true); -- again: nothing to do
  if public.court_assignment_set_published(t.d, false) <> 'draft'
     or (select published_at from public.event_assignment_meta where session_date = t.d) is not null then
    raise exception 'FAIL unpublish';
  end if;
  select count(*) into n from public.assignment_audit_log where session_date = t.d and action in ('publish', 'unpublish');
  if n <> 2 then raise exception 'FAIL % publish/unpublish rows, expected 2', n; end if;
  raise notice 'PASS publish and unpublish, each logged once';

  -- the activity feed
  if (select count(*) from public.court_assignment_activity(t.d)) <> 8 then
    raise exception 'FAIL the activity feed does not have all 8 entries';
  end if;
  -- (Newest-first order is not checkable here: every row of one transaction has the same now().)
  if not exists (select 1 from public.court_assignment_activity(t.d) a
                  where a.action = 'unpublish' and a.actor_id = t.admin_uid and a.actor_name = 'Edie Admin') then
    raise exception 'FAIL the activity feed does not name the admin';
  end if;
  raise notice 'PASS the activity feed lists the run''s log with each admin''s name';
end $$;

reset role;
rollback;
