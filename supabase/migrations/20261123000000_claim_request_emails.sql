-- Admin-only view of pending claim requests WITH the requester's email, so an admin can verify
-- who is asking before approving. Idempotent. NOT applied automatically.
--
-- Why a function: auth.users is not readable by the API roles, and exposing emails through
-- profiles or a view would leak them to everyone. A SECURITY DEFINER function can read
-- auth.users, and refuses anyone who is not an admin (public.is_admin(), checked for the CALLER).
--
-- Apply after 20261120000000_player_claims.sql.

begin;

do $$
begin
  if to_regclass('public.player_claim_requests') is null or to_regprocedure('public.is_admin()') is null then
    raise exception 'Apply 20261118000000_profiles_foundation.sql and 20261120000000_player_claims.sql first';
  end if;
end $$;

create or replace function public.admin_pending_claims()
returns table (
  request_id   uuid,
  player_id    uuid,
  player_name  text,
  user_id      uuid,
  email        text,
  display_name text,
  message      text,
  created_at   timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Admins only' using errcode = '42501';
  end if;

  -- Every column is table-qualified: the OUT parameter names above would otherwise be ambiguous.
  return query
  select r.id, r.player_id, p.name, r.user_id, u.email::text, pr.display_name, r.message, r.created_at
  from public.player_claim_requests r
  join public.players p on p.id = r.player_id
  join auth.users u on u.id = r.user_id
  left join public.profiles pr on pr.id = r.user_id
  where r.status = 'pending'
  order by r.created_at asc;
end;
$$;

-- Not callable by visitors; signed-in callers are then checked against is_admin() inside.
revoke all on function public.admin_pending_claims() from public, anon;
grant execute on function public.admin_pending_claims() to authenticated;

commit;
