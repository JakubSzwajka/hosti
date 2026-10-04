# Project status

Where Hosti stands, for people who want to use it or contribute. For setup, see
[README.md](./README.md). For vocabulary and rules, see [CONTEXT.md](./CONTEXT.md).

## Version

The latest app release is **v0.4.0**. Releases are Git tags `vX.Y.Z`, and each
publishes an image to `ghcr.io/jakubszwajka/hosti`. The `hosti` CLI has its own
tags, `cli-vX.Y.Z`. See [docs/release.md](./docs/release.md) for how the
maintainer cuts a release; self-hosters do not need it.

v0.4.0 replaces `HOSTI_OWNER_PASSWORD` with `HOSTI_OWNER_PASSWORD_HASH`. See
"Upgrading to v0.4.0" in the README.

## Shipped

1. [x] A catalog of static bundles with live, sandboxed previews.
2. [x] Push by CLI, HTTP API or browser upload (`.zip` and `.tar.gz`), with
   revisions and retention (`HOSTI_KEEP_REVISIONS`).
3. [x] Collections, and per-bundle sharing: `private`, `link` or `pin`, with
   link rotation.
4. [x] Push tokens with scopes (`publish`, `share`, `delete`) and an agent login
   the owner approves in the browser (`hosti login`).
5. [x] The `hosti-publish` skill, installed with `npx skills add JakubSzwajka/hosti`.
6. [x] The owner password held only as a scrypt hash, made with `pnpm owner:hash`.
7. [x] A Docker image and a Compose file that run on one host with one `/data`
   volume.

## Known limitations

- **Origin risk.** A bundle's JavaScript runs on the catalog's origin and can
  read an admin page's mutation token while the owner is logged in. The
  maintainer has accepted this for now. See
  [The origin risk](./README.md#the-origin-risk).
- **One owner.** There are no other users. The "users and agent authorization"
  work is parked and unbuilt.
- **No backup or restore tooling.** Back up the `/data` volume yourself. See
  [Backups](./README.md#backups).
- **Forward-only database upgrades.** `hosti.db` is upgraded in place when Hosti
  opens it. An older image cannot open a newer file, so roll back by restoring a
  backup.
- **In-memory counters.** Login and pin rate limits and pending agent
  connections live in server memory, and a restart clears them.

## What is next

- Serve `/v/` from a second origin, to close the origin risk. It is the first
  thing to revisit before Hosti hosts anything someone else generated.
- Pick up the parked users and agent authorization work, if it is wanted.

## Before database work

`data/` is ignored by Git. The next process that opens `data/hosti.db`,
including `pnpm dev`, migrates it to the current schema. `pnpm token:new` does
not migrate: it refuses an older database and asks you to start the server
first, which then migrates it. Back the database up before either.

## Contributing

Read [CONTRIBUTING.md](https://github.com/JakubSzwajka/hosti/blob/main/CONTRIBUTING.md)
and [AGENTS.md](./AGENTS.md). Before a change is ready, run `pnpm check`,
`pnpm test` and `pnpm build`.
