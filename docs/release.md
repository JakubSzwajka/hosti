# Releasing

This page documents the maintainer's own release pipeline. Self-hosters do not need it.

A merge to `main` ships nothing. CI checks and tests it, and that is all. Prod
changes only when someone runs **Create release** in GitHub Actions. This is
the operator's gated release profile. The workflow follows the infra CI standard
(`docs/ci/README.md` in the infra repo). Hosti's allowed deviations are the
second image, landing, and the release on GitHub-hosted runners (a public repo).
The workflow builds the landing image but does not deploy it. The operator
deploys landing from omarchy with the Alchemy stack in
[alchemy/landing](../alchemy/landing/README.md).

The whole release is one file, `.github/workflows/release-create.yml`. It
uses pinned Docker actions and inline shell, with no helper scripts. It starts
only by hand
(`workflow_dispatch`), never on push or pull request.

```text
merge to main ──> CI only (static, test, image, landing, secrets). No push, no deploy.

Create release (dispatch on main)   inputs: bump, dry_run, redeploy
  │
  ├─ build-and-tag            skipped when redeploy is set
  │    preflight: every variable and secret name is set
  │    CI gate: the newest push run of "CI" on this commit is green
  │    next vX.Y.Z from the newest v*.*.* tag (cli-v* tags are ignored)
  │    dry_run? ── yes ──> print version + commit subjects, stop
  │    build apps/web/Dockerfile and landing/Dockerfile with APP_COMMIT
  │    push immutable images prod-sha-<12> and landing-prod-sha-<12>
  │    push version aliases, then create the GitHub Release at this commit
  │
  └─ deploy                   after a good build, or alone with redeploy
       vX.Y.Z ─> commit (refused if not on main) ─> both immutable tags
       check both images exist before the app deploy
       deploy app and poll APP_URL/api/health until commit == <12>
       print the landing deploy command in the job summary
       notify Discord (always, including partial failures)

omarchy (operator, after the deploy job)
  alchemy/landing/deploy.sh deploy vX.Y.Z hosti.kubaszwajka.com
       Swarm service hosti-landing ─> image landing-vX.Y.Z
```

The build runs before the tag, so a failed build never leaves a tag or a
release behind. The tag is made on the server by `gh release create --target`,
with no `git push`. Both jobs run on GitHub-hosted `ubuntu-24.04`: hosti is a public repo, so those
minutes are free, and a public repo should not use a self-hosted runner. The image
build reads and writes the Docker layer cache in the Actions cache service
(`scope=release` for the app, `scope=landing` for landing). CI only reads it.
Runs share one concurrency group, `hosti-release`. A second run waits and is
never cancelled.

## The CI gate

A real release needs a green push run of the `CI` workflow on the same commit.
After a squash merge the commit on `main` is new, so wait for that push run to
pass before you release. A dry run reports the gate in the step summary and
never fails on it. `deploy` and `redeploy` skip the gate, so a rollback does
not depend on CI.

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

`redeploy` skips the build and the tag. It resolves the selected tag to its
commit and checks that both `prod-sha-<12>` and `landing-prod-sha-<12>` exist.
Only then can it change the Dokploy application. It deploys the app and waits
for `/api/health`. Nothing is rebuilt. The same command with the current
version redeploys it. Read the next section before you roll back.

The workflow does not deploy landing. To roll back landing, deploy the
previous version from omarchy:

```sh
alchemy/landing/deploy.sh deploy vX.Y.Z hosti.kubaszwajka.com
```

The job summary of every deploy run prints this command with the version it
deployed. Then check that `https://hosti.kubaszwajka.com/healthz` reports the
release commit.

There is no preflight of the live landing. A landing outage must not block a
repair release or a redeploy, because the new image is what fixes it. The
deploy still checks that both images exist before it changes the Dokploy app.

## Landing cutover from Dokploy

Until the cutover, the Dokploy landing app still serves
`hosti.kubaszwajka.com`, and no release updates it. To move landing to the
Alchemy stack:

1. [ ] Deploy to the trial host:
   `alchemy/landing/deploy.sh deploy vX.Y.Z hosti-next.kubaszwajka.com`.
   Check `https://hosti-next.kubaszwajka.com/healthz`.
2. [ ] Deploy the same version to `hosti.kubaszwajka.com`. This removes the
   `hosti-next` DNS record.
3. [ ] In Dokploy, remove the domain from the landing app, then stop it. Until
   then two Traefik routers match the host.
4. [ ] Check `https://hosti.kubaszwajka.com/healthz`.

The full steps and the way back are in
[alchemy/landing/README.md](../alchemy/landing/README.md#cutover-from-dokploy).

## The database and rollbacks

Hosti keeps its data in SQLite, in `hosti.db` on the `/data` volume. There is
no separate migration step. `packages/catalog` checks the schema version when
it opens the database and upgrades the file in place. So a deploy can change
the prod schema as soon as the new container starts serving.

A release that touches the schema code in `packages/catalog` is **not safe to
roll back by image alone**. The upgrade runs forward only. An older image would
start against a newer schema. Before you release such a change:

1. [ ] Say so in the release notes or the PR.
2. [ ] Take a fresh backup of the data volume first. A scheduled backup may be
   hours or days old.
3. [ ] Plan the way back as "restore the backup, then redeploy the older
   version", not "redeploy the older version".

The workflow deploys the app, and the operator deploys landing afterwards.
Until the operator runs `alchemy/landing/deploy.sh`, the new app serves with
the old landing page. Neither side rolls back the other. The release operator
must choose a compatible pair. Follow the migration rule above before using an
older app image.

A rollback needs a landing image that serves the health contract. A release
older than the first one built from the health-aware landing code has no such
image, so the workflow cannot roll back to it. If the pair cannot be rolled back
safely, the operator repairs it by hand. That is not a workflow rollback.

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
| Variable | `DOKPLOY_APPLICATION_ID` | The Dokploy application that runs the Hosti app image. |
| Variable | `APP_URL` | Public origin of the app. The deploy polls `APP_URL/api/health`. |

A preflight step in both jobs fails with one line per missing name, before any
tag exists. It never prints a value. An empty `DISCORD_DEPLOY_WEBHOOK` only warns.

These sit at repo level, with no `environment:`. The Dokploy application
needs an image source that can pull from GHCR, with auto deploy off.
`LANDING_URL` and `LANDING_DEPLOY_HOST` are not variables: the workflow
hard-codes them for the summary line. See `landing/README.md`.

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
Compose healthcheck uses the app route. The landing Swarm service checks
`/healthz` inside the container with busybox `wget`.

## Workflow notes

The release workflow is a copy of `templates/ci/release-create.yml` in the infra
repo. Compare it when the template changes:

```sh
diff ~/DEV/priv/infra/templates/ci/release-create.yml .github/workflows/release-create.yml
```

The Hosti-specific settings are the knobs in the top `env:` block: the app
Dockerfile, the landing Dockerfile and context, and the fixed public landing
origin. The extra steps are the landing build, the image check and the printed
landing deploy command. `RELEASE_MARK_LATEST: "false"` keeps the
CLI install URL on the `cli-v*` release. See [Why `--latest=false`](#why---latestfalse).
