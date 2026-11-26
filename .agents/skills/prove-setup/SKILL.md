---
name: prove-setup
description: Run Hosti CLI, API and MCP proof against isolated local services.
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

## Isolated MCP proof

Build the web app, then run the safe fixture runner from the task worktree:

```bash
pnpm build
proof_dir="$HOME/.pi/agent/proof/hosti/feat-hosti-146-mcp"
mkdir -p "$proof_dir"
set -o pipefail
node apps/web/scripts/mcp-proof.mjs | tee "$proof_dir/mcp-local.txt"
```

The runner uses a fresh temporary data directory and unused application and issuer ports.
No backup is needed for this empty database. It never reads the primary database.
It starts Next on `0.0.0.0` and uses the loopback URL for its own requests.
It does not require a browser or owner login.
It creates an ephemeral RSA key and serves a local JWKS.
All JWTs use a synthetic subject and client ID. No Clerk request or authentication bypass is involved.

The runner checks both metadata paths, anonymous challenges, signed-token refusals and session binding.
Its `Hosti MCP proof` client uploads `mcp-proof` with curl, then downloads and checks file hashes.
The fixture includes `index.html`, nested text and binary bytes.
It exercises sharing, link rotation, an owner-supplied synthetic pin, retention and delete refusal.
The pin page request uses `Accept: text/html` and requires the gate form at HTTP 200.
The same locked URL with `*/*`, and a locked nested asset, must return 404.
Wrong transfer methods return 405 and tampered signatures return 404 before valid use.
It kills its own Next process during a reserved upload, then restarts that process.
It checks interrupted, used, failed and unused upload grants after restart.
The old download grant still returns its original revision after the restart and a later push.
It enables delete only for the synthetic client on its isolated server, then checks confirmation and deletion.

Only PASS lines and the deferred production gap enter the retained transcript.
JWTs and capability URLs stay in process memory.
Curl reads grant URLs from stdin rather than command arguments.
The runner stops its own server and issuer and removes its temporary directory in `finally`.
Do not retain raw request logs, keys, pins, signatures or credentials.

Run the security tests for expiry, key rotation, unsafe archives, limits and revision reuse:

```bash
pnpm --filter @hosti/web exec vitest run src/tests/mcp.test.ts src/tests/mcp-regressions.test.ts
pnpm --filter @hosti/storage exec vitest run src/tests/transfers.test.ts
```

Regression tests use different public and MCP origins, a pre-feature writer recreation,
and an obstructed MCP metadata path with MCP disabled.
They also check the streamed grant byte limit and Unicode client-name boundary.
Download generation checks require Linux `/proc/self/fd` and directory birth times.

Production Clerk JWT access tokens and the audience claim are enabled; PKCE is required.
Real deployed Clerk/OpenBot OAuth remains CANNOT PROVE here and belongs to Majster.
Majster must deploy with zero downtime through the normal Dokploy path or rolling/start-first.
A continuous health probe must show uninterrupted service during deployment.
Do not deploy, modify Clerk or change production in this proof.
