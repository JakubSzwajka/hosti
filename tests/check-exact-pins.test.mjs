import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(
  new URL("../node_modules/@jakubszwajka/house-rules/bin/pins.mjs", import.meta.url),
);
const checkManifest = (manifest) => {
  const dir = mkdtempSync(join(tmpdir(), "check-exact-pins-"));
  try {
    const path = join(dir, "package.json");
    writeFileSync(path, JSON.stringify(manifest));
    return spawnSync(process.execPath, [script, path], { encoding: "utf8" });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};
const checkWorkspace = (files) => {
  const dir = mkdtempSync(join(tmpdir(), "check-exact-pins-workspace-"));
  try {
    for (const [path, content] of Object.entries(files)) {
      mkdirSync(join(dir, path, ".."), { recursive: true });
      writeFileSync(
        join(dir, path),
        typeof content === "string" ? content : JSON.stringify(content),
      );
    }
    return spawnSync(process.execPath, [script], { cwd: dir, encoding: "utf8" });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};
const WORKSPACE_YAML = 'packages:\n  - "apps/*"\n  - packages/*\n\nsaveExact: true\n';

describe("exact pin check", () => {
  it("accepts exact versions, prereleases, aliases, and commit-pinned GitHub specs", () => {
    const result = checkManifest({
      dependencies: { a: "1.2.3", b: "4.0.0-rc.1", c: "npm:real-name@2.0.0" },
      devDependencies: { d: "github:owner/repo#012daeb0d1809f0e026b9425dddc9a42a77c3328" },
      optionalDependencies: { e: "workspace:0.0.0" },
      packageManager: "pnpm@12.5.1",
    });
    assert.equal(result.status, 0, result.stderr);
  });

  for (const spec of [
    "^1.2.3",
    "~1.2.3",
    ">=1.0.0",
    "latest",
    "*",
    "github:owner/repo#main",
    "workspace:*",
    "workspace:^",
    "workspace:^1.2.3",
  ]) {
    it(`rejects ${spec}`, () => {
      const result = checkManifest({ devDependencies: { loose: spec } });
      assert.equal(result.status, 1);
      assert.match(result.stderr, /devDependencies\.loose:/);
    });
  }

  it("rejects a packageManager without an exact version", () => {
    const result = checkManifest({ packageManager: "pnpm@latest" });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /packageManager: pnpm@latest/);
  });

  it("checks root and every workspace manifest from pnpm-workspace.yaml", () => {
    const result = checkWorkspace({
      "pnpm-workspace.yaml": WORKSPACE_YAML,
      "package.json": { devDependencies: { a: "1.2.3" } },
      "apps/web/package.json": { dependencies: { b: "workspace:0.1.0" } },
      "packages/core/package.json": { dependencies: { c: "^4.0.0" } },
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /packages\/core\/package\.json[\s\S]*dependencies\.c: \^4\.0\.0/);
    assert.doesNotMatch(result.stderr, /apps\/web/);
  });

  it("passes when every workspace manifest is exact", () => {
    const result = checkWorkspace({
      "pnpm-workspace.yaml": WORKSPACE_YAML,
      "package.json": { devDependencies: { a: "1.2.3" } },
      "apps/web/package.json": { dependencies: { b: "workspace:0.1.0" } },
      "packages/core/package.json": { dependencies: { c: "4.0.0" } },
    });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /apps\/web\/package\.json, packages\/core\/package\.json/);
  });

  it("fails when pnpm-workspace.yaml lists no packages", () => {
    const result = checkWorkspace({
      "pnpm-workspace.yaml": "saveExact: true\n",
      "package.json": { devDependencies: { a: "1.2.3" } },
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /no `packages:` list/);
  });
});
