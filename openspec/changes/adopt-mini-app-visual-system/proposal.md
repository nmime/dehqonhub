# Adopt the dark mini-app visual system across DehqonHub

## Why

DehqonHub is launched primarily as a Telegram Mini App, but its product system
was authored for a light marketing web page: warm cream surfaces, print-like
elevation, and outline icons. Inside Telegram that reads as an embedded website
rather than an app — the shell competes with the host chrome, the bottom bar
disappears into the page, and small stroke icons lose contrast on low-DPI
Android devices at nav size.

The maintainer supplied a Telegram mini-app reference set and asked for the
product to move to that visual language. The reference contributes structure and
density — a deep canvas, gradient panels with generous radii, a floating
navigation island, compact stat chips, and filled glyphs — not its identity,
subject matter, or reward-loop patterns. DehqonHub keeps its own name, wordmark,
domain vocabulary, and honest-state rules.

The existing `REQ-AGRITECH-EXPERIENCE-026` mandates the cream/green light
palette by name, so the visual direction cannot change without formally
superseding those clauses.

## What Changes

- Make the dark theme the designed default. The token layer is authored
  dark-first: deep near-black canvas, indigo-violet gradient panels, a blue
  primary, a gold value accent, large corner radii, and glow-based elevation
  instead of drop shadows.
- Keep the light theme as a derived counterpart with equal hierarchy, spacing,
  and states, using palette-specific text tokens where the dark accent and
  success hues would fail contrast on light surfaces.
- Wire the display typeface that the token layer already declared but never
  applied, so headings and numeric values read as product typography.
- Add five shared mini-app primitives to `@app/frontend-ui-web`: page header,
  stat chip row, stat well grid, list row, and bottom navigation.
- Add a source-owned SVG asset pack: navigation glyphs, category marks, status
  badges, and empty-state illustrations. State is carried by glyph shape, not
  hue alone.
- Replace the hand-rolled bottom navigation in `MiniAppShell` with the shared
  navigation island. Navigation items now expose **visible text labels** rather
  than screen-reader-only names.
- Stop swapping the share control's accessible name to "Copied". The existing
  polite live region remains the single announcement of the copy result, and
  both share controls keep a stable name.
- Rewrite `docs/design/dehqonhub-marketplace.md` so the design contract matches
  the shipped tokens instead of contradicting them.

## Goals and Non-Goals

**Goals:**

- One product system that reads as a native Telegram Mini App in its default
  dark presentation and as a coherent light product on the open web.
- Shared, source-owned primitives and artwork so page code composes tokens
  instead of re-deriving spacing, radius, and colour per surface.
- Contrast, focus, target size, reduced motion, and narrow-viewport behavior at
  least as good as the palette being replaced.

**Non-Goals:**

- No change to routing, providers, API clients, authorization, guest favorite
  and preview-cart boundaries, demo provenance, or any commercial state
  machine. This change is presentation-only.
- No adoption of the reference product's identity, illustrations, subject
  matter, reward loops, streaks, or chance-based mechanics. A trade platform
  that extends agricultural credit must not borrow casino affordances.
- No removal of the light theme. Theme choice stays a user preference.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `agritech-marketplace`: `REQ-AGRITECH-EXPERIENCE-026` currently names the
  warm cream and green light palette, Poppins-compatible typography, pill
  controls, and print-like elevation as normative. Those clauses are replaced
  by the dark-default mini-app system, and two observable behaviors are added —
  visible bottom-navigation labels and a stable share-control accessible name.

`REQ-FRONTEND-DESIGN-008`, `REQ-FRONTEND-SHELL-004`, and
`REQ-FRONTEND-ACCESSIBILITY-003` are exercised by this change but are not
modified: they require shared, source-owned, theme-compatible primitives with
accessible names and preserved shell ownership, which the new primitives and
asset pack satisfy as written.

## Impact

Owned by `@app/frontend-ui-web` and `user-app`. It affects the shared token
stylesheet, the shared component barrel, a new shared asset barrel, the
mini-app shell composition, and Storybook and component evidence. Backend
schemas, persistence, authorization, provider contracts, i18n keys, and
deployment topology do not change.

## Risk, Rollout, and Rollback

- **Product risk:** a dark, high-contrast, gradient system can read as a game.
  Mitigated by keeping domain vocabulary, honest empty and demo states, and no
  reward, streak, or chance affordance; the gold accent marks settled value,
  never a prize.
- **Accessibility risk:** the reference palette is low-contrast in places. Both
  themes were computed against WCAG AA for body and large text, and
  `--xr-color-accent-text` / `--xr-color-success-text` exist precisely because
  the surface hues are not legible as text on the light background.
- **Compatibility risk:** the token names, `xr-*` class hooks, and shared
  component exports are unchanged, so application code that consumes tokens
  keeps working. Only values and two shell behaviors change.
- **Rollout:** a single presentation-layer change; no migration, flag, or data
  backfill.
- **Rollback:** revert the change commit. Nothing outside the frontend token
  layer, shared primitives, and mini-app shell is touched, and no persisted
  state depends on it.
