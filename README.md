# PlayCount

PlayCount is a shared Vite frontend deployed separately for each club. Each deployment reads its club branding and application data from that club's Supabase project.

Product behaviour is described in the [functional requirements](documentation/PlayCount_Functional_Requirements_Final.md). This README covers deployment and configuration.

## Cloudflare Workers

The hostname's first label selects the club instance. For example, `lamanchette.playcount.workers.dev` resolves to `lamanchette` and loads `public/instances/lamanchette.json`.

Configure the Worker build to run `npm run build` and publish the `dist` directory as static assets.

Each JSON file under `public/instances/` maps an instance slug to its Supabase project URL and publishable API key. The key is sent to the browser and is public by design; row-level security controls its data access. Add one JSON file per club instance.

For local development, set `VITE_DEFAULT_INSTANCE` in `.env` or use `?instance=lamanchette` on localhost.

The frontend reads the club name and banner message from that instance's `clubs` table.

Club branding also lives in each Supabase project, not in this repository: colors in `clubs.theme`, and the logo as a file in a public `branding` storage bucket referenced by `clubs.logo_path`. Create that bucket in the Supabase dashboard only when a logo is needed, then upload the logo under **Storage → branding**.

## Database Migrations

Each club has a separate Supabase project and migration directory under `instances/<club>/supabase/`. Connect the Supabase GitHub integration for each project to this repository and set its working directory to `instances/<club>`.

La Manchette now has one bootstrap migration. It creates only the club and a non-player administrator; no weekly patterns, sessions, attendance, guests, or storage buckets are seeded. The club's logo path starts empty.

### Rebuild La Manchette

**Destructive:** This discards the existing club data and replaces the migration history. Pause the Supabase GitHub production integration before pushing the squashed baseline, and keep it paused until after the linked reset is verified.

Do not copy only the script into an older Codespaces checkout. It refuses to run unless the checkout also has the single final baseline and updated `config.toml`. Pause the GitHub integration first; then transfer the complete worktree or commit and push the baseline while deployments are paused, and pull it in Codespaces before running the script.

Run [the reset script](scripts/reset-lamanchette.sh) on a machine with unrestricted PostgreSQL access, or in Codespaces. It needs Bash, Node.js/npm (for `npx`), and a running Docker daemon. Start Docker Desktop or enable Docker in Codespaces before running it. A firewall allowing only HTTPS/443 cannot reach the linked database pooler on 5432. On Windows, run the Bash script in WSL with Docker Desktop integration; Codespaces runs it directly.

1. Back up the Supabase project and pause its GitHub integration's production deployments in the dashboard. Verify the La Manchette project reference before proceeding.
2. From the repository root, test the baseline without touching the linked project:

   ```bash
   bash scripts/reset-lamanchette.sh --local-only
   ```

3. On the unrestricted machine, run the guarded linked reset:

   ```bash
   bash scripts/reset-lamanchette.sh <project-ref>
   ```

   The script uses a pinned Supabase CLI through `npx`, repeats the local test, prompts for login/link in your terminal, and saves private public-schema and data backups under `~/playcount-backups/<project-ref>/`. Confirm that the backups are accessible and move them off any disposable Codespace **before** typing the final reset confirmation. The script requires both `PAUSED` and `RESET <project-ref>` confirmations. Never put tokens, database passwords, or backup files in the repository.

4. Verify in the dashboard SQL Editor that there is one club, one administrator (`is_player = false`), and no schedule patterns, sessions, attendance, or exceptional players. `--no-seed` skips `seed.sql`, not the two inserts in the migration. Confirm the script's migration-list output reports only `20261009120000`, then create a pattern through Administration.
5. If the baseline was transferred without Git, commit and push it while automatic deployments remain paused. Re-enable the GitHub integration only after the reset and verification. The reset targets user-created database objects; Supabase-managed Auth users and Storage objects may need separate cleanup in the dashboard. Existing personal links are replaced; create the public `branding` bucket and upload the logo again before setting `logo_path`.

## Onboard a Club

For each new club, use a lowercase slug containing letters, numbers, and hyphens (for example, `northside`). The slug must match the hostname's first label and the configuration and Supabase directory names.

1. Create a Supabase project for the club.
2. Copy `instances/lamanchette/supabase/` to `instances/<club>/supabase/` as a starting point. Update `project_id` in `config.toml`. Before the first deployment, replace the La Manchette club and administrator seed rows, and review the migration and Edge Function for the new club. No weekly pattern is seeded. Keep each club's migrations in its own directory.
3. Add `public/instances/<club>.json` with the new project's `supabaseUrl` and `publishableKey`. These values are public; database access must be protected by row-level security.
4. Connect the Supabase project's GitHub integration to this repository. Set the working directory to `instances/<club>`, the production branch to `main`, and enable production deployments. Push the club's migrations and functions to deploy them.
5. Configure the project's personal-link signing key by following [Personal-Link Sessions](#personal-link-sessions). Use a separate key and `PLAYCOUNT_JWT_PRIVATE_KEY` secret for every Supabase project.
6. Enable Google sign-in for the project by following [Google Sign-In](#google-sign-in).
7. Create a Cloudflare Worker for the club. Build with `npm run build`, serve the `dist` static assets, and assign a hostname whose first label is the club slug (for example, `northside.playcount.workers.dev`).
8. Verify the deployed hostname shows the club's database-driven banner. If personal links are enabled, verify a valid link signs in and an invalid link shows Google sign-in.

## Personal-Link Sessions

Visiting `/p/<personal_link>` calls the club's `session` Edge Function, which exchanges the link for a one-hour token that the database accepts as that member. A token is issued once per page load; it is not renewed automatically. Reload the page to get a fresh token and reload attendance data. The function is deployed by the GitHub integration from `instances/<club>/supabase/functions/session/` and needs a signing key per Supabase project:

Personal links are UUIDs generated by the database when a member is inserted; member-creation code should omit `personal_link` and use the returned value.

1. Run `npx supabase gen signing-key --algorithm ES256`. Keep the output private and out of the repository.
2. In the Supabase dashboard, open **Project Settings → JWT Keys**, create a standby key by importing that private key, then click **Rotate keys** so the database accepts tokens it signs.
3. Under **Edge Functions → Secrets**, add `PLAYCOUNT_JWT_PRIVATE_KEY` containing the same private key JSON.

## Google Sign-In

Visiting `/` or an unrecognized personal link shows a Google sign-in button. After sign-in, the member whose `google_email` matches the Google account is redirected to their personal page. For each Supabase project:

1. In Google Cloud Console, create an OAuth client ID (Web application) and add `https://<project-ref>.supabase.co/auth/v1/callback` as an authorized redirect URI.
2. In the Supabase dashboard, open **Authentication → Sign In / Providers → Google**, enable it, and enter the client ID and secret.
3. Under **Authentication → URL Configuration**, set the Site URL to the club hostname and add `https://<club-hostname>/**` (and `http://localhost:5173/**` for local preview) to the redirect URLs.

## Local preview

Set `VITE_DEFAULT_INSTANCE` in `.env` to the slug whose JSON file you want to load, or use `?instance=lamanchette` on localhost. Run `npm install`, then `npm run dev`. Create the production bundle with `npm run build`.