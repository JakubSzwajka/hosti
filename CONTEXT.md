# Hosti

Hosti is a self-hosted catalog for the static bundles AI agents generate. An
agent pushes a folder, the folder gets a URL, and the owner browses everything
ever pushed and shares single bundles by link.

There are no users. There is the owner, and there are people holding links.

## Language

Use these words in code, in the schema, in the UI and in commit messages. The
term on the left wins over any synonym.

**Bundle**:
One static site: a directory of files with an entry file, normally
`index.html`. The unit a person opens, shares and deletes. Identified by a slug,
for example `garmin-q3`.
_Avoid_: site, artifact, report, project.

**Revision**:
One archive landing on a bundle, from `hosti push` or from the owner dropping
one on the catalog. The same slug again creates a new revision and moves the
`current` pointer. It then prunes: the newest few revisions stay and the rest
are deleted, files and rows both.
_Avoid_: version, build, deploy.

**Catalog**:
The full set of bundles, and the admin UI that browses it and takes uploads.
_Avoid_: dashboard, library, gallery.

**Collection**:
A named group of bundles, such as `reports` or `garmin`. Flat, not a tree. A
bundle belongs to zero or one collection, set by a push header, by the drop
zone, or by the owner on the bundle page, and cleared only by the owner. `-` is
the catalog's path for bundles in no collection, so no way in may set it.
_Avoid_: folder, directory, tag, category.

**Sharing state**:
Which of three states a bundle is in. `private` answers nothing at the share
URL. `link` opens the bundle to anyone holding it. `pin` shows the pin gate
first. One bundle, one state.
_Avoid_: visibility, access level, permission.

**Share link**:
The one public path to a bundle, at `/v/<share-slug>/`. The share slug is the
bundle slug until a rotate mints a fresh random one. A bundle has at most one,
and it answers only while the sharing state is `link` or `pin`.
_Avoid_: public URL, share token.

**Rotate**:
Minting a fresh share slug. The old URL stops answering at once. It is the only
way to cut off somebody who already has the address. The sharing state and the
pin stay as they were.
_Avoid_: regenerate, refresh, reset.

**Pin**:
Four to eight digits the owner types, guarding this bundle's link. Hashed with
`scrypt`. Hosti never invents one and never reads one back.
_Avoid_: password, passcode, PIN code.

**Push token**:
A bearer secret an agent or the CLI uses to write. Never used by a browser.
It carries scopes, and the server checks them on every `/api/v1/bundles` route.
The catalog creates one only when the owner approves an agent connection. The
agent made the secret, so Hosti only ever holds its digest. The owner's shell
can still make one with `pnpm token:new`. A revision records the name of the
push token that wrote it, or nothing when the owner uploaded the archive
through the catalog.
_Avoid_: API key, access token.

**Agent connection**:
A short-lived request from an agent to receive a push token. It waits for the
owner to approve or deny it in the browser, at `/connect/<id>`. It lives only
in server memory, lasts ten minutes, and carries only digests: the agent keeps
the clear token and the polling secret. It is never a push token itself.
_Avoid_: device code, pairing, token request.

**Scope**:
One named power a push token carries. There are three. `publish` lists, reads,
pushes and prunes. `share` sets the sharing state and the pin, and rotates.
`delete` deletes a bundle. Every token has `publish`. `delete` is granted only
when the agent asked for it and the owner ticked it.
_Avoid_: permission, role, right.

**Admin session**:
The cookie the owner gets after typing the owner password. It unlocks the
catalog. It never unlocks anything under `/v/`. Hosti holds the owner password
only as a `scrypt` hash, in `HOSTI_OWNER_PASSWORD_HASH`, made with
`pnpm owner:hash`. It never reads a plain password.
_Avoid_: login, user account.

## How the pieces sit

```
POST /api/v1/bundles/<slug>/revisions      GET /v/<share-slug>/<path>
        | push token                               | link or pin
POST /upload                                       |
        | admin session + mutation token           |
        v                                          v
   unpack to r<n>  ->  entry file check  ->  flip current
        |                                          |
        +----------- /data/bundles/<slug>/ --------+
        |
        +----------- /data/hosti.db (metadata)
```

The two ways in differ only in who they let through and what the bytes are
wrapped in. A tarball is read by one reader and a zip by another, and both hand
every entry to one sink, so the limits and the path rules cannot drift apart.

A push stops at the left column. Nothing on the right answers while the bundle
is private, and sharing has its own endpoints, all on the push token. Each route
needs its scope: `share` for the sharing routes, `delete` for the delete, and
`publish` for the rest:

```
PUT    /api/v1/bundles/<slug>/sharing         set the state: private, link, pin
POST   /api/v1/bundles/<slug>/sharing/rotate  mint a fresh share slug
GET    /api/v1/bundles/<slug>                 the bundle and its sharing state
DELETE /api/v1/bundles/<slug>                 forget the bundle, files and all
```

The body of the `PUT` is `{"mode": "private" | "link" | "pin", "pin"?: "4821"}`.
Asking for `pin` with no pin stored and none in the body is refused. Setting
`private` or `link` clears the stored pin hash.

One path under `/v/` is Hosti's own rather than the bundle's:

```
POST   /v/<share-slug>/unlock                the pin gate's form, no token
```

And one path outside `/v/` serves bundle bytes to the owner alone, so the
catalog can show a private bundle:

```
GET    /b/<slug>/preview/                    admin session
GET    /b/<slug>/preview/~<grant>/<path>     a signed grant, for the frame
POST   /api/v1/bundles/<slug>/prune          push token, prune on demand
POST   /upload                               admin session, an archive from the browser
```

An agent gets its push token through an agent connection, and can ask what the
token is:

```
POST   /api/v1/agent-authorizations          no credential; digests only, answers the id and the user code
GET    /api/v1/agent-authorizations/<id>     the polling secret: pending, approved, denied or expired
GET    /api/v1/whoami                        push token, no scope: its name and scopes
```

The catalog's own writes take the admin session and the mutation token, never a
push token:

```
POST   /b/<slug>/sharing                     set the state from the bundle page
POST   /b/<slug>/sharing/rotate              mint a fresh share slug
POST   /connect/<id>/approve                 approve an agent connection, with the scopes ticked
POST   /connect/<id>/deny                    deny an agent connection
POST   /tokens/revoke                        forget one push token's digest
```

Hosti serves no skill. The `hosti-publish` skill is a file in this repository,
at `skills/hosti-publish/SKILL.md`, and an agent installs it with
`npx skills add JakubSzwajka/hosti`. It drives the `hosti` CLI, which saves its
login with `hosti login`, so no instance value is written into the skill.

## Rules the code must keep

1. [x] A half-finished push never becomes the current revision. Unpack, verify
   the entry file, then flip the `current` symlink with a rename.
2. [x] A refused push leaves no partial directory and does not move `current`.
3. [x] Bundle URLs are path-based on one domain. No subdomains, and no `<base>`
   tag injected at push time, because a rotate changes the path a bundle
   answers on.
4. [x] `/v/<slug>` redirects to `/v/<slug>/` before anything is served, or every
   relative asset link inside the bundle misses.
5. [x] Bearer tokens open `/api/v1/`. Cookies never do, because a bundle runs
   its own JavaScript on this origin.
6. [x] An unknown share slug, a private bundle, a bundle with no revision and a
   bundle nobody has shared all answer the same 404. The 404 names nothing. A
   push never changes the sharing state, so a bundle is private until the owner
   says otherwise. A bundle's own `404.html` answers only where the bundle
   itself would answer, so a private or a locked link never serves it.
7. [x] Going private touches neither the bundle nor its revisions, and neither
   does a rotate. Going private and going to a plain link both clear the stored
   pin hash, because a pin that survives going private is a trap.
8. [x] A pin guards this bundle's one link. Its unlock cookie is scoped to that
   link's path, so a rotate makes every outstanding grant useless and no unlock
   cookie ever opens the catalog.
9. [x] A pin is typed by the owner, four to eight digits, hashed with `scrypt`.
   Hosti never generates one and never reads one back.
10. [x] A locked link answers a page request with the gate at the same URL, and
    everything else with the same 404 as any other miss. The gate names neither
    the bundle nor whether the slug is real.
11. [x] Hosti keeps no record of who opened a link: no counters, no hit table,
    no last-opened stamp, no addresses.
12. [x] Retention never deletes the current revision, whatever the keep count
    says, and it removes only `r<n>` directories directly inside the bundle's
    own directory. It never follows `current`, which is a symlink.
13. [x] The catalog's preview frame denies `allow-same-origin`, so a bundle
    cannot read the owner's cookie out of it. That is also why the preview URL
    carries its grant in the path: a sandboxed document is refused the admin
    cookie on its own asset requests, so nothing else would reach it.
14. [x] Only a preview response may be framed, and only by this origin. Every
    `/v/` response stays `frame-ancestors 'none'`.
15. [x] The catalog's upload is a change the catalog makes, so it wants the
    admin session and the mutation token, never a push token. It changes no
    sharing state either: a bundle is private however it arrived.
16. [x] Approving an agent connection and revoking a push token are catalog
    writes on the admin session and the mutation token, so no push token can
    create another one. The agent makes the secret and sends only its digest,
    so the server never holds a clear push token and has nothing to show once.
    No response, page or log carries a clear push token or polling secret.
