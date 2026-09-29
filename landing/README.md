# Landing page

The static page for `hosti.kubaszwajka.com`: `index.html`, `styles/` and
`icon.svg`. `docs/` holds the static docs at `/docs/`, one folder per page with
an `index.html`. There is no build step. The Hosti app itself runs at
`hosti-private.kubaszwajka.com`.

## Analytics

Only this public landing page records automatic pageviews in the self-hosted
Umami website for `hosti.kubaszwajka.com`. The single tracker in `index.html`
restricts collection to that domain, respects Do Not Track, and removes query
strings and hashes from recorded URLs. It sends no visitor identifiers or
custom events. The private Hosti app, catalog and shared bundles are outside
this scope.

To change the tracker, edit that one script tag and keep the website ID and
scope explicit. Check it with the focused regression test:

```bash
node --test tests/landing-analytics.test.mjs
```

Before handing off a change, run the repository checks with the pinned toolchain:

```bash
mise exec -- pnpm check
mise exec -- pnpm test
```

For a local browser check, build and serve the static image, then confirm the
browser Network panel loads `https://analytics.niuluc.me/script.js` and that the
page has no horizontal overflow at 390px or 1440px wide.

## Image

`Dockerfile` copies the site files into a pinned Caddy image, and
`Caddyfile` serves them on port 80 as a non-root user. The image
accepts `APP_COMMIT` and reports its first 12 characters at `/healthz`. The
build context is this folder:

```bash
docker build --build-arg APP_COMMIT=0123456789abcdef -t hosti-landing landing
docker run --rm -p 8080:80 hosti-landing
curl -fsS http://127.0.0.1:8080/healthz
# { "status": "ok", "commit": "0123456789ab" }
```

TLS ends at Traefik, so the container speaks plain HTTP.

## Deploy

The page is live at `https://hosti.kubaszwajka.com`. It is moving to a new
image-based Dokploy application `hosti-landing-image`, next to the app's
`hosti`. The existing `hosti-landing` application is GitHub-source until the
separately approved cutover.

| Setting | Value |
| --- | --- |
| Source | Docker image `ghcr.io/jakubszwajka/hosti:landing-prod-sha-<12>`, pinned by each release |
| Build | "Create release" builds `landing/Dockerfile` with context `landing/` and pushes to GHCR |
| Domain | `hosti.kubaszwajka.com`, HTTPS, routed to container port `80` |
| Auto deploy | off |

Before a real release, the workflow preflights the public `/healthz` and
requires `{"status":"ok","commit":"<12 lowercase hex>"}`. It then deploys the
new application after Hosti and waits for the same commit. It does not change
the old GitHub-source app in place. Set the repo variable
`DOKPLOY_LANDING_APPLICATION_ID` to the new application before a real release.

The current `v0.3.0` landing app returns an empty `/healthz`, so it cannot be
used as the bootstrap image. After the first release commit is merged to
`main`, build and publish that commit's health-aware landing image and deploy
it to the new application before the domain cutover. Verify the new
application, then get separate production approval to point the domain at it.
Keep the old GitHub-source app for manual fallback. The first two-image
release cannot automatically roll back to `v0.3.0` unless a compatible
landing image is intentionally built and published.

For a local check, build with a commit, then confirm `/healthz` returns JSON
with that commit and `/v/example?x=y` redirects to `hosti-private` with the
query preserved.

## What the server answers

| Path | Answer |
| --- | --- |
| `/healthz` | 200, JSON `{"status":"ok","commit":"<12>"}` from the image build commit |
| `/api/*`, `/b/*`, `/c/*`, `/v/*`, `/connect/*` | 308 to `https://hosti-private.kubaszwajka.com` with the same path and query |
| `/login*`, `/logout*`, `/tokens*`, `/upload*` | the same 308 |
| `/`, `/docs/*`, `/styles/*`, `/icon.svg` | the files, cached for 5 minutes (pages) or one day (styles, icon) |
| anything else | 404, not cached |

The redirects keep old share, approval and API links working after the app
moved off this domain. They do not carry a CLI login: `fetch` drops
`Authorization` on a cross-origin redirect. A CLI logged in against this
domain must point `url` in `~/.config/hosti.json`, or `HOSTI_URL`, at
`https://hosti-private.kubaszwajka.com`. The token stays valid.
