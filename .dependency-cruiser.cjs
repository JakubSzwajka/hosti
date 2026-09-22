const path = require("node:path");

const TEST_PATH = "(^|/)(apps|packages)/[^/]+/tests/";

module.exports = {
  forbidden: [
    {
      name: "no-circular",
      severity: "error",
      from: {},
      to: { circular: true },
    },
    {
      name: "web-server-does-not-import-next-delivery",
      severity: "error",
      comment: "Server code must not depend on Next app routes or delivery components.",
      from: { path: "(^|/)apps/web/src/server/" },
      to: { path: "(^|/)apps/web/src/app/" },
    },
    {
      name: "workspace-package-specifiers-use-public-entry",
      severity: "error",
      comment: "Deep @hosti package specifiers bypass public workspace package entries.",
      from: {},
      to: {
        path: "^@hosti/[^/]+/",
        couldNotResolve: true,
      },
    },
    {
      name: "packages-use-public-entry",
      severity: "error",
      comment:
        "Code outside @hosti/shared must import its public index instead of its implementation.",
      from: { pathNot: "(^|/)packages/shared/" },
      to: {
        path: "(^|/)packages/shared/src/",
        pathNot: "(^|/)packages/shared/src/index\\.[cm]?[jt]sx?$",
      },
    },
    {
      name: "production-does-not-import-tests",
      severity: "error",
      from: { pathNot: TEST_PATH },
      to: { path: TEST_PATH },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    exclude: "^apps/web/\\.next/",
    tsConfig: {
      fileName: path.join(__dirname, "tools/playbook-checks/dependency-cruiser.tsconfig.json"),
    },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["types", "import", "node", "default"],
    },
    reporterOptions: {
      text: { highlightFocused: false },
    },
  },
};
