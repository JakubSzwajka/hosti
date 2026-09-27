# Landing page

The static page for `hosti.kubaszwajka.com`: `index.html`, `styles/` and
`icon.svg`. There is no build step. The Hosti app itself runs at
`hosti-private.kubaszwajka.com`.

## Image

[Dockerfile](Dockerfile) copies the site files into a pinned Caddy image, and
[Caddyfile](Caddyfile) serves them on port 80 as a non-root user. The build
context is this folder:

```bash
docker build -t hosti-landing landing
docker run --rm -p 8080:80 hosti-landing
```

In Dokploy, set the Dockerfile path to `landing/Dockerfile` and the build
context to `landing/`. TLS ends at Traefik, so the container speaks plain HTTP.

## What the server answers

| Path | Answer |
| --- | --- |
| `/healthz` | 200, empty body |
| `/api/*`, `/b/*`, `/c/*`, `/v/*`, `/connect/*` | 308 to `https://hosti-private.kubaszwajka.com` with the same path and query |
| `/login*`, `/logout*`, `/tokens*`, `/upload*` | the same 308 |
| `/`, `/styles/*`, `/icon.svg` | the files, cached for 5 minutes (page) or one day (styles, icon) |
| anything else | 404, not cached |

The redirects keep old share, approval and API links working after the app
moved off this domain.
