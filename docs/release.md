# Releasing

A merge to `main` ships nothing. CI checks and tests it, and that is all. Prod
changes only when someone runs a release in GitHub Actions. This is the
operator's gated release profile. The reference copy lives in
`JakubSzwajka/drunk-cat-stack`.

```
merge to main ──> CI only (check, test, build). No image, no deploy.

Actions: "Create release"   (bump, version, deploy, dry_run)
  │
  ├─ "Publish image"   build apps/web/Dockerfile (context .) with APP_COMMIT,
  │                    push ghcr.io/jakubszwajka/hosti:prod-sha-<12>
  ├─ tag vX.Y.Z, alias the image as vX.Y.Z, prod-latest and latest
  ├─ GitHub Release, notes from the commit subjects since the last tag
  └─ "Deploy prod"     (version)   <── also run by hand to redeploy or roll back
       ├─ resolve the tag to its commit, refuse a commit not on main
       ├─ preflight: reject task-scoped Swarm hostnames in the app's env
       ├─ point Dokploy at prod-sha-<12>, deploy, wait until it is done
       ├─ smoke: APP_URL/api/health must report that commit within 300 s
       └─ post the outcome to Discord #deploys
```

The build runs before the tag, so a failed build never leaves a tag behind.

## Cut a release

1. In Actions, open "Create release" and run it on `main`.
2. Pick `bump`: `patch`, `minor` or `major`. A `version` such as `v1.2.0`
   overrides the bump.
3. Tick `dry_run` first to see the next version and the notes in the run
   summary. A dry run builds, tags and deploys nothing.
4. Untick `deploy` to tag and publish without deploying. Run "Deploy prod"
   with that version later.

Running the workflow is the approval. A private repo on GitHub Free gets no
environment reviewers, so nothing else stands between a merge and prod.

The Git tag `vX.Y.Z` is the app version. The `version` fields in the
`package.json` files mean nothing here. The CLI has its own tags, `cli-vX.Y.Z`,
and its own workflow, `release-cli.yml`. The two never mix: "Create release"
and "Deploy prod" only read tags that match `v[0-9]*.[0-9]*.[0-9]*`, and
`cli-v0.1.0` does not.

## The database and rollbacks

Hosti keeps its data in SQLite, in `hosti.db` on the `/data` volume. There is
no separate migration step. `packages/catalog` checks the schema version when
it opens the database and upgrades the file in place. So a deploy can change
the prod schema as soon as the new container starts serving.

A release that touches the schema code in `packages/catalog` is **not safe to
roll back automatically**. The upgrade runs forward only. An older image would
start against a newer schema. Before you release such a change:

1. [ ] Say so in the release notes or the PR.
2. [ ] Take a fresh backup of the `hosti-data` volume first. The nightly S3
   backup may be up to a day old.
3. [ ] Plan the way back as "restore the backup, then deploy the older
   version", not "deploy the older version".

## Redeploy or roll back

Run "Deploy prod" with a `version`. Left empty, it deploys the newest tag.

A rollback is "Deploy prod" with an older version. Nothing is rebuilt: Dokploy
points at the older `prod-sha-<12>` image and deploys it. See the section above
before you roll back past a schema change.

"Publish image" can also run alone, with a `ref` on `main`, to build an image
for any merged commit, for example to bisect a regression. It moves no alias
and deploys nothing.

## The `latest` image tag

`ghcr.io/jakubszwajka/hosti:latest` means the newest release. "Create release"
moves it, together with `prod-latest` and the version tag. A merge to `main`
does not. Self-hosters who run `docker-compose.yml` get the newest release on
each `docker compose up`, or can pin a version tag.

## What the workflows read

| Kind | Name | Note |
|---|---|---|
| Secret | `DOKPLOY_API_KEY` | Dokploy API key for the preflight and the deploy. |
| Secret | `SLACK_DEPLOY_WEBHOOK` | The Discord #deploys webhook with `/slack` appended. Empty means no post. |
| Variable | `DOKPLOY_BASE_URL` | Dokploy URL. |
| Variable | `DOKPLOY_APPLICATION_ID` | The `hosti` application. |
| Variable | `APP_URL` | `https://hosti.kubaszwajka.com`. Smoke target, and the link in the Discord post. |

All five sit at repo level, with no `environment:`. The workflows are
`.github/workflows/release-create.yml`, `release.yml` and `deploy-prod.yml`.
Their scripts live in `scripts/ci`. Run the script tests by hand:

```bash
bash scripts/ci/smoke-commit.test.sh
bash scripts/ci/preflight-dokploy-env.test.sh
```

## The health contract

`GET /api/health` answers without login:

```json
{"status":"ok","commit":"0123456789ab"}
```

`commit` is the first 12 characters of `APP_COMMIT`, or `unknown` when it is
empty. `apps/web/Dockerfile` bakes `APP_COMMIT` into the runtime stage from a
build arg that "Publish image" sets. An image built any other way, such as a
Dokploy source build, reports `unknown`, and the smoke check in "Deploy prod"
fails on it. The Compose healthcheck uses the same route.

## Where this copy differs from the reference

The copies are kept in step by hand. Compare them when the reference changes.
These differences are deliberate:

1. [x] Header comments name hosti and point at this file.
2. [x] Concurrency groups are `hosti-release` and `hosti-prod`, and the
   preflight label is `hosti prod`.
3. [x] "Publish image" builds `apps/web/Dockerfile` with context `.`.
4. [x] "Create release" passes `--latest=false` to `gh release create`. The CLI
   install URL `releases/latest/download/hosti-cli.tgz` must keep pointing at a
   `cli-v*` release, so an app release never takes GitHub's "latest" mark.
   The image tag `latest` still moves; only the GitHub Release mark does not.

`scripts/ci/*` are copied unchanged.
