# Reconcile the DehqonHub brand mark, palette, and restricted-card copy

## Why

`REQ-AGRITECH-EXPERIENCE-026` no longer describes the shipped user web app in
three places, so the specification cannot be used to review the product.

- It mandates "a deliberate black theme" and dual-theme parity. The product
  owner removed the dark theme deliberately: no marketplace route, settings
  page, or shell control offers a theme choice any more, and the app boots one
  light palette. A requirement that still demands theme parity makes reviewers
  and evidence lanes assert behavior the product does not have.
- Its brand invariant only forbids the white-backed legacy raster mark and
  otherwise describes a text wordmark. The header and footer now render the
  maintainer's transparent DehqonHub emblem beside that wordmark, which the
  invariant neither clearly permits nor forbids, so the ban was being read as a
  ban on raster artwork of any kind.
- Every catalog card printed the same eligibility sentence ("sign in to use this
  marketplace action") under its add action. Repeated once per card it is noise,
  and the product owner asked for it to go.

## What Changes

- Replace the inline vector mark in the header and footer lockups with the
  transparent emblem raster, served from the 96 px asset with the 512 px master
  offered only to denser screens, presentational so the lockup keeps its own
  localized accessible name, and sized so the clickable lockup meets the 44 px
  minimum target.
- Remove the black-theme and dual-theme-parity obligations from
  `REQ-AGRITECH-EXPERIENCE-026`. The single light palette becomes the specified
  palette and the absence of a theme control becomes explicit.
- Remove the per-card eligibility hint and its per-card recovery button. The
  reason is now announced on the card's own action through an accessible
  description, governed demo provenance stays visible as a card chip, and a
  signed-in actor who cannot yet transact gets exactly one catalog-level notice
  with the recovery route.
- Make the restricted add action read as the same plain add-to-cart call as the
  authenticated one, on the product owner's direct instruction. The long
  preview-cart wording wrapped onto two lines inside the card button, and the
  device-local boundary is already stated where the buyer will see it: the add
  confirmation, the cart route, and the new catalog eligibility notice.
- Synchronize the stale component, Storybook, app-shell, and browser assertions
  that still described the inline vector mark, the removed theme control, and
  the removed per-card hint.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `agritech-marketplace`

## Impact

The change is owned by `user-app` and its user i18n catalogs. It touches the
marketplace brand lockup, the product card, the marketplace page shell, the
app-owned marketplace stylesheet, the four locale catalogs, and the component,
Storybook, user-app Playwright, and fullstack runtime evidence. No API schema,
persistence, authorization, provider contract, or deployment topology changes.

The requirement delta in `specs/agritech-marketplace/spec.md` carries the
requirement's complete current text so the modified wording can be read in
place. Only the palette, brand-mark, restricted-card, and preview-label clauses
belong to this change; the product-detail and image-viewer clauses are already
durable text owned by other in-flight work.

## Rollout

Presentation-only, one immutable `user-app` revision. No migration, no feature
flag, no contract version.

## Rollback

Redeploy the previous `user-app` revision. The removed theme control has no
persisted state to restore; a stored theme preference on the profile response is
simply not read for presentation any more.

## Risk

- Product risk: a reviewer who expects the dark theme reads its removal as a
  regression. Mitigated by stating the single-palette decision in the
  requirement instead of leaving it as undocumented drift.
- Accessibility risk: dropping visible per-card copy could hide the reason a
  visitor cannot transact. Mitigated by the accessible description on the
  action, the visible demo chip, the one catalog-level notice, and the
  cart-route boundary copy.
- Compatibility risk: none at the API boundary. The emblem assets are static
  files the app already serves.
