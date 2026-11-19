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

Paste each file into the Supabase SQL Editor and run it. All are idempotent (re-running is safe
and never re-promotes anyone). Each one checks its prerequisites and stops with a clear message
if you run them out of order.

| # | File | What it does |
|---|------|--------------|
| 1 | `20261118000000_profiles_foundation.sql` | `profiles`, signup trigger, role to JWT mirror, `is_admin()`, admin policies on `weekly_scores` / `weeks` / `week-photos`, **backfill (existing accounts become admins)** |
| 2 | `20261119000000_player_admin.sql` | archive/rename/delete columns, `players` admin policies, name uniqueness |
| 3 | `20261120000000_player_claims.sql` | `players.user_id`, claim requests, approve/reject/unlink RPCs, guards |
| 4 | `20261121000000_avatars_bucket.sql` | public `avatars` bucket (2 MB, jpeg/png/webp) and per-user path policies |
| 5 | `20261122000000_player_avatars.sql` | `players.avatar_url`, avatar in `season_leaderboard` |
| 6 | `20261123000000_claim_request_emails.sql` | admin-only `admin_pending_claims()` so admins see each requester's email |

## 2. Verify the database

- [ ] Run `supabase/checks/verify_admin_access.sql`. Healthy: section 1 shows each real admin with
      `profile_role = admin` AND `jwt_claim = admin`; sections 2, 5 and 6 return **zero rows**;
      section 4 shows `is_security_definer = true`.
- [ ] Demote strays: `update public.profiles set role = 'user' where id = '<uuid>';`
- [ ] Optionally run the test scripts in `supabase/tests/` (each rolls back; nothing is kept):
      `player_admin_rls`, `profiles_escalation`, `player_claims`, `avatars_bucket`,
      `player_avatars`, `claim_request_emails`, `security_model`. Every one prints `PASS ...` lines and raises an
      exception on failure.
- [ ] Keep at least one admin you can sign in as before you demote anyone.

## 3. Supabase Auth settings (Dashboard > Authentication)

- [ ] **URL Configuration > Site URL:** your production origin, e.g. `https://wendy-wednesdays.pages.dev`
      (or your custom domain). The app builds all email-link and OAuth redirects from
      `window.location.origin`, so this must match.
- [ ] **URL Configuration > Redirect URLs:** add the production origin, `http://localhost:5173`
      for local dev, and your Cloudflare preview pattern, e.g. `https://*.wendy-wednesdays.pages.dev`.
      A redirect not on this list is silently replaced by the Site URL.
- [ ] **Sign In / Providers > Email:** enabled. **Confirm email: OFF** (the app handles both, but
      this is what you chose). Allow new users to sign up: ON (open sign-up).
- [ ] **Password length:** Supabase's default minimum is 6, which is what the app enforces. Raise
      it in Supabase and in `MIN_PASSWORD_LENGTH` (`src/utils/authValidation.ts`) together if you want more.
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

- [ ] Build command `npm run build`, output directory `dist` (unchanged).
- [ ] `public/_redirects` (SPA fallback) and `public/_headers` are already in the repo. Email links
      and OAuth return to `/`, so no extra routes are needed.

## 5. Ship the client, then smoke test

- [ ] Deploy. Open the site signed out: leaderboard loads, avatars (if any) lazy-load, initials otherwise.
- [ ] Sign in as an existing admin (an old session should keep working): the account menu shows
      **Admin tools**, the Weekly Entry tab is visible, you can save a week, add/rename/archive a player.
- [ ] Create a brand-new account (use a different browser): it signs in at once, the menu has **no**
      Admin tools, and no admin controls appear.
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
  account menu > Player claims. Users cannot withdraw a request (no delete permission). The email an admin sees is
  the one the requester signed up with and is unverified while email confirmation is OFF.
- **Profile photo changes** appear on the leaderboard after the next load (no live updates).
