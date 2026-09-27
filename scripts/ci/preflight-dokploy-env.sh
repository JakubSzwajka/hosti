#!/usr/bin/env bash
# Reference copy of the gated release profile. Projects copy this file; keep copies in step by hand.
#
# Reject Docker Swarm task-scoped hostnames in a Dokploy application's runtime env.
#
# Swarm publishes three DNS names per service; only two survive a task restart:
#
#   my-postgres                          service name  — stable forever      OK
#   tasks.my-postgres                    all task IPs  — stable              OK
#   my-postgres.1.z665xb3q3lrnsdmxnz7s   ONE container — dies with the task  NOT OK
#
# The third form is the container hostname shown by `docker ps` and in log lines,
# so it gets copy-pasted into config. It resolves correctly until the task is
# replaced, then never again. That took a production API down for 15h on 2026-07-25.
#
# Usage: preflight-dokploy-env.sh <application-id> [label]
#        preflight-dokploy-env.sh --stdin [label]   # scan KEY=VALUE lines on stdin
# Env:   DOKPLOY_BASE_URL, DOKPLOY_API_KEY  (required unless --stdin)
#        PREFLIGHT_ALLOW_KEYS               (optional, comma-separated keys to skip)
#
# Values are never printed — only the offending key and the matched hostname, which
# carries no credentials.
set -Eeuo pipefail

# service-ish label . slot . task id. Keep this identical in every copy of the
# profile and in any ops script that repeats the check: a drifting copy of
# exactly this check is what the 2026-07-25 outage was.
#
# The middle segment is a slot NUMBER for replicated services (`svc.1.<task>`) but
# a 25-char NODE ID for global-mode ones (`svc.<node>.<task>`), so it accepts
# either. Length is anchored at 15+ rather than exactly 25.
# That anchor is the ONLY thing keeping opaque tokens out: host_candidates emits
# the bare value too, so everything reaches this regex. A public hostname's last
# label is a TLD and no realistic TLD is 15+ lowercase alphanumerics, which is why
# the widening is safe. Erring wide is the right direction anyway: a false
# positive fails a deploy loudly, a false negative is 15 hours of downtime.
TASK_HOSTNAME_RE='^[A-Za-z0-9_-]+\.([0-9]+|[a-z0-9]{15,})\.[a-z0-9]{15,}$'

mode_stdin=false
if [ "${1:-}" = "--stdin" ]; then
  mode_stdin=true
  shift
  label="${1:-stdin}"
else
  app_id="${1:?application id required}"
  label="${2:-$app_id}"
fi

fetch_env() {
  : "${DOKPLOY_BASE_URL:?DOKPLOY_BASE_URL is required}"
  : "${DOKPLOY_API_KEY:?DOKPLOY_API_KEY is required}"

  local body
  # PREFLIGHT_FAKE_BODY exists so the response-shape handling below is testable
  # without a Dokploy instance; nothing in CI sets it.
  if [ -n "${PREFLIGHT_FAKE_BODY:-}" ]; then
    body="$PREFLIGHT_FAKE_BODY"
  else
    body="$(curl -fsS "${DOKPLOY_BASE_URL%/}/api/application.one?applicationId=${app_id}" \
      -H "x-api-key: ${DOKPLOY_API_KEY}")"
  fi

  # Dokploy wraps some routes in {result:{data:…}} and returns others bare, so
  # unwrap if the wrapper is there and fall back to the top level if not.
  #
  # Do NOT write this as `if (.result.data | objects | has("env"))`: on a bare
  # response `.result.data` is null, `null | objects` is an EMPTY STREAM rather
  # than false, an `if` over an empty condition produces no output at all, and
  # jq then exits 4 with nothing on stderr — turning every deploy into an
  # undiagnosable failure. Learned the hard way.
  #
  # An object with no `env` key returns "" and the caller treats it as "no env
  # configured".
  # Only a response that is not an object at all is treated as unrecognisable.
  printf '%s' "$body" | jq -r '
    (.result.data // .) as $app
    | if ($app | type) != "object" then
        error("unrecognised Dokploy response: expected an object, got \($app | type)")
      else
        ($app.env // "")
      end
  '
}

if [ "$mode_stdin" = true ]; then
  env_text="$(cat)"
else
  env_text="$(fetch_env)"
  if [ -z "$env_text" ]; then
    # No env configured: nothing to scan. The app itself will fail its health check.
    echo "preflight[${label}]: no runtime env set — nothing to check"
    exit 0
  fi
fi

allow="${PREFLIGHT_ALLOW_KEYS:-}"
is_allowed() {
  [ -n "$allow" ] && printf '%s' ",${allow}," | grep -q ",$1,"
}

# Emit every substring of a value that could sit in hostname position: the value
# itself, comma/semicolon/space/tab separated members, each host of an embedded
# URL with any user:password@ stripped, and the same with surrounding quotes and
# a trailing :port removed.
#
# Note the bare value IS one of the candidates, so opaque tokens do reach the
# regex — what keeps them from matching is the length anchor in
# TASK_HOSTNAME_RE, not the candidate set.
host_candidates() {
  local value="$1"
  # Dokploy's Environment tab is a .env-style paste, so values arrive quoted and
  # sometimes CRLF-terminated. Without stripping those first,
  # PGHOST="svc.1.<task>:5432" slips through on the quotes alone.
  local bare="${value%$'\r'}"
  bare="${bare#[\"\']}"
  bare="${bare%[\"\']}"

  local v
  for v in "$value" "$bare"; do
    printf '%s\n' "$v"
    # every producer must emit newline-terminated output, or its last line glues
    # onto the next producer's first line and no candidate matches
    printf '%s\n' "$v" | tr ',; \t' '\n\n\n\n'
    printf '%s\n' "$v" | grep -oE '://[^/[:space:]]+' \
      | sed -E 's#^://##; s#^[^@]*@##; s#[:/?].*$##'
    # `host:port` outside a URL — PGHOST=<task-hostname>:5432 is how the second
    # service in the 2026-07-25 incident was configured, and the URL producer
    # only strips the port when the value carries a scheme.
    printf '%s\n' "$v" | tr ',; \t' '\n\n\n\n' | sed -E 's#:[0-9]+.*$##'
  done
}

findings=0
while IFS= read -r line; do
  case "$line" in ''|'#'*) continue ;; esac
  key="${line%%=*}"
  value="${line#*=}"
  [ "$key" = "$line" ] && continue

  match="$(host_candidates "$value" | grep -E "$TASK_HOSTNAME_RE" | head -1 || true)"
  [ -z "$match" ] && continue

  if is_allowed "$key"; then
    echo "preflight[${label}]: ${key} matches a task hostname but is allow-listed — skipping"
    continue
  fi

  if [ "$findings" -eq 0 ]; then
    echo "preflight[${label}]: FAIL — task-scoped Swarm hostname(s) in runtime env" >&2
  fi
  echo "  ${key} -> ${match}" >&2
  findings=$((findings + 1))
done <<EOF
$env_text
EOF

if [ "$findings" -gt 0 ]; then
  cat >&2 <<'HINT'

This address points at a single container and stops resolving the moment that
task is replaced — the service keeps working until the next restart, then fails
permanently. Use the service name instead (drop the ".<slot>.<task-id>" suffix):

  postgresql://user:pw@my-postgres.1.z665xb3q3lrn…:5432/db   WRONG
  postgresql://user:pw@my-postgres:5432/db                   RIGHT

Fix it in the Dokploy application's Environment tab (Dokploy is the source of
truth — editing the live Swarm service is undone by the next deploy), then
re-run. If this is a false positive, set PREFLIGHT_ALLOW_KEYS=<key>.
HINT
  exit 1
fi

echo "preflight[${label}]: env clean — no task-scoped hostnames"
