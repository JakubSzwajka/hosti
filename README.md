# Hosti

A catalog and host for static bundles that AI agents generate. Push a folder,
get a URL. One VPS, one domain, one person.

The words Hosti uses are defined in [CONTEXT.md](./CONTEXT.md).

## Run it

```bash
npm install
export HOSTI_OWNER_PASSWORD=whatever-you-will-remember
export HOSTI_SECRET=$(openssl rand -hex 32)
npm run dev            # http://127.0.0.1:3000
```

Without those two variables the catalog will not serve a single admin page. It
says which one is missing on `/login` instead of letting anyone in.

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

## The catalog

```
/login                   the owner password, one field
/                        every bundle, newest push first
/c/reports               one collection; /c/- is the bundles no push put in one
/b/garmin-q3             one bundle: preview, revisions, sharing, collection, delete
/b/garmin-q3/preview/    the bundle itself, for the owner's eyes only
/upload                  drop an archive here; the drop zone posts to it
```

The session is a signed cookie, `hosti_admin`: HttpOnly, SameSite=Lax, Secure
when the request arrived over TLS, good for 30 days, signed with `HOSTI_SECRET`.
The login form takes five wrong passwords per caller per fifteen minutes and
then locks that caller out for ten. The count lives in memory, so a restart
clears it.

Every change the catalog makes, setting the sharing state, rotating the link,
setting a collection, deleting a bundle, logging out, is a POST carrying a token
derived from the session. No GET ever changes anything.

### Putting a bundle in from the browser

Drag a `.zip` or a `.tar.gz` anywhere onto the catalog, or press the file
button in the bar above the grid. The slug is filled in from the file name,
lowercased and cut down to letters, digits and dashes, and you correct it
before anything is sent. `Garmin Q3.zip` suggests `garmin-q3`.

A slug already in the catalog says so, in so many words, before the upload
starts: it lands as that bundle's next revision and becomes the one people
see, exactly as `hosti push` would. Retention prunes afterwards the same way.

The upload is a POST to `/upload` carrying the admin session and the same
mutation token every other change the catalog makes carries. No push token is
involved and nothing new is open to the public. It is posted with XHR rather
than submitted, so the bar can show how far the bytes have got and print the
server's own refusal when it refuses:

```
No index.html at the root of the pushed tree. Found: docs/, notes.txt
```

A zip goes through the same limits, the same path rules and the same
entry-file rule as a pushed tarball, because both readers hand every entry to
one sink. Zip needs no dependency: `zlib.inflateRaw` is the whole of deflate,
and the central directory is fixed-offset reads. Stored and deflated entries
are read; anything else, an encrypted entry, or a unix symlink is refused. The
Finder's `__MACOSX` tree is dropped, like the `._` sidecars `tar` makes.

Which container an upload is comes from its first bytes, not its name, so a
tarball someone renamed `.zip` still unpacks and a renamed anything-else is
refused before a directory is made.

### Live previews

Each card on the catalog runs the bundle itself, scaled down. There is no
screenshot, no stored image and no headless browser: it is the bundle's current
revision in an `<iframe>`, served from `/b/<slug>/preview/`. That route needs
the admin session, so a preview works on a private bundle, which is most of
them.

The frame carries `sandbox="allow-scripts"` and deliberately **not**
`allow-same-origin`, so the bundle runs in an opaque origin and cannot read the
owner's cookie or call the catalog's endpoints with credentials. That costs
something: a sandboxed document has no site-for-cookies, so the browser
withholds the `SameSite=Lax` admin cookie from the requests it makes for its own
`styles.css`. Measured in Chrome, the frame loads and every asset under it 404s.

So the preview URL carries a short-lived signed grant in its path,
`/b/<slug>/preview/~<grant>/`, which a relative asset URL inherits. A grant is
minted per page render, lasts 30 minutes, is bound to one bundle slug and is
signed with `HOSTI_SECRET`. It gives whoever holds that URL read access to that
one bundle's current revision until it runs out, which is the same power as a
share link somebody rotates half an hour later. It cannot be tied to the session nonce,
because the nonce lives in the cookie the sandbox strips, so logging out does
not kill an outstanding grant. Rotating `HOSTI_SECRET` does.

Preview responses answer `frame-ancestors 'self'` so the catalog may frame them.
The guest route at `/v/` is unchanged and still answers `frame-ancestors 'none'`.
Frames mount as cards come near the viewport, so a catalog of fifty bundles does
not start fifty page loads at once, and a card shows its drawn placeholder until
its frame loads.

A preview renders at a fixed viewport width and is then scaled to fit its slot:
760px for a card, 1100px for the bundle page. Rendering everything at 1280 and
scaling a card to a quarter made the text vanish; at 760 a bundle's own
responsive rules fire and the type survives the scale as legible shape. Both
slots crop to the first screen and fade out at the base, so a cut reads as a
crop rather than as a broken page.

### The origin risk

A bundle runs its own JavaScript on the same origin as the catalog, so a script
inside a bundle you forgot about can `fetch('/')` with the owner cookie attached
and read the catalog back. Slice 1 accepts that read. What it does not accept is
that same script writing: mutations need a per-session token that is rendered
into the page, never stored in a readable cookie, and the push API stays on
bearer tokens that no browser holds. The real fix is serving `/v/` from a second
hostname, and that is the first thing to revisit before Hosti hosts anything
someone else generated.

The preview frame is the one place a bundle already runs boxed off from this
origin, because its sandbox denies `allow-same-origin`. A bundle opened through
`/v/` in its own tab still runs on the catalog's origin and still gets that read.

## The CLI

```bash
export HOSTI_URL=http://127.0.0.1:3000
export HOSTI_TOKEN=$(npm run --silent token:new -- --name laptop | sed -n 2p)

hosti push ./fixtures/multi-page --slug squad-2026 --title "Squad 2026"
hosti share squad-2026 --mode link
hosti share squad-2026 --mode pin --pin 4821
hosti share squad-2026 --mode private
hosti rotate squad-2026
hosti ls
hosti rm atlas
hosti open squad-2026
hosti open squad-2026 --open
hosti prune squad-2026
```

`share` is the only way the sharing state moves. `--mode pin` needs a pin: send
`--pin`, or leave it off only when the bundle already holds one. `--pin` under
any other mode is refused by the CLI before a request leaves.

`rotate` mints a fresh share URL and the old one stops answering. It is the
only way to cut off somebody who already has the address, and it leaves the
state and the pin alone.

`open` prints where a bundle can be read: its share link, or its owner-only
page while the bundle is private. The URL is always the last line and nothing
else is on it, so `hosti open x | tail -1` is a URL. `--open` hands it to the
platform's browser as well. An unknown slug exits 1.

`prune` trims a bundle to the newest few revisions and says which it kept and
which it took away. The count is the server's, from `HOSTI_KEEP_REVISIONS`;
the CLI has no flag for it, because the endpoint takes none.

`ls` prints `private`, `link` or `pin`, the same three words the catalog uses.
Nothing ever prints the digits of a pin, because Hosti holds a hash and cannot
read one back. Digits the server refuses come back as its own message on the
last line, exit code 1.

The binary is `apps/cli`. It runs its TypeScript straight on Node, which strips
the types itself from **22.18 onwards**, so there is no build step and nothing
to compile. It talks HTTP only: it never opens the SQLite file.

To get `hosti` on the PATH, from the repository root:

```bash
npm install                    # once, so tar is there for the CLI to find
npm link -w @hosti/cli         # or: npm i -g ./apps/cli
hosti ls                       # from anywhere now
```

Both routes symlink the global `hosti` at this checkout rather than copying it,
so the repository has to stay where it is and an edit to `apps/cli/src` is live
at once. There is no third route: `@hosti/cli` is a workspace package and is
not published, so `npm i -g @hosti/cli` has nothing to fetch.

`npm unlink -g @hosti/cli` takes it off again.

Settings resolve in this order, per setting: `--url` and `--token`, then
`HOSTI_URL` and `HOSTI_TOKEN`, then `~/.config/hosti.json` (or
`$XDG_CONFIG_HOME/hosti.json`), a file of `{"url": "...", "token": "..."}`.
Missing settings exit 2 and name what to set. A server that refuses exits 1 with
its own message as the last line.

`push` takes a directory or one `.html` file. It leaves out `.git`,
`node_modules`, `.DS_Store` and `._` sidecars, and it warns about references
that start with a slash, because those ask for the root of the domain:

```
$ hosti push ./fixtures/root-absolute --slug repo-atlas
warning  5 root-absolute references will 404 under /v/repo-atlas/
            about.html:4   <script src="/assets/nav.js">
            index.html:6   <link rel="stylesheet" href="/assets/atlas.css" />
          fix them, or push anyway with --allow-absolute
pushed   revision 1
private  nothing answers at the share URL
admin    http://127.0.0.1:3000/b/repo-atlas
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
#      "adminUrl":"http://localhost:3000/b/squad-2026",
#      "sharing":{"mode":"private","shareSlug":"squad-2026","hasPin":false},
#      "shareUrl":null}

curl localhost:3000/api/v1/bundles -H "Authorization: Bearer $HOSTI_PUSH_TOKEN"
```

Pushing an unknown slug creates the bundle. Pushing it again creates the next
revision and moves `current` onto it. **A push never changes the sharing
state**, so a new bundle is `private` and answers 404 at `/v/<slug>/` until the
owner says otherwise.

## Keeping the last few revisions

Old pushes are the one thing here that grows without bound, so a push keeps the
newest few revisions of its bundle and deletes the rest, files and rows both.
`HOSTI_KEEP_REVISIONS` sets the count and defaults to 5. A value below 1 is read
as 1, and anything that is not a number falls back to 5. **The current revision
is never deleted**, whatever the count says.

A push prunes on its own. The endpoint is for a bundle nobody is pushing any
more, usually after the keep count was tightened:

```bash
curl -X POST localhost:3000/api/v1/bundles/squad-2026/prune \
  -H "Authorization: Bearer $HOSTI_PUSH_TOKEN"
# 200 {"bundle":"squad-2026","keep":5,"kept":[9,8,7,6,5],"removed":[4,3,2,1]}
```

The bundle page shows how many revisions are kept.

## Collections

A collection is a flat label on a bundle, never a directory, and a bundle sits
in zero or one. A push sets one with `--collection`, an upload sets one in the
drop zone, and the bundle page is where the owner changes it or takes it away:

```
/b/squad-2026   type a name that exists, type a new one, or clear it
```

Clearing moves the bundle to the `no collection` chip at `/c/-`, which is why
`-` cannot name a collection. Nor can a name with a slash in it, or one over 64
characters; the page says so and changes nothing.

Every way in is held to that rule, `X-Hosti-Collection` included. A push naming
`-` is refused 400 `bad_collection` before a byte reaches the disk, so it leaves
no revision behind. It used to go through, and such a bundle answered to no
chip at all: not to `/c/-`, which lists bundles with no collection, and not to a
chip of its own, because none is drawn for a name the catalog reads as "none".
Any bundle left sitting in `-` is moved to no collection when the database is
opened, which is where its own chip link already pointed.

Clearing a collection is still the catalog's job alone. A push or an upload
that names none leaves the label the owner chose where it is.

## Sharing

A bundle has one sharing state and at most one link:

```
private   nothing answers at the share URL, the same 404 as any other miss
link      anyone holding the URL opens the bundle
pin       the URL shows the pin gate, then opens the bundle
```

The share URL uses the bundle slug, so `squad-2026` is shared at
`/v/squad-2026/`. Every call needs a push token.

```bash
# open it
curl -X PUT localhost:3000/api/v1/bundles/squad-2026/sharing \
  -H "Authorization: Bearer $HOSTI_PUSH_TOKEN" \
  -H "Content-Type: application/json" -d '{"mode":"link"}'
# 200 {"bundle":"squad-2026",
#      "sharing":{"mode":"link","shareSlug":"squad-2026","hasPin":false},
#      "shareUrl":"http://localhost:3000/v/squad-2026/"}

# put it behind a pin
curl -X PUT localhost:3000/api/v1/bundles/squad-2026/sharing \
  -H "Authorization: Bearer $HOSTI_PUSH_TOKEN" \
  -H "Content-Type: application/json" -d '{"mode":"pin","pin":"4821"}'
# 200 ... "sharing":{"mode":"pin","shareSlug":"squad-2026","hasPin":true}

# shut it again. This also clears the stored pin hash.
curl -X PUT localhost:3000/api/v1/bundles/squad-2026/sharing \
  -H "Authorization: Bearer $HOSTI_PUSH_TOKEN" \
  -H "Content-Type: application/json" -d '{"mode":"private"}'
# 200 ... "sharing":{"mode":"private",...,"hasPin":false},"shareUrl":null

# cut off everyone holding the old address
curl -X POST localhost:3000/api/v1/bundles/squad-2026/sharing/rotate \
  -H "Authorization: Bearer $HOSTI_PUSH_TOKEN"
# 200 ... "shareSlug":"k7f3n9qpbcdf",
#         "shareUrl":"http://localhost:3000/v/k7f3n9qpbcdf/"

curl localhost:3000/api/v1/bundles/squad-2026 \
  -H "Authorization: Bearer $HOSTI_PUSH_TOKEN"
# 200 {"bundle":{...,"sharing":{...}},"shareUrl":"..."}

curl -X DELETE localhost:3000/api/v1/bundles/squad-2026 \
  -H "Authorization: Bearer $HOSTI_PUSH_TOKEN"
# 200 {"bundle":"squad-2026","deleted":true}   # revisions and files go too
```

`rotate` mints a fresh random share slug, twelve characters with no vowels. The
old URL stops answering at once, and that is the only way to cut off somebody
who already has the address. It keeps whatever state and pin the bundle had, so
rotating a private bundle just changes the address it will use.

A mode that is not one of the three comes back 400 `bad_mode`.

## Pins

A pin makes the link ask for four to eight digits first. **You type the digits;
Hosti never invents them.** It hashes what you send with `scrypt` and a fresh
salt, so no endpoint and no page ever shows a pin again. To change one, send
new digits. To get rid of the gate, set the mode to `link`.

`{"mode":"pin"}` with no pin stored and no `pin` in the body comes back 400
`pin_required`. It is refused rather than quietly downgraded, because a bundle
you asked to guard should not end up open. Once a pin is stored you may send
`{"mode":"pin"}` on its own and the stored one stays.

A `pin` sent with `private` or `link` comes back 400 `pin_not_wanted`. Moving
to either of those clears the stored hash, because a pin that survives going
private is a trap: you turn the link back on months later and meet a gate whose
digits you no longer remember.

Anything that is not four to eight digits comes back 400 `bad_pin`, and the
message never quotes what you sent. Setting a pin needs `HOSTI_SECRET`, because
that key signs the cookie a guest gets for typing it right; without the key the
call is refused 503 rather than leaving a link nobody could open.

What a guest sees at `/v/<share-slug>/`:

```
browser asks for a page   200, the gate, at the same URL, no redirect
anything else asks        404, the same 404 as any other miss
POST .../unlock, right    303 onward, cookie set
POST .../unlock, wrong    303 back to the gate, one error line
```

The cookie is `hosti_pin_<share-slug>`: HttpOnly, SameSite=Lax, Secure over TLS,
`Path=/v/<share-slug>`, good for 12 hours. It opens that one link. A rotate
changes the slug, so every grant anyone is holding stops working and the fresh
URL asks again.

The gate takes ten wrong pins per caller per fifteen minutes and then shuts that
link to that caller for an hour, and while it is shut the right pin is refused
too. The count lives in memory, so a restart clears it. The gate itself names
nothing: not the bundle title, not the collection, not whether the slug is real.

Hosti keeps no record of who opened a link. No counters, no hit table, no last
opened stamp, no addresses.

Hosti stores what it unpacks and nothing else. The entry file is `index.html` at
the root of the pushed tree; a tree with exactly one root `.html` file and no
`index.html` has that file stored as `index.html`, which is how a single-file
bundle arrives.

Limits, checked while unpacking: 50 MB compressed body, 2000 files, 20 MB per
file. Absolute paths, paths that climb out, symlinks and device nodes are
refused. One sink enforces all of it, so a zip dropped on the catalog and a
tarball pushed by the CLI are held to the same rules by the same code.

macOS `tar` packs extended attributes as `._name` sidecars. Hosti drops them,
so a single-file push from a mac shell still has exactly one root HTML file.

## Read a bundle

```
/v/x                  308 to /v/x/, unless a pin gates it
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

`docker-compose.yml` is a deployment example. It runs the published image,
`ghcr.io/jakubszwajka/hosti:latest`, which the publish workflow builds from
`apps/web/Dockerfile` on every push to main. Nothing is built on the box.

```bash
cp .env.example .env   # then set HOSTI_OWNER_PASSWORD and HOSTI_SECRET
docker login ghcr.io -u YOUR_GITHUB_USERNAME   # once per box, see below
docker compose pull    # fetch the image, and again whenever main moves
docker compose up -d
docker compose exec web node scripts/new-token.mjs --name vps
docker compose down
```

This repository is private, so the package the workflow publishes is private
too. Without the login `docker compose pull` is refused. `docker login` asks for
a password: give it a GitHub token that carries `read:packages`, not your
account password. The token belongs in your hands and in Docker's own config on
the box, never in this repository and never in `.env`. One login lasts, so this
is a first-time step and not part of every deploy.

`pull` is the only update step: pull, then `up -d` again, and Compose replaces
the container while the data stays put. `npm run compose:up` from the repository
root is `up -d --pull always`, which does both in one go.

`new-token.mjs` mints a push token for the CLI or for `curl`. The image's
working directory is the app, so the path is `scripts/new-token.mjs`, and the
token is written to the database in the volume.

`down` stops the container and leaves the volume alone. Only `down -v` deletes
the bundles and the database.

One service, one named volume. `hosti_data` mounts at `/data`, and the service
pins `HOSTI_DATA_DIR=/data`, so the bundles and `hosti.db` both live in the
volume and a backup is `tar` over `/data`. Put Caddy in front for TLS.

Compose reads `.env` from the directory it runs in and passes four of its
values through:

```
HOSTI_OWNER_PASSWORD   required; Compose refuses to start without it
HOSTI_SECRET           required; `openssl rand -hex 32`
HOSTI_PUBLIC_URL       the origin in push responses; http://localhost:3000
HOSTI_PORT             the host port in front of the container's 3000; 3000
```

The two required ones have no default on purpose: Compose stops with the
message in the file rather than starting a catalog nobody can open. The rest of
[.env.example](./.env.example) is for `npm run dev`. `HOSTI_DATA_DIR` and `PORT`
are fixed by the compose file, and anything else you want the container to read,
`HOSTI_KEEP_REVISIONS` among them, has to be added to the service's
`environment:` first.

The login above is what a private package costs. You can drop it: open the
package in GitHub and set its visibility to public. After that
`docker compose pull` needs no credentials on any box. The image is the app,
not your bundles, which stay in the volume either way.

## The mark

Two pages linked, one bundle pointing at another. It is drawn by hand as SVG,
not generated and not traced from a bitmap, so every edge is a whole pixel at
16px and at 32px.

```
apps/web/src/app/icon.svg        the favicon; Next links it for you
apps/web/src/app/apple-icon.png  180px, the same drawing on the same paper white
apps/web/src/app/_ui/mark.tsx    <Mark size={24} />, inline, ink from currentColor
```

The icon carries its own near-white plate, which is what lets one drawing sit on
a light tab strip and a dark one. `<Mark>` drops the plate and borrows the
surrounding text colour instead. Both share one set of numbers on a 32 grid; the
comment in `mark.tsx` says why they are those numbers. `apple-icon.png` is a
180px browser render of `icon.svg` over `#f8fdff`, so the plate's rounded corners
disappear into a full square and iOS applies its own mask.

## Layout

```
apps/web         Next.js: the catalog UI, push API, sharing API, serving
apps/cli         hosti: push, ls, share, rotate, rm, open, prune
packages/shared  types both sides need
fixtures/        the three bundle shapes plus one that links from the root
```
