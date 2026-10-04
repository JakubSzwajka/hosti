#!/usr/bin/env bash
# Clone committed HEAD and prove install, hooks, checks, tests, build, and Docker work.
# Uncommitted changes are not tested. KEEP=1 retains the temporary clone.
set -euo pipefail

step="starting"
tmp_parent="$(mktemp -d "${TMPDIR:-/tmp}/hosti-acceptance.XXXXXX")"
tmp="$tmp_parent/clone"
smoke_volume="hosti-acceptance-data-$$"
# One trap handler: read $? first so no cleanup command can overwrite the real status.
cleanup() {
  local status=$?
  trap - EXIT INT TERM
  docker volume rm -f "$smoke_volume" >/dev/null 2>&1 || true
  if [[ "${KEEP:-0}" == "1" ]]; then
    printf 'KEEP=1; kept acceptance copy at %s\n' "$tmp_parent" >&2
  else
    rm -rf "$tmp_parent"
  fi
  exit "$status"
}
trap cleanup EXIT INT TERM
fail() { printf 'acceptance failed [%s]: %s\n' "$step" "$*" >&2; exit 1; }
run_step() {
  step="$1"
  shift
  printf '== %s ==\n' "$step"
  local status=0
  "$@" || status=$?
  if [[ $status -ne 0 ]]; then
    printf 'acceptance failed [%s]: %s exited %d\n' "$step" "$*" "$status" >&2
    exit "$status"
  fi
}
if [[ $# -gt 0 ]]; then
  source_url="$1"
else
  repo_root="$(git rev-parse --show-toplevel)" || fail "could not find repository root"
  source_url="file://${repo_root}"
fi
printf 'source: %s\n' "$source_url"
run_step "clone" git clone --quiet --depth 1 "$source_url" "$tmp"
cd "$tmp"
printf 'commit: %s\n' "$(git rev-parse HEAD)"
run_step "enable Corepack" corepack enable
run_step "pnpm install" pnpm install --frozen-lockfile
[[ -f .git/hooks/pre-commit ]] || fail "pnpm install did not install .git/hooks/pre-commit"
run_step "pnpm check" pnpm check
run_step "pnpm test" pnpm test
run_step "pnpm build" pnpm build
run_step "Docker build" docker build -f apps/web/Dockerfile -t hosti:acceptance .
# new-token.mjs needs better-sqlite3 and @hosti/catalog to resolve in the image.
# --help only loads the imports; the second run mints a token in a throwaway /data.
run_step "image smoke: new-token --help" docker run --rm hosti:acceptance node scripts/new-token.mjs --help
run_step "image smoke: new-token mints a token" \
  docker run --rm -v "$smoke_volume:/data" hosti:acceptance node scripts/new-token.mjs --name acceptance
run_step "image smoke: new-token --allow-delete" \
  docker run --rm -v "$smoke_volume:/data" hosti:acceptance node scripts/new-token.mjs --name acceptance-delete --allow-delete
printf 'cold-clone acceptance passed\n'
