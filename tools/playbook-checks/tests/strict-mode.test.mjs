import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { checkRepository, formatDiagnostic } from "../check-playbook.mjs";
import { checkerFixtureConfig } from "./fixtures/checker/config-factory.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const checkerPath = path.join(repoRoot, "tools/playbook-checks/check-playbook.mjs");
const tscPath = path.join(repoRoot, "node_modules/.bin/tsc");
const fixtureRoot = "tools/playbook-checks/tests/fixtures/checker";
const disabledOptions = [
  ["strict-null-checks-off", "strictNullChecks", 4],
  ["strict-function-types-off", "strictFunctionTypes", 1],
];

function runChecker(name) {
  return spawnSync(
    process.execPath,
    [checkerPath, path.join(repoRoot, fixtureRoot, name, "config.mjs")],
    { cwd: repoRoot, encoding: "utf8" },
  );
}

test("TypeScript accepts explicit and inherited strict-family overrides", () => {
  for (const [fixtureName] of disabledOptions) {
    const result = spawnSync(
      tscPath,
      ["--project", path.join(repoRoot, fixtureRoot, fixtureName, "tsconfig.json"), "--noEmit"],
      { cwd: repoRoot, encoding: "utf8" },
    );
    assert.equal(result.status, 0, result.stderr);
  }
});

test("disabled strict-family members produce stable diagnostics", () => {
  for (const [fixtureName, optionName, line] of disabledOptions) {
    const diagnostics = checkRepository(checkerFixtureConfig(fixtureName), repoRoot);
    assert.equal(diagnostics.length, 1);
    assert.equal(
      formatDiagnostic(diagnostics[0]),
      `${fixtureRoot}/${fixtureName}/tsconfig.json:${line} error/strict-mode ` +
        `TypeScript strict-family option '${optionName}' must not resolve to false.`,
    );
  }
});

test("disabled strict-family members make the checker executable fail", () => {
  for (const [fixtureName, optionName] of disabledOptions) {
    const result = runChecker(fixtureName);
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stdout, new RegExp(`error/strict-mode .*'${optionName}'`, "u"));
    assert.match(result.stdout, /playbook-check: 1 errors, 0 warnings/u);
  }
});
