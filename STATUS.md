# Hosti continuation status

## Where things stand

The "CLI install and browser-approved login" spec
(`.pi/specs/2026-09-26_hosti-cli-browser-login/`) is built and deployed.

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
4. Further review fixes, `7c6a49f`: `hosti login` now checks the connection's
   `expiresAt` before every poll and before saving an `approved` answer, and
   caps each sleep at the time left; `pollAfterSeconds` no longer clamps to a
   30 s ceiling, only a 1 s floor; a malformed `~/.config/hosti.json` reports a
   fixed "is not valid JSON" message instead of echoing Node's parser text; and
   README.md's origin-risk section stopped claiming bundle JavaScript cannot
   write catalog mutations.
5. Password fixture, `6143d1a`: `apps/web/tests/env-check.test.ts` stopped
   using the real temporary prod owner password as its fixture, replacing it
   with a dummy value.
6. This close-out commit: every `/v/` response now carries
   `Cache-Control: private, no-store` (see below), the dead
   `apps/web/src/app/b/[slug]/sections.tsx` is deleted, and README.md and this
   file are brought up to date.

The repository is **public**. Release `cli-v0.1.0` is published on GitHub with
the built `hosti-cli.tgz` attached, marked latest. Both documented install
paths work end to end:

```bash
npm install -g https://github.com/JakubSzwajka/hosti/releases/latest/download/hosti-cli.tgz
npx skills add JakubSzwajka/hosti
```

The app is served at `hosti-priv.kubaszwajka.com`. The old domain,
`hosti.kubaszwajka.com`, stays attached to the same Dokploy application,
because existing CLI logins point at it. `HOSTI_PUBLIC_URL` is the new origin,
so new share and approval links use it.

Gated release onboarding is done. PR #15 added the "Create release" workflow,
one file that builds, tags, releases and deploys, and `GET /api/health`, which
reports the image's commit. It removed the old `publish-image.yml`, which
pushed `:latest` on every push to `main`; `latest` now moves only on a
release. On 2026-09-27 the Dokploy `hosti` application moved to the pinned
image `ghcr.io/jakubszwajka/hosti:prod-sha-a7488f87868d` with auto deploy
off, and `v0.1.0` (`a7488f8`) was deployed through "Create release". See
[docs/release.md](docs/release.md).

## The `/v/` cache fix

Observed on prod, 2026-09-27, behind Cloudflare: a request for
`/v/pin-test/assets/style.css` made before the link was unlocked got Hosti's
404, sent with no `Cache-Control` header. Cloudflare cached that 404 for 4
hours (`cf-cache-status: HIT`), so the owner, having since unlocked the link,
kept getting the same stale 404 for a real asset.

The fix: every response `serveBundleRequest` and `unlockBundleRequest` return
under `/v/<slug>/...` — a served file, a directory index, a redirect
(`/v/x` -> `/v/x/`), the pin gate page, an unlock POST answer (wrong pin,
right pin), and every 404 (Hosti's own, and a bundle's `404.html`) — now
carries `Cache-Control: private, no-store`, overriding whatever the inner
helper set. A shared cache must never hold any of it, unlocked assets
included, because the file behind a share slug can change from 404 to 200 the
moment someone types the right pin. `apps/web/tests/serving-cache-control.test.ts`
asserts the header on all of those cases at the route-handler level. The
`/b/<slug>/preview/` routes, which share `serveFromRevision`, were left alone;
their own headers are unaffected because the header override is applied at
the `/v/` entry point in `serve-bundle.ts`, not inside the shared helper.

## What is left, outside this repository

- **Rotate the temporary prod owner password.** `HOSTI_OWNER_PASSWORD` in
  Dokploy is still the value set for the operator's manual end-to-end run of
  the login flow. That value (not repeated here) sat in this repository's git
  history, in `apps/web/tests/env-check.test.ts`, before commit `6143d1a`.
  Because the repository is now public, treat that old value as burned: it
  must never be reused anywhere, and the live password needs a fresh value in
  Dokploy.
- **The old domain.** `hosti.kubaszwajka.com` is still attached so existing
  CLI logins keep working. Whether and when to drop it is the owner's call;
  do not remove it while a CLI login still points at it.
- **Accepted origin risk.** A bundle's JavaScript still runs on the catalog's
  origin and can read an admin page's mutation token while the owner is
  logged in (accepted 2026-09-26; see README.md's "The origin risk"). Serving
  `/v/` from a second origin is the planned fix and remains undone. This
  close-out only stops a stale cache from leaking one 404 across an unlock; it
  does not change which origin `/v/` is served from.
- **Parked spec.** The "users and agent authorization" spec
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
