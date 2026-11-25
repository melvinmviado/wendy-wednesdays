-- Court assignments: what changed on the RSVP list since the board was made. Idempotent and
-- additive (one new function, nothing dropped or altered). NOT applied automatically; run it
-- yourself in the Supabase SQL Editor (staging first), then run
-- supabase/tests/court_assignment_rsvp_changes.sql.
--
-- APPLY ORDER: after 20261208000000_court_assignment_editing.sql.
--
-- Why
--   Players cannot change their RSVP after the cutoff, but admins can (admin_remove_rsvp,
--   admin_add_rsvp, admin_add_guest_rsvp bypass it). A board made earlier is then out of date: a
--   removed player still has a court, and whoever moved up from the waitlist has none. The board
--   is never changed behind the admin's back (it may already be published and posted); instead
--   the editor lists the differences so the admin can fix them by hand, or regenerate.
--
-- court_assignment_rsvp_changes(date) -> (kind, player_id, name)
--   kind 'not_confirmed'  on the board, but no longer on the confirmed list
--   kind 'not_on_board'   confirmed (the same list generation uses: court_assignment_locked_list),
--                         but not on the board. player_id is null for a guest not yet turned into
--                         a player (they join the roster when the board is regenerated).
--   Admins only (42501 otherwise). Empty when the run has no board.
--
-- ROLLBACK (run manually):
--   drop function if exists public.court_assignment_rsvp_changes(date);

begin;

do $$
begin
  if to_regprocedure('public.court_assignment_swap(date, uuid, uuid)') is null then
    raise exception 'Apply 20261208000000_court_assignment_editing.sql first';
  end if;
end $$;

create or replace function public.court_assignment_rsvp_changes(p_session_date date)
returns table (kind text, player_id uuid, name text)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  if not (select public.is_admin()) then
    raise exception 'Only admins can check the board against the RSVP list' using errcode = '42501';
  end if;
  if not exists (select 1 from public.event_assignment_meta m
                  where m.session_date = p_session_date and m.state <> 'none') then
    return;
  end if;
  return query
  select 'not_confirmed'::text, a.player_id, p.name
    from public.court_assignments a
    join public.players p on p.id = a.player_id
   where a.session_date = p_session_date
     and not exists (select 1 from public.court_assignment_locked_list(p_session_date) l
                      where l.player_id = a.player_id)
  union all
  select 'not_on_board'::text, l.player_id, coalesce(p.name, l.guest_name)
    from public.court_assignment_locked_list(p_session_date) l
    left join public.players p on p.id = l.player_id
   where l.player_id is null
      or not exists (select 1 from public.court_assignments a
                      where a.session_date = p_session_date and a.player_id = l.player_id)
   order by 1, 3;
end;
$$;

revoke all on function public.court_assignment_rsvp_changes(date) from public, anon, authenticated;
grant execute on function public.court_assignment_rsvp_changes(date) to authenticated;

commit;
