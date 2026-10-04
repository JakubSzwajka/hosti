# Checks

## What is enforced

| Rule | Tool | Config file |
| --- | --- | --- |
| Dependency specs and `packageManager` use exact versions or a full Git commit SHA; workspace specs use `workspace:<exact>` | `house-rules-pins` from `@house-rules/rules` via `pnpm pins` | `package.json`, workspace manifests, `pnpm-workspace.yaml` |
| Dependencies are at least one day old unless an exact version is excluded | pnpm `minimumReleaseAge` | `pnpm-workspace.yaml` |
| Install scripts have an explicit allow/deny decision | pnpm `allowBuilds` | `pnpm-workspace.yaml` |
| Environment variables are declared, typed, and sensitive values are masked | Varlock `load` via `pnpm env:check` | `.env.schema`, `.varlock/config.json` |
| JavaScript and TypeScript follow the configured formatter and lint rules, including two-space indentation, 100-column width, no `export *`, no non-null assertions, kebab-case filenames or export-name filenames, and the configured recommended Biome rules | Biome `ci` | `biome.json`, which extends `@house-rules/rules/biome` |
| Comments are one-line whys beside the code they explain | ESLint `house-rules/comment-discipline` | `eslint.config.mjs` |
| Relative Markdown links, images, and definitions point at a path Git tracks, with exact case | ESLint `house-rules/no-broken-relative-links` | `eslint.config.mjs` |
| CSS in `apps/web/src/app/_styles` and `landing/styles` takes colours from design tokens; only listed alpha fades are allowed | ESLint `house-rules/design-no-raw-color` | `eslint.config.mjs`, `apps/web/src/app/_styles/hosti.css`, `landing/styles/tokens.css` |
| Every `var(--name)` in that CSS has a definition in the token file or the same file, except `--bar`, which the landing page sets inline | ESLint `house-rules/design-no-unknown-token` | `eslint.config.mjs` |
| Web radii come from the radius scale, shadows are `none`, and transitions and animations use `var(--t…)` | ESLint `house-rules/design-scale-value` | `eslint.config.mjs` |
| Strings in `apps/web/src` hold no raw colour, except the standalone not-found page in `respond.ts` | ESLint `house-rules/design-no-raw-color-literal` | `eslint.config.mjs` |
| The pin gate in `packages/serving/src/gate-page.ts` sets `--paper`, `--card`, `--ink`, `--muted`, `--line`, `--line-soft`, `--pop`, and `--danger` to the same values as `hosti.css` | Vitest `apps/web/src/tests/gate-page-tokens.test.ts` | `apps/web/src/tests/gate-page-tokens.test.ts`, `apps/web/src/app/_styles/hosti.css` |
| Web framework, CLI, and shared projects pass with patched TypeScript 7.0.2, with Effect diagnostics off in web and CLI; web use-cases pass separately with the diagnostics on | TypeScript through Turbo `typecheck` | `apps/web/tsconfig.json`, `apps/web/tsconfig.effect.json`, workspace manifests, `turbo.json` |
| Each workspace TypeScript project passes with strict mode, unchecked index access, exact optional properties, explicit overrides, verbatim module syntax, and erasable syntax | TypeScript via Turbo `typecheck` | `tsconfig.base.json` (extends `@house-rules/rules/tsconfig/effect.json`), `apps/*/tsconfig.json`, `packages/*/tsconfig.json`, `turbo.json` |
| Effect values must be used or yielded, including inside Vitest callbacks | Effect diagnostics `floatingEffect`, `floatingEffectInVitest` | `tsconfig.base.json` |
| Effect failure and catch channels use typed errors; `Effect.gen` does not use try/catch | Effect diagnostics `globalErrorInEffectFailure`, `globalErrorInEffectCatch`, `unknownInEffectCatch`, `anyUnknownInErrorContext`, `tryCatchInEffectGen` | `tsconfig.base.json` |
| Effect code does not run Effects inside Effects or return an Effect from a generator | Effect diagnostics `runEffectInsideEffect`, `returnEffectInGen` | `tsconfig.base.json` |
| Services handle required contexts and errors without leaking requirements or asserting unsafely | Effect diagnostics `missingEffectContext`, `missingEffectError`, `missingLayerContext`, `leakingRequirements`, `unsafeEffectTypeAssertion` | `tsconfig.base.json` |
| Effect code avoids async functions, promises, global APIs, and Node built-ins that Effect replaces | Effect diagnostics `asyncFunction`, `newPromise`, `global*`, `cryptoRandomUUID*`, `nodeBuiltinImport` | `tsconfig.base.json` |
| Effect code avoids synchronous Schema decoding and `instanceof` checks on schemas | Effect diagnostics `schemaSyncInEffect`, `instanceOfSchema` | `tsconfig.base.json` |
| Effect packages and web use-cases run the full configured diagnostics block at error severity | Patched TypeScript 7.0.2 via `@effect/tsgo` | `tsconfig.base.json`, `apps/web/tsconfig.effect.json`, `packages/*/tsconfig.json` |
| Imports have no cycles | Dependency Cruiser `no-cycles` from the house-rules `layout()` preset | `.dependency-cruiser.cjs` |
| Packages do not import apps; apps do not import other apps; cross-workspace package imports use package names and package public entries | Dependency Cruiser workspace rules | `.dependency-cruiser.cjs` |
| App server modules do not import delivery code: web `src/app` or CLI `src/delivery` | Dependency Cruiser `server-does-not-import-delivery` | `.dependency-cruiser.cjs` |
| Delivery code imports only the listed web server glue: `api-responses.ts`, `config.ts`, `errors.ts`, `auth/admin.ts`, `auth/cookie.ts`, and `serving/**` | Dependency Cruiser `delivery-does-not-import-server` | `.dependency-cruiser.cjs` |
| Only `apps/web/src/app/_http/run-use-case.ts` may import `runtime.ts`; routes and pages call use-cases through it | Dependency Cruiser `delivery-runtime-only-from-run-use-case` | `.dependency-cruiser.cjs` |
| Web use-cases do not import delivery or server modules | Dependency Cruiser `use-cases-do-not-import-outer-layers` | `.dependency-cruiser.cjs` |
| A use-case does not import another use-case | Dependency Cruiser `use-cases-do-not-import-use-cases` | `.dependency-cruiser.cjs` |
| Delivery reaches product actions through web use-cases instead of server domain adapters | Dependency Cruiser `delivery-reaches-domain-through-use-cases` | `.dependency-cruiser.cjs` |
| Web tests import only the server glue allowlist and seed state through `apps/web/src/tests/support.ts` | Dependency Cruiser `web-tests-import-only-server-test-glue` | `.dependency-cruiser.cjs` |
| Deep `@hosti/*` package imports do not resolve | Dependency Cruiser `no-unresolved-deep-package-imports` | `.dependency-cruiser.cjs` |
| Code outside `@hosti/cli` uses its public entry and does not import its implementation | Dependency Cruiser CLI rules | `.dependency-cruiser.cjs` |
| Production code does not import tests | Dependency Cruiser `production-does-not-import-tests` | `.dependency-cruiser.cjs` |
| Test files sit directly in a `tests/` folder under their workspace's `src/` | Dependency Cruiser `tests-live-in-tests-dir` | `.dependency-cruiser.cjs` |
| Tests do not import `packages/*/src/internal/` | Dependency Cruiser `tests-do-not-import-internals` | `.dependency-cruiser.cjs` |
| App code under `src/` sits in a layer folder (`app`, `delivery` for the CLI, `server`, `use-cases`) or is the `src/index.ts` entry | Dependency Cruiser `app-code-in-layers` | `.dependency-cruiser.cjs` |
| No file or folder under `apps/` or `packages/` is named `utils`, `helpers`, or `misc` | Dependency Cruiser `no-ownerless-files` | `.dependency-cruiser.cjs` |
| Imports resolve, except the generated Next declaration file | Dependency Cruiser `no-unresolved-imports` | `.dependency-cruiser.cjs` |
| Hook policy, CLI package, landing, and release workflow cases pass | Node test runner over `tests/**/*.test.mjs` | `package.json`, `tests/*.test.mjs` |
| ESLint configuration tests pass | Node test runner | `tools/eslint/*.test.mjs`, `package.json` |
| Workspace behavior tests pass; web tests seed through `apps/web/src/tests/support.ts` | Vitest through Turbo `test` | `apps/cli/package.json`, `apps/web/package.json`, Vitest configuration files |

`pnpm check` runs pins, Varlock environment validation, Biome, ESLint, workspace typechecks through Turbo, and Dependency Cruiser. `pnpm test` runs the Node test suites and workspace tests through Turbo. Turbo caching is off for both tasks. The vendored Next.js source under `.agent_sources/` is reference material and is excluded from Biome, ESLint, and Dependency Cruiser.

`pnpm-workspace.yaml` sets `minimumReleaseAge: 1440`; a version younger than one day needs an exact-version exclusion. Its `allowBuilds` map gives every install-script package an explicit decision. `better-sqlite3` and `esbuild` are enabled for the native database binding and Vitest platform binary. `@swc/core` is denied because its install script adds only a wasm fallback. `lefthook` is disabled because hook setup runs explicitly. TypeScript 6.0.3 is assigned to `@house-rules/rules`, for its ESLint parser, by `packageExtensions`. The root `prepare` script patches the TypeScript 7 compiler before hook installation. Every workspace, web included, uses that one patched compiler. Next.js 16.3.6 runs it during `next build`. `apps/web/tsconfig.json` and `apps/cli/tsconfig.json` turn the Effect diagnostics off; `apps/web/tsconfig.effect.json` keeps them on for `src/use-cases/**`.

## Review only

Tools do not decide whether:

- Hosti's vocabulary and product rules in `CONTEXT.md` still match the behavior.
- A comment explains why the code exists rather than restating it.
- A change preserves privacy, authorization, sharing, retention, and secret-handling intent beyond the specific tests.
- Tests cover meaningful cases or assert the right product outcome.
- A module boundary, folder layout, or abstraction is the right one when imports still pass the configured rules.
- A TypeScript cast or suppression is justified.
- The standalone pages still look like Hosti. No lint rule checks the pin gate in `packages/serving/src/gate-page.ts`, but `gate-page-tokens.test.ts` holds its token values to `hosti.css`. The not-found page in `respond.ts` uses Hosti's paper, ink, and surface values as raw literals, is exempt from `design-no-raw-color-literal`, and no test ties it to `hosti.css`.
- A requested behavior has been documented for operators and users.
