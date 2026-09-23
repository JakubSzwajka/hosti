# Agent instructions

Read [CONTEXT.md](./CONTEXT.md) before changing code. It defines Hosti's words and rules. See [CHECKS.md](./CHECKS.md) for what the tools enforce and what still needs review.

## Commands

This repository uses npm 11 workspaces. `packageManager` pins npm 11.19.0. Do not add another package manager or lockfile.

| Command | What it does |
| --- | --- |
| `npm ci` | Install from `package-lock.json`. In a local Git clone, `prepare` installs the pre-commit hook. It skips CI and directories without `.git`. |
| `npm run check` | Check exact pins, run Biome and ESLint, run TypeScript checks in each workspace, then Dependency Cruiser. |
| `npm run test` | Run `tests/**/*.test.mjs`, ESLint tool tests, then workspace Vitest suites. |
| `npm run build` | Build the web app. |
| `npm run acceptance` | Clone committed HEAD and run `npm ci`, check, test and build. Uncommitted changes are not included. |
| `npm run dev` | Start the Next app at `http://127.0.0.1:3000`. |
| `npm run token:new -- --name <name>` | Mint a push token locally. |
| `npm run env:check` | Inspect environment lengths and digest prefixes without printing secrets. |
| `npm run compose:up` / `npm run compose:down` | Start or stop the local Compose stack. |

Before handing off code, run `npm run check` and `npm run test`. Run `npm run build` when the change can affect the web app or its Docker image.

## Workspaces

- `apps/web` is the Next.js 15 catalog and server. Keep its routes and UI inside this app.
- `apps/cli` is the private `@hosti/cli` workspace package.
- `packages/shared` is `@hosti/shared`, the shared public package. Export through `src/index.ts`.
- Declare workspace dependencies by package name and keep their manifest version equal to the workspace version. Do not import another workspace through a relative path.
- Do not change `.dependency-cruiser.cjs` rules as part of routine feature work.

## Pins

Pin every dependency in the root and workspace manifests to an exact version. The `pins` check enforces this. `packageManager` must stay exact. `.npmrc` makes npm save exact versions. Internal dependencies use the workspace's exact version, such as `0.1.0`, not `*`.

Do not upgrade a dependency as part of unrelated work. Ask before adding, removing, or changing a dependency or the Node/npm version. `allowScripts` in the root manifest approves install scripts. Review any new script before approving it.

## Hooks

Lefthook runs `npm run check`, then `npm run test` before each commit. Fix failures. Never bypass the hook with `--no-verify`, `git commit -n`, `LEFTHOOK=0`, or `core.hooksPath`. The command policy blocks bypass attempts in Pi and Claude Code hook configurations. Do not weaken that policy.

## Environment

The web app needs `HOSTI_OWNER_PASSWORD` and `HOSTI_SECRET`. Set them in your local shell or local environment file. Never commit secrets. `.env.local` and `.env.*.local` are ignored. `HOSTI_PUBLIC_URL` should be the exact public HTTPS origin in a deployment. See README.md for deployment details.

Do not run a command that opens or migrates `data/hosti.db` unless you have checked whether the database needs a backup. See the current [STATUS.md](./STATUS.md) before database work.

## Safe without asking

- Make code changes that keep the configured checks and tests green.
- Add or improve tests without changing existing assertions.
- Fix documentation that does not change product policy.
- Tighten a check without reducing its coverage.

## Ask the owner first

- Add, remove, or upgrade dependencies, Node, or npm.
- Change product behavior, authentication, sharing, retention, data migration, or secret handling.
- Change `.dependency-cruiser.cjs`, Biome or ESLint rules, TypeScript compiler settings, hook policy, or CI gates in a way that weakens enforcement.
- Delete tests or data, run a database migration, commit, push, publish, or change branches.
