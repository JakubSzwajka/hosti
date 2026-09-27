#!/usr/bin/env bash
# Reference copy of the gated release profile. Projects copy this file; keep copies in step by hand.
#
# Poll a URL until it returns HTTP 200 over TLS that curl trusts (default verify).
#
# Usage: smoke-http.sh <base-url> [path] [expect-substring]
# Env:   SMOKE_ATTEMPTS (default 10), SMOKE_DELAY (seconds, default 6)
#
# A trusted-TLS 200 is deliberate: a domain serving Traefik's self-signed
# fallback cert (certificate not issued) yields HTTP 000 here and must fail.
#
# `expect-substring` also requires that text in the body: a 200 proves the route
# answers, not that it answered with the content you expect.
set -Eeuo pipefail

base="${1:?base url required}"
path="${2:-/}"
expect="${3:-}"
url="${base%/}${path}"
attempts="${SMOKE_ATTEMPTS:-10}"
delay="${SMOKE_DELAY:-6}"

body="$(mktemp)"
trap 'rm -f "$body"' EXIT

code="000"
for attempt in $(seq 1 "$attempts"); do
  code="$(curl -s -o "$body" -w '%{http_code}' "$url" || true)"
  verify="$(curl -s -o /dev/null -w '%{ssl_verify_result}' "$url" || true)"
  echo "attempt ${attempt}/${attempts}: ${url} -> HTTP ${code} (tls_verify=${verify})"
  if [ "$code" = "200" ]; then
    if [ -z "$expect" ] || grep -qF -- "$expect" "$body"; then
      exit 0
    fi
    echo "Smoke test failed: ${url} returned 200 but the body does not contain '${expect}'." >&2
    head -c 400 "$body" >&2
    echo >&2
    exit 1
  fi
  sleep "$delay"
done

echo "Smoke test failed: ${url} never returned 200 (last HTTP ${code})." >&2
if [ "${code}" = "000" ]; then
  echo "Hint: HTTP 000 is a TLS/connection failure — check the domain's TLS certificate, DNS, and that the service is running." >&2
fi
exit 1
