# Hosti

Hosti is a self-hosted catalog for static bundles that AI agents generate. An
agent pushes a bundle, you preview it in the catalog, and you share it by link
or behind a pin. It runs as one container with one volume.

Hosti is not a hosting platform for other people's sites, a multi-user app or a
CMS. It has one user, the owner, and it serves only static files. It runs no
server-side code and records no visitor analytics. Hosti's vocabulary and rules
are defined in [CONTEXT.md](./CONTEXT.md).

## Features

- Put a static site in three ways. The `hosti` CLI pushes a folder or one
  `.html` file. The HTTP API takes a gzipped tarball. The browser takes a `.zip`
  or a `.tar.gz` by drag and drop.
- A catalog with a live preview of every bundle, and flat collections.
- Revisions: each push is a new revision, and the newest few are kept.
- Sharing per bundle: `private`, `link` or `pin`. Rotate a link to cut off
  everyone who has the old address.
- Agent login approved in your browser: no token passes through the clipboard
  or the chat. Tokens carry scopes (`publish`, `share`, `delete`).
- The `hosti-publish` skill, so an agent knows how to push and share.
- One container, one `/data` volume: the bundles and a SQLite file.

## Quick start

You need Docker with Compose, and a way to make the owner hash (next step).

1. Get the Compose file. It runs `ghcr.io/jakubszwajka/hosti:latest`, the newest
   release, and builds nothing:

   ```bash
   mkdir hosti && cd hosti
   curl -fsSLO https://raw.githubusercontent.com/JakubSzwajka/hosti/main/docker-compose.yml
   ```

2. Make the owner hash. Hosti stores the owner password only as a scrypt hash.
   See [Make the owner hash](#make-the-owner-hash) for the options. With Docker:

   ```bash
   docker run --rm -it ghcr.io/jakubszwajka/hosti:latest node scripts/owner-hash.mjs
   ```

3. Write a `.env` file next to the Compose file. Wrap every secret in single
   quotes:

   ```dotenv
   HOSTI_OWNER_PASSWORD_HASH='scrypt:16384:8:1:<salt>:<key>'
   HOSTI_SECRET='<output of: openssl rand -hex 32>'
   HOSTI_PUBLIC_URL=https://hosti.example.com
   ```

4. Start it:

   ```bash
   docker compose up -d
   ```

   Compose refuses to start while `HOSTI_OWNER_PASSWORD_HASH` or `HOSTI_SECRET`
   is missing. The service publishes no host port: it exposes port `3000` to the
   Docker network for a reverse proxy. For a local trial, add a `ports` entry
   such as `"127.0.0.1:3000:3000"` and leave `HOSTI_PUBLIC_URL` unset, so it
   defaults to `http://localhost:3000`.

5. Open the address, log in at `/login` with the password you hashed, and
   [connect an agent](#connect-an-agent).

To build the image from source instead of pulling it, clone the repository and
add the build override. It builds `apps/web/Dockerfile` with the repository root
as the context and tags the result `hosti:local`:

```bash
docker compose -f docker-compose.yml -f docker-compose.build.yml up -d --build
```

`docker compose down` keeps the `hosti_data` volume. `docker compose down -v`
removes it, and with it every bundle and the database.

## Configuration

[`.env.schema`](./.env.schema) lists and types every variable Hosti reads. It is
the source of truth. [`.env.example`](./.env.example) shows local values and holds
no live secrets. The Compose file passes only the variables in its
`environment` block to the container, so add an optional one there as well as
to `.env`.

| Variable | Required | Default | Meaning |
| --- | --- | --- | --- |
| `HOSTI_OWNER_PASSWORD_HASH` | Yes, for the admin pages | none | Scrypt hash of the owner password, `scrypt:16384:8:1:<salt>:<key>`. Make it with `pnpm owner:hash`. Compose requires it. Without a well-formed hash the catalog serves no admin page and `/login` names the missing value. |
| `HOSTI_SECRET` | Yes, for the admin pages | none | Signs the admin session cookie, the pin unlock cookies and the preview grants. A pin cannot be set without it. Changing it signs the owner out and shuts every unlocked link. Make it with `openssl rand -hex 32`. Compose requires it. |
| `HOSTI_PUBLIC_URL` | Yes, in a deployment | the request's own origin; Compose defaults to `http://localhost:3000` | The exact public HTTPS origin that serves Hosti. The approval link an agent prints, the share URLs and the absolute URLs in link-preview tags are built from it. |
| `HOSTI_DATA_DIR` | No | `./data`; the image and Compose set `/data` | Where `hosti.db` and the bundles live. |
| `PORT` | No | `3000` | The port the server listens on. The image and Compose use `3000`. |
| `HOSTI_KEEP_REVISIONS` | No | `5` | How many revisions of one bundle survive a push. A value below 1 is read as 1, and a value that is not a number falls back to 5. The current revision is never deleted. |
| `HOSTI_URL` | No | none | CLI only. The server the `hosti` CLI talks to. Overrides the saved login. |
| `HOSTI_TOKEN` | No | none | CLI only. The push token the CLI uses. Overrides the saved login. |
| `XDG_CONFIG_HOME` | No | `~/.config` | CLI only. Where the CLI keeps `hosti.json`. |
| `APP_COMMIT` | No | `unknown` | A Docker build argument. `/api/health` reports its first 12 characters. |
| `HOSTI_PUSH_TOKEN` | No | none | Not read by Hosti. The curl examples below use it as a shell variable name. |

Wrap every secret value in single quotes in `.env` and in a PaaS editor. Compose
and a PaaS environment editor parse the text before Hosti sees it. Compose reads `$name` in an unquoted value as a variable and puts its value
in, usually nothing, so `secr$tone` arrives as `secr`. Double quotes do not
protect a `$`; `$$` does, but single quotes cover both cases. A password ending in `#` failed
login when it was set unquoted in a PaaS editor, and worked once it was
single-quoted. A scrypt hash holds neither character, but single-quote it
anyway.

After you change a variable, redeploy so the container is recreated. A restart
keeps the old environment. To see what the running container holds without
printing a secret, run this in its shell or in the PaaS terminal:

```bash
docker compose exec web node scripts/env-check.mjs
```

It prints lengths and digest prefixes, never a value. From a clone,
`pnpm env:digest` does the same for your local environment, and
`pnpm env:check` validates it against `.env.schema`.

### Make the owner hash

The password needs at least 8 characters. Every option below prints only the
hash on stdout. Prompts and errors go to stderr.

- From a clone of the repository, after `pnpm install --frozen-lockfile`:

  ```bash
  pnpm --silent owner:hash
  ```

- Without a clone, with the image. This needs a release that ships the script,
  `v0.4.0` or later. Keep `-it` so the password prompt stays hidden:

  ```bash
  docker run --rm -it ghcr.io/jakubszwajka/hosti:latest node scripts/owner-hash.mjs
  ```

In a terminal, either command asks for the password twice without showing it.
In a script, pipe the password on stdin instead: `printf '%s' 'the password' |
pnpm --silent owner:hash`, or the same with `docker run --rm -i` and no `-t`.

Paste the output as `HOSTI_OWNER_PASSWORD_HASH`, in single quotes.

### Upgrading to v0.4.0

`v0.4.0` replaces `HOSTI_OWNER_PASSWORD` with `HOSTI_OWNER_PASSWORD_HASH`. The
plain variable is no longer read. Until the hash is set, the catalog serves no
admin page and `/login` names the missing variable.

1. [ ] Make a hash of the owner password, as above. Use a fresh password if the
   old one was ever written to a file, a log or a chat.
2. [ ] Set `HOSTI_OWNER_PASSWORD_HASH` in your `.env` or your PaaS, in single
   quotes.
3. [ ] Redeploy, not restart, so the container gets the new environment.
4. [ ] Log in with the password you hashed. Then remove the old
   `HOSTI_OWNER_PASSWORD`. `node scripts/env-check.mjs` (`pnpm env:digest` from a
   clone) warns while it is still set.

Before any upgrade, back up `/data` (see [Backups](#backups)). Hosti upgrades
`hosti.db` in place when it opens it, forward only, so an older image cannot
open a newer file.

## Connect an agent

Open `/tokens` in the catalog. An empty catalog shows the same panel on its
front page. It leads with two commands for the agent to run:

```bash
npm install -g https://github.com/JakubSzwajka/hosti/releases/latest/download/hosti-cli.tgz
hosti login https://hosti.example.com
```

The second carries your instance's URL. Under them the panel has an agent prompt
that says the same thing, ready to paste. It carries no token. The CLI needs
Node 24.21.0 or later.

`hosti login` starts an agent connection. The agent makes a push token and a
polling secret on its own machine and sends only their SHA-256 digests. It
prints a link to `/connect/<id>` and a short code such as `KX4F-9QLM`. You open
the link in your browser, log in if the browser has no session, check that the
page shows the same code, and approve. The CLI picks up the answer and saves
its login. The token never passes through your clipboard or the chat, and
Hosti never holds it in the clear.

The approval page shows the token name, the code, the scopes the agent asked
for and when the request runs out. `publish` and `share` are granted when
asked. `delete` appears only when the agent ran `hosti login --allow-delete`,
and its box starts unticked. You can grant less than was asked, never more. A
connection lives in server memory for ten minutes. A restart drops pending
ones, and the agent then runs `hosti login` again.

The list on `/tokens` shows every push token, its scopes, when it was made and
when it last pushed, with a revoke on each. Revoking drops the digest, so that
secret stops opening `/api/v1/` from the next request on. Nothing under
`/api/v1/` makes or revokes a token, so no push token can create another one.

To make a token from the server instead, run this where the container runs:

```bash
docker compose exec web node scripts/new-token.mjs --name laptop
```

Add `--allow-delete` for the `delete` scope. From a clone, run
`pnpm token:new -- --name laptop` with `HOSTI_DATA_DIR` pointing at the data
directory. Either way it prints the secret once. Hosti stores only the digest,
in `hosti.db`. `hosti login` stays the recommended path.

### The hosti-publish skill

The skill is a file in this repository, at `skills/hosti-publish/SKILL.md`. An
agent on any machine installs it by repository name:

```bash
npx skills add JakubSzwajka/hosti
```

Hosti serves nothing to make that work. The file is the same text for every
instance. It drives the CLI: install it if `hosti` is missing, run
`hosti whoami`, and if that fails, run `hosti login` with the URL the owner
gives and wait for approval. It covers push, share, rotate and open. It deletes
only when the token has `delete` and the owner asked. It never prints the token.

## The CLI

Install it with Node 24.21.0 or later, then connect it to a catalog:

```bash
npm install -g https://github.com/JakubSzwajka/hosti/releases/latest/download/hosti-cli.tgz
hosti login https://hosti.example.com
```

`hosti login` prints a link and a code, each on its own line, and tries to
open the link in a browser. The owner opens it, checks the code and approves.
The CLI then writes `{"url","token"}` to `~/.config/hosti.json` (or
`$XDG_CONFIG_HOME/hosti.json`) with mode `0600`, and prints the token's name
and scopes. It never prints the token. On a denied or expired connection, or
one the server forgot, it exits 1 and says to run `hosti login` again.

```bash
hosti login https://hosti.example.com --name "ci runner"   # default: <user>@<hostname>
hosti login https://hosti.example.com --allow-delete       # ask for delete too
hosti whoami     # the URL, the token name and its scopes
hosti logout     # forget the saved login; revoke the token on /tokens
```

`logout` only edits the local file. A push token cannot revoke itself, so the
token keeps working until the owner revokes it on `/tokens`.

A push token carries scopes, and the server checks them:

| Scope | Allows |
| --- | --- |
| `publish` | list bundles, read one, push a revision (creating the bundle if new), prune |
| `share` | set the sharing state to `private`, `link` or `pin`, set a pin, rotate the share link |
| `delete` | delete a bundle, with its revisions and files |

Every token has `publish`. `hosti login` asks for `publish` and `share`, and
for `delete` only with `--allow-delete`. The owner grants `delete` only by
ticking it. A command the token lacks the scope for answers 403 with
`missing_scope`; the CLI prints the server's message on the last line and exits 1.
Tokens made before scopes existed carry all three.

Once logged in:

```bash
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

Settings resolve in this order, per setting: `--url` and `--token`, then
`HOSTI_URL` and `HOSTI_TOKEN`, then the saved login in `~/.config/hosti.json`.
`hosti login` and `hosti logout` warn when `HOSTI_URL` or `HOSTI_TOKEN` is set,
because those override the saved login. Missing settings exit 2 and name what
to set. A server that refuses exits 1 with its own message as the last line.

### Where the CLI comes from

The source is `apps/cli`. In this checkout it runs its TypeScript straight on
Node 24.21.0, which strips the types itself, so development and the tests need
no build:

```bash
node apps/cli/src/index.ts --help
```

Node refuses to strip types from files under `node_modules`, so the installed
package is compiled JavaScript. `pnpm --filter @hosti/cli run pack:tgz` builds
it with the CLI's own TypeScript 7.0.2 in a temporary directory and writes
`apps/cli/hosti-cli.tgz`. Pass a directory to write it somewhere else. The
packed CLI imports no workspace package at run time; its one dependency is
`tar`. `tests/cli-package.test.mjs` packs it, installs the tarball offline into
a temporary prefix and runs `hosti --help` from `node_modules`.

Pushing a tag `cli-v<version>` runs `.github/workflows/release-cli.yml`. It
checks that the tag matches `apps/cli/package.json`, runs the CLI tests and the
packaging test, packs `hosti-cli.tgz` and attaches it to a GitHub Release for
that tag, marked latest. The install command above always fetches the latest
release. To try a local change, install from a local pack instead:

```bash
pnpm --filter @hosti/cli run pack:tgz
npm install -g ./apps/cli/hosti-cli.tgz
```

The CLI talks HTTP only: it never opens the SQLite file.

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

## Deploy behind a reverse proxy or a PaaS

Whatever you deploy on, Hosti needs the same four things:

1. [ ] The image `ghcr.io/jakubszwajka/hosti:latest`, or a version tag such as
   `:v0.4.0` to stay on one release. `latest` is the newest release. A push to
   `main` builds no image and moves no tag.
2. [ ] A persistent volume mounted at `/data`. It holds the bundles and
   `hosti.db`. The image already sets `HOSTI_DATA_DIR=/data` and `PORT=3000`.
3. [ ] The environment from [Configuration](#configuration): at least
   `HOSTI_OWNER_PASSWORD_HASH`, `HOSTI_SECRET` and `HOSTI_PUBLIC_URL`.
4. [ ] An HTTPS domain that routes to container port `3000`. Publish nothing on
   the host.

`HOSTI_PUBLIC_URL` must be the exact HTTPS origin that serves Hosti, such as
`https://hosti.example.com`. Share links and the approval link an agent prints
are built from it. Hosti runs as the `node` user and answers `GET /api/health`
without login:

```json
{"status":"ok","commit":"0123456789ab"}
```

The `commit` is the first 12 characters of `APP_COMMIT`, or `unknown` for an
image built without it. The Compose healthcheck calls this route.

### A reverse proxy on a plain host

Use the Compose file from [Quick start](#quick-start). Its service is `web`. It
mounts the named volume `hosti_data:/data` and exposes port `3000` to the Docker
network without publishing it. Run Caddy, Traefik or nginx on the same network
and point it at service `web`, port `3000`. Terminate TLS in the proxy.

Every response under `/v/` carries `Cache-Control: private, no-store`. Keep it.
A shared cache in front of Hosti, such as a CDN, must never hold one of these
responses: a cached 404 for a still-locked asset once kept answering after the
owner unlocked the link.

### Dokploy or another PaaS

Either of these works on Dokploy. Other PaaS products have the same settings
under other names.

- **A Compose application.** Point it at `docker-compose.yml`, set the three
  variables in the environment editor and give the service `web` a domain on
  port `3000`. Compose parses the `.env` that the PaaS writes, so the quoting
  advice in [Configuration](#configuration) applies.
- **An image application.** Set the source to the Docker image above, add a
  volume mount with a named volume (for example `hosti-data`) at `/data`, set
  the variables, and add the HTTPS domain with container port `3000`. Decide
  for yourself whether auto deploy follows `latest` or you pin a tag.
- **Building from source.** Set the build type to Dockerfile, the Dockerfile
  path to `apps/web/Dockerfile` and the build context to `.`. The Dockerfile
  needs the whole workspace, so the context is the repository root. Such an
  image reports `unknown` as its commit.

The PaaS environment editor parses the text you type before the container sees
it, so single-quote every secret. After you change a variable, redeploy so the
container is recreated; a restart keeps the old environment. To check what the
running container holds, open the application's terminal and run
`node scripts/env-check.mjs`. It prints lengths and digest prefixes, never a
secret.

Redeploys keep the data volume. Any action that removes the volume destroys
every bundle and the database. Back `/data` up before you touch it by hand.

## Backups

Everything Hosti keeps is under `/data`:

```
$HOSTI_DATA_DIR/
  hosti.db
  bundles/squad-2026/
    current -> r2
    r1/index.html
    r2/index.html
```

`hosti.db` holds the metadata, including push token digests. A `tar` archive
over `/data` captures both the bundles and the database. Hosti has no backup
schedule or restore command of its own; use your host's volume backup, or take
the archive yourself.

To back up and restore with the Compose file, stop the service first so
SQLite is not mid-write. These commands read the volume through the stopped
container:

```bash
docker compose stop web
docker run --rm --volumes-from "$(docker compose ps -aq web)" -v "$PWD":/backup \
  node:24.21.0-bookworm-slim tar czf /backup/hosti-data.tgz -C /data .
docker compose start web
```

To restore, stop the service, clear `/data`, unpack the archive into it and
start the service again:

```bash
docker compose stop web
docker run --rm --volumes-from "$(docker compose ps -aq web)" -v "$PWD":/backup \
  node:24.21.0-bookworm-slim sh -c 'rm -rf /data/* && tar xzf /backup/hosti-data.tgz -C /data'
docker compose start web
```

Take a backup before every upgrade. There is no separate migration step: Hosti
checks the schema version when it opens `hosti.db` and upgrades the file in
place, forward only. An older image would then meet a newer schema, so going
back means restoring a backup, not only running the older image.

## Security model

- **One owner.** The owner logs in with one password, kept only as a scrypt
  hash in `HOSTI_OWNER_PASSWORD_HASH`. The session is a signed cookie,
  `hosti_admin`: HttpOnly, SameSite=Lax, Secure when the request arrived over
  TLS, good for 30 days, signed with `HOSTI_SECRET`. The login form takes five
  wrong passwords per caller per fifteen minutes and then locks that caller out
  for ten. The count lives in memory, so a restart clears it.
- **No GET changes anything.** Every change the catalog makes is a POST carrying
  a token derived from the session.
- **Push tokens open only `/api/v1/`.** They are bearer tokens with scopes
  (`publish`, `share`, `delete`). Hosti stores only a digest. No push token can
  create or revoke another one. A cookie never opens `/api/v1/`.
- **Bundles are private until shared.** A push never changes the sharing state.
  A private bundle, an unknown slug and a bundle nobody shared all answer the
  same 404. A pin is hashed with scrypt, and the pin gate rate-limits wrong
  guesses. Rotating a link cuts off everyone who holds the old address.
- **No visitor records.** Hosti keeps no counters, hit table, last-opened stamp
  or addresses.
- **Uploads are checked.** Limits are 50 MB compressed, 2000 files and 20 MB per
  file. Absolute paths, paths that climb out, symlinks and device nodes are
  refused.

[CONTEXT.md](./CONTEXT.md) lists the rules the code must keep. To report a
vulnerability, follow [SECURITY.md](https://github.com/JakubSzwajka/hosti/blob/main/SECURITY.md).

### The origin risk

A bundle runs its own JavaScript on the same origin as the catalog. So a script
inside a bundle you forgot about can `fetch('/')` with the owner cookie attached
and read the catalog back. That read reaches the admin pages too, and those
pages render the per-session mutation token into the HTML, so the script can
read that token and use it to write. Concretely, while you are logged in, a
bundle script could start its own agent connection and approve it without
asking you, because approval takes no password when a session exists.

The maintainer knows about this and has accepted it for now. The push API is not
reachable this way: it takes a bearer token that no browser holds, so a bundle
script cannot forge a push on its own. The real fix is serving `/v/` from a
second hostname. That is the first thing to revisit before Hosti hosts anything
someone else generated.

The preview frame is the one place a bundle already runs boxed off from this
origin, because its sandbox denies `allow-same-origin`. A bundle opened through
`/v/` in its own tab still runs on the catalog's origin and still gets that read.

What you can do until then: push only bundles you trust, treat every bundle as
code that can act as you while you are logged in, log out when you are done, and
check `/tokens` now and then. Revoke a token you did not make.

## Reference

How the catalog, the API and the stored data behave.

### The catalog

```
/login                   the owner password, one field
/                        every bundle, newest push first
/c/reports               one collection; /c/- is the bundles no push put in one
/b/garmin-q3             one bundle: preview, revisions, sharing, collection, delete
/b/garmin-q3/preview/    the bundle itself, for the owner's eyes only
/upload                  drop an archive here; the drop zone posts to it
/tokens                  the agent prompt, every push token with its scopes, revoke
/connect/<id>            approve or deny one agent connection
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

The frame carries `sandbox="allow-scripts"` and deliberately not
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

### Push a bundle by hand

Any push token works. This one is made from a clone against local data, with
the server from `pnpm dev` on `localhost:3000`:

```bash
export HOSTI_PUSH_TOKEN=$(pnpm --silent run token:new -- --name laptop | sed -n 2p)

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
revision and moves `current` onto it. A push never changes the sharing
state, so a new bundle is `private` and answers 404 at `/v/<slug>/` until the
owner says otherwise.

### Keeping the last few revisions

Old pushes are the one thing here that grows without bound, so a push keeps the
newest few revisions of its bundle and deletes the rest, files and rows both.
`HOSTI_KEEP_REVISIONS` sets the count and defaults to 5. A value below 1 is read
as 1, and anything that is not a number falls back to 5. The current revision
is never deleted, whatever the count says.

A push prunes on its own. The endpoint is for a bundle nobody is pushing any
more, usually after the keep count was tightened:

```bash
curl -X POST localhost:3000/api/v1/bundles/squad-2026/prune \
  -H "Authorization: Bearer $HOSTI_PUSH_TOKEN"
# 200 {"bundle":"squad-2026","keep":5,"kept":[9,8,7,6,5],"removed":[4,3,2,1]}
```

The bundle page shows how many revisions are kept.

### Collections

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

### Sharing

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

### Pins

A pin makes the link ask for four to eight digits first. You type the digits;
Hosti never invents them. It hashes what you send with `scrypt` and a fresh
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

### Read a bundle

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

Every response from `/v/` carries `Cache-Control: private, no-store`, whether
it is a served file, a redirect, the pin gate, an unlock answer or a 404. A
shared cache in front of Hosti, such as a CDN, must never hold one of
these responses: a 404 for a still-locked asset cached before an unlock once
kept answering after the owner unlocked the link.

## Development

Run the source directly when you need Hosti on localhost:

```bash
corepack enable
pnpm install --frozen-lockfile
export HOSTI_OWNER_PASSWORD_HASH=$(pnpm --silent owner:hash)
export HOSTI_SECRET=$(openssl rand -hex 32)
pnpm dev               # http://127.0.0.1:3000
```

`pnpm owner:hash` asks for the owner password at a prompt and prints the hash.
Single-quote a hash when you write it into a file or an editor: `!` starts
history expansion in bash and zsh, and `#` starts a comment. The `HOSTI_SECRET`
line stays unquoted on purpose, because the command substitution has to run and
hex output is safe. Without both variables, the catalog names the missing value
on `/login` and serves no admin page. Keep local values in an ignored
`.env.local`.

Useful commands:

```bash
pnpm build             # Next production build
pnpm test              # Repository Node tests, ESLint config tests, then workspace tests
pnpm check             # pins, Varlock, Biome, ESLint, TypeScript, and Dependency Cruiser
pnpm token:new -- --name laptop   # a push token from the shell; add --allow-delete for delete
pnpm owner:hash        # scrypt hash of the owner password
pnpm env:check         # validate the declared environment schema with Varlock
pnpm env:digest        # inspect configured values without printing secrets
```

pnpm 12 runs only the install scripts approved in `pnpm-workspace.yaml`.
`better-sqlite3` needs its script to build the native SQLite binding.

To contribute, read
[CONTRIBUTING.md](https://github.com/JakubSzwajka/hosti/blob/main/CONTRIBUTING.md).
[AGENTS.md](./AGENTS.md) describes the workspace layout and the layer rules, and
[CHECKS.md](./CHECKS.md) lists what the tools enforce. The architecture checks
adapt the maintained-tool setup from
[house-rules-stack](https://github.com/JakubSzwajka/house-rules-stack).

Project documents: [CONTEXT.md](./CONTEXT.md) defines Hosti's vocabulary and
rules, [PRODUCT.md](./PRODUCT.md) records the product purpose and owner
workflow, [DESIGN.md](./DESIGN.md) records the interface system,
[STATUS.md](./STATUS.md) says where the project stands, and
[docs/release.md](./docs/release.md) documents the maintainer's own release
pipeline, which self-hosters do not need.

## License

Hosti is available under the [MIT License](./LICENSE).
