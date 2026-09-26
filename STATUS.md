# Hosti continuation status

## Where things stand

The "CLI install and browser-approved login" spec
(`.pi/specs/2026-09-26_hosti-cli-browser-login/`) is built in two parts.

1. Server, committed as `0d4f653`: push token scopes and schema 4, agent
   connections in server memory, the `/connect/<id>` approval page, the
   `/api/v1/agent-authorizations` and `/api/v1/whoami` routes, scope checks on
   every `/api/v1/bundles` route, and the onboarding panel that leads with the
   install and login commands. Minting by hand on `/tokens` is gone; the
   server-shell `pnpm token:new` remains, with `--allow-delete`.
2. CLI, distribution, skill and docs, in the working tree and not committed:
   `hosti login`, `hosti whoami` and `hosti logout`; the compiled
   `hosti-cli.tgz` pack; the `cli-v*` release workflow; the root packaging
   test; the `hosti-publish` skill on the CLI; and CONTEXT.md, README.md and
   this file.

## What is left

- The repository is private, so the install command
  `npm install -g https://github.com/JakubSzwajka/hosti/releases/latest/download/hosti-cli.tgz`
  does not work yet. The operator decided to make it public; nobody has.
- No CLI release is cut. The first one is a pushed `cli-v0.1.0` tag, which runs
  `.github/workflows/release-cli.yml`. Until then, pack locally with
  `pnpm --filter @hosti/cli run pack:tgz`.
- Accepted risk, 2026-09-26: approval takes no password when a session exists.
  A bundle's JavaScript runs on the catalog's origin, so while the owner is
  logged in, a bundle opened at `/v/` could approve its own agent connection.
  Serving `/v/` from a second origin is the planned fix. Until then the
  `/tokens` list is where an unexpected token shows up.
- `apps/web/src/app/b/[slug]/sections.tsx` is dead code. Nothing imports it. It
  was left in place on purpose.

## Before the next command

Local `data/hosti.db` was last read at schema 2. The next process that opens it,
including `pnpm dev` or `pnpm token:new`, migrates it to schema 4. Back it up
first. Production has nightly volume backups to S3, kept 14 days.

## Resume checklist

1. Read STATUS.md and CONTEXT.md.
2. Run `git status --short` and preserve every change you did not make.
3. Run `pnpm check`, `pnpm test` and `pnpm build` before trusting the tree.
4. Commit, push, tag or release only with explicit operator approval.
