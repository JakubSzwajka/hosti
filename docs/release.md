# Releasing

A merge to `main` ships nothing. CI checks and tests it, and that is all. Prod
changes only when someone runs **Create release** in GitHub Actions. This is
the operator's gated release profile. The reference copy of the workflow lives
in `JakubSzwajka/drunk-cat-stack`.

The whole release is one file, `.github/workflows/release-create.yml`. It
uses pinned Docker actions and inline shell, with no helper scripts. It starts
only by hand
(`workflow_dispatch`), never on push or pull request.

```text
merge to main ──> CI only (check, test, build). No image, no deploy.

Create release (dispatch on main)   inputs: bump, dry_run, redeploy
  │
  ├─ build-and-tag            skipped when redeploy is set
  │    next vX.Y.Z from the newest v*.*.* tag (cli-v* tags are ignored)
  │    dry_run? ── yes ──> print version + commit subjects, stop
  │    preflight LANDING_URL/healthz (status ok, 12 lowercase hex commit)
  │    build apps/web/Dockerfile and landing/Dockerfile with APP_COMMIT
  │    push immutable images prod-sha-<12> and landing-prod-sha-<12>
  │    push version aliases, then git tag and GitHub Release
  │
  └─ deploy                   after a good build, or alone with redeploy
       vX.Y.Z ─> commit (refused if not on main) ─> both immutable tags
       check both images exist before changing either Dokploy app
       preflight LANDING_URL/healthz before any Dokploy update
       deploy app and poll APP_URL/api/health until commit == <12>
       deploy landing and poll LANDING_URL/healthz until commit == <12>
       notify Discord (always, including partial failures)
```

The build runs before the tag, so a failed build never leaves a tag or a
release behind. Runs share one concurrency group, `hosti-release`. A second
run waits and is never cancelled.

## Cut a release

1. [ ] Preview it:
   `gh workflow run "Create release" --ref main -f bump=patch -f dry_run=true`.
   The run log and summary show the next version and the commit subjects since
   the last tag. A dry run builds, tags and deploys nothing.
2. [ ] Ship it: `gh workflow run "Create release" --ref main -f bump=patch`.
   Use `minor` or `major` as needed. The Actions UI offers the same inputs.

Running the workflow is the approval. A private repo on GitHub Free gets no
environment reviewers, so nothing else stands between a merge and prod.

The Git tag `vX.Y.Z` is the app version. The `version` fields in the
`package.json` files mean nothing here. Release notes come from GitHub
(`--generate-notes`). The CLI has its own tags, `cli-vX.Y.Z`, and its own
workflow, `release-cli.yml`. The two never mix: "Create release" only reads
tags that match `v[0-9]*.[0-9]*.[0-9]*`, and `cli-v0.1.0` does not.

Only the deploy job posts to Discord. It reads
`✅ hosti prod deploy succeeded — vX.Y.Z (<12>) — <run url>`, or
`❌ hosti prod deploy failed — …` for any other deploy outcome. Build and tag
failures stay in GitHub Actions and do not post there.

## Redeploy or roll back

```sh
gh workflow run "Create release" --ref main -f redeploy=vX.Y.Z
```

`redeploy` skips the build and the tag. It first preflights the public landing
origin, then resolves the selected tag to its commit and checks that both
`prod-sha-<12>` and `landing-prod-sha-<12>` exist. Only then can it change a
Dokploy application. It deploys the app first, waits for `/api/health`, then
deploys the landing image and waits for `/healthz`. Nothing is rebuilt. The
same command with the current version redeploys it. Read the next section
before you roll back.

The preflight is intentional. While `hosti.kubaszwajka.com` still serves the
old GitHub-source landing app, its empty `/healthz` response stops a real
release before the image build and tag, and stops a redeploy before any Dokploy
update. The first image-based release cannot proceed until the cutover is
ready.

## The database and rollbacks

Hosti keeps its data in SQLite, in `hosti.db` on the `/data` volume. There is
no separate migration step. `packages/catalog` checks the schema version when
it opens the database and upgrades the file in place. So a deploy can change
the prod schema as soon as the new container starts serving.

A release that touches the schema code in `packages/catalog` is **not safe to
roll back by image alone**. The upgrade runs forward only. An older image would
start against a newer schema. Before you release such a change:

1. [ ] Say so in the release notes or the PR.
2. [ ] Take a fresh backup of the `hosti-data` volume first. The nightly S3
   backup may be up to a day old.
3. [ ] Plan the way back as "restore the backup, then redeploy the older
   version", not "redeploy the older version".

The workflow deploys the app before the landing image. A failed landing deploy
can therefore leave the new app serving with the old landing page. It does not
auto-rollback either application. The release operator must inspect the partial
deploy and choose a compatible pair. Follow the migration rule above before
using an older app image.

For the first two-image release, the rollback floor is the first release whose
landing image was built from the new health-aware landing code after the
cutover bootstrap. It is **not** automatically `v0.3.0`: the current `v0.3.0`
GitHub-source landing app returns an empty `/healthz`, and no compatible
historical landing image exists unless one is intentionally built and
published. Keep that old app as a manual fallback only. If the image pair cannot
be rolled back safely, an operator may separately approve pointing the public
domain back to the old app while the image deployment is repaired. That is not
a workflow rollback.

## Why `--latest=false`

The CLI install URL,
`https://github.com/JakubSzwajka/hosti/releases/latest/download/hosti-cli.tgz`,
resolves through GitHub's "Latest" release mark. That mark must stay on a
`cli-v*` release. So the workflow sets `RELEASE_MARK_LATEST: "false"`, and an
app release never takes the mark.

This is only the GitHub Release mark. The image tag
`ghcr.io/jakubszwajka/hosti:latest` still moves on every app release, and only
then. Self-hosters who run `docker-compose.yml` get the newest release on each
`docker compose up`, or can pin a version tag.

## What the workflow reads

| Kind | Name | Note |
|---|---|---|
| Secret | `DOKPLOY_API_KEY` | Dokploy API key for the deploy. |
| Secret | `DISCORD_DEPLOY_WEBHOOK` | A plain Discord #deploys channel webhook URL. Empty means no post. |
| Variable | `DOKPLOY_BASE_URL` | Dokploy URL. |
| Variable | `DOKPLOY_APPLICATION_ID` | The Hosti app application. |
| Variable | `DOKPLOY_LANDING_APPLICATION_ID` | The separate image-based landing application. Required for real releases and redeploys. |
| Variable | `APP_URL` | `https://hosti-private.kubaszwajka.com`. The app health target. |

These sit at repo level, with no `environment:`. Both Dokploy applications
need image sources that can pull from GHCR. `LANDING_URL` is the fixed public
origin `https://hosti.kubaszwajka.com`.

## Onboarding and cutover

Hosti went onto the gated release profile on 2026-09-27:

1. [x] PR #15 merged the workflow and the health route (`a7488f8`).
2. [x] "Create release" cut `v0.1.0` from `a7488f8` before any Dokploy secret
   existed, so its deploy job stopped at "Deploy to Dokploy" and made no call.
3. [x] The existing five names above were set.
4. [ ] Create the new image-based `hosti-landing-image` Dokploy application and set
   `DOKPLOY_LANDING_APPLICATION_ID`. Do not switch the old GitHub-source app's
   `sourceType` in place.
5. [ ] After the first release commit is merged to `main`, build and publish
   its landing image, then deploy that image to the new application before the
   domain cutover. This one-time bootstrap must come from the new health-aware
   landing code, not from the current `v0.3.0` landing app, whose `/healthz` is
   empty. Verify the new application's `/healthz` before continuing.
6. [ ] Get separate production approval, then point the `hosti.kubaszwajka.com`
   domain at the new application. The workflow does not perform this cutover.
7. [x] The Dokploy `hosti` application moved to the Docker image
   `ghcr.io/jakubszwajka/hosti:prod-sha-a7488f87868d`, with a per-app GHCR
   pull login and auto deploy off.
8. [x] `-f redeploy=v0.1.0` deployed it. Health reported `a7488f87868d`, and
   #deploys got the success line.

The prod domain is `hosti-private.kubaszwajka.com`, and the app health check
uses it. `hosti.kubaszwajka.com` remains on the old GitHub-source landing app
until the separately approved cutover. See `landing/README.md`.

## The health contract

`GET /api/health` answers without login. The health-aware landing image has
the same contract at `GET /healthz`:

```json
{"status":"ok","commit":"0123456789ab"}
```

`commit` is the first 12 characters of `APP_COMMIT`, or `unknown` when it is
empty. `apps/web/Dockerfile` bakes `APP_COMMIT` into the runtime stage from a
build arg that "Create release" sets. An image built any other way, such as a
Dokploy source build, reports `unknown`, and the deploy's health wait fails on
it. The old container keeps answering 200 until the new one is healthy, which
is why the deploy waits for the new `commit`, not for any 200. The landing Caddy
image substitutes its `APP_COMMIT` build argument into the JSON response. The
Compose healthcheck uses the app route.

## Workflow notes

The release workflow is maintained here rather than copied from the reference
project. Compare them when the reference changes:

```sh
diff ../drunk-cat-stack/.github/workflows/release-create.yml .github/workflows/release-create.yml
```

The Hosti-specific settings include the app Dockerfile, the landing Dockerfile
and the fixed public landing origin. `RELEASE_MARK_LATEST: "false"` keeps the
CLI install URL on the `cli-v*` release. See [Why `--latest=false`](#why---latestfalse).
