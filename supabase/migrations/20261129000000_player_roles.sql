-- Player roles: cosmetic labels (e.g. Developer, Organizer) shown as badges on a player.
-- Idempotent: safe to run more than once. NOT applied automatically; run it yourself in the
-- Supabase SQL Editor.
--
-- APPLY ORDER: after 20261118000000_profiles_foundation.sql (public.is_admin()) and
-- 20261119000000_player_admin.sql (public.players).
--
-- Decisions
--   * A role is a LABEL, not a permission. Nothing here reads or writes profiles.role or the JWT
--     claim, and is_admin() never looks at player_roles. Assigning "Organizer" grants no access.
--   * Roles attach to PLAYERS, not profiles: unclaimed players have no account.
--   * ONE role per player (primary key is player_id alone). To allow several later, change the
--     key to (player_id, role_key) and have the RPC take a text[].
--   * Allowed values: a lookup table `roles`, not a check constraint. Adding a role is an
--     INSERT (no migration, no redeploy), and the FK still rejects unknown values.
--   * Readable by everyone, like players itself; writable by admins only via is_admin().
--
-- ROLLBACK (run manually, in this order):
--   drop function if exists public.set_player_role(uuid, text);
--   drop table if exists public.player_roles;
--   drop table if exists public.roles;

begin;

-- 0. Preconditions ---------------------------------------------------------------------
do $$
begin
  if to_regprocedure('public.is_admin()') is null or to_regclass('public.players') is null then
    raise exception 'Apply 20261118000000_profiles_foundation.sql and 20261119000000_player_admin.sql first';
  end if;
end $$;

-- 1. roles lookup ----------------------------------------------------------------------
create table if not exists public.roles (
  key        text primary key check (key ~ '^[a-z][a-z0-9_]{0,31}$'),
  label      text not null check (char_length(btrim(label)) between 1 and 40),
  sort_order integer not null default 0
);

insert into public.roles (key, label, sort_order) values
  ('developer', 'Developer', 10),
  ('organizer', 'Organizer', 20)
on conflict (key) do nothing;

-- 2. player_roles ----------------------------------------------------------------------
create table if not exists public.player_roles (
  player_id   uuid primary key references public.players (id) on delete cascade,
  role_key    text not null references public.roles (key) on update cascade on delete restrict,
  assigned_by uuid null references auth.users (id) on delete set null,
  assigned_at timestamptz not null default timezone('utc'::text, now())
);

-- Lookups by role (e.g. "all organizers"); player_id is already indexed by the primary key.
create index if not exists player_roles_role_key_idx on public.player_roles (role_key);

-- 3. RLS + grants ----------------------------------------------------------------------
alter table public.roles enable row level security;
alter table public.player_roles enable row level security;

revoke all on public.roles, public.player_roles from anon, authenticated;
grant select on public.roles, public.player_roles to anon, authenticated;
grant insert, update, delete on public.player_roles to authenticated;  -- RLS limits to admins
grant insert, update, delete on public.roles to authenticated;         -- RLS limits to admins

drop policy if exists "Public read roles" on public.roles;
create policy "Public read roles" on public.roles for select using (true);

drop policy if exists "Admins insert roles" on public.roles;
drop policy if exists "Admins update roles" on public.roles;
drop policy if exists "Admins delete roles" on public.roles;
create policy "Admins insert roles"
  on public.roles for insert to authenticated with check (public.is_admin());
create policy "Admins update roles"
  on public.roles for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy "Admins delete roles"
  on public.roles for delete to authenticated using (public.is_admin());

drop policy if exists "Public read player roles" on public.player_roles;
create policy "Public read player roles" on public.player_roles for select using (true);

drop policy if exists "Admins insert player roles" on public.player_roles;
drop policy if exists "Admins update player roles" on public.player_roles;
drop policy if exists "Admins delete player roles" on public.player_roles;
create policy "Admins insert player roles"
  on public.player_roles for insert to authenticated with check (public.is_admin());
create policy "Admins update player roles"
  on public.player_roles for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy "Admins delete player roles"
  on public.player_roles for delete to authenticated using (public.is_admin());

-- 4. RPC: set or clear one player's role -----------------------------------------------
-- p_role = null clears it. A single upsert/delete statement is atomic. SECURITY DEFINER with
-- an explicit admin check, so the caller's RLS is not what protects this: is_admin() is.
create or replace function public.set_player_role(p_player_id uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Only admins can assign player roles' using errcode = '42501';
  end if;
  if not exists (select 1 from public.players where id = p_player_id) then
    raise exception 'Unknown player' using errcode = 'P0002';
  end if;

  if p_role is null then
    delete from public.player_roles where player_id = p_player_id;
    return;
  end if;

  if not exists (select 1 from public.roles where key = p_role) then
    raise exception 'Unknown role: %', p_role using errcode = '23503';
  end if;

  insert into public.player_roles (player_id, role_key, assigned_by)
  values (p_player_id, p_role, (select auth.uid()))
  on conflict (player_id) do update
    set role_key = excluded.role_key,
        assigned_by = excluded.assigned_by,
        assigned_at = timezone('utc'::text, now());
end;
$$;

revoke all on function public.set_player_role(uuid, text) from public, anon;
grant execute on function public.set_player_role(uuid, text) to authenticated;

commit;
