-- Tests for event_court_settings.court_numbers (the facility's courts as a list). Run in the
-- Supabase SQL Editor AFTER applying 20261210000000_court_numbers_list.sql (and everything before).
-- One transaction, ROLLED BACK at the end. A failed check raises; "PASS ..." shows in Messages.

begin;

create temp table t_ids as
select gen_random_uuid() as admin_uid,
       gen_random_uuid() as p1, gen_random_uuid() as p2, gen_random_uuid() as p3,
       gen_random_uuid() as p4, gen_random_uuid() as p5, gen_random_uuid() as p6,
       date '2020-02-26' as d_range,  -- saved the old way: top and bottom only
       date '2020-03-04' as d,        -- saved as a list, with a board
       date '2020-03-11' as d_next,   -- nothing saved: generation copies d's list
       'cn-' || substr(gen_random_uuid()::text, 1, 8) as suffix;
grant select on t_ids to authenticated, service_role;

insert into auth.users (id, aud, role, email)
select admin_uid, 'authenticated', 'authenticated', 'cn-admin-' || suffix || '@test.local' from t_ids;
update public.profiles set role = 'admin' where id = (select admin_uid from t_ids);

insert into public.players (id, name)
select x.id, x.n || ' ' || t.suffix
  from t_ids t,
       lateral (values (t.p1, 'Cn One'), (t.p2, 'Cn Two'), (t.p3, 'Cn Three'),
                       (t.p4, 'Cn Four'), (t.p5, 'Cn Five'), (t.p6, 'Cn Six')) x(id, n);

-- ------------------------------------------------------------ an admin saves the courts
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', (select admin_uid from t_ids), 'role', 'authenticated')::text, true);
do $$
declare t t_ids%rowtype; s public.event_court_settings%rowtype; bad integer[];
begin
  select * into t from t_ids;

  insert into public.event_court_settings (session_date, court_numbers) values (t.d, '{10,9,8,7,3,2}');
  select * into s from public.event_court_settings where session_date = t.d;
  if (s.top_court_number, s.bottom_court_number, s.courts_in_use) is distinct from (10, 2, 6) then
    raise exception 'FAIL 10, 9, 8, 7, 3, 2 gave top %, bottom %, % courts',
      s.top_court_number, s.bottom_court_number, s.courts_in_use;
  end if;
  raise notice 'PASS a list with a gap: top 10, bottom 2, 6 courts in use';

  foreach bad slice 1 in array array[[10, 10], [0, 1], [1, null], [-3, 4]] loop
    begin
      insert into public.event_court_settings (session_date, court_numbers) values (t.d_next, bad);
      raise exception 'FAIL % accepted', bad;
    exception when check_violation then null;
    end;
  end loop;
  begin
    insert into public.event_court_settings (session_date, court_numbers) values (t.d_next, '{}');
    raise exception 'FAIL an empty list accepted';
  exception when check_violation then null;
  end;
  begin
    insert into public.event_court_settings (session_date, court_numbers)
    values (t.d_next, array(select generate_series(1, 51)));
    raise exception 'FAIL 51 courts accepted';
  exception when check_violation then null;
  end;
  raise notice 'PASS repeats, 0, negatives, blanks, an empty list and 51 courts are refused';

  -- Older code writes only top and bottom: it still gets the whole range.
  insert into public.event_court_settings (session_date, top_court_number, bottom_court_number) values (t.d_range, 10, 7);
  select * into s from public.event_court_settings where session_date = t.d_range;
  if s.court_numbers is distinct from '{10,9,8,7}'::integer[] or s.courts_in_use <> 4 then
    raise exception 'FAIL 10 -> 7 gave %', s.court_numbers;
  end if;
  update public.event_court_settings set top_court_number = 4, bottom_court_number = 6 where session_date = t.d_range;
  select * into s from public.event_court_settings where session_date = t.d_range;
  if s.court_numbers is distinct from '{4,5,6}'::integer[] then
    raise exception 'FAIL 4 -> 6 gave %', s.court_numbers;
  end if;
  raise notice 'PASS top and bottom alone still mean the range between them';
end $$;

-- ------------------------------------------------------------ the board follows the list
do $$
declare t t_ids%rowtype; got text;
begin
  select * into t from t_ids;
  insert into public.event_assignment_meta (session_date, state, generated_at) values (t.d, 'draft', now());
  insert into public.court_assignments (session_date, player_id, court_position, slot, status, seed_rank)
  select t.d, x.id, x.pos, 0, 'assigned', x.pos + 1
    from (values (t.p1, 0), (t.p2, 1), (t.p3, 2), (t.p4, 3), (t.p5, 4), (t.p6, 5)) x(id, pos);
  select string_agg(court_number::text, ',' order by court_position) into got
    from public.court_assignments where session_date = t.d;
  if got is distinct from '10,9,8,7,3,2' then raise exception 'FAIL board courts %', got; end if;
  raise notice 'PASS positions 0-5 are courts 10, 9, 8, 7, 3, 2';

  begin
    update public.court_assignments set court_position = 6 where session_date = t.d and player_id = t.p6;
    raise exception 'FAIL a seventh court accepted';
  exception when sqlstate 'CA002' then
    raise notice 'PASS no position past the last court (CA002)';
  end;

  update public.event_court_settings set court_numbers = '{12,11,10,9,8,1}' where session_date = t.d;
  select string_agg(court_number::text, ',' order by court_position) into got
    from public.court_assignments where session_date = t.d;
  if got is distinct from '12,11,10,9,8,1' then raise exception 'FAIL after renumbering: %', got; end if;
  select top_court_number || '->' || bottom_court_number into got
    from public.event_court_settings where session_date = t.d;
  if got is distinct from '12->1' then raise exception 'FAIL top and bottom did not follow the list: %', got; end if;
  raise notice 'PASS changing the list renumbers the board, and top/bottom follow';

  begin
    update public.event_court_settings set court_numbers = '{10,9,8,7}' where session_date = t.d;
    raise exception 'FAIL fewer courts than the board uses accepted';
  exception when sqlstate 'CA002' then
    raise notice 'PASS a shorter list is refused while players sit on the courts it drops (CA002)';
  end;
end $$;

-- ------------------------------------------------------------ generation copies the list
reset role;
set local role service_role;
do $$
declare t t_ids%rowtype; r jsonb; copied integer[];
begin
  select * into t from t_ids;
  r := public.court_assignment_prepare(t.d_next);
  select court_numbers into copied from public.event_court_settings where session_date = t.d_next;
  if copied is distinct from '{12,11,10,9,8,1}'::integer[] then
    raise exception 'FAIL the next run got %', copied;
  end if;
  if r -> 'court_numbers' is distinct from '[12,11,10,9,8,1]'::jsonb then
    raise exception 'FAIL prepare returned %', r -> 'court_numbers';
  end if;
  raise notice 'PASS the next run copies the list, and prepare hands it to the Edge Function';
end $$;

reset role;
rollback;
