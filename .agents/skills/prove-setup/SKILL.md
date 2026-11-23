---
name: prove-setup
description: Run Hosti CLI and API proof against an isolated local server.
disable-model-invocation: true
---

# Hosti proof setup

Use this setup with the global `prove` skill. Run from the task worktree.

## Runtime

Use Node from `.nvmrc` and pnpm from `packageManager` in `package.json`.
Run `pnpm install --frozen-lockfile` if dependencies are missing.
Choose an unused port with `ss -ltn`. Record the selected port and process PID.

## Data and login

Create a fresh temporary directory with `mktemp -d`. Keep data, CLI config,
source fixtures and output directories inside it. No backup is needed for this
new, empty database. Read `STATUS.md` before any database command.

Set `HOSTI_DATA_DIR` to its absolute `data` path. Create a synthetic push token
with `pnpm --silent token:new -- --name pull-proof`. Capture stdout privately,
never in the proof transcript. The command initializes a new database.
Read its token line into `HOSTI_TOKEN` without printing it. Set `HOSTI_URL` to
the local server origin and `XDG_CONFIG_HOME` to the temporary config directory.
For a share-only refusal, create another synthetic token in this same test
database and set only that token's scopes to `share` with SQLite.

No owner login is needed for push, pull or bundle API reads. Do not configure
an owner password or use a saved personal CLI login.

## Start

Run `pnpm --filter @hosti/web dev --hostname 0.0.0.0` with the chosen `PORT`,
`HOSTI_DATA_DIR`, and `HOSTI_KEEP_REVISIONS=2`. Save the PID and a local log.
Ready means `GET http://127.0.0.1:<port>/api/health` returns 200.
Use only this origin for the proof. Run the CLI with
`node apps/cli/src/index.ts <command>` and the isolated CLI environment.

## Acceptance data

Create a synthetic bundle with `index.html`, a nested text asset and a binary
file. Save file hashes outside the source directory before removing it.
A third push prunes revision 1 when the keep count is 2.
A separate bundle with a sole root `report.html` checks the stored rename to
`index.html`. Compare pulled bytes with the isolated stored revision too.
For malformed archive recovery, use an isolated local stub that returns a
malformed archive. Do not modify the application or production responses.

## Do not touch

Do not open the primary checkout's `data/hosti.db`, use production, deploy,
release, use real tokens, or delete directories this proof did not create.

## Stop and cleanup

Stop only the server and stub processes this proof started. Remove only the
temporary data directory this proof created. Keep safe transcripts and the
proof table in the durable proof folder. Never retain clear tokens there.
