# Agent instructions

Read [CONTEXT.md](./CONTEXT.md) before changing code. It defines Hosti's words and rules. See [CHECKS.md](./CHECKS.md) for what the tools enforce and what still needs review.

## Commands

This repository uses pnpm 12 workspaces and Turborepo. `packageManager` pins pnpm 12.5.1. Use Corepack and do not add another package manager or lockfile.

| Command | What it does |
| --- | --- |
| `corepack enable` | Enable Corepack once on the machine. |
| `pnpm install --frozen-lockfile` | Install from `pnpm-lock.yaml`. In a local Git clone, `prepare` installs the pre-commit hook. It skips CI and directories without `.git`. |
| `pnpm check` | Check pins, validate the environment schema, run Biome and ESLint, typecheck all workspaces through Turbo, then run Dependency Cruiser. |
| `pnpm test` | Run `tests/**/*.test.mjs`, ESLint tool tests, then workspace tests through Turbo. |
| `pnpm build` | Build the web app. |
| `pnpm acceptance` | Clone committed HEAD and run frozen install, hook check, check, test, build, and Docker build. Uncommitted changes are not tested. |
| `pnpm dev` | Start the Next app at `http://127.0.0.1:3000`. |
| `pnpm token:new -- --name <name>` | Mint a push token locally. |
| `pnpm env:check` | Validate and load variables from `.env.schema` with Varlock. |
| `pnpm env:digest` | Inspect configured variable lengths and digest prefixes without printing secrets. |
| `pnpm vendor:agent-sources` | Shallow-clone the pinned Next.js source for agent reference. Not part of checks. |
| `pnpm compose:up` / `pnpm compose:down` | Start or stop the local Compose stack. |

Before handing off code, run `pnpm check` and `pnpm test`. Run `pnpm build` when a change can affect the web app or its Docker image.

## Workspaces

- `apps/web` is the Next.js 15 catalog and server. Keep its routes and UI inside this app.
- `apps/cli` is the private `@hosti/cli` workspace package.
- `packages/bundles` is `@hosti/bundles`, the Effect-backed bundle operations capability.
- `packages/shared` is `@hosti/shared`, the shared public package. Export through `src/index.ts`.
- `packages/catalog` is `@hosti/catalog`, the Effect-backed SQLite catalog. Export through `src/index.ts`.
- `packages/identity` is `@hosti/identity`, the Effect-backed identity and authentication capability. Export through `src/index.ts`.
- `packages/storage` is `@hosti/storage`, the Effect-backed bundle storage capability. Export through `src/index.ts`.
- `packages/serving` is `@hosti/serving`, the Effect-backed bundle-serving capability.
- Declare workspace dependencies by package name and use `workspace:<exact version>`. Do not import another workspace through a relative path.
- Do not change `.dependency-cruiser.cjs` rules as part of routine feature work.

## Layers inside apps/web

- `src/app` is delivery. It owns Next routes, pages, and React UI. A route is an entry point: it reads HTTP or Next inputs, applies auth/HTTP glue, calls a use-case, and maps the result to a response or page.
- `src/use-cases` holds one `Effect.fn` per product action. Use-cases compose public `@hosti/*` package operations and return typed failures. They do not import Next, `Request`/`Response`, or `src/server`.
- `src/server` holds the Node layers, HTTP glue, `runtime.ts` and the single `ManagedRuntime`, plus the domain adapters retained for existing tests.
- Delivery calls use-cases through `src/app/_http/run-use-case.ts`, which uses `runtime.ts`. Do not run Effects from a route or page. Delivery may import `server/auth/admin.ts`, `server/auth/cookie.ts`, `server/config.ts`, `server/api-responses.ts`, `server/errors.ts`, and `server/serving/**` for Next, HTTP, configuration, and Node serving glue. It may import `@hosti/*` exports directly for constants and pure helpers.
- Delivery must not import server domain adapters for catalog, database, storage, sharing, push, retention, bundle removal, push tokens, share pins, minted secrets, or auth sessions/rate limits. Those adapters stay in `src/server` for the existing tests, not for app product flows.

Dependency Cruiser enforces the three layer rules: `use-cases-do-not-import-outer-layers`, `server-does-not-import-delivery`, and `delivery-reaches-domain-through-use-cases`.

## Pins and install policy

Pin every dependency in the root and workspace manifests to an exact version or a full Git commit SHA. The `pins` check enforces this and rejects `workspace:*`. `packageManager` must stay exact. pnpm writes exact versions and `workspace:<exact version>` through `pnpm-workspace.yaml`.

Do not upgrade a dependency as part of unrelated work. Ask before adding, removing, or changing a dependency, Node, pnpm, or Turbo.

`pnpm-workspace.yaml` holds the install policy. `minimumReleaseAge: 1440` refuses versions published less than one day ago. If a pinned version is too new, wait or ask before adding an exact-version `minimumReleaseAgeExclude` entry. `allowBuilds` names every dependency with an install script. Keep approvals explicit: `better-sqlite3` is enabled for the native SQLite binding, and `esbuild` for Vitest's platform binary. `@swc/core` is denied because its script only adds a wasm fallback; its native binary is optional. `lefthook` is disabled because hook setup runs explicitly. Review any new build script before approving it. `packageExtensions` gives the ESLint comment plugin its own TypeScript 6.0.3 dependency.

## Hooks

Lefthook runs `pnpm check`, then `pnpm test` before each commit. Fix failures. Never bypass the hook with `--no-verify`, `git commit -n`, `LEFTHOOK=0`, or `core.hooksPath`. The command policy blocks bypass attempts in Pi and Claude Code hook configurations. Do not weaken that policy.

## Effect

Before editing Effect code, read `effect/AGENTS.md` and the docs under `effect/ai-docs/` in an installed workspace copy, such as `packages/storage/node_modules/effect/AGENTS.md`. pnpm may not install `effect` at the repo root. Read `.agent_sources/github.com/Effect-TS/effect` for source examples; run `pnpm vendor:agent-sources` if that mirror is missing. Follow `.agents/skills/add-an-effect-module/SKILL.md` when adding a module.

Effect packages live under `packages/` and declare `effect`. They use TypeScript 7.0.2 patched by `@effect/tsgo` 0.45.0. Root `prepare` runs `effect-tsgo patch` before hook setup. Keep `effect`, `@effect/vitest`, and any other `@effect/*` runtime package on the same exact version. Never lower an Effect diagnostic below `error` to make a change pass.

Next.js 15.5.25 rejects TypeScript 7, so `apps/web`, `apps/cli`, and `packages/shared` keep TypeScript 5.9.3 unless they pass Effect diagnostics unchanged. Web use-cases get a separate check through `apps/web/tsconfig.effect.json`, using the patched root compiler. Keep `src/app`, React, and route handlers out of that project. Dependency Cruiser uses SWC to parse TypeScript 7, and the comment plugin uses its TypeScript 6.0.3 extension.

## Environment

`.env.schema` is the source of truth for environment variables read by the apps. `pnpm env:check` validates and loads them; set secrets in your shell or an ignored local env file. The owner password and signing secret stay optional in the schema, but the app refuses admin pages until both are set. Never commit secrets. `.env`, `.env.local`, and `.env.*.local` are ignored. `HOSTI_PUBLIC_URL` should be the exact public HTTPS origin in a deployment. Use `pnpm env:digest` to inspect the configured environment without printing secret values. See README.md for deployment details.

Do not run a command that opens or migrates `data/hosti.db` unless you have checked whether the database needs a backup. See the current [STATUS.md](./STATUS.md) before database work.

## Safe without asking

- Make code changes that keep the configured checks and tests green.
- Add or improve tests without changing existing assertions.
- Fix documentation that does not change product policy.
- Tighten a check without reducing its coverage.

## Ask the owner first

- Add, remove, or upgrade dependencies, Node, pnpm, or Turbo.
- Change product behavior, authentication, sharing, retention, data migration, or secret handling.
- Change `.dependency-cruiser.cjs`, Biome or ESLint rules, TypeScript compiler settings, hook policy, or CI gates in a way that weakens enforcement.
- Delete tests or data, run a database migration, commit, push, publish, or change branches.
