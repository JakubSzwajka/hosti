import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(new URL("../scripts/check-exact-pins.mjs", import.meta.url));
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
const WORKSPACES = ["apps/*", "packages/*"];

describe("exact pin check", () => {
  it("accepts exact versions, prereleases, aliases, and commit-pinned GitHub specs", () => {
    const result = checkManifest({
      dependencies: { a: "1.2.3", b: "4.0.0-rc.1", c: "npm:real-name@2.0.0" },
      devDependencies: { d: "github:owner/repo#012daeb0d1809f0e026b9425dddc9a42a77c3328" },
      optionalDependencies: { e: "0.0.1" },
      packageManager: "npm@11.19.0",
    });
    assert.equal(result.status, 0, result.stderr);
  });

  for (const spec of ["^1.2.3", "~1.2.3", ">=1.0.0", "latest", "*", "github:owner/repo#main"]) {
    it(`rejects ${spec}`, () => {
      const result = checkManifest({ devDependencies: { loose: spec } });
      assert.equal(result.status, 1);
      assert.match(result.stderr, /devDependencies\.loose:/);
    });
  }

  it("rejects a packageManager without an exact version", () => {
    const result = checkManifest({ packageManager: "npm@latest" });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /packageManager: npm@latest/);
  });

  it("checks root and every workspace package from package.json workspaces", () => {
    const result = checkWorkspace({
      "package.json": { workspaces: WORKSPACES, devDependencies: { a: "1.2.3" } },
      "apps/web/package.json": { dependencies: { b: "1.0.0" } },
      "packages/core/package.json": { dependencies: { c: "^4.0.0" } },
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /packages\/core\/package\.json[\s\S]*dependencies\.c: \^4\.0\.0/);
    assert.doesNotMatch(result.stderr, /apps\/web/);
  });

  it("passes when every workspace manifest is exact", () => {
    const result = checkWorkspace({
      "package.json": { workspaces: WORKSPACES, devDependencies: { a: "1.2.3" } },
      "apps/web/package.json": { dependencies: { b: "1.0.0" } },
      "packages/core/package.json": { dependencies: { c: "4.0.0" } },
    });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /apps\/web\/package\.json, packages\/core\/package\.json/);
  });

  it("fails when package.json lists no workspaces", () => {
    const result = checkWorkspace({ "package.json": { devDependencies: { a: "1.2.3" } } });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /no `workspaces` list/);
  });
});
