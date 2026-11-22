#!/usr/bin/env bash
# Runs every SQL test in supabase/tests against a database and reports PASS / FAIL per file.
#
#   DATABASE_URL=postgres://postgres:...@host:5432/postgres bash supabase/run-tests.sh
#   DATABASE_URL=... bash supabase/run-tests.sh --migrate   # apply every migration first (fresh DB)
#
# Needs psql, and a Supabase database (the tests use the auth and storage schemas): a staging
# project or `supabase start` locally. Connect as postgres: the tests impersonate API roles with
# SET LOCAL ROLE. Each test runs in one transaction that is rolled back, so nothing is kept, but
# prefer staging over production anyway.
set -uo pipefail

: "${DATABASE_URL:?Set DATABASE_URL to a staging or local Supabase database}"
dir="$(cd "$(dirname "$0")" && pwd)"
export PGOPTIONS='--client-min-messages=notice'

if [[ "${1:-}" == "--migrate" ]]; then
  for f in "$dir"/migrations/*.sql; do
    echo "== migrate $(basename "$f")"
    psql "$DATABASE_URL" -X -q -v ON_ERROR_STOP=1 -f "$f" >/dev/null || { echo "Migration failed: $f"; exit 1; }
  done
fi

failed=()
for f in "$dir"/tests/*.sql; do
  name="$(basename "$f" .sql)"
  out="$(psql "$DATABASE_URL" -X -q -v ON_ERROR_STOP=1 -f "$f" 2>&1)"
  status=$?
  passes="$(grep -c 'PASS' <<<"$out")"
  if [[ $status -eq 0 ]]; then
    echo "ok   $name ($passes checks)"
  else
    echo "FAIL $name"
    grep -E 'ERROR|FAIL' <<<"$out" | sed 's/^/     /'
    failed+=("$name")
  fi
done

if [[ ${#failed[@]} -gt 0 ]]; then
  echo "${#failed[@]} test file(s) failed: ${failed[*]}"
  exit 1
fi
echo "All SQL tests passed."
