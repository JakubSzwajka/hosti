# Checks

## What is enforced

| Rule | Tool | Config file |
| --- | --- | --- |
| Dependency specs and `packageManager` use exact versions or a full Git commit SHA; workspace specs use `workspace:<exact>` | `scripts/check-exact-pins.mjs` via `pnpm pins` | `package.json`, workspace manifests, `pnpm-workspace.yaml`, `scripts/check-exact-pins.mjs` |
| Dependencies are at least one day old unless an exact version is excluded | pnpm `minimumReleaseAge` | `pnpm-workspace.yaml` |
| Install scripts have an explicit allow/deny decision | pnpm `allowBuilds` | `pnpm-workspace.yaml` |
| Environment variables are declared, typed, and sensitive values are masked | Varlock `load` via `pnpm env:check` | `.env.schema`, `.varlock/config.json` |
| JavaScript and TypeScript follow the configured formatter and lint rules, including two-space indentation, 100-column width, no `export *`, no non-null assertions, kebab-case filenames or export-name filenames, and the configured recommended Biome rules | Biome `ci` | `biome.json` |
| ESLint's recommended codebase AI rules pass | ESLint | `eslint.config.mjs` |
| Web framework, CLI, and shared projects pass with TypeScript 5.9.3; web use-cases pass separately with patched TypeScript 7.0.2 | TypeScript through Turbo `typecheck` | `apps/web/tsconfig.json`, `apps/web/tsconfig.effect.json`, workspace manifests, `turbo.json` |
| Each workspace TypeScript project passes with strict mode, unchecked index access, exact optional properties, explicit overrides, verbatim module syntax, and erasable syntax | TypeScript via Turbo `typecheck` | `tsconfig.base.json`, `apps/*/tsconfig.json`, `packages/*/tsconfig.json`, `turbo.json` |
| Effect values must be used or yielded, including inside Vitest callbacks | Effect diagnostics `floatingEffect`, `floatingEffectInVitest` | `tsconfig.base.json` |
| Effect failure and catch channels use typed errors; `Effect.gen` does not use try/catch | Effect diagnostics `globalErrorInEffectFailure`, `globalErrorInEffectCatch`, `unknownInEffectCatch`, `anyUnknownInErrorContext`, `tryCatchInEffectGen` | `tsconfig.base.json` |
| Effect code does not run Effects inside Effects or return an Effect from a generator | Effect diagnostics `runEffectInsideEffect`, `returnEffectInGen` | `tsconfig.base.json` |
| Services handle required contexts and errors without leaking requirements or asserting unsafely | Effect diagnostics `missingEffectContext`, `missingEffectError`, `missingLayerContext`, `leakingRequirements`, `unsafeEffectTypeAssertion` | `tsconfig.base.json` |
| Effect code avoids async functions, promises, global APIs, and Node built-ins that Effect replaces | Effect diagnostics `asyncFunction`, `newPromise`, `global*`, `cryptoRandomUUID*`, `nodeBuiltinImport` | `tsconfig.base.json` |
| Effect code avoids synchronous Schema decoding and `instanceof` checks on schemas | Effect diagnostics `schemaSyncInEffect`, `instanceOfSchema` | `tsconfig.base.json` |
| Effect packages and web use-cases run the full configured diagnostics block at error severity | Patched TypeScript 7.0.2 via `@effect/tsgo` | `tsconfig.base.json`, `apps/web/tsconfig.effect.json`, `packages/*/tsconfig.json` |
| Imports have no cycles | Dependency Cruiser `no-cycles` | `.dependency-cruiser.cjs` |
| Packages do not import apps; apps do not import other apps; cross-workspace package imports use package names and package public entries | Dependency Cruiser workspace rules | `.dependency-cruiser.cjs` |
| Web server modules do not import Next delivery routes | Dependency Cruiser `web-server-does-not-import-next-delivery` | `.dependency-cruiser.cjs` |
| Deep `@hosti/*` package imports do not resolve | Dependency Cruiser `no-unresolved-deep-package-imports` | `.dependency-cruiser.cjs` |
| Code outside `@hosti/cli` uses its public entry and does not import its implementation | Dependency Cruiser CLI rules | `.dependency-cruiser.cjs` |
| Production code does not import tests | Dependency Cruiser `production-does-not-import-tests` | `.dependency-cruiser.cjs` |
| Imports resolve, except the generated Next declaration file | Dependency Cruiser `no-unresolved-imports` | `.dependency-cruiser.cjs` |
| Hook policy and exact-pin checker cases pass | Node test runner over `tests/**/*.test.mjs` | `package.json`, `tests/*.test.mjs` |
| ESLint configuration tests pass | Node test runner | `tools/eslint/*.test.mjs`, `package.json` |
| Workspace behavior tests pass | Vitest through Turbo `test` | `apps/cli/package.json`, `apps/web/package.json`, Vitest configuration files |

`pnpm check` runs pins, Varlock environment validation, Biome, ESLint, workspace typechecks through Turbo, and Dependency Cruiser. `pnpm test` runs the Node test suites and workspace tests through Turbo. Turbo caching is off for both tasks. The vendored Next.js source under `.agent_sources/` is reference material and is excluded from Biome, ESLint, and Dependency Cruiser.

`pnpm-workspace.yaml` sets `minimumReleaseAge: 1440`; a version younger than one day needs an exact-version exclusion. Its `allowBuilds` map gives every install-script package an explicit decision. `better-sqlite3` and `esbuild` are enabled for the native database binding and Vitest platform binary. `@swc/core` is denied because its install script adds only a wasm fallback. `lefthook` is disabled because hook setup runs explicitly. TypeScript 6.0.3 is assigned to the ESLint comment plugin by `packageExtensions`. The root `prepare` script patches the TypeScript 7 compiler before hook installation. Web keeps TypeScript 5.9.3 for Next.js 15.5.25; only `src/use-cases/**` uses the patched compiler.

## Review only

Tools do not decide whether:

- Hosti's vocabulary and product rules in `CONTEXT.md` still match the behavior.
- A comment explains why the code exists rather than restating it.
- A change preserves privacy, authorization, sharing, retention, and secret-handling intent beyond the specific tests.
- Tests cover meaningful cases or assert the right product outcome.
- A module boundary, folder layout, or abstraction is the right one when imports still pass the configured rules.
- A TypeScript cast or suppression is justified.
- A requested behavior has been documented for operators and users.
