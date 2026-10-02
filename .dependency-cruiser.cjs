const path = require("node:path");
const { layout } = require("@house-rules/rules/dependency-cruiser");

const CLI_ROOT = "^apps/cli(?:/|$)";
const CLI_SOURCE_ROOT = "^apps/cli/src(?:/|$)";
const CLI_ENTRY = "^apps/cli/src/index[.][cm]?[jt]sx?$";
const CLI_DELIVERY_ROOT = "^apps/cli/src/delivery(?:/|$)";
const WEB_NEXT_ENV_DECLARATION = "^apps/web/next-env[.]d[.]ts$";
const WEB_DELIVERY_ROOT = "^apps/web/src/app(?:/|$)";
const WEB_SERVER_ROOT = "^apps/web/src/server(?:/|$)";
const WEB_DELIVERY_SERVER_GLUE =
  "^apps/web/src/server/(?:api-responses[.]ts|config[.]ts|errors[.]ts|runtime[.]ts|auth/(?:admin|cookie)[.]ts|serving/)";
const WEB_RUN_USE_CASE = "^apps/web/src/app/_http/run-use-case[.]ts$";
const WEB_SERVER_RUNTIME = "^apps/web/src/server/runtime[.]ts$";
const WEB_TEST_SERVER_ALLOWLIST =
  "^apps/web/src/server/(?:runtime[.]ts|config[.]ts|auth/(?:config|cookie)[.]ts)$";
const WEB_DOMAIN_ADAPTERS =
  "^apps/web/src/server/(?:catalog[.]ts|db(?:/|$)|storage(?:/|$)|sharing[.]ts|push[.]ts|retention[.]ts|remove-bundle[.]ts|push-tokens[.]ts|share-pin[.]ts|minted-secret[.]ts|auth/(?:session|rate-limit)[.]ts)$";
const TEST_PATH = "(?:^|/)(?:tests?|__tests__)(?:/|$)|[.](?:test|spec)[.][^/]+$";
const NEXT_BUILD_OUTPUT = "(?:^|/)[.]next(?:/|$)";

const HOSTI_RULES = [
  {
    name: "delivery-runtime-only-from-run-use-case",
    severity: "error",
    comment:
      "Only run-use-case.ts may import runtime.ts; routes and pages call use-cases through it.",
    from: { path: WEB_DELIVERY_ROOT, pathNot: WEB_RUN_USE_CASE },
    to: { path: WEB_SERVER_RUNTIME },
  },
  {
    name: "delivery-reaches-domain-through-use-cases",
    severity: "error",
    comment: "Delivery must call web use-cases instead of server domain adapters.",
    from: { path: WEB_DELIVERY_ROOT },
    to: { path: WEB_DOMAIN_ADAPTERS },
  },
  {
    name: "web-tests-import-only-server-test-glue",
    severity: "error",
    comment:
      "Web tests seed through src/tests/support.ts and may import only the explicit server glue allowlist.",
    from: { path: "^apps/web/src/tests(?:/|$)" },
    to: { path: WEB_SERVER_ROOT, pathNot: WEB_TEST_SERVER_ALLOWLIST },
  },
  {
    name: "cli-public-entry-only",
    severity: "error",
    comment: "Code outside @hosti/cli must import its public entry, not its implementation.",
    from: { pathNot: CLI_ROOT },
    to: { path: CLI_SOURCE_ROOT, pathNot: CLI_ENTRY },
  },
  {
    name: "cli-entry-follows-package-exports",
    severity: "error",
    comment: "@hosti/cli has no package export; non-local imports may not resolve to its entry.",
    from: { pathNot: CLI_ROOT },
    to: { path: CLI_ENTRY, dependencyTypesNot: ["local"] },
  },
];

function houseRule(config, name) {
  const found = config.forbidden.find((rule) => rule.name === name);
  if (found === undefined) throw new Error(`house-rules layout() has no rule named ${name}`);
  return found;
}

function withPattern(pattern, extra) {
  return [pattern, extra].flat();
}

function hostiLayout() {
  // Next.js owns the web delivery folder name, so the house delivery layer is `app`.
  const config = layout({
    scope: "@hosti/",
    layers: { delivery: "app" },
    testsDir: "tests",
    appEntryFiles: ["index.ts"],
  });

  // The CLI has no Next app, so its delivery layer keeps the house folder name.
  const appCodeInLayers = houseRule(config, "app-code-in-layers");
  appCodeInLayers.module.pathNot = [...appCodeInLayers.module.pathNot, "^apps/cli/src/delivery/"];
  const deliveryToServer = houseRule(config, "delivery-does-not-import-server");
  deliveryToServer.from.path = withPattern(deliveryToServer.from.path, CLI_DELIVERY_ROOT);
  const serverToDelivery = houseRule(config, "server-does-not-import-delivery");
  serverToDelivery.to.path = withPattern(serverToDelivery.to.path, CLI_DELIVERY_ROOT);
  const useCasesOuter = houseRule(config, "use-cases-do-not-import-outer-layers");
  useCasesOuter.to.path = withPattern(useCasesOuter.to.path, CLI_DELIVERY_ROOT);

  // Next routes may use the web server glue named in AGENTS.md; every other server edge stays banned.
  deliveryToServer.to.pathNot = WEB_DELIVERY_SERVER_GLUE;

  // Scripts and configs outside src/ must not import tests either.
  houseRule(config, "production-does-not-import-tests").from = { pathNot: TEST_PATH };

  // next-env.d.ts references generated .next types that are excluded from the cruise.
  houseRule(config, "no-unresolved-imports").from = { pathNot: WEB_NEXT_ENV_DECLARATION };

  config.forbidden.push(...HOSTI_RULES);

  const { enhancedResolveOptions } = config.options;
  config.options = {
    ...config.options,
    exclude: { path: withPattern(config.options.exclude.path, NEXT_BUILD_OUTPUT) },
    baseDir: __dirname,
    tsConfig: { fileName: path.join(__dirname, "apps/web/tsconfig.json") },
    enhancedResolveOptions: {
      ...enhancedResolveOptions,
      // `types` first resolves @hosti/catalog/schema to its public entry, as its exports map declares.
      conditionNames: ["types", ...enhancedResolveOptions.conditionNames],
    },
  };
  return config;
}

module.exports = hostiLayout();
