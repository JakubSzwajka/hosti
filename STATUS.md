# Hosti continuation status

## Where things stand

The "CLI install and browser-approved login" spec
(`.pi/specs/2026-09-26_hosti-cli-browser-login/`) is built and committed.

1. Server, `0d4f653`: push token scopes and schema 4, agent connections in
   server memory, the `/connect/<id>` approval page, the
   `/api/v1/agent-authorizations` and `/api/v1/whoami` routes, scope checks on
   every `/api/v1/bundles` route, and the onboarding panel that leads with the
   install and login commands. Minting by hand on `/tokens` is gone; the
   server-shell `pnpm token:new` remains, with `--allow-delete`.
2. CLI, distribution, skill and docs, `fb874b0`: `hosti login`, `hosti whoami`
   and `hosti logout`; the compiled `hosti-cli.tgz` pack; the `cli-v*` release
   workflow; the root packaging test; the `hosti-publish` skill on the CLI;
   and CONTEXT.md, README.md and this file.
3. Review fixes, `be7f75a`: the approval activation race and migration
   atomicity found in review of `fb874b0`.
4. Further review fixes, in this lane's working tree, not yet committed:
   `hosti login` now checks the connection's `expiresAt` before every poll and
   before saving an `approved` answer, and caps each sleep at the time left;
   `pollAfterSeconds` no longer clamps to a 30 s ceiling, only a 1 s floor; a
   malformed `~/.config/hosti.json` reports a fixed "is not valid JSON"
   message instead of echoing Node's parser text (which could quote a token
   sitting next to the syntax error); and README.md's origin-risk section no
   longer claims bundle JavaScript cannot write catalog mutations — it can
   read the mutation token off an admin page and, while the owner is logged
   in, use it to start and approve its own agent connection.

The app is deployed to `hosti.kubaszwajka.com` from `main`, currently running
with a temporary test owner password set for the operator's manual end-to-end
run of the login flow. Rotate `HOSTI_OWNER_PASSWORD` in Dokploy once that
manual run is done.

## What is left

- The repository is private, so the release install command in README.md
  (`npm install -g https://.../releases/latest/download/hosti-cli.tgz`) does
  not work yet, and no `cli-v*` tag has been pushed. Until a release exists,
  install from a locally packed tarball: `pnpm --filter @hosti/cli run
  pack:tgz`.
- Accepted risk, 2026-09-26: approval takes no password when a session
  exists. A bundle's JavaScript runs on the catalog's origin, can read the
  per-session mutation token off an admin page, and could use it to start and
  approve its own agent connection while the owner is logged in. Serving
  `/v/` from a second origin is the planned fix. Until then, check `/tokens`
  for a token nobody minted on purpose.
- `apps/web/src/app/b/[slug]/sections.tsx` is dead code. Nothing imports it.
  It was left in place on purpose.
- The "users and agent authorization" spec
  (`.pi/specs/2026-09-21_hosti-users-agent-authorization/`) is parked and
  unbuilt.

## Before the next command

Local `data/hosti.db` was last read at schema 2. The next process that opens it,
including `pnpm dev` or `pnpm token:new`, migrates it to schema 4. Back it up
first. Production has nightly volume backups to S3, kept 14 days.

## Resume checklist

1. Read STATUS.md and CONTEXT.md.
2. Run `git status --short` and preserve every change you did not make.
3. Run `pnpm check`, `pnpm test` and `pnpm build` before trusting the tree.
4. Commit, push, tag or release only with explicit operator approval.
