import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { checkRepository, formatDiagnostic } from "./check-playbook.mjs";
import "./tests/biome-scope.test.mjs";
import "./tests/strict-mode.test.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const fixtureRoot = "tools/playbook-checks/tests/fixtures/checker";
const checkerPath = path.join(repoRoot, "tools/playbook-checks/check-playbook.mjs");
const depcruisePath = path.join(repoRoot, "node_modules/.bin/depcruise");
const dependencyConfig = path.join(repoRoot, "tools/playbook-checks/tests/dependency-cruiser.cjs");

function configFor(name, overrides = {}) {
  const root = `${fixtureRoot}/${name}`;
  return {
    scanRoots: [root],
    tsconfigFiles: [`${root}/tsconfig.json`],
    testRoots: [`${root}/tests`],
    publicEntries: ["index.ts"],
    generatedRoots: [],
    ignoredDirectories: ["node_modules"],
    directoryNameExceptions: [],
    maxSiblings: 10,
    ownerlessBasenames: ["helpers", "misc", "utils"],
    ...overrides,
  };
}

function diagnosticsFor(name, overrides) {
  return checkRepository(configFor(name, overrides), repoRoot);
}

function rules(diagnostics, severity = "error") {
  return diagnostics.filter((item) => item.severity === severity).map((item) => item.rule);
}

function runChecker(name) {
  return spawnSync(
    process.execPath,
    [checkerPath, path.join(repoRoot, fixtureRoot, name, "config.mjs")],
    { cwd: repoRoot, encoding: "utf8" },
  );
}

function runDepcruise(target, config = dependencyConfig, outputType = "json") {
  const targets = Array.isArray(target) ? target : [target];
  return spawnSync(depcruisePath, ["--config", config, "--output-type", outputType, ...targets], {
    cwd: repoRoot,
    encoding: "utf8",
  });
}

function graphFrom(result) {
  assert.equal(result.error, undefined);
  assert.ok(result.stdout, result.stderr);
  return JSON.parse(result.stdout);
}

function graphDependencies(graph) {
  return graph.modules.flatMap((module) => module.dependencies ?? []);
}

test("a conforming fixture passes", () => {
  assert.deepEqual(diagnosticsFor("pass"), []);
});

test("strict mode must resolve to true", () => {
  assert.deepEqual(rules(diagnosticsFor("strict-off")), ["strict-mode"]);
});

test("bare export stars fail only in configured public entries", () => {
  const diagnostics = diagnosticsFor("star-export", {
    publicEntries: ["index.ts", "index.d.ts"],
  });
  assert.deepEqual(rules(diagnostics), ["no-bare-star-export"]);
  assert.match(
    formatDiagnostic(diagnostics[0]),
    /index\.ts:1 error\/no-bare-star-export Name the exports/u,
  );
});

test("non-deterministic source names fail", () => {
  assert.deepEqual(rules(diagnosticsFor("bad-name")), ["file-name"]);
});

test("a PascalCase component with a matching named export passes", () => {
  assert.deepEqual(diagnosticsFor("component-match"), []);
});

test("a PascalCase component with a mismatched export warns", () => {
  const diagnostics = diagnosticsFor("component-mismatch");
  assert.deepEqual(rules(diagnostics), []);
  assert.deepEqual(rules(diagnostics, "warning"), ["component-export-name"]);
});

test("tests outside configured test roots fail", () => {
  assert.deepEqual(rules(diagnosticsFor("misplaced-test")), ["test-placement"]);
});

test("sibling count and ownerless names warn without errors", () => {
  const diagnostics = diagnosticsFor("warnings", { maxSiblings: 1 });
  assert.deepEqual(rules(diagnostics), []);
  assert.deepEqual(rules(diagnostics, "warning"), ["sibling-count", "ownerless-name"]);
});

test("only exact generated roots are skipped", () => {
  const root = `${fixtureRoot}/generated-scope`;
  const diagnostics = diagnosticsFor("generated-scope", {
    generatedRoots: [`${root}/apps/web/.next`, `${root}/apps/web/generated-output`],
  });
  assert.deepEqual(rules(diagnostics), ["file-name"]);
  assert.match(diagnostics[0].path, /src\/dist\/bad_name\.ts$/u);
});

test("missing configured paths produce stable diagnostics", () => {
  const root = `${fixtureRoot}/missing`;
  const diagnostics = checkRepository(
    configFor("pass", {
      scanRoots: [`${root}/missing-root`],
      tsconfigFiles: [`${root}/missing-tsconfig.json`],
    }),
    repoRoot,
  );
  assert.deepEqual(
    new Set(rules(diagnostics)),
    new Set(["config-root-missing", "config-tsconfig-missing"]),
  );
});

test("checker executable exits zero for a passing fixture", () => {
  const result = runChecker("pass");
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /playbook-check: 0 errors, 0 warnings/u);
});

test("checker executable exits nonzero for a deterministic failure", () => {
  const result = runChecker("star-export");
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stdout, /error\/no-bare-star-export/u);
  assert.match(result.stdout, /playbook-check: 1 errors, 0 warnings/u);
});

test("checker executable exits zero when it reports warnings", () => {
  const result = runChecker("warnings");
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /warning\/sibling-count/u);
  assert.match(result.stdout, /warning\/ownerless-name/u);
  assert.match(result.stdout, /playbook-check: 0 errors, 2 warnings/u);
});

test("component export warnings exit zero", () => {
  const result = runChecker("component-mismatch");
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /warning\/component-export-name/u);
  assert.match(result.stdout, /playbook-check: 0 errors, 1 warnings/u);
});

test("Dependency Cruiser accepts allowed fixture edges", () => {
  const target = "tools/playbook-checks/tests/fixtures/dependencies/pass";
  const result = runDepcruise(target);
  const graph = graphFrom(result);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(graph.summary.violations, []);
  const publicPackageEdge = graphDependencies(graph).find(
    ({ module }) => module === "@hosti/shared",
  );
  assert.ok(publicPackageEdge);
  assert.equal(publicPackageEdge.couldNotResolve, false);
});

test("Dependency Cruiser rejects every configured fixture violation", () => {
  const target = "tools/playbook-checks/tests/fixtures/dependencies/fail";
  const result = runDepcruise(target);
  const graph = graphFrom(result);
  assert.ok(graph.summary.advisedExitCode > 0);
  assert.deepEqual(
    new Set(graph.summary.violations.map(({ rule }) => rule.name)),
    new Set([
      "no-circular",
      "packages-use-public-entry",
      "production-does-not-import-tests",
      "workspace-package-specifiers-use-public-entry",
      "web-server-does-not-import-next-delivery",
    ]),
  );
  const packageSpecifierViolations = graph.summary.violations.filter(
    ({ rule }) => rule.name === "workspace-package-specifiers-use-public-entry",
  );
  assert.deepEqual(
    new Set(packageSpecifierViolations.map(({ from }) => from)),
    new Set([
      `${target}/apps/cli/src/deep-package.ts`,
      `${target}/apps/cli/tests/deep-package.test.ts`,
    ]),
  );
  assert.ok(packageSpecifierViolations.every(({ to }) => to === "@hosti/shared/src/internal"));
  const aliasEdges = graphDependencies(graph).filter(({ module }) => module.startsWith("@/"));
  assert.ok(aliasEdges.length > 0);
  assert.ok(aliasEdges.every(({ couldNotResolve }) => !couldNotResolve));

  const executableResult = runDepcruise(target, dependencyConfig, "err");
  assert.notEqual(executableResult.status, 0);
  for (const ruleName of [
    "no-circular",
    "packages-use-public-entry",
    "production-does-not-import-tests",
    "workspace-package-specifiers-use-public-entry",
    "web-server-does-not-import-next-delivery",
  ]) {
    assert.match(executableResult.stdout, new RegExp(ruleName, "u"));
  }
});

test("Dependency Cruiser resolves real aliases and workspace packages", () => {
  const result = runDepcruise(["apps", "packages"], path.join(repoRoot, ".dependency-cruiser.cjs"));
  const graph = graphFrom(result);
  assert.equal(result.status, 0, result.stderr);
  for (const prefix of ["@/", "@hosti/"]) {
    const dependencies = graphDependencies(graph).filter(({ module }) => module.startsWith(prefix));
    assert.ok(dependencies.length > 0, `expected ${prefix} dependencies`);
    assert.equal(dependencies.filter(({ couldNotResolve }) => couldNotResolve).length, 0);
  }
});
