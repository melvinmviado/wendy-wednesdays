-- pg_cron job: generates the court assignments of every run whose RSVPs have closed. NOT a migration:
-- run it in the Supabase SQL Editor AFTER the generate-court-assignments function is deployed
-- (docs/court-assignments-runbook.md). Re-running replaces the job.
--
-- Needs
--   * The pg_cron and pg_net extensions (Dashboard > Database > Extensions).
--   * Two Vault secrets, created once (Dashboard > Project Settings > Vault, or in SQL):
--       select vault.create_secret('https://<project-ref>.supabase.co', 'court_assignments_project_url');
--       select vault.create_secret('<the function''s CRON_SECRET>', 'court_assignments_cron_secret');
--
-- What it does: every 5 minutes it asks public.court_assignment_due_sessions() which runs are due
-- (cutoff passed, night not over, no board yet, a court range to use) and calls the function once
-- for each. The lock time is rsvp_cutoff_at(), the same cutoff the RSVP bar and set_rsvp use.
-- A run that fails (say, a guest named like a roster player: CA010) is simply tried again on the
-- next tick until an admin fixes it or the night ends. pg_net is asynchronous: replies land in
-- net._http_response, and the function's log (Dashboard > Edge Functions) has each outcome.

do $$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron')
     or not exists (select 1 from pg_extension where extname = 'pg_net') then
    raise exception 'Enable the pg_cron and pg_net extensions first (Dashboard > Database > Extensions)';
  end if;
  if (select count(*) from vault.decrypted_secrets
       where name in ('court_assignments_project_url', 'court_assignments_cron_secret')) < 2 then
    raise exception 'Create the two Vault secrets first (see the top of this file)';
  end if;
  if to_regprocedure('public.court_assignment_due_sessions(timestamptz)') is null then
    raise exception 'Apply 20261207000000_court_assignment_generation.sql first';
  end if;
end $$;

select cron.unschedule(jobid) from cron.job where jobname = 'generate-court-assignments';

select cron.schedule(
  'generate-court-assignments',
  '*/5 * * * *',
  $job$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'court_assignments_project_url')
             || '/functions/v1/generate-court-assignments',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets
                           where name = 'court_assignments_cron_secret')),
      body := jsonb_build_object('eventId', due.session_date::text),
      timeout_milliseconds := 10000)
    from public.court_assignment_due_sessions() as due(session_date)
  $job$
);

-- Check it:
--   select jobid, schedule, active from cron.job where jobname = 'generate-court-assignments';
--   select status, return_message, start_time from cron.job_run_details
--    where jobid = (select jobid from cron.job where jobname = 'generate-court-assignments')
--    order by start_time desc limit 10;
--   select id, status_code, content, created from net._http_response order by created desc limit 10;
-- Pause it:  update cron.job set active = false where jobname = 'generate-court-assignments';
-- Remove it: select cron.unschedule('generate-court-assignments');
