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
  white: "#ffffff"
  selection: "#bfe0e3"
typography:
  display:
    fontFamily: "Fraunces, Superclarendon, 'Bookman Old Style', Georgia, serif"
    fontSize: "clamp(34px, 5.6vw, 54px)"
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
    fontSize: "25px"
    fontWeight: 900
    lineHeight: 1.25
    letterSpacing: "-0.01em"
  body:
    fontFamily: "'Instrument Sans', ui-sans-serif, system-ui, 'Helvetica Neue', sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  meta:
    fontFamily: "'Instrument Sans', ui-sans-serif, system-ui, 'Helvetica Neue', sans-serif"
    fontSize: "13.5px"
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
  preview-mark: "2px"
  focus: "3px"
  stamp: "4px"
  flag: "5px"
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
  section-rule:
    backgroundColor: "transparent"
    textColor: "{colors.muted}"
    typography: "11px"
    padding: "0"
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
- Type is compact around the bundle previews; names carry real display weight.
- Destructive controls come last and use burnt red only when the owner acts.

## Colors

A cool grey-blue paper stack with one deep teal accent and one burnt red that
almost never appears.

### Primary

- **Deep Teal** (`#06707e`): the machine's voice. It marks a path, a live share
  URL, a slug, the current revision, and the `link` or `pin` flag. It is also
  the focus ring. It never decorates a heading and it never fills a large area,
  except inside a sharing-state flag.
- **Teal Wash** (`#e4f0f1`): one small fill, the step numbers on the empty
  catalog. It is not a panel tint; the bundle page has no panels to tint.

### Tertiary

- **Burnt Red** (`#8a2b14`): refusals and destruction only. It carries an error
  line and the filled `delete bundle` control. No other resting control uses
  it.

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

**The Words Rule.** The sharing state is never a coloured dot. `private`,
`link` and `pin` are printed words on a block, and the block's colour only
repeats what the words already said.

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

- **Display** (900, `clamp(34px, 5.6vw, 54px)`, 1.02, -0.035em): a bundle's
  title. One per page, capped at 18ch so a long title breaks before it crowds
  the meta line.
- **Headline** (900, 22px, -0.02em): the `hosti` wordmark, the empty-state
  heading, and the gate.
- **Title** (900, 25px; 19px below 560px): a card's bundle title. The slug
  lives in the window bar, leaving the name as the one heavy thing in the card.
- **Body** (400, 16px, 1.5): prose. Measure capped at 48ch to 56ch inside a
  panel, 54ch for a page lead.
- **Meta** (400, 13.5px, 1.5): the short secondary line that states where
  something stands. The meta line under a bundle title, the share state, a
  share link's path, the drop zone's prompt, and the gate's setup note. It sits
  between body and label because it is read after the thing it describes, never
  before it.
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
20px below 900px. The catalog and bundle mastheads end on a 5px printer's rule,
then a compact register line ends on a hairline. Login, gate and 404 keep their
own masthead treatment.

The catalog is a grid asked for by width, not by count:
`repeat(auto-fill, minmax(298px, 1fr))` with a 22px gap. Below 560px each card
turns into a compact row with a 108px preview, its name, sharing state and open
action. The phone catalog stays a contact sheet instead of becoming a tall
stack of 16:10 previews.

The bundle page is one column. Under the title, three blocks remain: the meta
line with its collection select and open action, the preview window, and one
sharing island. A delete strip closes the page. Revision history is absent;
the current revision and date appear once in the meta line. Collection editing
lives in that line rather than in a section.

Spacing runs on two steps, 22px between the daily blocks and 34px before the
delete strip. A heading always carries more space above it than below.

### Named rules

**The One Column Rule.** The bundle page never splits. A control the owner
needs is found by reading down, not by scanning across, and a section that
runs short leaves a shorter page rather than a hole beside a taller one.

**The Said Once Rule.** Collection, current revision and date are stated in the
meta line under the title. Sharing state is stated in its selected radio row.
Neither fact is repeated elsewhere on the bundle page.

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

Radii step with the size of the thing. Preview marks use 2px, the focus ring
follows at 3px, a pin stamp uses 4px, and sharing flags use 5px. A control is
6px, something nested inside a panel is 8px, a panel or card is 10px, and a
card standing alone on paper is 12px. Pills are reserved for chips and the
preview's open label. Nothing exceeds 12px.

Borders are 1px, always `--line` or `--line-soft`, always a full outline. A
coloured edge on one side is not part of this language. The catalog and bundle
mastheads use a 5px printer's rule over a hairline register. The bundle meta
line uses a 2px ink rule to bind the select, revision, date and open action.

Two silhouettes recur. The **card**: a rounded box with a preview at the top, a
body, and a footer band. It exists in the catalog grid and nowhere else. The
**window**: a rounded card whose first row is a mono bar naming a path, then
live content cropped and faded at the base. Every preview is a window.

The **sharing island** is a third silhouette: one card-tone surface with a
label band, three full-width radio rows and a foot band for the address. It is
one control group, not a stack of smaller cards.

## Components

### Buttons

- **Shape:** small rounded rectangle (6px), 4px by 11px of padding, 12.5px text,
  lowercase.
- **Default:** paper fill, `--line` border, ink text. Hover moves the border to
  `--ink`. Border and colour transition on `--t` (140ms), nothing else.
- **Go:** the one filled button on a screen. Ink fill, paper text, 13px, weight
  500, 6px by 15px. It opens something. A screen has at most one.
- **Danger tone:** confirmation actions may move border and text to
  `--danger`. The final bundle delete is a filled burnt-red button, last on the
  page.
- **Inert:** a daily control whose action is unavailable keeps its place and
  drops to `--muted`. The no-revision sharing block is different: it collapses
  to one short reason because no share action exists yet.
- **Delete:** a filled burnt-red button, 14px, with an inline confirmation that
  names its real cost before the form can post.

### Chips

- **Style:** pill, 1px `--line`, muted text, 13px, with a tabular count at 60%
  opacity.
- **Selected:** border and text to `--ink`, fill to `--card`.

### Islands and cards

- **Sharing island:** `--card` fill, 1px `--line`, 10px radius. Its head and
  foot use `--paper`; the selected radio row uses the same tone step. Choice
  labels are 18px and the live address is 15px.
- **Card:** `--card` fill, 1px `--line`, 10px radius, with a preview window, a
  body, and a footer band on `--paper` divided by `--line-soft`. Below 560px the
  same parts run across as a compact row. Only the catalog has these cards.

### Inputs

- **Style:** `--card` fill, 1px `--line`, 6px radius, 4px by 9px. A pin field is
  mono.
- **Focus:** 2px `--pop` outline at 1px offset with the border also going
  `--pop`. Every focusable thing in the system gets a `--pop` ring; none of them
  get `outline: none`.

### Navigation

The masthead is the whole of it: mark plus wordmark on the left linking home,
an optional meta line and `log out` on the right. Catalog and bundle pages use
a 5px ink printer's rule, followed by the uppercase register and one hairline.
The bundle page leaves the meta slot empty and adds a `← back to the catalog`
link below the register.

### The preview window (signature)

The component the whole product is built around. A rounded panel whose first
row is a mono bar. Catalog cards carry the bundle path and current revision;
the bundle page carries the path, entry file and byte size. The live sandboxed
frame is cropped below it.

A card crops to 16:10. The bundle page's window runs the full column, so it
crops to 21:9 instead: 16:10 across 1080px is 675px of picture before the owner
reaches a single control. Below 700px, where the column is already short, it
goes back to 16:10.

The frame renders at a fixed viewport width and is scaled down to the slot:
760px for a card, 1100px for the bundle page. Loading plate words run at 24px,
30px on the wide bundle preview, and 17px in a phone card. A truthful plate
stays under the frame and its entry file, file count and byte size remain
legible at the base.
The plate covers loading, almost-blank and no-revision states without painting
an unexplained white rectangle. Hovering the bundle page's window raises a dark
scrim with `open bundle ↗`.

### Named rule

**The Deliberate Crop Rule.** A preview never simply stops. It is bounded above
by a bar that names what it is showing, and it fades out at the base. A frame
cut through a sentence with a hard edge reads as broken software. The bar and
the fade carry this on their own, with no caption underneath explaining them.

## Do's and don'ts

### Do

- **Do** keep daily controls in place when their action is unavailable. A
  no-revision bundle is the exception: sharing collapses to one compact inert
  line because there is no address that can answer yet.
- **Do** put `open` in the loudest slot on any screen that shows a bundle. It is
  the first thing anyone reaches for.
- **Do** spend teal on machine values and on the one next action, and nowhere
  else.
- **Do** put rotate and delete confirmation inline, in the band where the
  initiating control already lives.
- **Do** set every path, slug, URL, size and command in mono with ligatures off.
- **Do** time every transition from `--t` so `prefers-reduced-motion` is one
  override.
- **Do** theme the surfaces the browser would otherwise own: selection, caret,
  scrollbar, focus ring, underline offset, and tabular numerals.

### Don't

- **Don't** add a shadow. The system is flat, and a border under a shadow is the
  ghost card this world exists without.
- **Don't** move delete above the daily controls. It is filled burnt red, but
  it stays last, under a rule, and never appears on a catalog card.
- **Don't** use a coloured dot, a badge or an icon for share state. Words on a
  block.
- **Don't** use monospace as a costume for "technical". It marks machine values
  only.
- **Don't** explain the product on a screen the owner uses daily. A sentence
  earns its place only by carrying something nobody could guess: that a PIN is
  hashed and unreadable, and what a delete takes with it.
- **Don't** split sharing into a link list, per-link disclosures or nested
  cards. One bundle has one sharing island and one address.
- **Don't** declare grid tracks by count plus a breakpoint. Use `minmax`.
- **Don't** introduce a second accent, a gradient on text, glass, a dark mode
  toggle, an icon font, or a second display face.
- **Don't** claim behaviour the server does not have. Share links do not expire,
  nothing counts views, and no screen can ever show a PIN back.
