#!/usr/bin/env bash
# Reference copy of the gated release profile. Projects copy this file; keep copies in step by hand.
# Run it by hand: bash scripts/ci/preflight-dokploy-env.test.sh
#
# Regression tests for the task-scoped-hostname guard.
#
# This gate is the whole mitigation for the 2026-07-25 outage (prod API down
# 15h03m because DATABASE_URL pointed at a Swarm task-scoped DNS name). It had no
# tests, and two shapes slipped through it: `PGHOST=<task-host>:5432` (the form
# the second affected service actually used) and global-mode task names, whose
# middle segment is a node id rather than a slot number.
#
# Runs entirely through --stdin; no Dokploy, no network.
set -Eeuo pipefail
cd "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/../.."

SCRIPT=scripts/ci/preflight-dokploy-env.sh
# Real task ids from the 2026-07-25 incident report.
TASK=z665xb3q3lrnsdmxnz7sxzqtj
NODE=mnb3d0ijh2ppq5ju5tfl0pxza
failures=0

expect() {
  local want="$1" name="$2" env_line="$3" got=0
  printf '%s\n' "$env_line" | bash "$SCRIPT" --stdin test >/dev/null 2>&1 || got=$?
  if [ "$got" -eq "$want" ]; then
    printf '  ok   %s\n' "$name"
  else
    printf '  FAIL %s (want exit %s, got %s)\n     %s\n' "$name" "$want" "$got" "$env_line"
    failures=$((failures + 1))
  fi
}
rejects() { expect 1 "$1" "$2"; }
accepts() { expect 0 "$1" "$2"; }

echo "task-scoped hostnames are rejected:"
rejects "DATABASE_URL, replicated task, with port" \
  "DATABASE_URL=postgresql://u:p@app-postgres-abc123.1.${TASK}:5432/db"
rejects "PGHOST, bare hostname" \
  "PGHOST=app-postgres-abc123.1.${TASK}"
rejects "PGHOST, bare hostname with port" \
  "PGHOST=app-postgres-abc123.1.${TASK}:5432"
rejects "global-mode task name (node id, not slot number)" \
  "DATABASE_URL=postgresql://u:p@alloy.${NODE}.${TASK}:5432/db"
rejects "comma-separated host list member with port" \
  "PGHOSTS=db-primary,app-postgres-abc123.1.${TASK}:5432"
# Dokploy's Environment tab is a .env-style paste, so these shapes turn up.
rejects "double-quoted value with port" \
  "PGHOST=\"app-postgres-abc123.1.${TASK}:5432\""
rejects "single-quoted value" \
  "PGHOST='app-postgres-abc123.1.${TASK}'"
rejects "host:port/path with no scheme" \
  "PGHOST=app-postgres-abc123.1.${TASK}:5432/db"

echo "legitimate values pass:"
accepts "service name (the correct form)" \
  "DATABASE_URL=postgresql://u:p@app-postgres-abc123:5432/db"
accepts "service name in PGHOST with port" \
  "PGHOST=app-postgres-abc123:5432"
accepts "ordinary external host" \
  "DATABASE_URL=postgresql://u:p@db.example.com:5432/db"
accepts "version-ish value that is not a hostname" \
  "IMAGE_TAG=api.1.0"
# Pins the 15-char length anchor: a 3-label value whose tail is 14 chars must
# still pass, or the anchor has been loosened too far.
accepts "three-label value with a 14-char tail" \
  "BUILD_META=api.20260727.abcdefghijklmn"

echo "Dokploy response shapes (fetch path, via PREFLIGHT_FAKE_BODY):"
shape() {
  local want="$1" name="$2" body="$3" got=0
  DOKPLOY_BASE_URL=http://x DOKPLOY_API_KEY=y PREFLIGHT_FAKE_BODY="$body" \
    bash "$SCRIPT" app-id shape >/dev/null 2>&1 || got=$?
  if [ "$got" -eq "$want" ]; then
    printf '  ok   %s\n' "$name"
  else
    printf '  FAIL %s (want exit %s, got %s)\n     %s\n' "$name" "$want" "$got" "$body"
    failures=$((failures + 1))
  fi
}
# Legitimate shapes must all pass. `.result.data | objects` on a bare response
# yields an EMPTY STREAM, not false, which made jq exit 4 with no output and
# blocked every deploy — these cases exist so that cannot come back.
shape 0 "wrapped, has env"        '{"result":{"data":{"env":"FOO=bar"}}}'
shape 0 "bare, has env"           '{"env":"FOO=bar"}'
shape 0 "wrapped, env null"       '{"result":{"data":{"env":null}}}'
shape 0 "wrapped, env empty"      '{"result":{"data":{"env":""}}}'
shape 0 "wrapped, no env key"     '{"result":{"data":{}}}'
shape 0 "wrapped, data null"      '{"result":{"data":null}}'
shape 0 "empty object"            '{}'
shape 1 "task hostname via fetch" '{"env":"DATABASE_URL=postgresql://u:p@svc.1.z665xb3q3lrnsdmxnz7sxzqtj:5432/db"}'
# Not an object at all -> unrecognisable, must fail loudly rather than pass green.
shape 5 "null body"               'null'
shape 5 "string body"             '"nope"'

if [ "$failures" -gt 0 ]; then
  echo "preflight guard: ${failures} failing case(s)" >&2
  exit 1
fi
echo "preflight guard: all cases pass"
