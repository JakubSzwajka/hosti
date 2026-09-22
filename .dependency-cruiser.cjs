/** @type {import("dependency-cruiser").IConfiguration} */

const path = require("node:path");

const CLI_ROOT = "^apps/cli(?:/|$)";
const CLI_SOURCE_ROOT = "^apps/cli/src(?:/|$)";
const CLI_ENTRY = "^apps/cli/src/index[.][cm]?[jt]sx?$";
const WEB_ROOT = "^apps/web(?:/|$)";
const WEB_NEXT_ENV_DECLARATION = "^apps/web/next-env[.]d[.]ts$";
const WEB_SOURCE_ROOT = "^apps/web/src(?:/|$)";
const WEB_DELIVERY_ROOT = "^apps/web/src/app(?:/|$)";
const WEB_SERVER_ROOT = "^apps/web/src/server(?:/|$)";
const SHARED_ROOT = "^packages/shared(?:/|$)";
const SHARED_SOURCE_ROOT = "^packages/shared/src(?:/|$)";
const SHARED_ENTRY = "^packages/shared/src/index[.][cm]?[jt]sx?$";
const TEST_PATH = "(?:^|/)(?:tests|__tests__)(?:/|$)|[.](?:test|spec)[.][^/]+$";
const PACKAGE_NAMESPACE = "^@hosti/";

const EXCLUDED_PATH = "^apps/web/[.]next(?:/|$)";

module.exports = {
  forbidden: [
    {
      name: "no-cycles",
      severity: "error",
      from: {},
      to: { circular: true },
    },
    {
      name: "web-server-does-not-import-next-delivery",
      severity: "error",
      comment: "Server code must not depend on Next app routes or delivery components.",
      from: { path: WEB_SERVER_ROOT },
      to: { path: WEB_DELIVERY_ROOT },
    },
    {
      name: "no-unresolved-deep-package-imports",
      severity: "error",
      comment: "Deep @hosti package specifiers bypass public workspace package entries.",
      from: {},
      to: {
        path: `${PACKAGE_NAMESPACE}[^/]+/.+`,
        couldNotResolve: true,
      },
    },
    {
      name: "cli-public-entry-only",
      severity: "error",
      comment: "Code outside @hosti/cli must import its public entry, not its implementation.",
      from: { pathNot: CLI_ROOT },
      to: {
        path: CLI_SOURCE_ROOT,
        pathNot: CLI_ENTRY,
      },
    },
    {
      name: "cli-entry-follows-package-exports",
      severity: "error",
      comment: "@hosti/cli has no package export; non-local imports may not resolve to its entry.",
      from: { pathNot: CLI_ROOT },
      to: {
        path: CLI_ENTRY,
        dependencyTypesNot: ["local"],
      },
    },
    {
      name: "shared-public-entry-only",
      severity: "error",
      comment: "Code outside @hosti/shared must import its public entry, not its implementation.",
      from: { pathNot: SHARED_ROOT },
      to: {
        path: SHARED_SOURCE_ROOT,
        pathNot: SHARED_ENTRY,
      },
    },
    {
      name: "web-source-is-workspace-private",
      severity: "error",
      comment: "@hosti/web has no package export; only its own code may import its source.",
      from: { pathNot: WEB_ROOT },
      to: { path: WEB_SOURCE_ROOT },
    },
    {
      name: "production-does-not-import-tests",
      severity: "error",
      from: { pathNot: TEST_PATH },
      to: { path: TEST_PATH },
    },
    {
      name: "no-unresolved-imports",
      severity: "error",
      from: { pathNot: WEB_NEXT_ENV_DECLARATION },
      to: { couldNotResolve: true },
    },
  ],
  options: {
    exclude: {
      path: EXCLUDED_PATH,
    },
    doNotFollow: {
      path: "(?:^|/)node_modules(?:/|$)",
    },
    skipAnalysisNotInRules: true,
    baseDir: __dirname,
    tsPreCompilationDeps: "specify",
    // check:deps runs from apps/web so Dependency Cruiser resolves @/* from this tsconfig.
    tsConfig: {
      fileName: path.join(__dirname, "apps/web/tsconfig.json"),
    },
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["types", "import", "node", "default"],
    },
  },
};
