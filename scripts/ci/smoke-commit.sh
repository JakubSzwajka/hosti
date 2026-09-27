#!/usr/bin/env bash
# Reference copy of the gated release profile. Projects copy this file; keep copies in step by hand.
#
# Poll /api/health until the NEW image answers: HTTP 200 over TLS that curl trusts,
# and a JSON `commit` equal to the commit being deployed.
#
# Usage: smoke-commit.sh <base-url> <expected-commit>
# Env:   SMOKE_TIMEOUT (seconds, default 300), SMOKE_DELAY (seconds, default 6),
#        SMOKE_PATH (default /api/health)
#
# A plain 200 is not enough after a deploy: until Swarm swaps the container
# (its healthcheck has a 60 s start period), the old one still answers 200. So a
# 200 with the wrong commit keeps polling, and only the deadline fails the check.
#
# `expected-commit` may be a full sha; only its first 12 characters are compared,
# which is what the health endpoint reports.
set -Eeuo pipefail

base="${1:?base url required}"
expected_in="${2:?expected commit required}"
path="${SMOKE_PATH:-/api/health}"
timeout="${SMOKE_TIMEOUT:-300}"
delay="${SMOKE_DELAY:-6}"
url="${base%/}${path}"

if ! [[ "$expected_in" =~ ^[0-9a-f]{12,40}$ ]]; then
  echo "Expected commit '${expected_in}' is not a 12-40 character lowercase hex sha." >&2
  exit 2
fi
expected="${expected_in:0:12}"

command -v jq >/dev/null || { echo "jq is required." >&2; exit 2; }

body="$(mktemp)"
trap 'rm -f "$body"' EXIT

code="000"
seen="none"
attempt=0
deadline=$((SECONDS + timeout))
while :; do
  attempt=$((attempt + 1))
  : >"$body"
  code="$(curl -s --max-time 10 -o "$body" -w '%{http_code}' "$url" || true)"
  # A non-JSON body (a proxy error page) leaves `seen` as none rather than failing.
  seen="$(jq -r '.commit // "none" | tostring' "$body" 2>/dev/null || echo none)"
  seen="${seen:-none}"
  echo "attempt ${attempt}: ${url} -> HTTP ${code}, commit ${seen} (want ${expected})"
  if [ "$code" = "200" ] && [ "$seen" = "$expected" ]; then
    echo "The new image is serving: commit ${seen}."
    exit 0
  fi
  if [ "$SECONDS" -ge "$deadline" ]; then
    break
  fi
  sleep "$delay"
done

echo "Smoke test failed after ${timeout}s: ${url} never returned 200 with commit ${expected}." >&2
echo "Expected commit: ${expected}" >&2
echo "Last seen:       commit ${seen}, HTTP ${code}" >&2
if [ "$code" = "000" ]; then
  echo "Hint: HTTP 000 is a TLS/connection failure — check the domain's TLS certificate, DNS, and that the service is running." >&2
elif [ "$seen" = "unknown" ]; then
  echo "Hint: commit 'unknown' means the serving image was built without the APP_COMMIT build arg (for example a Dokploy source build)." >&2
elif [ "$code" = "200" ]; then
  echo "Hint: a 200 with another commit means the old container is still serving; check the Swarm service's task state in Dokploy." >&2
fi
exit 1
