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

## Local preview

Copy `.env.example` to `.env` and set `VITE_DEFAULT_INSTANCE` to the slug whose JSON file you want to load. Run `npm install`, then `npm run dev`. Create the production bundle with `npm run build`.