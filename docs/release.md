# Releasing

A merge to `main` ships nothing. CI checks and tests it, and that is all. Prod
changes only when someone runs **Create release** in GitHub Actions. This is
the operator's gated release profile. The reference copy of the workflow lives
in `JakubSzwajka/drunk-cat-stack`.

The whole release is one file, `.github/workflows/release-create.yml`. Every
step is a plain `run:` block, with no helper scripts. It starts only by hand
(`workflow_dispatch`), never on push or pull request.

```text
merge to main ──> CI only (check, test, build). No image, no deploy.

Create release (dispatch on main)   inputs: bump, dry_run, redeploy
  │
  ├─ build-and-tag            skipped when redeploy is set
  │    next vX.Y.Z from the newest v*.*.* tag (cli-v* tags are ignored)
  │    dry_run? ── yes ──> print version + commit subjects, stop
  │    build apps/web/Dockerfile (context .) with APP_COMMIT, push ONE image:
  │      ghcr.io/jakubszwajka/hosti:prod-sha-<12>   (immutable, what deploy uses)
  │      ghcr.io/jakubszwajka/hosti:vX.Y.Z
  │      ghcr.io/jakubszwajka/hosti:latest
  │    git tag vX.Y.Z + push, gh release create --generate-notes --latest=false
  │
  └─ deploy                   after a good build, or alone with redeploy
       vX.Y.Z ─> commit (refused if not on main) ─> prod-sha-<12>
       Dokploy application.update (image) ─> application.deploy
         title "vX.Y.Z (prod-sha-<12>)"
       poll APP_URL/api/health until 200 and commit == <12>  (10 min)
       notify Discord (always, never fails the job)
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

The Discord line reads
`✅ hosti prod deploy succeeded — vX.Y.Z (<12>) — <run url>`, or
`❌ hosti prod deploy failed — …` for any other outcome.

## Redeploy or roll back

```sh
gh workflow run "Create release" --ref main -f redeploy=vX.Y.Z
```

`redeploy` skips the build and the tag. It points Dokploy at that release's
`prod-sha-<12>` image and runs the same health wait and Discord post. Nothing
is rebuilt. The same command with the current version redeploys it. Read the
next section before you roll back.

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
| Variable | `DOKPLOY_APPLICATION_ID` | The `hosti` application. |
| Variable | `APP_URL` | `https://hosti.kubaszwajka.com`. The health check target. |

All five sit at repo level, with no `environment:`. The Dokploy application
needs a Docker image source that can pull from GHCR.

## The health contract

`GET /api/health` answers without login:

```json
{"status":"ok","commit":"0123456789ab"}
```

`commit` is the first 12 characters of `APP_COMMIT`, or `unknown` when it is
empty. `apps/web/Dockerfile` bakes `APP_COMMIT` into the runtime stage from a
build arg that "Create release" sets. An image built any other way, such as a
Dokploy source build, reports `unknown`, and the deploy's health wait fails on
it. The old container keeps answering 200 until the new one is healthy, which
is why the deploy waits for the new `commit`, not for any 200. The Compose
healthcheck uses the same route.

## Where this copy differs from the reference

The copies are kept in step by hand. Compare them when the reference changes:

```sh
diff ../drunk-cat-stack/.github/workflows/release-create.yml .github/workflows/release-create.yml
```

Only the top `env:` block differs, on purpose:

1. [x] `DOCKERFILE: apps/web/Dockerfile`. The build context stays `.`.
2. [x] `RELEASE_MARK_LATEST: "false"`, with a comment naming the CLI install
   URL. See [Why `--latest=false`](#why---latestfalse).
