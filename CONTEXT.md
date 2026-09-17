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

**Share link**:
A public path that grants access to one bundle. It carries its own slug, its own
optional PIN and its own optional expiry. Revoking it does not touch the bundle.
_Avoid_: public URL, share token.

**Push token**:
A bearer secret an agent or the CLI uses to write. Never used by a browser.
_Avoid_: API key, access token.

**Admin session**:
The cookie the owner gets after typing the owner password. It unlocks the
catalog. It never unlocks anything under `/v/`.
_Avoid_: login, user account.

## How the pieces sit

```
POST /api/v1/bundles/<slug>/revisions      GET /v/<share-slug>/<path>
        | push token                               | share link
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

A push stops at the left column. Nothing on the right answers until a share
link exists, and share links are their own endpoints, all on the push token:

```
POST   /api/v1/bundles/<slug>/share-links    open a door, unlisted on request
GET    /api/v1/bundles/<slug>/share-links    the doors this bundle has
PUT    /api/v1/share-links/<share-slug>/pin  set or replace the pin on a door
DELETE /api/v1/share-links/<share-slug>/pin  take the pin off
DELETE /api/v1/share-links/<share-slug>      shut one door
DELETE /api/v1/bundles/<slug>                forget the bundle, files and all
```

One path under `/v/` is Hosti's own rather than the bundle's:

```
POST   /v/<share-slug>/unlock                the pin gate's form, no token
```

And one path outside `/v/` serves bundle bytes to the owner alone, so the
catalog can show a bundle nobody has shared:

```
GET    /b/<slug>/preview/                    admin session
GET    /b/<slug>/preview/~<grant>/<path>     a signed grant, for the frame
POST   /api/v1/bundles/<slug>/prune          push token, prune on demand
POST   /upload                               admin session, an archive from the browser
```

## Rules the code must keep

1. [x] A half-finished push never becomes the current revision. Unpack, verify
   the entry file, then flip the `current` symlink with a rename.
2. [x] A refused push leaves no partial directory and does not move `current`.
3. [x] Bundle URLs are path-based on one domain. No subdomains, and no `<base>`
   tag injected at push time, because one bundle can answer several share links.
4. [x] `/v/<slug>` redirects to `/v/<slug>/` before anything is served, or every
   relative asset link inside the bundle misses.
5. [x] Bearer tokens open `/api/v1/`. Cookies never do, because a bundle runs
   its own JavaScript on this origin.
6. [x] An unknown share link, a bundle with no revision and a bundle nobody has
   shared all answer the same 404. A push mints no share link, so a bundle is
   private until someone asks for one.
7. [x] Revoking a share link touches neither the bundle nor its other links.
8. [x] A PIN guards one share link, never the bundle. Its unlock cookie is
   scoped to that link's path, so a second link on the same bundle asks again
   and no unlock cookie ever opens the catalog.
9. [x] A PIN is typed by the owner, four to eight digits, hashed with `scrypt`.
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
    admin session and the mutation token, never a push token. It mints no
    share link either: a bundle is private however it arrived.
