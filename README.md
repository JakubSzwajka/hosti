# Hosti

A catalog and host for static bundles that AI agents generate. Push a folder,
get a URL. One VPS, one domain, one person.

The words Hosti uses are defined in [CONTEXT.md](./CONTEXT.md).

## Run it

```bash
npm install
npm run dev            # http://localhost:3000
```

Other commands, all from the repository root:

```bash
npm run build          # Next production build
npm run test           # vitest
npm run check          # Biome, then tsc across the workspaces
npm run token:new -- --name laptop
```

`npm install` on npm 11 asks before running a dependency's install script.
`better-sqlite3` needs its one, and `package.json` already records the approval
in `allowScripts`.

## Push a bundle

```bash
export HOSTI_PUSH_TOKEN=$(npm run --silent token:new -- --name laptop | sed -n 2p)

tar czf /tmp/b.tgz -C ./fixtures/multi-page .
curl -X POST localhost:3000/api/v1/bundles/squad-2026/revisions \
  -H "Authorization: Bearer $HOSTI_PUSH_TOKEN" \
  -H "X-Hosti-Title: Squad 2026" \
  --data-binary @/tmp/b.tgz
# 201 {"bundle":"squad-2026","revision":1,"url":"http://localhost:3000/v/squad-2026/"}

curl localhost:3000/api/v1/bundles -H "Authorization: Bearer $HOSTI_PUSH_TOKEN"
```

Pushing an unknown slug creates the bundle and a share link of the same name.
Pushing it again creates the next revision and moves `current` onto it.

Hosti stores what it unpacks and nothing else. The entry file is `index.html` at
the root of the pushed tree; a tree with exactly one root `.html` file and no
`index.html` has that file stored as `index.html`, which is how a single-file
bundle arrives.

Limits, checked while unpacking: 50 MB compressed body, 2000 files, 20 MB per
file. Absolute paths, paths that climb out, symlinks and device nodes are
refused.

macOS `tar` packs extended attributes as `._name` sidecars. Hosti drops them,
so a single-file push from a mac shell still has exactly one root HTML file.

## Read a bundle

```
/v/x                  308 to /v/x/
/v/x/                 index.html
/v/x/athletes/        athletes/index.html
/v/x/athletes         308 to /v/x/athletes/
/v/x/reports/2026-q3  reports/2026-q3.html
/v/x/assets/chart.js  the file
anything else         the bundle's 404.html, else Hosti's own 404
```

Links inside a bundle must be relative. A link written `/assets/chart.js` asks
for the root of the domain, which is the catalog, and it will 404.

## On disk

```
$HOSTI_DATA_DIR/
  hosti.db
  bundles/squad-2026/
    current -> r2
    r1/index.html
    r2/index.html
```

`HOSTI_DATA_DIR` defaults to `./data` and the container sets it to `/data`. See
[.env.example](./.env.example).

## Docker

```bash
docker compose build
docker compose up -d
docker compose exec web node scripts/new-token.mjs --name vps
docker compose down
```

One service, one named volume at `/data`. Put Caddy in front for TLS.

## Layout

```
apps/web         Next.js: push API, bundle serving, catalog UI (later slice)
apps/cli         hosti push (another lane, not built yet)
packages/shared  types both sides need
fixtures/        the three bundle shapes, used by tests and by hand
```
