import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const biomePath = path.join(repoRoot, "node_modules/.bin/biome");

function runBiome(file, configPath = "biome.json") {
  return spawnSync(
    biomePath,
    ["lint", `--config-path=${configPath}`, "--reporter=json", "--no-errors-on-unmatched", file],
    { cwd: repoRoot, encoding: "utf8" },
  );
}

function reportFor(result) {
  assert.ok(result.stdout, result.stderr);
  return JSON.parse(result.stdout);
}

function assertNonNullFailure(result) {
  const report = reportFor(result);
  assert.equal(result.status, 1, result.stderr);
  assert.ok(
    report.diagnostics.some(
      ({ category, severity }) =>
        category === "lint/style/noNonNullAssertion" && severity === "error",
    ),
  );
}

test("the real Biome config excludes only the generated Next root", () => {
  const sourceRoot = path.join(repoRoot, "apps/web/src", `playbook-biome-${process.pid}`);
  const nestedNextFile = path.join(sourceRoot, "nested/.next/non-null.ts");
  const nestedDistFile = path.join(sourceRoot, "nested/dist/non-null.ts");
  const rootNextFile = path.join(repoRoot, "apps/web/.next", `playbook-biome-${process.pid}.ts`);
  const code = 'const value: string | undefined = "x";\nexport const definite = value!;\n';

  for (const file of [nestedNextFile, nestedDistFile, rootNextFile]) {
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, code);
  }

  try {
    const rootNextResult = runBiome(path.relative(repoRoot, rootNextFile));
    const rootNextReport = reportFor(rootNextResult);
    assert.equal(rootNextResult.status, 0, rootNextResult.stderr);
    assert.equal(rootNextReport.summary.matches, 0);
    assert.deepEqual(rootNextReport.diagnostics, []);

    assertNonNullFailure(runBiome(path.relative(repoRoot, nestedNextFile)));
    assertNonNullFailure(runBiome(path.relative(repoRoot, nestedDistFile)));
  } finally {
    rmSync(sourceRoot, { recursive: true, force: true });
    rmSync(rootNextFile, { force: true });
  }
});

test("Biome reports non-null assertions as errors", () => {
  const fixture = path.join(repoRoot, "tools/playbook-checks/tests/fixtures/biome");
  const result = runBiome(path.join(fixture, "non-null.ts"), path.join(fixture, "biome.json"));
  const report = reportFor(result);
  assert.equal(result.status, 1, result.stderr);
  assert.equal(report.summary.errors, 1);
  assert.equal(report.diagnostics[0].category, "lint/style/noNonNullAssertion");
  assert.equal(report.diagnostics[0].severity, "error");
});
