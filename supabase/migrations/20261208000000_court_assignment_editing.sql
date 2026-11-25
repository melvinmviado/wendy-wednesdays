-- Court assignment editing: the writes behind the admin board editor (/admin/courts) and its
-- activity feed. Idempotent. NOT applied automatically; run it yourself in the Supabase SQL Editor
-- (staging first), then run supabase/tests/court_assignment_editing.sql.
--
-- APPLY ORDER: after 20261207000000_court_assignment_generation.sql.
--
-- Every edit is one call, one transaction:
--   court_assignment_swap(date, a, b)          two players trade places: seat <-> seat, or seat <-> sitting out
--   court_assignment_move(date, player, court_position, slot, remove)
--                                              to an empty seat; to sitting out (position and slot null);
--                                              onto the board if not on it yet (any active player);
--                                              off the board with remove = true (undoing an add)
--   court_assignment_set_published(date, bool) publish / unpublish
--   court_assignment_activity(date, limit)     the audit log, newest first, with each admin's name
-- Each edit locks the run's event_assignment_meta row first, so edits to one run (and generation,
-- which takes the same lock) happen one at a time: last write wins, nothing interleaves. Each one
-- sets manually_edited = true (publishing does not) and appends to assignment_audit_log, stamped
-- with the caller by the column default. Admins only (is_admin()), checked inside.
--
-- Board rules
--   * A player is on a run's board at most once: unique (session_date, player_id) from
--     20261206000000. That is also what keeps duplicates off a published board.
--   * A taken seat is refused (CA022), not overwritten: to trade places, swap.
--   * A court with fewer than four is allowed; the editor warns about it.
--   * Swaps and moves keep each player's seed_rank (their seeding). A player added by hand is
--     seeded after everyone else.
--
-- Error codes: CA020 no board yet; CA021 that player is not on the board (someone else changed it);
-- CA022 that seat is taken; CA023 not an active player; plus CA002 from 20261206000000 (no such court).
--
-- ROLLBACK (run manually):
--   drop function if exists public.court_assignment_activity(date, integer),
--     public.court_assignment_set_published(date, boolean),
--     public.court_assignment_move(date, uuid, integer, integer, boolean),
--     public.court_assignment_swap(date, uuid, uuid),
--     public.court_assignment_edit_begin(date), public.court_assignment_place(date, uuid);

begin;

-- 0. Preconditions ---------------------------------------------------------------------
do $$
begin
  if to_regprocedure('public.court_assignment_apply(date, text, boolean, jsonb, jsonb, jsonb)') is null then
    raise exception 'Apply 20261207000000_court_assignment_generation.sql first';
  end if;
end $$;

-- 1. Helpers (not API endpoints) ----------------------------------------------------------
-- A player's place on a run's board, for the audit log: null when not on it. The name is copied
-- so the log still reads well after a rename or delete.
create or replace function public.court_assignment_place(p_session date, p_player uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object('player_id', a.player_id, 'name', p.name, 'status', a.status,
                            'court_position', a.court_position, 'court_number', a.court_number, 'slot', a.slot)
    from public.court_assignments a
    join public.players p on p.id = a.player_id
   where a.session_date = p_session and a.player_id = p_player
$$;

-- Admin check, then lock the run's meta row (edits and generation on one run go one at a time).
create or replace function public.court_assignment_edit_begin(p_session date)
returns public.event_assignment_meta
language plpgsql
set search_path = ''
as $$
declare
  m public.event_assignment_meta%rowtype;
begin
  if not (select public.is_admin()) then
    raise exception 'Only admins can edit court assignments' using errcode = '42501';
  end if;
  select * into m from public.event_assignment_meta where session_date = p_session for update;
  if not found or m.state = 'none' then
    raise exception 'There is no board for % yet', p_session using errcode = 'CA020';
  end if;
  return m;
end;
$$;

-- 2. Swap ------------------------------------------------------------------------------
create or replace function public.court_assignment_swap(p_session_date date, p_player_a uuid, p_player_b uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  d  date := p_session_date;
  a  public.court_assignments%rowtype;
  b  public.court_assignments%rowtype;
  was jsonb;
begin
  perform public.court_assignment_edit_begin(d);
  if p_player_a is null or p_player_b is null or p_player_a = p_player_b then
    raise exception 'Pick two different players' using errcode = '22023';
  end if;
  select * into a from public.court_assignments where session_date = d and player_id = p_player_a;
  if not found then
    raise exception 'That player is no longer on the board' using errcode = 'CA021';
  end if;
  select * into b from public.court_assignments where session_date = d and player_id = p_player_b;
  if not found then
    raise exception 'That player is no longer on the board' using errcode = 'CA021';
  end if;
  if a.status = 'sitting_out' and b.status = 'sitting_out' then
    raise exception 'Both players are sitting out' using errcode = '22023';
  end if;

  was := jsonb_build_array(public.court_assignment_place(d, a.player_id), public.court_assignment_place(d, b.player_id));

  -- One statement: the seat constraint is deferrable, so the two may trade seats directly.
  update public.court_assignments x
     set court_position = case when x.player_id = a.player_id then b.court_position else a.court_position end,
         slot           = case when x.player_id = a.player_id then b.slot           else a.slot end,
         status         = case when x.player_id = a.player_id then b.status         else a.status end
   where x.session_date = d and x.player_id in (a.player_id, b.player_id);

  update public.event_assignment_meta set manually_edited = true where session_date = d;
  insert into public.assignment_audit_log (session_date, action, before, after)
  values (d, 'swap', was,
          jsonb_build_array(public.court_assignment_place(d, a.player_id), public.court_assignment_place(d, b.player_id)));
end;
$$;

-- 3. Move ------------------------------------------------------------------------------
create or replace function public.court_assignment_move(
  p_session_date   date,
  p_player_id      uuid,
  p_court_position integer default null,
  p_slot           integer default null,
  p_remove         boolean default false
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  d        date := p_session_date;
  removing boolean := coalesce(p_remove, false);
  cur      public.court_assignments%rowtype;
  on_board boolean;
  was      jsonb;
begin
  perform public.court_assignment_edit_begin(d);
  if p_player_id is null or (p_court_position is null) <> (p_slot is null)
     or (removing and p_court_position is not null) then
    raise exception 'Give a court and a seat, neither (sitting out), or remove' using errcode = '22023';
  end if;

  select * into cur from public.court_assignments where session_date = d and player_id = p_player_id;
  on_board := found;
  if not on_board then
    if removing then
      return; -- already off the board
    end if;
    if not exists (select 1 from public.players p where p.id = p_player_id and p.archived_at is null) then
      raise exception 'That player is not on the roster' using errcode = 'CA023';
    end if;
  elsif not removing and cur.court_position is not distinct from p_court_position and cur.slot is not distinct from p_slot then
    return; -- already there
  end if;

  if p_court_position is not null and exists (
       select 1 from public.court_assignments x
        where x.session_date = d and x.court_position = p_court_position and x.slot = p_slot) then
    raise exception 'That seat is taken' using errcode = 'CA022';
  end if;

  was := public.court_assignment_place(d, p_player_id);
  if removing then
    delete from public.court_assignments where session_date = d and player_id = p_player_id;
  elsif on_board then
    update public.court_assignments
       set court_position = p_court_position, slot = p_slot,
           status = case when p_court_position is null then 'sitting_out' else 'assigned' end
     where session_date = d and player_id = p_player_id;
  else
    insert into public.court_assignments (session_date, player_id, court_position, slot, status, seed_rank)
    select d, p_player_id, p_court_position, p_slot,
           case when p_court_position is null then 'sitting_out' else 'assigned' end,
           coalesce(max(x.seed_rank), 0) + 1
      from public.court_assignments x
     where x.session_date = d;
  end if;

  update public.event_assignment_meta set manually_edited = true where session_date = d;
  insert into public.assignment_audit_log (session_date, action, before, after)
  values (d, 'move', was, public.court_assignment_place(d, p_player_id));
end;
$$;

-- 4. Publish / unpublish ---------------------------------------------------------------
-- Returns the state afterwards. Publishing what is already published (or the reverse) changes
-- nothing and logs nothing.
create or replace function public.court_assignment_set_published(p_session_date date, p_published boolean)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  m      public.event_assignment_meta%rowtype;
  target text := case when coalesce(p_published, false) then 'published' else 'draft' end;
begin
  m := public.court_assignment_edit_begin(p_session_date);
  if m.state = target then
    return target;
  end if;
  update public.event_assignment_meta set state = target where session_date = p_session_date;
  insert into public.assignment_audit_log (session_date, action, before, after)
  values (p_session_date, case when target = 'published' then 'publish' else 'unpublish' end,
          jsonb_build_object('state', m.state), jsonb_build_object('state', target));
  return target;
end;
$$;

-- 5. Activity feed -----------------------------------------------------------------------
-- The run's audit log for the editor's Activity drawer. actor_name: the admin's display name;
-- null for the automatic run (actor_id null and action generate/regenerate/publish by 'auto').
create or replace function public.court_assignment_activity(p_session_date date, p_limit integer default 100)
returns table (id uuid, action text, actor_id uuid, actor_name text, before jsonb, after jsonb, created_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  if not (select public.is_admin()) then
    raise exception 'Only admins can read the activity log' using errcode = '42501';
  end if;
  return query
  select l.id, l.action, l.actor_id,
         case when l.actor_id is null then null else coalesce(nullif(btrim(pr.display_name), ''), 'An admin') end,
         l.before, l.after, l.created_at
    from public.assignment_audit_log l
    left join public.profiles pr on pr.id = l.actor_id
   where l.session_date = p_session_date
   order by l.created_at desc, l.id desc
   limit least(greatest(coalesce(p_limit, 100), 1), 500);
end;
$$;

-- 6. Grants ------------------------------------------------------------------------------
revoke all on function public.court_assignment_place(date, uuid),
  public.court_assignment_edit_begin(date),
  public.court_assignment_swap(date, uuid, uuid),
  public.court_assignment_move(date, uuid, integer, integer, boolean),
  public.court_assignment_set_published(date, boolean),
  public.court_assignment_activity(date, integer)
  from public, anon, authenticated;
grant execute on function public.court_assignment_swap(date, uuid, uuid),
  public.court_assignment_move(date, uuid, integer, integer, boolean),
  public.court_assignment_set_published(date, boolean),
  public.court_assignment_activity(date, integer)
  to authenticated;

commit;
