# Landing page

The static page for `hosti.kubaszwajka.com`: `index.html`, `styles/` and
`icon.svg`. `docs/` holds the static docs at `/docs/`, one folder per page with
an `index.html`. There is no build step. The Hosti app itself runs at
`hosti-private.kubaszwajka.com`.

## Image

[Dockerfile](Dockerfile) copies the site files into a pinned Caddy image, and
[Caddyfile](Caddyfile) serves them on port 80 as a non-root user. The build
context is this folder:

```bash
docker build -t hosti-landing landing
docker run --rm -p 8080:80 hosti-landing
```

TLS ends at Traefik, so the container speaks plain HTTP.

## Deploy

The page is live at `https://hosti.kubaszwajka.com`. It runs as the Dokploy
application `hosti-landing`, next to the app's `hosti`:

| Setting | Value |
| --- | --- |
| Source | GitHub, this repository, branch `main` |
| Build | Dockerfile path `landing/Dockerfile`, build context `landing/` |
| Domain | `hosti.kubaszwajka.com`, HTTPS, routed to container port `80` |
| Auto deploy | off |

"Create release" does not deploy it. That workflow waits for a new commit on
`/api/health`, and this page has no such route. To ship a change:

1. [ ] Merge it to `main`.
2. [ ] In Dokploy, open `hosti-landing` and press Deploy. It builds from the
   current `main`.
3. [ ] Check that `https://hosti.kubaszwajka.com/` shows the change and
   `https://hosti.kubaszwajka.com/b/x` answers 308 to `hosti-private`.

## What the server answers

| Path | Answer |
| --- | --- |
| `/healthz` | 200, empty body |
| `/api/*`, `/b/*`, `/c/*`, `/v/*`, `/connect/*` | 308 to `https://hosti-private.kubaszwajka.com` with the same path and query |
| `/login*`, `/logout*`, `/tokens*`, `/upload*` | the same 308 |
| `/`, `/docs/*`, `/styles/*`, `/icon.svg` | the files, cached for 5 minutes (pages) or one day (styles, icon) |
| anything else | 404, not cached |

The redirects keep old share, approval and API links working after the app
moved off this domain. They do not carry a CLI login: `fetch` drops
`Authorization` on a cross-origin redirect. A CLI logged in against this
domain must point `url` in `~/.config/hosti.json`, or `HOSTI_URL`, at
`https://hosti-private.kubaszwajka.com`. The token stays valid.
