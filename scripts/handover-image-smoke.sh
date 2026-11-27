#!/usr/bin/env bash
set -euo pipefail

image="${1:?usage: scripts/handover-image-smoke.sh <image>}"
run_id="hosti-handover-$$"
volume="$run_id-data"
old="$run_id-old"
candidate="$run_id-candidate"
work="$(mktemp -d "${TMPDIR:-/tmp}/$run_id.XXXXXX")"

cleanup() {
  local status=$?
  trap - EXIT INT TERM
  docker rm -f "$old" "$candidate" >/dev/null 2>&1 || true
  docker volume rm -f "$volume" >/dev/null 2>&1 || true
  rm -rf "$work"
  exit "$status"
}
trap cleanup EXIT INT TERM

fail() {
  printf 'handover smoke failed: %s\n' "$*" >&2
  docker logs "$old" 2>&1 | tail -20 >&2 || true
  exit 1
}

hook() {
  local container="$1" method="$2" path="$3" epoch="${4:-}"
  docker exec "$container" node -e '
    const [method, path, epoch] = process.argv.slice(1);
    fetch("http://localhost:3000" + path, {
      method,
      headers: epoch ? { "X-Small-App-Epoch": epoch } : {},
      body: epoch ? JSON.stringify({ epoch }) : undefined,
      redirect: "error",
    })
      .then(async (r) => process.stdout.write(r.status + " " + (await r.text())))
      .catch(() => process.exit(1));
  ' "$method" "$path" "$epoch"
}

address() {
  docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' "$1"
}

public() {
  local container="$1"
  shift
  curl --silent --output /dev/null --write-out '%{http_code}' "$@" \
    --resolve "hosti.test:3000:$(address "$container")"
}

expect() {
  local label="$1" actual="$2" pattern="$3"
  [[ "$actual" =~ $pattern ]] || fail "$label: got [$actual], expected /$pattern/"
  printf 'ok  %s\n' "$label"
}

wait_ready() {
  local container="$1" pattern="$2"
  for _ in $(seq 1 60); do
    if body="$(hook "$container" GET /internal/deploy/ready 2>/dev/null)" && [[ "$body" =~ $pattern ]]; then
      printf '%s' "$body"
      return 0
    fi
    sleep 0.5
  done
  fail "$container never matched /$pattern/"
}

docker volume create "$volume" >/dev/null
token="$(docker run --rm -v "$volume:/data" "$image" node scripts/new-token.mjs --name smoke | sed -n 2p)"
[[ "$token" == hosti_* ]] || fail "token:new did not mint a token"
tar -czf "$work/bundle.tar.gz" -C "$(dirname "$0")/../fixtures/single-file" .

docker run -d --name "$old" -v "$volume:/data" "$image" >/dev/null
expect "old writer readiness" "$(wait_ready "$old" '"writer":true')" '^200 .*"ready":true,"writer":true,"schema":"4","epoch":null'
expect "private health" "$(hook "$old" GET /api/health)" '^200 \{"status":"ok","commit":"[^"]+"\}$'
expect "private smoke" "$(hook "$old" GET /internal/deploy/smoke)" '^200 .*"ok":true'
for path in /api/health /internal/deploy/ready /internal/deploy/smoke; do
  expect "public GET $path" "$(public "$old" -H 'X-Forwarded-For: 127.0.0.1' "http://hosti.test:3000$path")" '^404$'
done
for path in /internal/deploy/fence/on /internal/deploy/fence/off; do
  expect "public POST $path" "$(public "$old" -X POST -H 'X-Small-App-Epoch: proof-epoch-a' \
    -H 'Host: localhost:3000' -d '{"epoch":"proof-epoch-a"}' "http://hosti.test:3000$path")" '^404$'
done
expect "token:new refused while serving" \
  "$(docker exec "$old" node scripts/new-token.mjs --name refused 2>&1 || true)" 'running Hosti server owns'
expect "public push" "$(public "$old" -X POST -H "Authorization: Bearer $token" \
  -H 'Content-Type: application/gzip' --data-binary "@$work/bundle.tar.gz" \
  http://hosti.test:3000/api/v1/bundles/smoke-old/revisions)" '^201$'

expect "fence-on" "$(hook "$old" POST /internal/deploy/fence/on proof-epoch-a)" \
  '^200 \{"fenced":true,"drained":true,"epoch":"proof-epoch-a"\}$'
expect "fenced push" "$(public "$old" -X POST -H "Authorization: Bearer $token" \
  -H 'Content-Type: application/gzip' --data-binary "@$work/bundle.tar.gz" \
  http://hosti.test:3000/api/v1/bundles/smoke-late/revisions)" '^503$'
expect "fenced read" "$(public "$old" -H "Authorization: Bearer $token" \
  http://hosti.test:3000/api/v1/bundles/smoke-old)" '^200$'

docker run -d --name "$candidate" -e SMALL_APP_WRITER_EPOCH=proof-epoch-a -v "$volume:/data" "$image" >/dev/null
expect "candidate writer readiness" "$(wait_ready "$candidate" '"writer":true')" \
  '"ready":true,"writer":true,"schema":"4","epoch":"proof-epoch-a"'
expect "old stays reader" "$(hook "$old" GET /internal/deploy/ready)" '"writer":false'
expect "candidate push" "$(public "$candidate" -X POST -H "Authorization: Bearer $token" \
  -H 'Content-Type: application/gzip' --data-binary "@$work/bundle.tar.gz" \
  http://hosti.test:3000/api/v1/bundles/smoke-new/revisions)" '^201$'
expect "old reads candidate write" "$(public "$old" -H "Authorization: Bearer $token" \
  http://hosti.test:3000/api/v1/bundles/smoke-new)" '^200$'
expect "late fence-on on candidate" "$(hook "$candidate" POST /internal/deploy/fence/on proof-epoch-a)" '^409 '

docker restart "$old" >/dev/null
expect "restarted old stays reader" "$(wait_ready "$old" '"ready":true')" '"writer":false'
printf 'handover image smoke passed\n'
