const path = require("node:path");

const CLI_ROOT = "^apps/cli(?:/|$)";
const CLI_SOURCE_ROOT = "^apps/cli/src(?:/|$)";
const CLI_ENTRY = "^apps/cli/src/index[.][cm]?[jt]sx?$";
const WEB_NEXT_ENV_DECLARATION = "^apps/web/next-env[.]d[.]ts$";
const WEB_DELIVERY_ROOT = "^apps/web/src/app(?:/|$)";
const WEB_SERVER_ROOT = "^apps/web/src/server(?:/|$)";
const APPS_ROOT = "^apps/";
const APP_ROOT = "^(apps/[^/]+)/";
const WORKSPACE_ROOT = "^((?:apps|packages)/[^/]+)/";
const PACKAGES_ROOT = "^packages/";
const PACKAGE_ENTRY = "src/index[.]ts$";
const TEST_PATH = "(?:^|/)(?:tests|__tests__)(?:/|$)|[.](?:test|spec)[.][^/]+$";
const PACKAGE_NAMESPACE = "^@hosti/";

const EXCLUDED_PATH = "(?:^|/)(?:node_modules|[.]next|[.]agent_sources)(?:/|$)";

module.exports = {
  forbidden: [
    {
      name: "no-cycles",
      severity: "error",
      from: {},
      to: { circular: true },
    },
    {
      name: "packages-do-not-import-apps",
      severity: "error",
      from: { path: PACKAGES_ROOT },
      to: { path: APPS_ROOT },
    },
    {
      name: "apps-do-not-import-other-apps",
      severity: "error",
      from: { path: APP_ROOT },
      to: { path: APPS_ROOT, pathNot: "^$1/" },
    },
    {
      name: "packages-imported-by-name",
      severity: "error",
      from: { path: WORKSPACE_ROOT },
      to: { path: PACKAGES_ROOT, pathNot: "^$1/", dependencyTypes: ["local"] },
    },
    {
      name: "packages-public-entry-only",
      severity: "error",
      from: { path: WORKSPACE_ROOT },
      to: { path: `${PACKAGES_ROOT}[^/]+/(?!${PACKAGE_ENTRY})`, pathNot: "^$1/" },
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
    parser: "swc",
    exclude: {
      path: EXCLUDED_PATH,
    },
    doNotFollow: {
      path: "(?:^|/)node_modules(?:/|$)",
    },
    skipAnalysisNotInRules: true,
    baseDir: __dirname,
    tsPreCompilationDeps: "specify",
    tsConfig: {
      fileName: path.join(__dirname, "apps/web/tsconfig.json"),
    },
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["types", "import", "node", "default"],
    },
  },
};
