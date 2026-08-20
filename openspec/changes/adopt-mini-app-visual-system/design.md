# Design

## Context

`libs/frontend/ui-web/lib/src/styles.css` is the single token and component
stylesheet for every web deployable. It declares an `--xr-*` scale that is
mapped onto the shadcn semantic tokens, and `shadcn-foundation.spec.ts` guards
the presence of those token names. Application code consumes `xr-*` class hooks
and semantic tokens, never raw colour values.

That stylesheet was authored light-first for a marketing-style page. The
Telegram Mini App shell (`apps/frontend/app/src/shared/mini-app/`) sits on top
of it and hand-rolled its own bottom navigation, which duplicated layout the
shared library should own and shipped icon-only destinations with `sr-only`
labels.

## Goals / Non-Goals

**Goals:**

- Change the _values_ in the token layer, not the token _names_ or class hooks,
  so nothing downstream has to be rewritten and every guard test stays honest.
- Move the recurring mini-app shapes out of page code into shared primitives.
- Own the artwork in source so it themes with `currentColor` and tokens.

**Non-Goals:**

- No new dependency, no icon library swap (lucide keeps every icon except the
  five nav glyphs), no build or bundling change.
- No behavioral change to routing, data, or state.

## Decisions

### Dark-first token authoring, light as a derived theme

`:root` now sets `color-scheme: dark` and carries the dark values directly, so
the default presentation needs no attribute. `:root[data-theme='dark']`
re-asserts the same values — it is not redundant: a nested shell inside a light
ancestor must be able to reverse the theme, and the foundation guard reads the
block by name. `:root[data-theme='light']` carries the derived counterpart.

Core surface values: canvas `#0b0b12`, deep canvas `#08080e`, panel
`#1e1c3e` → `#241d48` (a 160° gradient), well `#141328`, border `#3a3270`.
Primary is blue `#2b6ef5`, accent is gold `#f5b43c`. Radii step
`0.75 / 1 / 1.25 / 1.5 rem`.

**Alternative considered:** keeping light as the authored default and adding a
dark override. Rejected — the product's primary surface is a Telegram Mini App
in a dark host. Authoring the secondary presentation as the source of truth is
how the current mismatch happened.

### Separate text tokens for accent and success

Gold `#f5b43c` on `#0b0b12` passes AA comfortably; on the light `#f4f4fa`
surface it is roughly 1.8:1 — unreadable. Rather than weaken the dark accent to
a value that works on both, `--xr-color-accent-text` and
`--xr-color-success-text` are separate tokens: on dark they equal the surface
hue, on light they resolve to `#8a5600` and `#15803d`. Components that render
accent-coloured _text_ use the `-text` token; components that render an accent
_fill_ use the surface token.

### Glow instead of drop shadow

Panels carry `box-shadow: none` and are separated by gradient and border. Only
raised interactive elements glow — `--xr-glow-primary`, `--xr-glow-accent` —
and only the navigation island keeps a true shadow (`--xr-shadow-nav`), because
it floats over scrolling content and needs a real occlusion cue.

### Five primitives, not one screen component

`UiPageHeader`, `UiStatChip`/`UiStatChipRow`, `UiStatWells`, `UiListRow`/
`UiListRows`, and `UiBottomNav` are the shapes that recur across the reference
screens. Each is a layout primitive with its own semantics:

- `UiStatWells` renders a `<dl>` with `<dt>` before `<dd>` so the pairing
  survives without sight; CSS `column-reverse` restores the visual order.
- `UiListRow` renders `<a>` with `href`, `<button>` with `onClick`, and `<div>`
  with neither, so a decorative row is not announced as an interactive one.
- `UiStatChip` is a `role="group"` with `aria-label="{label}: {value}"`.
- `UiBottomNav` renders visible labels and `aria-current="page"`.

**Alternative considered:** a single `MiniAppScreen` component taking a props
object. Rejected — it would push layout decisions into a prop schema and make
every page a configuration exercise rather than a composition.

### Source-owned SVG asset pack

`libs/frontend/ui-web/lib/src/asset/` holds `ArtworkFrame` plus navigation
glyphs, category marks, status badges, and empty-state illustrations. Gradients
are `useId()`-scoped so two instances on one page do not collide. Artwork is
`aria-hidden` unless given a `title`, in which case it becomes `role="img"`.
Status badges are hue-coded _and_ glyph-coded so state survives greyscale.

Filled nav glyphs replace lucide strokes in the bottom navigation only: at
24 px inside a filled active plate, a 2 px stroke loses too much contrast on a
low-DPI screen. Lucide still owns every other icon in the app.

### Share control keeps a stable accessible name

Previously both share controls swapped their name to "Copied" after a
successful copy while a polite live region also announced the result. A control
whose accessible name changes is announced as a different control, and on the
header button the `aria-label` meant the swapped text was never the accessible
name in the first place. The live region is now the single announcement; the
visual affordance still swaps to a check glyph, and `data-share-result` remains
the machine-readable hook. This is an observable change and is recorded as a
spec delta rather than absorbed silently.

## Risks / Trade-offs

- **Two palettes to maintain.** Every new token now needs a light counterpart.
  Accepted: the alternative is dropping the light theme, which would break the
  theme preference and the open-web surface.
- **Visible nav labels cost vertical space.** At 320 px four labelled
  destinations plus a trailing action fit, but a fifth would crowd. Accepted;
  the nav is capped by the shell's action list, not by user configuration.
- **Reference proximity.** The system is deliberately close to a game's visual
  density. The mitigation is behavioral, not visual: no chance mechanics, no
  streaks, no reward language, and the accent reserved for settled value.
