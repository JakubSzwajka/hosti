# Product

<!-- impeccable:product-schema 1 -->

> How this file was written: no operator was available to interview during the
> session that created it. Every fact below is read out of `CONTEXT.md`,
> `README.md`, `.pi/specs/2026-09-17_hosti-bundle-catalog/`, and the code in
> `apps/`. Nothing here is invented. Where the sources do not answer, the
> section says so rather than guessing.

## Platform

web

## Users

There is one user: **the owner**. One person, one box, one domain. They run
Hosti on their own VPS and they hold the owner password.

Their situation: an AI agent has generated a static bundle, pushed it, and the
owner now wants to find it, look at it, and decide whether anyone else may see
it. They are usually at a desktop; the same screens have to work on a phone
because links get shared from wherever the owner happens to be.

Everyone else is **a person holding a link**. They are not a user of the
catalog. They never sign in, they see one bundle, and Hosti records nothing
about them: no counters, no hit table, no last-opened stamp, no addresses.

There are no roles, no teams, no accounts, no invitations.

## Product purpose

Hosti is a self-hosted catalog for the static bundles AI agents generate. An
agent pushes a folder, the folder gets a URL, and the owner browses everything
ever pushed and shares single bundles by link.

Success is the owner never having to think about hosting. A push lands and a
link works. Between those two moments the catalog has to answer three
questions without being read closely:

1. [x] Which bundle is this?
2. [x] Who can open it right now?
3. [x] How do I open it, share it, or shut it?

## Positioning

Two facts a neighbouring static host could not truthfully copy:

1. **A push never changes the sharing state.** A bundle is private the moment
   it lands, whether it came from `hosti push` or from a file dropped on the
   catalog. Every other way in is the same: nothing new is public until the
   owner turns sharing on.
2. **Every card runs the bundle itself.** No screenshot service, no stored
   image, no headless browser. The card is the bundle's current revision in a
   sandboxed iframe, served from an owner-only route. The preview works on a
   private bundle, which is most of them.

## Operating context

The owner's loop, in order:

```
agent pushes  ->  catalog shows it (private)  ->  owner opens it
                                              ->  owner shares it by link
                                              ->  owner rotates the link, or
                                                 goes private again
```

Screens that carry that loop:

| Path | What it does |
|---|---|
| `/login` | Owner password, one field |
| `/` | Every bundle, newest push first |
| `/c/<collection>` | One collection; `/c/-` is bundles in none |
| `/b/<slug>` | One bundle: preview, revisions, sharing state, collection, delete |
| `/b/<slug>/preview/` | The bundle itself, owner only |
| `/v/<share-slug>/` | The bundle, for whoever holds the link |
| `/v/<share-slug>/` + PIN | Hosti's own gate, at the guest's own URL |

Two other ways in exist and have no screen: `hosti push` from a terminal and
`POST /api/v1/bundles/<slug>/revisions` on a push token.

## Capabilities and constraints

The words are binding and live in `CONTEXT.md`. Use them in code, in the
schema and in the UI: **bundle**, **revision**, **catalog**, **collection**,
**sharing state**, **share link**, **rotate**, **pin**, **push token**,
**admin session**. Do not write site, artifact, report, project, version,
build, deploy, dashboard, library, gallery, folder, tag, category,
visibility, access level, permission, public URL, share token, regenerate,
refresh, reset, password, passcode, API key, or user account.

Confirmed behaviour the design has to respect:

- [x] A bundle is private until the owner turns sharing on. A private bundle
      answers the same 404 at `/v/<slug>/` as a slug that was never pushed.
- [x] One bundle has one sharing state, one share slug and one pin. The three
      states are `private`, `link` and `pin`. There is no second link to keep
      in step and none to forget about.
- [x] **Rotate** is the only way to cut off somebody who already has the
      address. It mints a fresh share slug, the old URL stops answering at
      once, and the state and the pin stay as they were.
- [x] A PIN guards the bundle's one link. Four to eight digits, typed by the
      owner, hashed with `scrypt`. Hosti never generates one and never reads
      one back, so no screen can ever show a PIN. Going private or going to a
      plain link clears it.
- [x] A collection is a flat label. A bundle sits in zero or one. `-` is the
      catalog's path for "no collection", so no way in may set it as a name.
- [x] Retention keeps the newest few revisions and deletes the rest, files and
      rows both. The current revision is never deleted.
- [x] A share link never expires. There is no expiry column and no expiry
      behaviour, so no screen may claim a link runs out. Rotating it or going
      private is how a link ends.
- [x] Every change the catalog makes is a POST carrying a mutation token
      derived from the session. No GET ever changes anything.
- [x] The preview frame denies `allow-same-origin`, so the bundle inside it
      cannot read the owner's cookie. It is inert: no pointer events, no tab
      stop, hidden from the accessibility tree.
- [x] The PIN gate must leak nothing: not the bundle title, not the
      collection, not whether the slug is real.

Technical constraints on the interface itself:

- Next.js App Router, TypeScript, React server components by default.
- Plain CSS in `apps/web/src/app/_styles/`. No Tailwind, no component library, no
  CSS-in-JS, no animation library, no font loader package.
- Biome caps a source file at 300 lines, which is why both the CSS and the UI
  are split into small files. Split further rather than fight it.
- The PIN gate is a route handler, so its CSS is inlined by hand in
  `apps/web/src/server/serving/gate-page.ts` and duplicates the tokens.
- Type comes from `fonts.bunny.net` over a plain `<link>`. A box with no
  outbound network falls back to system faces, so the layout may not depend on
  Fraunces or Instrument Sans loading.

## Brand commitments

- The name is **hosti**, set lowercase in the masthead.
- The mark is two pages linked, one bundle pointing at another. Hand drawn as
  SVG on a 32 grid so every edge is a whole pixel at 16px and 32px. It ships as
  `apps/web/src/app/icon.svg`, `apple-icon.png`, and `_ui/mark.tsx`. It is not
  to be redrawn or traced.
- The one colour the mark cannot borrow is its teal, `#06707e`. Everything else
  in the mark takes `currentColor`.
- Voice: plain, short, concrete, lowercase for controls, no exclamation marks.
  The existing copy says "this bundle is private" and "nothing here", and that
  register is the register.

## Evidence on hand

- Seed data in `data/`: ten bundles across five collection states, one
  multi-page bundle worth previewing. The file is still on the old schema, so
  the first open migrates it and every bundle lands private.
- Bundle fixtures in `fixtures/`: three bundle shapes plus one that links from
  the root.
- The design argument and three prototypes in
  `.pi/specs/2026-09-17_hosti-bundle-catalog/` (read only, never edited).

What does not exist, and must not be invented: users other than the owner,
usage metrics of any kind (Hosti deliberately records none), customers,
testimonials, pricing, a hosted service, and a roadmap.

## Product principles

1. **Private by default, and say so.** Share state is the single most
   important fact on any bundle. It is words on a block, never a coloured dot.
2. **A control never moves and never vanishes.** The owner learns where
   "open", "copy" and "share" live once. A state change alters what a control
   says, not whether it is on the page.
3. **The bundle is the content.** Every screen that can show the bundle shows
   the real thing, not a stand-in.
4. **Destructive last, and quietest.** Delete is a real capability and gets
   real confirmation, but it never outranks the controls used daily.
5. **Never claim more than the code does.** No expiry, no view counts, no PIN
   readback, no "secure" language the mechanism does not earn.

## Accessibility and inclusion

No standard was set by an operator, so treat these as the floor already
implied by the code:

- The preview iframe is `aria-hidden` with `tabIndex={-1}`; every card carries
  a real text link, so nothing depends on the frame being reachable.
- Focus must stay visible. The existing focus style is a 2px `--pop` outline
  with 1px offset; keep it on every interactive element.
- Colour is never the only carrier of state. `private` and `shared` are words.
- Body text runs on `--ink` `#2b3133` over `--paper` `#ecf2f3` at 11.7:1.
  `--muted` carries most of the small type on this catalog, so it has to clear
  AA with room to spare on both grounds, not scrape past it.
