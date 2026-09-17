---
name: Hosti
description: A quiet paper catalog for the static bundles an agent leaves behind.
colors:
  paper: "#ecf2f3"
  card: "#f8fdff"
  surface: "#dee4e5"
  ink: "#2b3133"
  muted: "#61686a"
  line: "#c9cfd0"
  line-soft: "#dde3e4"
  pop: "#06707e"
  pop-wash: "#e4f0f1"
  danger: "#8a2b14"
typography:
  display:
    fontFamily: "Fraunces, Superclarendon, 'Bookman Old Style', Georgia, serif"
    fontSize: "34px"
    fontWeight: 900
    lineHeight: 1.1
    letterSpacing: "-0.025em"
  headline:
    fontFamily: "Fraunces, Superclarendon, 'Bookman Old Style', Georgia, serif"
    fontSize: "22px"
    fontWeight: 900
    lineHeight: 1.2
    letterSpacing: "-0.02em"
  title:
    fontFamily: "Fraunces, Superclarendon, 'Bookman Old Style', Georgia, serif"
    fontSize: "18px"
    fontWeight: 400
    lineHeight: 1.25
    letterSpacing: "-0.01em"
  body:
    fontFamily: "'Instrument Sans', ui-sans-serif, system-ui, 'Helvetica Neue', sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  label:
    fontFamily: "'Instrument Sans', ui-sans-serif, system-ui, 'Helvetica Neue', sans-serif"
    fontSize: "11px"
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: "0.12em"
  mono:
    fontFamily: "ui-monospace, 'SF Mono', Menlo, Consolas, 'DejaVu Sans Mono', monospace"
    fontSize: "12.5px"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "0.015em"
    fontFeature: "'liga' 0, 'calt' 0"
rounded:
  control: "6px"
  nested: "8px"
  panel: "10px"
  lone: "12px"
  pill: "999px"
spacing:
  hair: "8px"
  tight: "12px"
  gap: "22px"
  gap-lg: "34px"
components:
  button:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "4px 11px"
    typography: "12.5px"
  button-go:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    rounded: "{rounded.control}"
    padding: "6px 15px"
    typography: "13px"
  button-inert:
    backgroundColor: "transparent"
    textColor: "{colors.muted}"
    rounded: "{rounded.control}"
    padding: "4px 11px"
  chip:
    backgroundColor: "transparent"
    textColor: "{colors.muted}"
    rounded: "{rounded.pill}"
    padding: "3px 11px"
  chip-on:
    backgroundColor: "{colors.card}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    padding: "3px 11px"
  flag-shared:
    backgroundColor: "{colors.pop}"
    textColor: "#ffffff"
    rounded: "5px"
    padding: "3px 9px"
  flag-private:
    backgroundColor: "transparent"
    textColor: "{colors.muted}"
    rounded: "5px"
    padding: "3px 9px"
  panel:
    backgroundColor: "{colors.card}"
    textColor: "{colors.ink}"
    rounded: "{rounded.panel}"
    padding: "15px 19px 17px"
  panel-urgent:
    backgroundColor: "{colors.pop-wash}"
    textColor: "{colors.ink}"
    rounded: "{rounded.panel}"
    padding: "15px 19px 17px"
  input:
    backgroundColor: "{colors.card}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "4px 9px"
---

# Design system: Hosti

## Overview

**Creative North Star: "The Contact Sheet"**

A photographer's contact sheet is a working object, not a presentation. Every
frame from the roll is printed at thumbnail size on one piece of paper, so the
eye can run down the sheet and find the one worth enlarging. The paper is plain,
the grease pencil is one colour, and nothing on the sheet competes with the
frames.

Hosti is that sheet for the bundles an agent leaves behind. The bundle itself is
the only image on the screen, running live in a box. Everything around it is
paper, a hairline, and small type that stays out of the way. The screen has one
accent, a deep teal, and it is spent on the two things that carry risk: who can
open this, and where the link points.

The paper is real. `--paper` carries a 22px dot grid at 8% ink, which is the
only texture in the system and the reason a bundle's own white reads as a page
laid on a desk rather than a panel floating in a void. Depth comes from that
contrast and from one hairline, never from a shadow.

**Key characteristics:**

- Cool near-white paper with a fine dot grid; bundle previews are the only
  saturated things on screen.
- One display serif with real weight, against a plain grotesque, against a
  monospace reserved for paths and machine values.
- Flat. One 1px hairline is the entire depth system.
- Type is small and dense; the page is generous.
- Destructive controls are the quietest thing on the screen.

## Colors

A cool grey-blue paper stack with one deep teal accent and one burnt red that
almost never appears.

### Primary

- **Deep Teal** (`#06707e`): the machine's voice. It marks a path, a share URL,
  a slug, the current revision, and the `shared` flag. It is also the focus
  ring. It never decorates a heading and it never fills a large area, except
  inside the `shared` flag block and the one washed panel below.
- **Teal Wash** (`#e4f0f1`): the single tinted panel. It marks the share panel
  of a bundle nobody can open yet, because that panel holds the next action.

### Tertiary

- **Burnt Red** (`#8a2b14`): refusals and destruction only. An error line, a
  hover on `revoke`, `clear it` or `delete this bundle`. It is never a resting
  state and never a fill.

### Neutral

- **Paper** (`#ecf2f3`): the page, carrying the dot grid.
- **Card** (`#f8fdff`): a panel or a card, one step lighter than the paper so
  it lifts without a shadow.
- **Surface** (`#dee4e5`): the empty preview slot, before a frame loads.
- **Ink** (`#2b3133`): body text, headings, and the one filled button.
- **Muted** (`#61686a`): every secondary line, label, count and caption. 5.0:1
  on paper and 5.5:1 on card.
- **Line** (`#c9cfd0`) and **Line Soft** (`#dde3e4`): panel edges, and the
  divider inside a panel.

### Named rules

**The Two Jobs Rule.** Teal has exactly two jobs: it names a machine value, and
it marks the one next action. Red has exactly one: this refuses, or this
destroys. A colour with a third job is a bug.

**The Words Rule.** Share state is never a coloured dot. `private` and `shared`
are printed words on a block, and the block's colour only repeats what the words
already said.

## Typography

**Display font:** Fraunces, falling back to Superclarendon and Georgia.
**Body font:** Instrument Sans, falling back to the system grotesque.
**Mono font:** the platform monospace, with ligatures switched off.

**Character:** a heavy old-style serif set tight against a plain neutral sans.
The serif appears only where something is named, which makes a bundle title feel
like a printed label rather than a row in a database. Ligatures and contextual
alternates are off in mono, so a slug reads character by character; that matters
when the reader is checking a URL they are about to hand out.

### Hierarchy

- **Display** (900, 34px, 1.1, -0.025em): a bundle's title. One per page,
  balanced, capped at 22ch so a long title breaks rather than crowding the
  controls beside it.
- **Headline** (900, 22px, -0.02em): the `hosti` wordmark, the empty-state
  heading, and the gate.
- **Title** (400, 18px): a card's bundle title. Regular weight on purpose: the
  grid holds ten of these and 900 would shout ten times.
- **Body** (400, 16px, 1.5): prose. Measure capped at 48ch to 56ch inside a
  panel, 54ch for a page lead.
- **Label** (500, 11px, 0.12em, uppercase): panel headings and field labels.
  Uppercase is the only case transform in the system.
- **Mono** (12.5px, 0.015em): paths, slugs, URLs, byte counts, environment
  variable names, commands. Never for emphasis.

### Named rules

**The Machine Voice Rule.** Monospace means a value a machine produced or
consumes: a path, a slug, a URL, a size, a command, an env var. It is not a
texture. A word a person wrote is never mono.

**The One Serif Rule.** The serif names things. Titles, the wordmark, empty-state
headings. It never carries a sentence.

## Layout

One centred column, 1080px at most, with 32px of side padding that drops to
20px below 900px. Every screen hangs off the same masthead: mark, wordmark, a
line of meta on the right, and a 2px ink rule under it.

The catalog is a grid asked for by width, not by count:
`repeat(auto-fill, minmax(266px, 1fr))` with a 22px gap. It resolves to three
columns at 1080, two around 800, one below 560, and it never leaves a column
half the page wide between two fixed breakpoints.

The bundle page is two stacks that start on one baseline, 1.22fr against 1fr,
34px apart. Left: the preview, then revisions. Right: share links, then
collection. The preview is tall, so it is paired against the panel that also
grows. Below 900px the two stacks become one, in that order. A full-width strip
under a hairline closes the page.

Spacing runs on two steps, 22px between panels in a stack and 34px between
columns and major bands. Inside a panel, groups are tight (8px to 12px) and a
heading always carries more space above it than below.

### Named rules

**The Shared Baseline Rule.** Two columns of panels always start level, and each
column always holds more than one panel. A single short card beside a tall stack
is the failure this layout exists to prevent.

**The Ask By Width Rule.** Grid tracks are declared with `minmax`, never with a
fixed column count plus breakpoints. A count fixes the wrong thing.

## Elevation & depth

There is no shadow anywhere in this system, and adding one is a change to the
world, not a tweak.

Depth is three things. First, tone: `--card` sits one step lighter than
`--paper`, and a panel reads as lifted because of it. Second, one hairline:
`1px solid var(--line)` around a panel, `--line-soft` for a divider inside it.
Third, the dot grid, which continues behind every panel and stops at its edge,
so the panel visibly covers the paper.

The one apparent exception is the preview overlay, which uses a short dark
gradient to carry its label. That is a scrim over a photograph, not elevation.

### Named rule

**The One Edge Rule.** A surface declares itself once. A 1px border, or a tone
step, never a border under a shadow. Nothing in Hosti has both a border and a
shadow, because nothing in Hosti has a shadow.

## Shapes

Radii step with the size of the thing. A control is 6px, something nested inside
a panel is 8px, a panel or a card is 10px, a card standing alone on paper is
12px, and a pill is reserved for chips and the preview's open label. Nothing
exceeds 12px.

Borders are always 1px, always `--line` or `--line-soft`, always a full outline.
A coloured edge on one side is not part of this language. The one 2px rule in
the system is the ink line under the masthead, which is a printer's rule, not a
border.

Two silhouettes recur. The **panel**: a rounded card with an uppercase label at
the top over a soft divider. The **window**: a rounded card whose first row is a
mono bar naming a path, then live content, then a caption. Every preview is a
window.

## Components

### Buttons

- **Shape:** small rounded rectangle (6px), 4px by 11px of padding, 12.5px text,
  lowercase.
- **Default:** paper fill, `--line` border, ink text. Hover moves the border to
  `--ink`. Border and colour transition on `--t` (140ms), nothing else.
- **Go:** the one filled button on a screen. Ink fill, paper text, 13px, weight
  500, 6px by 15px. It opens something. A screen has at most one.
- **Danger tone:** identical at rest; hover moves the border and the text to
  `--danger`. There is no red button in Hosti.
- **Inert:** a control whose action is unavailable keeps its place and its
  label, switches its border to dashed, and drops to `--muted`. It is rendered
  as a `span` with `aria-disabled`, never removed.
- **Quiet danger:** a destructive action that is not a button. Muted text with a
  `--line` underline, 13px, that turns `--danger` on hover.

### Chips

- **Style:** pill, 1px `--line`, muted text, 13px, with a tabular count at 60%
  opacity.
- **Selected:** border and text to `--ink`, fill to `--card`.

### Cards and panels

- **Panel:** `--card` fill, 1px `--line`, 10px radius, 15px by 19px padding.
  Heading is the label style over a `--line-soft` divider.
- **Panel, urgent:** the same panel filled `--pop-wash` with a `#b6d2d5` edge.
  Exactly one state earns it: a bundle with no share link.
- **Card:** the same, with a preview at the top, a body, and a footer band on
  `--paper` divided by `--line-soft`. Hover moves the border one step darker.

### Inputs

- **Style:** `--card` fill, 1px `--line`, 6px radius, 4px by 9px. A PIN field is
  mono.
- **Focus:** 2px `--pop` outline at 1px offset with the border also going
  `--pop`. Every focusable thing in the system gets a `--pop` ring; none of them
  get `outline: none`.

### Navigation

The masthead is the whole of it: mark plus wordmark on the left linking home,
a meta line and `log out` on the right, a 2px ink rule beneath. Below 900px it
stacks left-aligned. A bundle page adds a `← back to the catalog` link in muted
13px under the rule.

### The preview window (signature)

The component the whole product is built around. A rounded panel whose first row
is a mono bar carrying the bundle's path on the left and its revision on the
right; then the bundle itself, live in a sandboxed frame, cropped to 16:10; then
a caption on a `--line-soft` divider.

The frame renders at a fixed viewport width and is scaled down to the slot:
760px for a card, 1100px for the bundle page. A white gradient fades the last
44px on a card and the last 76px on the bundle page, so the crop reads as a
crop. Hovering the bundle page's window raises a dark scrim with a pill reading
`open bundle ↗`.

### Named rule

**The Deliberate Crop Rule.** A preview never simply stops. It is bounded above
by a bar that names what it is showing, and it fades out at the base. A frame
cut through a sentence with a hard edge reads as broken software.

## Do's and don'ts

### Do

- **Do** keep a control in place when its action is unavailable. Render it
  inert with a reason beside it. A control that disappears sends the owner
  hunting for something they already learned the position of.
- **Do** put `open` in the loudest slot on any screen that shows a bundle. It is
  the first thing anyone reaches for.
- **Do** spend teal on machine values and on the one next action, and nowhere
  else.
- **Do** give every column of panels a partner panel, and start both columns on
  one baseline.
- **Do** set every path, slug, URL, size and command in mono with ligatures off.
- **Do** time every transition from `--t` so `prefers-reduced-motion` is one
  override.
- **Do** theme the surfaces the browser would otherwise own: selection, caret,
  scrollbar, focus ring, underline offset, and tabular numerals.

### Don't

- **Don't** add a shadow. The system is flat, and a border under a shadow is the
  ghost card this world exists without.
- **Don't** give a destructive control more weight than a daily one. Delete is
  a quiet underlined link on a full-width strip, last on the page, under a rule.
  It is never a panel of its own, and it is never on a catalog card.
- **Don't** use a coloured dot, a badge or an icon for share state. Words on a
  block.
- **Don't** use monospace as a costume for "technical". It marks machine values
  only.
- **Don't** declare grid tracks by count plus a breakpoint. Use `minmax`.
- **Don't** introduce a second accent, a gradient on text, glass, a dark mode
  toggle, an icon font, or a second display face.
- **Don't** claim behaviour the server does not have. Share links do not expire,
  nothing counts views, and no screen can ever show a PIN back.
