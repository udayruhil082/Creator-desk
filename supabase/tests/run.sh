#!/usr/bin/env bash
# Runs every test file on a fresh scratch database with the real migration applied.
# Needs a local Postgres (default socket /var/tmp, port 55432) and Deno.
set -euo pipefail
cd "$(dirname "$0")/.."
P="psql -h ${PGHOST:-/var/tmp} -p ${PGPORT:-55432} -U postgres -v ON_ERROR_STOP=1 -q"
export TEST_DB_URL="postgres://postgres@localhost:${PGPORT:-55432}/cdtest"
for t in tests/*.test.ts; do
  $P -c "drop database if exists cdtest" -c "create database cdtest"
  $P -d cdtest -f tests/bootstrap.sql
  for f in migrations/*.sql; do $P -d cdtest -f "$f"; done
  ${DENO:-deno} test -A --no-check "$t" "$@"
done
