# PlayCount

PlayCount is a shared Vite frontend deployed separately for each club. Each deployment reads its club branding and application data from that club's Supabase project.

## Cloudflare Pages

Create one Cloudflare Pages project per club and connect each project to this GitHub repository. Use these build settings:

- Production branch: `main`
- Root directory: `/`
- Framework preset: `Vite`
- Build command: `npm run build`
- Build output directory: `dist`

Set these variables separately for each Pages project, using values from that club's Supabase project:

- `VITE_SUPABASE_URL`: the Supabase project URL
- `VITE_SUPABASE_ANON_KEY`: the project's anon/publishable API key

The frontend reads the club name and banner message from the `clubs` table. Row-level security controls which data the public client can read.

## Database Migrations

Each club has a separate Supabase project and migration directory under `instances/<club>/supabase/`. Connect the Supabase GitHub integration for each project to this repository and set its working directory to `instances/<club>`.

## Local preview

Copy `.env.example` to `.env` and fill in the Supabase URL and anon/publishable key for the club you are developing against. Run `npm install`, then `npm run dev`. Create the production bundle with `npm run build`.