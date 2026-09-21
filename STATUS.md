# Hosti continuation status

## Stop point

The working tree holds finished agent-onboarding work from three lanes. Nothing
is committed and the operator has not approved a commit. Every path listed in
the working tree map below belongs to this work, so preserve all of it and read
the diff before editing.

## Decisions that are settled

1. The catalog mints and revokes push tokens. Both writes take an admin session
   and a mutation token, never a bearer token, and neither sits under
   `/api/v1/`, so no push token can mint another one.
2. A minted secret is shown once, out of an in-process store that forgets it on
   the first read. Nothing writes it to disk, to a URL or to a log.
3. `revisions.pushed_by` records how a revision arrived. A push token's name
   means it came through the push API. `@catalog` means the owner uploaded the
   archive in the catalog. NULL means the revision was written before schema 3
   and nobody knows.
4. Schema version is 3. Version 3 adds the nullable `revisions.pushed_by`
   column and changes nothing else.
5. `recordRevision` requires `pushedBy`. Only the migration leaves NULL, so no
   caller can forge the "nobody knows" state on a revision written today.
6. An empty catalog is an onboarding panel, not a blank grid. It copies a
   ready-to-run agent prompt and an `npx skills add` command.
7. `/tokens` is that panel's permanent home. It carries the panel, the list of
   tokens that already exist, and a revoke on each.
8. The `hosti-publish` skill is a real file in the repository. An agent installs
   it with `npx skills add JakubSzwajka/hosti`. Hosti serves no skill route.

## What is implemented

- `POST /tokens/mint` and `POST /tokens/revoke` on the admin session and the
  mutation token, with the minted secret held in `minted-secret.ts` and shown
  once on the page that follows.
- The `pushed_by` column, written by every way in: the push API stores the push
  token's name, `/upload` stores `@catalog`. The bundle page turns that into an
  arrival clause, and prints nothing when the column is NULL.
- The onboarding panel on an empty catalog and on `/tokens`, with copy buttons
  for the agent prompt, the repository install command and a freshly minted
  secret.
- `skills/hosti-publish/SKILL.md` teaches an agent to push and share by reading
  `HOSTI_URL` and `HOSTI_TOKEN` from its environment. It contains no instance
  URL or token value, and the web app has no route that serves it.
- `recordRevision` takes `pushedBy` as a required string and its doc comment
  states the three meanings of the column.

## Evidence and checks

- `npm run check` exits 0. `npm run test` exits 0 with 72 CLI tests and 280
  web tests. The web count fell by two from the 282-test baseline.
- The removed tests covered templating the instance URL from the direct request
  and from a proxy. The retained tests read `skills/hosti-publish/SKILL.md`
  from disk and check its front matter, triggers, environment settings,
  commands and refused actions.
- Browser screenshots of the onboarding work live in `/tmp/hosti-onboard/` and
  will not survive a reboot. They predate the repository install command.

## Working tree map

- Docs, modified: `CONTEXT.md`, `README.md`, `STATUS.md`.
- Skill, new: `skills/hosti-publish/SKILL.md`. The earlier untracked HTTP
  route and its TypeScript template were removed.
- Server, modified: `apps/web/src/server/{catalog,push,push-tokens}.ts`,
  `apps/web/src/server/db/{open.mjs,schema.sql}`. New:
  `apps/web/src/server/minted-secret.ts`.
- Routes, modified: `apps/web/src/app/upload/route.ts` and the revisions API.
  New: `apps/web/src/app/tokens/`.
- UI, modified: the catalog, bundle page and app shell. New: the onboarding
  panel and its style sheet.
- Shared and scripts, modified: `packages/shared/src/index.ts`, the token script
  and the web test config. Tests add onboarding, revision arrival and token
  admin coverage.

## What remains

- No commit exists and none is approved. Ask before committing.
- `apps/web/src/app/b/[slug]/sections.tsx` is dead code. Nothing imports it and
  the lane left it in place on purpose rather than deleting it in passing.
- The JavaScript-disabled path of the mint and revoke forms was never opened in
  a browser. Tests cover the native POST routes.
- The operator decided to make `JakubSzwajka/hosti` public. No repository
  setting was changed here, and no push, release or deploy happened.
- The real database was not migrated.

## Risks before the next command

`data/hosti.db` is still at schema version 2. Confirmed by reading it
read-only: `meta.schema_version` is `2`, with 10 bundles, 18 revisions and 6
push tokens, and `revisions` has no `pushed_by` column yet.

The next process that opens it, including `npm run dev`, `npm start` or
`npm run token:new`, migrates it to 3 by adding `revisions.pushed_by`. The
column arrives as NULL on all existing rows, so every revision already stored
renders with no arrival clause on its bundle page. Nothing is deleted and no
other data changes. Decide on a backup first.

## Resume checklist

1. Read STATUS.md, CONTEXT.md and DESIGN.md.
2. Run `git status --short`. Preserve every listed change.
3. Decide whether to back up `data/hosti.db` before any command that opens it.
   Until then, do not run `npm run dev`, `npm start` or `npm run token:new`.
4. Rerun `npm run check` and `npm run test` before trusting the tree.
5. Choose one bounded next task: prepare one reviewed commit of this work, or
   close a loose end above.
6. Commit only with explicit operator approval.
