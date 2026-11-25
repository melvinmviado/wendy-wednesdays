-- Tests for the court assignment lock time in America/Toronto, across both DST changes. Run in
-- the Supabase SQL Editor AFTER applying 20261207000000_court_assignment_generation.sql.
-- One transaction, ROLLED BACK at the end. A failed check raises; "PASS ..." shows in Messages.
--
-- The lock time is public.rsvp_cutoff_at(date): the admin's cutoff for the run the Event setup
-- describes, else 6:00 PM Toronto time on the Wednesday. These runs are in 2027 so the Event setup
-- (one row, for the current run) does not apply to them; if it ever does, the first check says so.
-- 2027: DST starts Sun Mar 14 and ends Sun Nov 7. Clocks never change on a Wednesday (or the
-- Tuesday before), so 6:00 PM, and "24 hours before an 8:00 PM start", always exist exactly once.

begin;

create temp table t_runs (d date, cutoff_utc timestamptz, label text);
insert into t_runs values
  (date '2027-03-10', timestamptz '2027-03-10 23:00+00', 'Mar 10 (EST, the week before spring forward)'),
  (date '2027-03-17', timestamptz '2027-03-17 22:00+00', 'Mar 17 (EDT, the week after)'),
  (date '2027-11-03', timestamptz '2027-11-03 22:00+00', 'Nov 3 (EDT, the week before fall back)'),
  (date '2027-11-10', timestamptz '2027-11-10 23:00+00', 'Nov 10 (EST, the week after)');

do $$
declare r record;
begin
  if exists (select 1 from public.event_settings s, t_runs t
              where (s.event_start_at at time zone s.timezone)::date = t.d) then
    raise exception 'SKIP: the Event setup is for one of the test dates; pick other dates';
  end if;
  for r in select * from t_runs loop
    if public.rsvp_cutoff_at(r.d) <> r.cutoff_utc then
      raise exception 'FAIL cutoff for %: % (expected %)', r.label, public.rsvp_cutoff_at(r.d), r.cutoff_utc;
    end if;
    if to_char(public.rsvp_cutoff_at(r.d) at time zone 'America/Toronto', 'Dy HH24:MI') <> 'Wed 18:00' then
      raise exception 'FAIL cutoff for % is not Wed 6:00 PM in Toronto', r.label;
    end if;
  end loop;
  raise notice 'PASS the cutoff is 6:00 PM Toronto time on both sides of both DST changes';
end $$;

-- The cron job's query: due from the cutoff exactly, not a second before, and not once the night
-- is over (10:00 PM Toronto). Needs a confirmed RSVP and a court range.
create temp table t_ids as select gen_random_uuid() as p1, 'lt-' || substr(gen_random_uuid()::text, 1, 8) as suffix;
insert into public.players (id, name) select p1, 'Lock Test ' || suffix from t_ids;
insert into public.event_court_settings (session_date, top_court_number, bottom_court_number)
select date '2027-03-03', 10, 9;
insert into public.rsvps (session_date, player_id, status)
select t.d, i.p1, 'in' from t_runs t, t_ids i;

do $$
declare r record;
begin
  for r in select * from t_runs loop
    if r.d in (select public.court_assignment_due_sessions(r.cutoff_utc - interval '1 second')) then
      raise exception 'FAIL % was due a second before its cutoff', r.label;
    end if;
    if r.d not in (select public.court_assignment_due_sessions(r.cutoff_utc)) then
      raise exception 'FAIL % was not due at its cutoff', r.label;
    end if;
    if r.d in (select public.court_assignment_due_sessions(public.rsvp_live_end(r.d))) then
      raise exception 'FAIL % was still due after the night ended', r.label;
    end if;
    if to_char(public.rsvp_live_end(r.d) at time zone 'America/Toronto', 'HH24:MI') <> '22:00' then
      raise exception 'FAIL the night of % does not end at 10:00 PM Toronto time', r.label;
    end if;
  end loop;
  raise notice 'PASS the cron job picks a run up from its cutoff until the night ends, across DST';
end $$;

rollback;
