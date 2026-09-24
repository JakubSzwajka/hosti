#!/usr/bin/env bash
# Shallow-clone pinned Next.js and Effect sources for agent reference.
# Usage: pnpm vendor:agent-sources [-- --refresh]
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

clone_source() {
  local owner="$1" repo="$2" remote="$3" ref="$4"
  local dest="${PREFIX}/${owner}/${repo}"

  if [[ -d "${dest}/.git" && "$REFRESH" != true ]]; then
    echo "skip ${owner}/${repo} (exists; pass --refresh to replace)"
    return 0
  fi
  rm -rf "$dest"
  mkdir -p "$(dirname "$dest")"
  echo "clone ${owner}/${repo} @ ${ref}"
  git -c advice.detachedHead=false clone --quiet --depth 1 --branch "$ref" "$remote" "$dest"

  cat >"${dest}/.agent-source.json" <<EOF
{
  "remote": "${remote}",
  "ref": "${ref}",
  "commit": "$(git -C "$dest" rev-parse HEAD)",
  "addedAt": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
}
EOF
  echo "  -> ${dest}"
}

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
EFFECT_VERSION="$(cd "$ROOT" && node -e '
const { globSync, readFileSync } = require("node:fs");
const pins = new Set(
  globSync(["apps/*/package.json", "packages/*/package.json"])
    .map((path) => JSON.parse(readFileSync(path, "utf8")).dependencies?.effect)
    .filter((pin) => pin !== undefined),
);
if (pins.size !== 1) {
  console.error(`expected one effect pin across the workspace, found: ${[...pins].join(", ") || "none"}`);
  process.exit(1);
}
console.log([...pins][0]);
')"

clone_source vercel next.js https://github.com/vercel/next.js.git "v${NEXT_VERSION}"
clone_source Effect-TS effect https://github.com/Effect-TS/effect.git "effect@${EFFECT_VERSION}"
echo "done: agent sources under ${PREFIX}"
