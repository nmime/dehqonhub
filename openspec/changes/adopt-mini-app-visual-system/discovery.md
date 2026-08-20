# Discovery

## Participants and Owners

- Product/domain owner: `agritech-maintainers`
- Specification author: `agritech-maintainers`
- Independent verification reviewer: `quality-engineering`
- Security reviewer, when applicable: not applicable — presentation-only change
  with no credential, authorization, or data-boundary surface.
- Operations reviewer, when applicable: not applicable — no deployment,
  topology, or runtime configuration change.

## Actors and Outcomes

- A dehqan farmer opening the app from a Telegram chat on a low-end Android
  phone needs the app to feel like part of Telegram, not like a website loaded
  in a frame, and needs navigation targets that are readable outdoors.
- A buyer comparing suppliers needs numeric values — balances, counts,
  settlement countdowns — to read as the primary content of a panel.
- A screen-reader user needs navigation destinations and control names to stay
  stable and predictable while a status change is announced exactly once.
- A visitor on the open web who prefers light presentation needs the same
  hierarchy and states, not a washed-out inversion of a dark design.

## Rules

- Dark is the default authored presentation; light is derived from it and must
  keep the same hierarchy, spacing, states, and semantics.
- The reference set contributes structure and density only. Identity, subject
  matter, artwork, and reward mechanics are not borrowed.
- Colour never carries meaning alone. Every status has a distinct glyph, and
  the active navigation item is marked by `aria-current` as well as by fill.
- Interactive targets are at least 44 px in their hit area; a control may look
  smaller than its target.
- A control's accessible name describes the control, not the outcome of the
  last interaction. Status is announced by a live region.
- Application pages compose shared primitives and tokens; they do not restate
  radius, colour, or elevation values locally.
- Motion is decorative. Every transition collapses under
  `prefers-reduced-motion: reduce`.

## Examples

- The bottom navigation renders as a floating island inset from the screen
  edges, respecting `--tg-safe-area-inset-*`, with each destination showing a
  filled glyph above a visible text label and the current destination carrying
  both a filled plate and `aria-current="page"`.
- A settlement countdown renders as four wells; each well is a `<dt>`/`<dd>`
  pair so it reads as "Days: 2" rather than "2 2 44 55", while CSS reverses the
  visual order so the number sits on top.
- A stat chip shows a 1.9 rem circular add button whose transparent `::after`
  extends the hit area to 44 px without enlarging the chip.
- Sharing a link announces "Share link copied to clipboard." once through the
  polite live region while both share buttons stay named "Send".

## Counterexamples and Boundaries

- A gold "collect"-style button attached to a chance outcome, a streak counter,
  a spinner reward, or any mechanic implying winnings is out of scope and
  forbidden; the accent marks settled commercial value only.
- Pure `#000000` is not used as a surface; the canvas is `#0b0b12` so elevated
  panels remain distinguishable.
- The dark accent `#f5b43c` and success `#22c55e` MUST NOT be reused as text
  colours on the light surface — they fail AA there, which is why the
  `-text` token variants exist.
- Icon-only navigation is a boundary violation: labels are visible text, not
  `sr-only` names.
- A non-interactive list row must not render as a `<button>` or `<a>`; with
  neither `href` nor `onClick` it renders a `<div>` and stays out of the tab
  order.
- The 320 px floor and 375 px Russian layout must not produce horizontal
  overflow, clipped nav labels, or an unreachable primary action.

## Failure and Operational Modes

- Missing product media renders an intentional source-owned category
  illustration, never a broken image or an unlabeled grey box.
- A theme change that fails to persist server-side leaves the local
  presentation applied and does not redirect or clear the route.
- Reduced-motion users receive the same layout with transitions removed, not a
  degraded or partially animated one.
- Rollback is a revert of the presentation commit; no stored user state depends
  on the palette.

## Assumptions

- The maintainer's instruction "all must be like in images of design" authorizes
  replacing the previously approved cream/green palette outright rather than
  adopting only its structure. This was confirmed explicitly before
  implementation.
- Telegram's own theme parameters continue to be treated as host chrome hints;
  the app supplies its own palette rather than inheriting per-client colours.

## Unresolved Questions

- None.
