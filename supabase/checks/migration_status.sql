-- Which migrations has this database had? Read-only: run it in the Supabase SQL Editor any time.
-- Nothing records applied migrations (they are pasted into the SQL Editor by hand), so each one is
-- detected by an object it creates. Apply anything marked "missing" in filename order.

select migration,
       case when applied then 'applied' else 'MISSING' end as status
from (values
  ('20261117000000_baseline',               to_regclass('public.players') is not null and to_regclass('public.weeks') is not null),
  ('20261118000000_profiles_foundation',    to_regclass('public.profiles') is not null),
  ('20261119000000_player_admin',           exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'players' and column_name = 'archived_at')),
  ('20261120000000_player_claims',          to_regclass('public.player_claim_requests') is not null),
  ('20261121000000_avatars_bucket',         exists (select 1 from storage.buckets where id = 'avatars')),
  ('20261122000000_player_avatars',         exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'players' and column_name = 'avatar_url')),
  ('20261123000000_claim_request_emails',   exists (select 1 from pg_proc where proname = 'admin_pending_claims' and pronamespace = 'public'::regnamespace)),
  ('20261124000000_rsvps',                  to_regclass('public.rsvps') is not null),
  ('20261125000000_admin_rsvps',            exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'rsvps' and column_name = 'added_by')),
  ('20261126000000_admin_guest_rsvps',      exists (select 1 from pg_proc where proname = 'admin_add_guest_rsvp' and pronamespace = 'public'::regnamespace)),
  ('20261127000000_event_settings',         to_regclass('public.event_settings') is not null),
  ('20261128000000_rsvp_open_at',           exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'event_settings' and column_name = 'rsvp_open_at')),
  ('20261129000000_player_roles',           to_regclass('public.player_roles') is not null),
  ('20261130000000_leaderboard_role',       exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'season_leaderboard' and column_name = 'role_key')),
  ('20261201000000_admin_rename_guest_rsvp', exists (select 1 from pg_proc where proname = 'admin_rename_guest_rsvp' and pronamespace = 'public'::regnamespace)),
  ('20261202000000_leaderboard_claimed',    exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'season_leaderboard' and column_name = 'is_claimed')),
  ('20261203000000_security_hardening',     exists (select 1 from pg_constraint where conname = 'profiles_avatar_url_own_storage')),
  ('20261204000000_rsvp_abuse_limits',      exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'rsvps' and column_name = 'client_ip_hash')),
  ('20261205000000_db_cleanup',             exists (select 1 from pg_proc where proname = 'players_totals_guard' and pronamespace = 'public'::regnamespace)),
  ('20261206000000_court_assignments',      to_regclass('public.court_assignments') is not null),
  ('20261207000000_court_assignment_generation', to_regprocedure('public.court_assignment_apply(date, text, boolean, jsonb, jsonb, jsonb)') is not null),
  ('20261208000000_court_assignment_editing', to_regprocedure('public.court_assignment_swap(date, uuid, uuid)') is not null),
  ('20261209000000_court_assignment_rsvp_changes', to_regprocedure('public.court_assignment_rsvp_changes(date)') is not null)
) as m(migration, applied)
order by migration;
