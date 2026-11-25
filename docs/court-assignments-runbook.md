# Starting courts: deploying generation

Generating a board has three parts:

- **Migration `20261207000000_court_assignment_generation.sql`.** The rules, and the one-transaction write.
- **Edge Function `generate-court-assignments`.** Runs the shared algorithm. It answers to an admin or to the cron job.
- **pg_cron job.** Every 5 minutes it calls the function for any run whose RSVPs have closed and that has no board yet.

Do it on staging first, then production. The steps are in order.

## 1. Database

1. Apply `supabase/migrations/20261206000000_court_assignments.sql` first, if it isn't applied yet, then `20261207000000_court_assignment_generation.sql`. Use the SQL Editor (see `docs/deploy-checklist.md`).
2. Run `supabase/tests/court_assignment_generation.sql`. It prints `PASS ...` lines and rolls back.
3. Apply `20261210000000_court_numbers_list.sql` too, and run `supabase/tests/court_numbers_list.sql`.
4. In the app, open **Admin > Event setup > Starting courts**. Enter the court numbers top court first, separated by commas: `10, 9, 8, 7, 3, 2` for the facility. A run of courts can be written `10-7`. Later runs reuse them until you change them.

## 2. Edge Function

You need the Supabase CLI (`npx supabase ...` runs it without adding it to the project). `--use-api` bundles on Supabase's side, so you don't need Docker or Deno.

```sh
npm run sync:functions -- --check        # the function's copy of the algorithm is current
npx supabase login
npx supabase link --project-ref <project-ref>

# A long random secret, shared by the function and the cron job. Keep it out of the repo.
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
npx supabase secrets set CRON_SECRET=<that secret>

npx supabase functions deploy generate-court-assignments --no-verify-jwt --use-api
```

**`--no-verify-jwt` is required.** The cron job sends a secret header, not a user token. The function does its own checks:

- the `x-cron-secret` header must match `CRON_SECRET`, or
- a signed-in user's token must pass the database's `is_admin()`.

Supabase provides `SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` to the function automatically.

**Smoke test (safe).** A run whose RSVPs are still open is refused before anything is written:

```sh
curl -i -X POST https://<project-ref>.supabase.co/functions/v1/generate-court-assignments \
  -H "Content-Type: application/json" -H "x-cron-secret: <secret>" -d '{"eventId":"2099-12-30"}'
# expect 409 {"ok":false,"code":"CA011",...}. A wrong secret gives 401.
```

## 3. Cron job

1. **Dashboard > Database > Extensions:** enable `pg_cron` and `pg_net`.
2. In the SQL Editor, store the two values the job needs in Vault, once:
   ```sql
   select vault.create_secret('https://<project-ref>.supabase.co', 'court_assignments_project_url');
   select vault.create_secret('<the same CRON_SECRET>', 'court_assignments_cron_secret');
   ```
3. Run `supabase/cron/court_assignments.sql`. It schedules `generate-court-assignments` every 5 minutes; running it again replaces the job.
4. On the next Wednesday, a few minutes after the cutoff:
   - **Admin > Event setup** shows the draft;
   - `select * from cron.job_run_details order by start_time desc limit 5;` shows the job running;
   - **Dashboard > Edge Functions > generate-court-assignments > Logs** shows one line per run.

## How it behaves

- **Courts.** The best four players start on the first court in the list, the next four on the second, and so on. Courts with no full foursome stay empty. Changing the list later renumbers a board already made, seat for seat; a shorter list is refused while players are seated on the courts it drops (`CA002`).
- **When.** The job picks up a run once `rsvp_cutoff_at(run)` has passed: the cutoff the RSVP bar already enforces. That is the admin's saved cutoff ("Cutoff 24h before start" fills in start − 24h), or Wednesday 6 PM if none is saved. It stops at the end of the night.
- **Draft by default.** A new board is a draft only admins see. With **Auto-publish on generate** on, it is published at once.
- **Generate now** (Admin > Event setup) works only after the cutoff.
  - If the run already has a board, it asks first. Regenerating starts the board over as a draft, unless auto-publish is on.
  - If someone edited the board by hand, it warns that those edits will be lost and forces the regeneration. Only an admin can force; the cron job never replaces an existing board.
- **Guests become players** when the board is generated, and keep their place in line. From then on they're on the public leaderboard with 0 points, as the Rules page says. A guest who then doesn't show up stays listed until you archive them.
- **RSVP changes after the cutoff** (an admin adding or removing someone): use **Generate now** to rebuild from the current list.
- **The audit log** gets `generate`, `regenerate` (`after.forced` says whether it was forced) and `publish` (auto-publish) rows, with the board before and after.

## Editing the board (Admin > Court assignments)

The editor needs `20261208000000_court_assignment_editing.sql`, and `20261209000000_court_assignment_rsvp_changes.sql` for the RSVP-change warning (without it, the editor works but doesn't warn). It needs nothing deployed beyond the database.

- **Swap:** tap a player, then another. This works between courts, and between a court and the tray.
- **Move:** tap a player, then an empty seat.
- **Remove from court:** sends the selected player to the tray.
- **Take off the board:** removes the selected player entirely, for someone who is no longer coming. Players can't change their RSVP after the cutoff, but admins can.
- **RSVP changes:** if an admin removes or adds an RSVP after the board was made, the editor lists who is still seated without being confirmed, and who is confirmed but not seated. The board is never changed for you, even when published: fix it by hand, or Regenerate. A guest added after the cutoff becomes a player only when you regenerate.
- **Fill an empty seat:** tap it with nobody selected, then choose someone sitting out, someone on the RSVP list, or any active player.
- **Drag and drop:** works on a computer with a mouse.
- **Saving and Undo:** each change saves at once, with Undo in its notice. It marks the board as edited by hand, so the cron job and a plain Generate never replace it without the force warning.
- **Warnings:** a court with 1 to 3 players gets a warning but can still be published. The database never lets a player appear twice.
- **Two admins at once:** the database applies changes one at a time, and the last one wins. Each admin's screen follows the other's changes through Realtime. A change that lands on a seat someone just took is refused, and the board reloads.
- **Activity:** lists the run's audit log, with names.

## The public Court Board

- **Address:** `/events/YYYY-MM-DD/courts`, using the run's Wednesday. The RSVP bar and the Who's Playing sheet link to it once the board is published.
- **Before publishing,** it says courts are posted once RSVP closes and the organizer publishes.
- **TV mode:** add `?tv=1` for a screen at the facility. It shows large type with no navigation, and scrolls by itself when the courts don't fit.
- **Print:** prints on one page, black on white.
- **Live updates:** changes arrive through Realtime. The page also rechecks every minute, because Realtime can't tell a signed-out visitor that a board was unpublished.
- **Data:** it reads only `court_assignment_board`, for published runs (names, photos, seats and seeds).

## When something goes wrong

| Seen | Meaning | Fix |
|------|---------|-----|
| `CA010` | A confirmed guest has the same name as a roster player, so generation stops rather than create a duplicate | Rename the guest on the RSVP list, or remove the guest and add the player. The job retries every 5 minutes. |
| `CA001` | No court numbers saved, for this run or any earlier one | Save them under Starting courts |
| `CA002` | The new court list is shorter than the board needs | Keep as many courts, or generate the board again first |
| `CA011` | RSVPs are still open | Wait for the cutoff |
| `CA012` | The board was edited by hand | Use Generate now and confirm |
| `CA013` | The list kept changing during generation | Try again |
| 401 from the job | The Vault secret and `CRON_SECRET` differ | Set them to the same value (below) |
| 404 / "isn't deployed" | The function isn't deployed on this project | Section 2 |
| `CA021` / `CA022` while editing | Another admin changed that player or seat a moment earlier | The board has reloaded; make the change again |

**Rotate the secret:**
1. `npx supabase secrets set CRON_SECRET=<new>`
2. `select vault.update_secret((select id from vault.secrets where name = 'court_assignments_cron_secret'), '<new>');`

**Pause the job:** `update cron.job set active = false where jobname = 'generate-court-assignments';`

**Remove the job:** `select cron.unschedule('generate-court-assignments');`

**Remove the function:** `npx supabase functions delete generate-court-assignments`.

**Database rollback:** steps at the top of each migration.

## Changing the algorithm

1. Edit `src/lib/courtAssignment.ts`. It must stay free of imports.
2. Run `npm run sync:functions`.
3. Run `npm test`. It fails if the function's copy is stale.
4. Redeploy the function.
