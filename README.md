# PlayCount

PlayCount is a shared Vite frontend deployed separately for each club. Each deployment reads its club branding and application data from that club's Supabase project.

Product behaviour is described in the [functional requirements](documentation/PlayCount_Functional_Requirements_Final.md). This README covers deployment and configuration.

## Cloudflare Workers

The hostname's first label selects the club instance. For example, `lamanchette.playcount.workers.dev` resolves to `lamanchette` and loads `public/instances/lamanchette.json`.

Configure the Worker build to run `npm run build` and publish the `dist` directory as static assets.

Each JSON file under `public/instances/` maps an instance slug to its Supabase project URL and publishable API key. The key is sent to the browser and is public by design; row-level security controls its data access. Add one JSON file per club instance.

For local development, set `VITE_DEFAULT_INSTANCE` in `.env` or use `?instance=lamanchette` on localhost.

The frontend reads the club name and banner message from that instance's `clubs` table.

## Database Migrations

Each club has a separate Supabase project and migration directory under `instances/<club>/supabase/`. Connect the Supabase GitHub integration for each project to this repository and set its working directory to `instances/<club>`.

## Onboard a Club

For each new club, use a lowercase slug containing letters, numbers, and hyphens (for example, `northside`). The slug must match the hostname's first label and the configuration and Supabase directory names.

1. Create a Supabase project for the club.
2. Copy `instances/lamanchette/supabase/` to `instances/<club>/supabase/` as a starting point. Update `project_id` in `config.toml`. Before the first deployment, replace or remove the La Manchette club, member, and schedule seed data, and review the migrations and Edge Functions for the new club. Keep each club's migrations in its own directory.
3. Add `public/instances/<club>.json` with the new project's `supabaseUrl` and `publishableKey`. These values are public; database access must be protected by row-level security.
4. Connect the Supabase project's GitHub integration to this repository. Set the working directory to `instances/<club>`, the production branch to `main`, and enable production deployments. Push the club's migrations and functions to deploy them.
5. Configure the project's personal-link signing key by following [Personal-Link Sessions](#personal-link-sessions). Use a separate key and `PLAYCOUNT_JWT_PRIVATE_KEY` secret for every Supabase project.
6. Enable Google sign-in for the project by following [Google Sign-In](#google-sign-in).
7. Create a Cloudflare Worker for the club. Build with `npm run build`, serve the `dist` static assets, and assign a hostname whose first label is the club slug (for example, `northside.playcount.workers.dev`).
8. Verify the deployed hostname shows the club's database-driven banner. If personal links are enabled, verify a valid link signs in and an invalid link shows Google sign-in.

## Personal-Link Sessions

Visiting `/p/<personal_link>` calls the club's `session` Edge Function, which exchanges the link for a one-hour token that the database accepts as that member. The function is deployed by the GitHub integration from `instances/<club>/supabase/functions/session/` and needs a signing key per Supabase project:

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