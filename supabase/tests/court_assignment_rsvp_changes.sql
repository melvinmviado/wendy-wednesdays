-- Tests for court_assignment_rsvp_changes. Run in the Supabase SQL Editor AFTER applying
-- 20261209000000_court_assignment_rsvp_changes.sql (and everything before it).
-- One transaction, ROLLED BACK at the end. A failed check raises; "PASS ..." shows in Messages.
--
-- The board (court 10 only): p1 p2 p3 p4 on it, p5 sitting out.
-- The RSVP list since then: p4 was removed by an admin, p6 was added, a guest was added.

begin;

create temp table t_ids as
select gen_random_uuid() as admin_uid, gen_random_uuid() as user_uid,
       gen_random_uuid() as p1, gen_random_uuid() as p2, gen_random_uuid() as p3,
       gen_random_uuid() as p4, gen_random_uuid() as p5, gen_random_uuid() as p6,
       date '2020-01-15' as d,       -- a run with a board
       date '2020-01-22' as d_none,  -- a run with RSVPs and no board
       'rc-' || substr(gen_random_uuid()::text, 1, 8) as suffix;
grant select on t_ids to anon, authenticated;

insert into auth.users (id, aud, role, email)
select x.id, 'authenticated', 'authenticated', x.n || '-' || t.suffix || '@test.local'
  from t_ids t, lateral (values (t.admin_uid, 'rc-admin'), (t.user_uid, 'rc-user')) x(id, n);
update public.profiles set role = 'admin' where id = (select admin_uid from t_ids);

insert into public.players (id, name)
select x.id, x.n || ' ' || t.suffix
  from t_ids t,
       lateral (values (t.p1, 'Rc One'), (t.p2, 'Rc Two'), (t.p3, 'Rc Three'),
                       (t.p4, 'Rc Four'), (t.p5, 'Rc Five'), (t.p6, 'Rc Six')) x(id, n);

insert into public.event_court_settings (session_date, top_court_number, bottom_court_number)
select x.d, 10, 10 from t_ids t, lateral (values (t.d), (t.d_none)) x(d);
insert into public.event_assignment_meta (session_date, state, generated_at, generated_by, published_at)
select d, 'published', now(), 'auto', now() from t_ids;
insert into public.court_assignments (session_date, player_id, court_position, slot, status, seed_rank)
select t.d, x.id, x.pos, x.slot, x.st, x.seed
  from t_ids t,
       lateral (values (t.p1, 0, 0, 'assigned', 1), (t.p2, 0, 1, 'assigned', 2), (t.p3, 0, 2, 'assigned', 3),
                       (t.p4, 0, 3, 'assigned', 4), (t.p5, null, null, 'sitting_out', 5)) x(id, pos, slot, st, seed);

-- The RSVP list now: p4 is out (removed after the board was made), p6 and a guest are in.
insert into public.rsvps (session_date, player_id, guest_name, status, created_at)
select t.d, x.id, x.g, x.st, timestamptz '2020-01-10 12:00+00' + x.i * interval '1 minute'
  from t_ids t,
       lateral (values (t.p1, null::text, 'in', 1), (t.p2, null, 'in', 2), (t.p3, null, 'in', 3),
                       (t.p4, null, 'out', 4), (t.p5, null, 'in', 5), (t.p6, null, 'in', 6),
                       (null::uuid, 'Rc Guest ' || t.suffix, 'in', 7)) x(id, g, st, i);
insert into public.rsvps (session_date, player_id, status) select d_none, p1, 'in' from t_ids;

-- ------------------------------------------------------------ who may call
set local role anon;
select set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
do $$
begin
  perform public.court_assignment_rsvp_changes((select d from t_ids));
  raise exception 'FAIL anon read the RSVP changes';
exception when insufficient_privilege then
  raise notice 'PASS anon cannot call it';
end $$;

reset role;
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', (select user_uid from t_ids), 'role', 'authenticated')::text, true);
do $$
begin
  perform public.court_assignment_rsvp_changes((select d from t_ids));
  raise exception 'FAIL a non-admin read the RSVP changes';
exception when insufficient_privilege then
  raise notice 'PASS a signed-in non-admin cannot call it';
end $$;

-- ------------------------------------------------------------ what it reports
select set_config('request.jwt.claims',
  json_build_object('sub', (select admin_uid from t_ids), 'role', 'authenticated')::text, true);
do $$
declare t t_ids%rowtype; got text;
begin
  select * into t from t_ids;
  select string_agg(c.kind || ':' || coalesce(c.player_id::text, 'guest') || ':' || c.name, ' | ' order by c.kind, c.name)
    into got from public.court_assignment_rsvp_changes(t.d) c;
  if got is distinct from
     'not_confirmed:' || t.p4 || ':Rc Four ' || t.suffix
     || ' | not_on_board:guest:Rc Guest ' || t.suffix
     || ' | not_on_board:' || t.p6 || ':Rc Six ' || t.suffix then
    raise exception 'FAIL changes: %', got;
  end if;
  raise notice 'PASS lists the removed player, the added player and the added guest';

  if exists (select 1 from public.court_assignment_rsvp_changes(t.d_none)) then
    raise exception 'FAIL reported changes for a run with no board';
  end if;
  raise notice 'PASS nothing for a run with no board';

  -- Fixed by hand: p4 off the board, p6 onto it. Only the guest is left (until a regenerate).
  perform public.court_assignment_move(t.d, t.p4, null, null, true);
  perform public.court_assignment_move(t.d, t.p6, 0, 3);
  select string_agg(c.kind, ',') into got from public.court_assignment_rsvp_changes(t.d) c;
  if got is distinct from 'not_on_board' then
    raise exception 'FAIL after fixing by hand: %', got;
  end if;
  raise notice 'PASS fixing the board by hand clears the player differences';
end $$;

reset role;
rollback;
