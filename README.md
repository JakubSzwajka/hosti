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

## The CLI

```bash
export HOSTI_URL=http://127.0.0.1:3000
export HOSTI_TOKEN=$(npm run --silent token:new -- --name laptop | sed -n 2p)

hosti push ./fixtures/multi-page --slug squad-2026 --title "Squad 2026"
hosti share squad-2026
hosti push ./out --slug atlas --share --unlisted
hosti ls
hosti links squad-2026
hosti revoke atlas-k7f3n9qp
hosti rm atlas
```

The binary is `apps/cli`, linked into `node_modules/.bin/hosti` by `npm
install`. It runs its TypeScript straight on Node 22.18 or newer, so there is
no build step. It talks HTTP only: it never opens the SQLite file.

Settings resolve in this order, per setting: `--url` and `--token`, then
`HOSTI_URL` and `HOSTI_TOKEN`, then `~/.config/hosti.json` (or
`$XDG_CONFIG_HOME/hosti.json`), a file of `{"url": "...", "token": "..."}`.
Missing settings exit 2 and name what to set. A server that refuses exits 1 with
its own message as the last line.

`push` takes a directory or one `.html` file. It leaves out `.git`,
`node_modules`, `.DS_Store` and `._` sidecars, and it warns about references
that start with a slash, because those ask for the root of the domain:

```
$ hosti push ./fixtures/root-absolute --slug repo-atlas --share
warning  5 root-absolute references will 404 under /v/repo-atlas/
            about.html:4   <script src="/assets/nav.js">
            index.html:6   <link rel="stylesheet" href="/assets/atlas.css" />
          fix them, or push anyway with --allow-absolute
pushed   revision 1
shared   http://127.0.0.1:3000/v/repo-atlas/
```

The push still goes through, and the CLI never rewrites your files. The links
it prints use the server you asked for, not the host the server names itself.

## Push a bundle by hand

```bash
export HOSTI_PUSH_TOKEN=$(npm run --silent token:new -- --name laptop | sed -n 2p)

tar czf /tmp/b.tgz -C ./fixtures/multi-page .
curl -X POST localhost:3000/api/v1/bundles/squad-2026/revisions \
  -H "Authorization: Bearer $HOSTI_PUSH_TOKEN" \
  -H "X-Hosti-Title: Squad 2026" \
  --data-binary @/tmp/b.tgz
# 201 {"bundle":"squad-2026","revision":1,
#      "adminUrl":"http://localhost:3000/b/squad-2026","shareUrls":[]}

curl localhost:3000/api/v1/bundles -H "Authorization: Bearer $HOSTI_PUSH_TOKEN"
```

Pushing an unknown slug creates the bundle. Pushing it again creates the next
revision and moves `current` onto it. **A push never creates a share link**, so
`shareUrls` is empty until someone asks for one, and the bundle answers 404 at
`/v/<slug>/` until then.

## Share links

A share link is the only public door to a bundle. One bundle may hold several,
and revoking one leaves the bundle and its other links alone. Every call needs a
push token.

```bash
# open it; the link takes the bundle slug
curl -X POST localhost:3000/api/v1/bundles/squad-2026/share-links \
  -H "Authorization: Bearer $HOSTI_PUSH_TOKEN"
# 201 {"bundle":"squad-2026","link":{"slug":"squad-2026",
#      "url":"http://localhost:3000/v/squad-2026/","createdAt":"..."}}

# open it behind an unguessable slug: eight characters, no vowels
curl -X POST localhost:3000/api/v1/bundles/squad-2026/share-links \
  -H "Authorization: Bearer $HOSTI_PUSH_TOKEN" \
  -H "Content-Type: application/json" -d '{"unlisted":true}'
# 201 ... "slug":"squad-2026-k7f3n9qp"

curl localhost:3000/api/v1/bundles/squad-2026/share-links \
  -H "Authorization: Bearer $HOSTI_PUSH_TOKEN"
# 200 {"bundle":"squad-2026","links":[...]}

curl -X DELETE localhost:3000/api/v1/share-links/squad-2026-k7f3n9qp \
  -H "Authorization: Bearer $HOSTI_PUSH_TOKEN"
# 200 {"shareSlug":"squad-2026-k7f3n9qp","revoked":true}

curl -X DELETE localhost:3000/api/v1/bundles/squad-2026 \
  -H "Authorization: Bearer $HOSTI_PUSH_TOKEN"
# 200 {"bundle":"squad-2026","deleted":true}   # revisions and files go too
```

A second link on the bundle slug answers 409. Revoking drops the row, so the
slug can be handed out again. PINs and expiry are slice 2; their columns exist
and carry no behaviour.

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
apps/web         Next.js: push API, share-link API, bundle serving
apps/cli         hosti: push, ls, share, links, rm, revoke
packages/shared  types both sides need
fixtures/        the three bundle shapes plus one that links from the root
```
