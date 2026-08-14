# Rebuild the DehqonHub user experience from the approved product references

## Why

The selected `user-app` owns the DehqonHub apex and complete marketplace, but
its current presentation does not consistently match the approved warm-cream,
green, pill-shaped product language. Header controls crowd narrow layouts,
typography drifts from the supplied design, the logo asset carries a visible
white box, filters and field padding are visually inconsistent, and an empty
production catalog leaves no useful governed preview path. Guest favorites also
force authentication even though a clearly local bookmark is sufficient.

## What Changes

- Recompose the user marketplace shell, home, catalog, order, contract,
  verification, account, cart, favorites, and AI surfaces around the approved
  DehqonHub layout and token system.
- Use Poppins-compatible product typography, warm cream/green light surfaces,
  pill controls, flat print-like elevation, consistent padding, transparent
  wordmark treatment, and clear line icons.
- Keep an intentionally designed black theme with equivalent hierarchy,
  contrast, spacing, and component states.
- Keep catalog filters labelled, populated from authoritative catalog values,
  visibly active, keyboard-operable, and responsive through a mobile sheet.
- Add guest-only browser-local favorites without fabricating authenticated
  marketplace records; signed-in favorites remain server-authoritative.
- Present API-provided demo listings as clearly labelled browse-only preview
  data and provide deterministic realistic Storybook/browser fixtures for
  frontend evaluation without a production fixture fallback.
- Preserve generated API clients, verification/organization gates, public route
  behavior, and every existing transactional boundary.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `agritech-marketplace`

## Impact

The change is owned by `user-app` and its user i18n catalogs. It affects the
marketplace page composition, styles, local guest preference state, deterministic
frontend preview fixtures, and browser/component evidence. Backend endpoint
schemas, persistence, authorization, provider contracts, and deployment
topology do not change.
