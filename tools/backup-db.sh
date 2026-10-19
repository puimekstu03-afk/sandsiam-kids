#!/bin/sh
# Backs up the pagoda field database (the free Supabase plan keeps no backups you can restore).
# Writes backups/sandsiam-YYYY-MM-DD.sql: schemas public + private, with all rows.
# Needs pg_dump (brew install libpq) and supabase/.db-password. Run from the project folder:
#   sh tools/backup-db.sh
# Restore into an empty project: psql "<connection string>" -f backups/sandsiam-….sql
set -eu
cd "$(dirname "$0")/.."
mkdir -p backups
out="backups/sandsiam-$(date +%Y-%m-%d).sql"
PGPASSWORD="$(cat supabase/.db-password)" pg_dump "$(cat supabase/.temp/pooler-url)" \
  --no-owner --no-privileges -n public -n private -f "$out"
echo "wrote $out ($(du -h "$out" | cut -f1))"
