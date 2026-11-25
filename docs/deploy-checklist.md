# Deploy checklist: user accounts, profiles, avatars

Database first, client second. The new client decides who is an admin from `profiles` /
the JWT claim, so shipping it before the migrations would hide admin controls from everyone.
The OLD client keeps working against the migrated database (admins still write; everyone
else is simply refused by RLS), so applying SQL first is always safe.

## 0. Before you touch anything

- [ ] **Back up.** Supabase Dashboard > Database > Backups (or `pg_dump`). The migrations are
      idempotent but a backup is cheap.
- [ ] **Review who will become an admin.** The backfill promotes EVERY existing non-anonymous
      account, because today every account has full write access. Run section 1 of
      `supabase/checks/verify_admin_access.sql` (it is read-only) and note anyone you do not
      recognise. You can demote them afterwards in one statement (step 2).
- [ ] **Duplicate player names.** `20261119000000_player_admin.sql` refuses to run if two
      active players share a name (case/whitespace-insensitive). It lists them; rename or
      archive one and re-run.

## 1. Apply the migrations, in this order

Run `supabase/checks/migration_status.sql` first: it lists every migration as applied or MISSING.
Then paste each missing file into the Supabase SQL Editor and run it, in filename order. All are
idempotent (re-running is safe and never re-promotes anyone). Each one checks its prerequisites
and stops with a clear message if you run them out of order.

| # | File | What it does |
|---|------|--------------|
| 0 | `20261117000000_baseline.sql` | the original tables, view and totals trigger (replaces the old `schema.sql`). **New databases only**; a database built from `schema.sql` already has it |
| 1 | `20261118000000_profiles_foundation.sql` | `profiles`, signup trigger, role to JWT mirror, `is_admin()`, admin policies on `weekly_scores` / `weeks` / `week-photos`, **backfill (existing accounts become admins)** |
| 2 | `20261119000000_player_admin.sql` | archive/rename/delete columns, `players` admin policies, name uniqueness |
| 3 | `20261120000000_player_claims.sql` | `players.user_id`, claim requests, approve/reject/unlink RPCs, guards |
| 4 | `20261121000000_avatars_bucket.sql` | public `avatars` bucket (2 MB, jpeg/png/webp) and per-user path policies |
| 5 | `20261122000000_player_avatars.sql` | `players.avatar_url`, avatar in `season_leaderboard` |
| 6 | `20261123000000_claim_request_emails.sql` | admin-only `admin_pending_claims()` so admins see each requester's email |
| 7 | `20261124000000_rsvps.sql` | weekly RSVPs: `rsvps` table (sealed), `set_rsvp()`, roster and state RPCs |
| 8 | `20261125000000_admin_rsvps.sql` | admins add/remove players on the RSVP list |
| 9 | `20261126000000_admin_guest_rsvps.sql` | admins add/remove guests |
| 10 | `20261127000000_event_settings.sql` | admin-editable cutoff, start/end and capacity |
| 11 | `20261128000000_rsvp_open_at.sql` | optional RSVP open time |
| 12 | `20261129000000_player_roles.sql` | cosmetic player roles |
| 13 | `20261130000000_leaderboard_role.sql` | role in `season_leaderboard` |
| 14 | `20261201000000_admin_rename_guest_rsvp.sql` | admins rename guests |
| 15 | `20261202000000_leaderboard_claimed.sql` | `is_claimed` in `season_leaderboard` |
| 16 | `20261203000000_security_hardening.sql` | closes `public_profiles`, pins avatar URLs to the user's own file, limits `week-photos` |
| 17 | `20261204000000_rsvp_abuse_limits.sql` | protects admin-added RSVPs, per-network RSVP cap, several claimants per player, 7-day wait after a rejected claim. **Then follow its VERIFY AFTER APPLYING note** |
| 18 | `20261205000000_db_cleanup.sql` | totals trigger fixes (moved scores, no direct writes), `is_admin()` once per query, foreign-key indexes |
| 19 | `20261206000000_court_assignments.sql` | starting courts: per-run court range, assignments, draft/published state, audit log, `court_assignment_board` view, Realtime on the two public tables |
| 20 | `20261207000000_court_assignment_generation.sql` | starting courts, generation: "Auto-publish on generate", the prepare/apply functions the `generate-court-assignments` Edge Function calls, and the query the cron job uses. **Then deploy the function and the cron job: `docs/court-assignments-runbook.md`** |
| 21 | `20261208000000_court_assignment_editing.sql` | starting courts, editing: swap / move / publish / unpublish RPCs for the board editor (`/admin/courts`), each logged, and its activity feed |
| 22 | `20261209000000_court_assignment_rsvp_changes.sql` | starting courts: the editor warns when an admin changed the RSVP list after the board was made (removed player still seated, new player not seated). Additive: one function |

## 2. Verify the database

- [ ] Run `supabase/checks/verify_admin_access.sql`. Healthy: section 1 shows each real admin with
      `profile_role = admin` AND `jwt_claim = admin`; sections 2, 5 and 6 return **zero rows**;
      section 4 shows `is_security_definer = true`.
- [ ] Demote strays: `update public.profiles set role = 'user' where id = '<uuid>';`
- [ ] Run the test scripts in `supabase/tests/` (each rolls back; nothing is kept). Every one
      prints `PASS ...` lines and raises an exception on failure. Paste them into the SQL Editor
      one at a time, or run them all against a staging database with `supabase/run-tests.sh`.
- [ ] Keep at least one admin you can sign in as before you demote anyone.

## 3. Supabase Auth settings (Dashboard > Authentication)

- [ ] **URL Configuration > Site URL:** your production origin, e.g. `https://wendy-wednesdays.pages.dev`
      (or your custom domain). The app builds all email-link and OAuth redirects from
      `window.location.origin`, so this must match.
- [ ] **URL Configuration > Redirect URLs:** add the production origin, `http://localhost:5173`
      for local dev, and your Cloudflare preview pattern, e.g. `https://*.wendy-wednesdays.pages.dev`.
      A redirect not on this list is silently replaced by the Site URL.
- [ ] **Sign In / Providers > Email:** enabled. Allow new users to sign up: ON (open sign-up).
      **Confirm email: turn it ON once custom SMTP is set up.** While it is OFF, Supabase itself
      tells a sign-up form whether an address already has an account, and sign-up addresses are
      unverified. With it ON, the app answers every sign-up with "check your email".
- [ ] **Password length: 8.** The app enforces `MIN_PASSWORD_LENGTH` (`src/utils/authValidation.ts`);
      set the same minimum in Supabase, and turn on **leaked password protection**.
- [ ] **Redirect URLs:** never a bare `https://*.pages.dev/**` wildcard: that lets any pages.dev
      site receive sign-in tokens. Scope it to your project (`https://*.wendy-wednesdays.pages.dev/**`).
- [ ] **Email delivery:** Supabase's built-in mailer is limited to a handful of emails per hour,
      which magic links will hit quickly. Configure **custom SMTP** (Project Settings > Auth >
      SMTP) before announcing sign-up.
- [ ] **Rate Limits:** review Authentication > Rate Limits. Defaults are reasonable for a club app;
      the ones that matter are emails sent per hour (needs custom SMTP to raise), and sign-ups /
      sign-ins per 5 minutes per IP. Open sign-up invites bots: consider enabling CAPTCHA
      (Turnstile fits Cloudflare), which needs a small client change that is not built yet.
- [ ] **Google provider:** leave it OFF for now (see step 6). The app shows
      "Google sign-in isn't available yet".

## 4. Cloudflare Pages (Settings > Environment variables)

Vite bakes these in **at build time**, so changing one needs a new deployment. Set them for
**Production and Preview**.

| Variable | Value |
|----------|-------|
| `VITE_SUPABASE_URL` | `https://<project-ref>.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | the anon (public) key. **Never** the `service_role` key |
| `VITE_GOOGLE_AUTH_ENABLED` | optional. `false` hides the Google button; leave unset to show it |

- [ ] Build command `npm run build`, output directory `dist` (unchanged). **The build fails if
      `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` are missing** (it would otherwise ship demo
      mode). Set them for Preview too, or set `ALLOW_DEMO_BUILD=1` to build the demo on purpose.
- [ ] `public/_redirects` (SPA fallback) and `public/_headers` are already in the repo. Email links
      and OAuth return to `/`, so no extra routes are needed. The build fills your Supabase origin
      into the Content-Security-Policy in `dist/_headers`; check it in the browser's dev tools
      after deploying (no CSP errors in the console).

## 5. Ship the client, then smoke test

- [ ] Deploy. Open the site signed out: leaderboard loads, avatars (if any) lazy-load, initials otherwise.
- [ ] Sign in as an existing admin (an old session should keep working): the account menu shows
      **Enter weekly results**, the Weekly Entry tab is visible, you can save a week, add/rename/archive a player.
- [ ] Create a brand-new account (use a different browser): it signs in at once, the menu has **no**
      Enter weekly results, and no admin controls appear.
- [ ] Magic link: request one, open it on the same device, confirm you land signed in with a clean URL
      (no `#access_token` or `?code=`).
- [ ] Profile: change the display name, upload a photo, confirm it shows in the header menu; remove it.
- [ ] Click **Continue with Google**: you should get the friendly "isn't available yet" message, not
      a Supabase error page.
- [ ] Sign out returns you to the leaderboard.

## 6. Enabling Google sign-in later

1. **Google Cloud Console** > pick or create a project > **APIs & Services > OAuth consent screen**:
   User type External, fill app name and support email, add your domain under Authorized domains,
   scopes `openid`, `email`, `profile` (the defaults). Move the app from *Testing* to *In production*
   when ready, otherwise only listed test users can sign in.
2. **Credentials > Create credentials > OAuth client ID > Web application.**
   - Authorized JavaScript origins: your production origin (and `http://localhost:5173` for dev).
   - Authorized redirect URIs: **`https://<project-ref>.supabase.co/auth/v1/callback`**
     (this is Supabase's callback, not your site's; the exact value is shown in the Supabase Google provider panel).
3. Copy the **Client ID** and **Client secret**.
4. **Supabase > Authentication > Sign In / Providers > Google:** toggle ON, paste both, save.
5. Confirm your site URLs are in **URL Configuration** (step 3).
6. Make sure `VITE_GOOGLE_AUTH_ENABLED` is not `false`, then test a real sign-in. A new Google user gets a
   `profiles` row automatically, with their Google name as display name.

## Known limits to be aware of

- **Demoted admins keep access up to ~1 hour** (until their access token refreshes), because the stale JWT
  claim still says admin. To cut a person off immediately, also delete or ban their auth user.
- **Email confirmation OFF** means sign-up emails are not verified. Someone could register an address they
  do not own; if that person later signs in with a magic link or Google on the same address, the accounts may
  be linked. Admin rights are never derived from an email address, so this is not an escalation path, but
  turning confirmation ON is the safer setting once SMTP is configured.
- **Claim requests:** users request from a player's stats dialog; admins approve/reject/unlink under
  account menu > Player name claims. Users cannot withdraw a request (no delete permission). The email an admin sees is
  the one the requester signed up with and is unverified while email confirmation is OFF.
- **Profile photo changes** appear on the leaderboard after the next load (no live updates).
