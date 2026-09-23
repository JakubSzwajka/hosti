#!/usr/bin/env bash
# Shallow-clone the pinned Next.js source for agent reference. Not part of check.
# Usage: npm run vendor:agent-sources [-- --refresh]
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PREFIX="${ROOT}/.agent_sources/github.com"
REFRESH=false

for arg in "$@"; do
  case "$arg" in
    --refresh) REFRESH=true ;;
    -h | --help)
      echo "Usage: $0 [--refresh]"
      exit 0
      ;;
    *)
      echo "Unknown arg: $arg" >&2
      exit 1
      ;;
  esac
done

NEXT_VERSION="$(node -e '
const { readFileSync } = require("node:fs");
const pkg = JSON.parse(readFileSync(process.argv[1], "utf8"));
const version = pkg.dependencies?.next;
if (typeof version !== "string" || !/^\d+\.\d+\.\d+$/.test(version)) {
  console.error(`expected an exact Next.js version pin, found: ${version ?? "none"}`);
  process.exit(1);
}
console.log(version);
' "$ROOT/apps/web/package.json")"
DEST="${PREFIX}/vercel/next.js"

if [[ -d "${DEST}/.git" && "$REFRESH" != true ]]; then
  echo "skip vercel/next.js (exists; pass --refresh to replace)"
  exit 0
fi

rm -rf "$DEST"
mkdir -p "$(dirname "$DEST")"
echo "clone vercel/next.js @ v${NEXT_VERSION}"
git -c advice.detachedHead=false clone --quiet --depth 1 --branch "v${NEXT_VERSION}" \
  https://github.com/vercel/next.js.git "$DEST"

cat >"${DEST}/.agent-source.json" <<EOF
{
  "remote": "https://github.com/vercel/next.js.git",
  "ref": "v${NEXT_VERSION}",
  "commit": "$(git -C "$DEST" rev-parse HEAD)",
  "addedAt": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
}
EOF
echo "  -> ${DEST}"
echo "done: agent sources under ${PREFIX}"
