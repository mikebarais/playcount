# PlayCount

PlayCount is a shared Vite frontend deployed separately for each club. Each deployment reads its club branding and application data from that club's Supabase project.

## Cloudflare Workers

The hostname's first label selects the club instance. For example, `lamanchette.playcount.workers.dev` resolves to `lamanchette` and loads `public/instances/lamanchette.json`.

Configure the Worker build to run `npm run build` and publish the `dist` directory as static assets.

Each JSON file under `public/instances/` maps an instance slug to its Supabase project URL and publishable API key. The key is sent to the browser and is public by design; row-level security controls its data access. Add one JSON file per club instance.

For local development, set `VITE_DEFAULT_INSTANCE` in `.env` or use `?instance=lamanchette` on localhost.

The frontend reads the club name and banner message from that instance's `clubs` table.

## Database Migrations

Each club has a separate Supabase project and migration directory under `instances/<club>/supabase/`. Connect the Supabase GitHub integration for each project to this repository and set its working directory to `instances/<club>`.

## Personal-Link Sessions

Visiting `/p/<personal_link>` calls the club's `session` Edge Function, which exchanges the link for a one-hour token that the database accepts as that member. The function is deployed by the GitHub integration from `instances/<club>/supabase/functions/session/` and needs a signing key per Supabase project:

1. Run `npx supabase gen signing-key --algorithm ES256`. Keep the output private and out of the repository.
2. In the Supabase dashboard, open **Project Settings → JWT Keys**, create a standby key by importing that private key, then click **Rotate keys** so the database accepts tokens it signs.
3. Under **Edge Functions → Secrets**, add `PLAYCOUNT_JWT_PRIVATE_KEY` containing the same private key JSON.

## Local preview

Copy `.env.example` to `.env` and set `VITE_DEFAULT_INSTANCE` to the slug whose JSON file you want to load. Run `npm install`, then `npm run dev`. Create the production bundle with `npm run build`.