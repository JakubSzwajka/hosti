# Checks

## What is enforced

| Rule | Tool | Config file |
| --- | --- | --- |
| Dependency specs and `packageManager` use exact versions or a full Git commit SHA | `scripts/check-exact-pins.mjs` via `npm run pins` | `package.json`, workspace `package.json` files, `scripts/check-exact-pins.mjs` |
| JavaScript and TypeScript follow the configured formatter and lint rules, including two-space indentation, 100-column width, no `export *`, no non-null assertions, kebab-case filenames or export-name filenames, and the configured recommended Biome rules | Biome `ci` | `biome.json` |
| ESLint's recommended codebase AI rules pass | ESLint | `eslint.config.mjs` |
| Each workspace TypeScript project passes with strict mode, unchecked index access, exact optional properties, explicit overrides, verbatim module syntax, and erasable syntax | TypeScript | `tsconfig.base.json`, `apps/*/tsconfig.json`, `packages/*/tsconfig.json` |
| Imports have no cycles | Dependency Cruiser `no-cycles` | `.dependency-cruiser.cjs` |
| Web server modules do not import Next delivery routes | Dependency Cruiser `web-server-does-not-import-next-delivery` | `.dependency-cruiser.cjs` |
| Deep `@hosti/*` package imports do not resolve | Dependency Cruiser `no-unresolved-deep-package-imports` | `.dependency-cruiser.cjs` |
| Code outside `@hosti/cli` uses its public entry and does not import its implementation | Dependency Cruiser `cli-public-entry-only`, `cli-entry-follows-package-exports` | `.dependency-cruiser.cjs` |
| Code outside `@hosti/shared` uses its public entry and does not import its implementation | Dependency Cruiser `shared-public-entry-only` | `.dependency-cruiser.cjs` |
| Workspace code outside `apps/web` does not import web source | Dependency Cruiser `web-source-is-workspace-private` | `.dependency-cruiser.cjs` |
| Production code does not import tests | Dependency Cruiser `production-does-not-import-tests` | `.dependency-cruiser.cjs` |
| Imports resolve, except the generated Next declaration file | Dependency Cruiser `no-unresolved-imports` | `.dependency-cruiser.cjs` |
| Hook policy and exact-pin checker cases pass | Node test runner over `tests/**/*.test.mjs` | `package.json`, `tests/*.test.mjs` |
| ESLint configuration tests pass | Node test runner | `tools/eslint/*.test.mjs`, `package.json` |
| Workspace behavior tests pass | Vitest in each workspace | `apps/cli/package.json`, `apps/web/package.json`, Vitest configuration files |

`npm run check` runs pins, Biome, ESLint, workspace TypeScript checks, and Dependency Cruiser. `npm run test` runs the Node test suites and workspace Vitest suites.

## Review only

Tools do not decide whether:

- Hosti's vocabulary and product rules in `CONTEXT.md` still match the behavior.
- A comment explains why the code exists rather than restating it.
- A change preserves privacy, authorization, sharing, retention, and secret-handling intent beyond the specific tests.
- Tests cover meaningful cases or assert the right product outcome.
- A module boundary, folder layout, or abstraction is the right one when imports still pass the configured rules.
- A TypeScript cast or suppression is justified.
- A requested behavior has been documented for operators and users.
