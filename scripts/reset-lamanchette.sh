#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root/instances/lamanchette"

if [[ $# -ne 1 ]]; then
  printf 'Usage: bash scripts/reset-lamanchette.sh --local-only | <project-ref>\n' >&2
  exit 2
fi

shopt -s nullglob
migrations=(supabase/migrations/*.sql)
shopt -u nullglob
baseline='supabase/migrations/20261009120000_initial_schema.sql'
if [[ ${#migrations[@]} -ne 1 || ${migrations[0]:-} != "$baseline" ]] \
  || ! grep -Fq 'CREATE OR REPLACE FUNCTION "public"."admin_delete_pattern"' "$baseline" \
  || ! grep -Fq "SELECT id, 'Maximilian Barais', 'mikebarais@gmail.com', false, true" "$baseline" \
  || ! grep -Fqx '[db.seed]' supabase/config.toml \
  || ! grep -Eq '^enabled[[:space:]]*=[[:space:]]*false$' supabase/config.toml; then
  printf 'Unsafe checkout: expected one final baseline with the club/admin seed and seed.sql disabled.\n' >&2
  printf 'Do not reset from an older commit or copy only this script. Obtain the complete squashed migration and config first.\n' >&2
  exit 1
fi

for tool in docker node npx; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    printf 'Missing %s. Install Node.js/npm and Docker Desktop (or a running Docker daemon).\n' "$tool" >&2
    exit 1
  fi
done

if ! docker info >/dev/null 2>&1; then
  printf 'Docker is not running. Start Docker Desktop or the Codespaces Docker daemon.\n' >&2
  exit 1
fi

supabase() {
  npx --yes supabase@2.120.0 "$@"
}

printf 'Starting local Supabase and testing the single baseline migration...\n'
supabase start
supabase db reset --local --no-seed
supabase db lint --local --fail-on error

container="supabase_db_playcount-lamanchette"
counts="$(docker exec "$container" psql -U postgres -d postgres -At -c "
  SELECT (SELECT count(*) FROM public.clubs),
         (SELECT count(*) FROM public.members),
         (SELECT bool_and(is_admin AND NOT is_player) FROM public.members),
         (SELECT count(*) FROM public.schedule_patterns),
         (SELECT count(*) FROM public.sessions),
         (SELECT count(*) FROM public.attendances),
         (SELECT count(*) FROM public.exceptional_players),
         (SELECT count(*) FROM storage.buckets),
         (SELECT count(*) FROM supabase_migrations.schema_migrations);
")"
if [[ "$counts" != '1|1|t|0|0|0|0|0|1' ]]; then
  printf 'Unexpected local seed counts: %s\n' "$counts" >&2
  exit 1
fi
printf 'Local reset verified: one club, one admin-only member, one migration, no other app data.\n'

if [[ "$1" == '--local-only' ]]; then
  printf 'Local-only check complete. No linked project was changed.\n'
  exit 0
fi

project_ref="$1"
if [[ ! "$project_ref" =~ ^[a-z0-9]{20}$ ]]; then
  printf 'Provide the 20-character project ref from the intended Supabase project.\n' >&2
  exit 2
fi

printf '\nDANGER: linked reset permanently removes user-created database objects and data.\n'
printf 'Pause the Supabase GitHub production integration in the dashboard first.\n'
read -r -p 'Type PAUSED after you have paused deployments: ' paused
if [[ "$paused" != 'PAUSED' ]]; then
  printf 'Aborted without touching the linked project.\n' >&2
  exit 1
fi

umask 077
backup_dir="${BACKUP_DIR:-$HOME/playcount-backups/$project_ref/$(date -u +%Y%m%dT%H%M%SZ)}"
mkdir -p "$backup_dir"

printf 'Log in to Supabase. Enter any access token or password directly in this terminal.\n'
supabase login --no-browser
supabase link --project-ref "$project_ref"

printf 'Backing up the linked public schema and data to %s\n' "$backup_dir"
supabase db dump --linked --schema public --file "$backup_dir/public-schema.sql"
supabase db dump --linked --schema public --data-only --file "$backup_dir/public-data.sql"

printf '\nCheck the backups and project ref before resetting the linked database.\n'
read -r -p "Type RESET $project_ref to permanently reset this project: " confirmation
if [[ "$confirmation" != "RESET $project_ref" ]]; then
  printf 'Aborted. Backups remain in %s\n' "$backup_dir" >&2
  exit 1
fi

supabase db reset --linked --no-seed
supabase migration list --linked

printf '\nLinked reset requested for %s. Verify one club, one admin-only member, one migration,\n' "$project_ref"
printf 'and no patterns/sessions in the dashboard before resuming GitHub deployments.\n'
printf 'Backup: %s (contains private member data; store it securely outside this workspace).\n' "$backup_dir"