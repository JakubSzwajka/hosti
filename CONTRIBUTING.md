# Contributing to Hosti

Thanks for helping. Small, focused pull requests are the easiest to review.

## Prerequisites

- Node at the version in [`.nvmrc`](./.nvmrc).
- Corepack, which ships with Node. It installs the pnpm version pinned by
  `packageManager` in [`package.json`](./package.json).

Do not add another package manager or lockfile.

## Install

```bash
corepack enable
pnpm install --frozen-lockfile
```

In a Git clone, `prepare` also installs the pre-commit hook.

## Commands

| Command | What it does |
| --- | --- |
| `pnpm install --frozen-lockfile` | Install from `pnpm-lock.yaml`. |
| `pnpm check` | Check pins, validate the environment schema, run Biome and ESLint, typecheck all workspaces, then run Dependency Cruiser. |
| `pnpm test` | Run `tests/**/*.test.mjs`, ESLint tool tests, then workspace tests. |
| `pnpm build` | Build the web app. |
| `pnpm acceptance` | Clone committed HEAD and run frozen install, hook check, check, test, build, and Docker build. Uncommitted changes are not tested. |
| `pnpm dev` | Start the Next app at `http://127.0.0.1:3000`. |
| `pnpm token:new -- --name <name>` | Mint a push token locally. |
| `pnpm owner:hash` | Make the owner password hash for `HOSTI_OWNER_PASSWORD_HASH`. |
| `pnpm env:check` | Validate and load variables from `.env.schema` with Varlock. |
| `pnpm env:digest` | Inspect configured variable lengths and digest prefixes without printing secrets. |
| `pnpm vendor:agent-sources` | Shallow-clone the pinned Next.js source for agent reference. Not part of checks. |
| `pnpm compose:up` / `pnpm compose:down` | Start or stop the local Compose stack. |

To run Hosti locally, you need an owner hash and a secret. The
[README](./README.md#development) shows how.

## Before you open a pull request

1. [ ] `pnpm check` exits 0.
2. [ ] `pnpm test` exits 0.
3. [ ] `pnpm build` exits 0, when your change can affect the web app or its
   Docker image.
4. [ ] You updated the docs when behavior changed for users.

[CHECKS.md](./CHECKS.md) lists what the tools enforce and what still needs a
reviewer.

## The pre-commit hook

Lefthook runs `pnpm check` and then `pnpm test` before each commit. Fix the
failures. Bypassing the hook is not allowed: no `--no-verify`, no `git commit -n`,
no `LEFTHOOK=0` and no `core.hooksPath`. A pull request that weakens a check to
make it pass will not be merged.

## Dependencies

Every dependency is pinned to an exact version or a full Git commit SHA.
`pnpm check` enforces it, and it rejects `workspace:*`. Workspace dependencies
use `workspace:<exact version>`.

Ask in an issue before you add, remove or change a dependency, Node, pnpm or
Turbo. Do not upgrade a dependency as part of unrelated work. `pnpm-workspace.yaml`
holds the install policy, including a one-day minimum release age and an
explicit list of packages allowed to run install scripts.

## Where code goes

[AGENTS.md](./AGENTS.md) describes the workspaces, the layers inside `apps/web`
and the rules Dependency Cruiser enforces. [CONTEXT.md](./CONTEXT.md) defines
Hosti's words and rules. Use those words in code, tests and docs. Keep tests in
the `src/tests/` directory of the workspace they test.

## Pull requests

- One change per pull request. Keep it small.
- Say what changed and why, and which checks you ran.
- Report security problems privately, as [SECURITY.md](https://github.com/JakubSzwajka/hosti/blob/main/SECURITY.md) says. Never
  use a public issue for them.
