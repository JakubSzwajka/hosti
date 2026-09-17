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
One push of a bundle. Pushing the same slug again creates a new revision and
moves the `current` pointer. Old revisions stay on disk until they are pruned.
_Avoid_: version, build, deploy.

**Catalog**:
The full set of bundles, and the admin UI that browses it.
_Avoid_: dashboard, library, gallery.

**Collection**:
A named group of bundles, such as `reports` or `garmin`. Flat, not a tree. A
bundle belongs to zero or one collection.
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
        v                                          v
   unpack to r<n>  ->  entry file check  ->  flip current
        |                                          |
        +----------- /data/bundles/<slug>/ --------+
        |
        +----------- /data/hosti.db (metadata)
```

A push stops at the left column. Nothing on the right answers until a share
link exists, and share links are their own endpoints, all on the push token:

```
POST   /api/v1/bundles/<slug>/share-links    open a door, unlisted on request
GET    /api/v1/bundles/<slug>/share-links    the doors this bundle has
DELETE /api/v1/share-links/<share-slug>      shut one door
DELETE /api/v1/bundles/<slug>                forget the bundle, files and all
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
