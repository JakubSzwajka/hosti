# Hosti continuation status

## Stop point

Nothing is committed. The working tree contains the complete sharing-state migration, CLI and route changes, owner catalog and bundle UI, contract updates, and tests. Treat every listed path as part of this Hosti session, not as unrelated user work.

The shipped catalog and bundle screens match the approved `bolder` prototype direction. The prototype record is `.pi/specs/2026-09-17_hosti-bundle-catalog/prototypes/bolder/README.md`, but `.pi/specs/` is local ignored work and is not a repository change.

## Decisions that are settled

1. One bundle has one sharing state: `private`, `link` or `pin`. It has one share slug and one pin hash. There is no link list, expiry, unlisted link or revoke action.
2. A share URL starts on the bundle slug. `rotate` mints a random 12-character slug with no vowels. The old URL stops answering, while the state and pin stay.
3. Use the word `pin`, not password. A pin is four to eight owner-typed digits, stored as a `scrypt` hash. Hosti never reads it back or generates it.
4. Going `private` or `link` clears the pin. `mode: pin` without a stored or supplied pin is refused. A pin supplied with another mode is refused.
5. Revisions do not get a page section. The current revision and date appear only in the meta line.
6. Collection is a select in the same meta line. It supports an existing collection, no collection, and a follow-up for a new collection.
7. Delete is a filled burnt-red button at the bottom with inline confirmation. There is no always-on explanation.
8. Catalog cards use a contact-sheet treatment: numbered frames, slug in the window bar, 25px/900 titles, truthful plates under live frames, and compact mobile rows. Flags read `private`, `link` or `pin`.
9. The bundle page is title, meta, preview, one sharing island, then delete. It has no share-link list, revision ledger or collection section.

## What is implemented

- Schema version 2 adds sharing columns to `bundles`, drops `share_links`, preserves bundles, revisions and push tokens, and creates a fresh schema in one transaction.
- The new server sharing module owns state changes and rotation. Six old share-link routes are gone. New push-token API and admin-session routes set state and rotate; bundle GET includes the sharing state.
- Serving, the pin gate and the scoped cookie now use the one bundle share slug. Unlock HMAC data binds the share slug, immutable bundle id and current pin hash.
- The CLI now has `hosti share <slug> --mode private|link|pin [--pin ...]` and `hosti rotate <slug>`. Old `links`, `revoke` and `pin` commands are removed. `open` and `ls` print the state.
- The approved catalog and bundle owner screens are production code in the working tree. `CONTEXT.md`, `PRODUCT.md`, `DESIGN.md` and `README.md` describe the new model.

## Evidence and checks

- Independent final verification after all code changes: `npm run check` exited 0. `npm run test` exited 0 with 72 CLI tests and 224 web tests across 17 files, 296 total. `git diff --check` exited 0.
- A production build used for browser checks exited 0.
- Browser checks used a temporary copy of `data/` on port 3210. Screens in `/tmp/hosti-owner-ui/` cover catalog plus bundle states `private`, `link`, `pin`, rotate confirmation and delete confirmation at 1440px and 390px. There were no browser errors or horizontal overflow at 390px. Browser and server were stopped.
- The Impeccable detector reported 17 advisory UI findings and no blockers. The real darker danger-hover issue was fixed. `DESIGN.md` records why the other flags are deliberate.
- A copy of the real database migrated with bundles 10 to 10, revisions 18 to 18, push tokens 6 to 6, and share links 5 to a dropped table. All 10 bundles became private. A second open did nothing.
- Security tests prove generic byte-identical 404 bodies and headers for locked/private and unknown slugs; bundle `404.html` only for open bundles; grant invalidation after rotate, pin change, and delete/recreate on the same slug; refusal of wrong-mode or empty pins; no stale state restoration after concurrent pin hashing; and transactional fresh schema creation.

## Working tree map

- Contracts/docs, modified: `CONTEXT.md`, `PRODUCT.md`, `DESIGN.md`, `README.md`. New: `STATUS.md`.
- Shared types and CLI, modified: `packages/shared/src/index.ts`, `apps/cli/src/{args,client,commands}.ts`, `apps/cli/tests/{args,cli,open-prune}.test.ts`. New: `apps/cli/tests/{sharing.test.ts,stub-server.ts}`.
- Server/data model, modified: `apps/web/src/server/{catalog,push,remove-bundle,share-pin}.ts`, `apps/web/src/server/db/{open.mjs,schema.sql}`, `apps/web/src/server/serving/{gate-page,gate,preview-token,serve-bundle,unlock}.ts`. New: `apps/web/src/server/sharing.ts`. Deleted: `apps/web/src/server/share-links.ts`.
- Routes and owner UI, modified: `apps/web/src/app/_ui/{catalog-screen,pieces,shot}.tsx`, `apps/web/src/app/api/v1/bundles/[slug]/route.ts`, `apps/web/src/app/b/[slug]/{page,sections}.tsx`, `apps/web/src/app/b/[slug]/collection/route.ts`, `apps/web/src/app/not-found.tsx`. New: `apps/web/src/app/api/v1/bundles/[slug]/sharing/{route.ts,rotate/route.ts}`, `apps/web/src/app/b/[slug]/{collection-picker,sharing-island}.tsx`, `apps/web/src/app/b/[slug]/sharing/{route.ts,rotate/route.ts}`.
- Deleted old route families: `apps/web/src/app/api/v1/bundles/[slug]/share-links/route.ts`, `apps/web/src/app/api/v1/share-links/[shareSlug]/{route.ts,pin/route.ts}`, and `apps/web/src/app/b/[slug]/share-links/{route.ts,pin/route.ts,revoke/route.ts}`.
- Styles, modified: `apps/web/src/styles/{controls,detail,grid,hosti,narrow,share}.css`.
- Tests, modified: `apps/web/tests/{admin-routes,collections,pin-owner,push,share-pin,upload}.test.ts`, `apps/web/tests/api.ts`, and `apps/web/tests/pin-helpers.ts`. New: `apps/web/tests/{migration,not-found-parity,sharing-pin-writes,sharing,unlock-grant}.test.ts`. Deleted: `apps/web/tests/share-links.test.ts`.

## What remains

- No commit exists and no commit approval was given. Review the working tree before editing. Do not commit until the operator asks.
- Edge screens were prototyped but not ported: admin-session login, pin gate, 404, and onboarding/upload idle. Prototype files are not production code.
- JavaScript-disabled behavior of the new bundle forms was not checked in a browser. Tests cover native POST routes, noscript controls and the collection follow-up route.
- The no-revision bundle UI was not checked in a browser because every copied fixture had a revision.
- No push, release, deploy or production data migration happened.

## Risks before the next command

`data/hosti.db` is untouched at schema version 1. The next process that opens it, including `npm run dev`, `npm start` or `npm run token:new`, will migrate it to version 2 and drop all five old share links. Bundles, revisions and six push tokens survive, and all ten bundles become private. The operator approved this while the product is in development, but decide on a backup before opening the database.

Do not mistake `.pi/specs/` for repository work. Do not run the app merely to inspect the UI until the database choice above is made.

## Resume checklist

1. Read STATUS.md, CONTEXT.md and DESIGN.md.
2. Run git status --short. Preserve every listed change.
3. Decide whether to back up data/hosti.db before any command that opens it.
4. Until that decision is made, do not run `npm run dev`, `npm start` or `npm run token:new`. The first open drops five old share links and makes all ten bundles private while preserving bundles, revisions and six push tokens.
5. If the operator wants it, review the shipped catalog and bundle pixels once more. Do not start another redesign round.
6. Choose one bounded next task: port one edge-screen group, or prepare one reviewed commit of the current work.
7. Before a commit, inspect the full diff and rerun the checks that fit any new edits. Commit only with explicit operator approval.
