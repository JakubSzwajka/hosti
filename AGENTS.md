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
- `packages/shared` is `@hosti/shared`, the shared public package. Export through `src/index.ts`.
- Declare workspace dependencies by package name and use `workspace:<exact version>`. Do not import another workspace through a relative path.
- Do not change `.dependency-cruiser.cjs` rules as part of routine feature work.

## Pins and install policy

Pin every dependency in the root and workspace manifests to an exact version or a full Git commit SHA. The `pins` check enforces this and rejects `workspace:*`. `packageManager` must stay exact. pnpm writes exact versions and `workspace:<exact version>` through `pnpm-workspace.yaml`.

Do not upgrade a dependency as part of unrelated work. Ask before adding, removing, or changing a dependency, Node, pnpm, or Turbo.

`pnpm-workspace.yaml` holds the install policy. `minimumReleaseAge: 1440` refuses versions published less than one day ago. If a pinned version is too new, wait or ask before adding an exact-version `minimumReleaseAgeExclude` entry. `allowBuilds` names every dependency with an install script. Keep approvals explicit: `better-sqlite3` is enabled for the native SQLite binding, and `esbuild` for Vitest's platform binary. `lefthook` is disabled because hook setup runs explicitly. `sharp` has no install script; `unrs-resolver` and `@swc/core` are not dependencies. Review any new build script before approving it. `packageExtensions` is unnecessary unless an observed dependency mismatch requires one.

## Hooks

Lefthook runs `pnpm check`, then `pnpm test` before each commit. Fix failures. Never bypass the hook with `--no-verify`, `git commit -n`, `LEFTHOOK=0`, or `core.hooksPath`. The command policy blocks bypass attempts in Pi and Claude Code hook configurations. Do not weaken that policy.

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
