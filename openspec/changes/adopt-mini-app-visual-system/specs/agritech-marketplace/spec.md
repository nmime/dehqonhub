## MODIFIED Requirements

### Requirement: [REQ-AGRITECH-EXPERIENCE-026] DehqonHub user experience is coherent, responsive, and honestly previewable

The selected user web application SHALL present every DehqonHub marketplace
route through one mini-app product system whose authored default is a dark
presentation: a deep near-black canvas, gradient elevated panels, large corner
radii, a blue primary action colour, a gold accent reserved for settled
commercial value, filled navigation glyphs, a distinct display typeface for
headings and numeric values, and glow-based rather than drop-shadow elevation.
A derived light theme SHALL remain available as a user preference. Both themes
SHALL preserve the same content hierarchy, spacing, interaction states,
localized semantics, and generated-API authority across desktop, 375 px
Russian, and the 320 px supported floor.

The home experience SHALL expose the compact marketplace header, search,
category chips, hero, quick scenarios, real or governed-demo product shelves,
purchase-request explanation, verification entry, and footer without duplicated
category blocks or a separate marketing renderer. Catalog filters SHALL be
labelled, populated from current authoritative results, visibly active,
keyboard operable, resettable, and available in a mobile bottom sheet. Empty
text and price filter controls SHALL render localized example placeholders
without substituting those examples as submitted values. Order, contract,
verification, account, cart, favorites, and AI surfaces SHALL retain their
owning real state machines while following the same spacing, typography, icon,
card, and responsive rules.

The mini-app bottom navigation SHALL render each destination with a visible
text label beside or beneath its glyph and SHALL mark the current destination
with `aria-current="page"` in addition to any visual fill. Controls that report
a transient outcome SHALL keep a stable accessible name and announce the
outcome through a polite live region instead of renaming the control.

Guests and unverified visitors MAY assemble a versioned browser-local preview
cart grouped by seller. That preview SHALL be explicitly local, SHALL use only
safe public listing projections, and SHALL NOT invoke add-to-cart, update-cart,
checkout, contract, or verification mutations. The governed demo home MAY show
the three fixed reviewer identities created by the guarded demo seed, but only
while API-governed demo listings are present and only with explicit demo copy.

The account entry route SHALL present one focused task at a time. Returning
visitors SHALL receive a compact sign-in form and connected-provider choices;
new visitors SHALL receive a separate registration flow ordered as method,
identity, and credentials with a visible localized step trail. Moving backward
and forward SHALL preserve the drafted display name and email without retaining
the password in application state. Telegram registration SHALL reuse the
configured provider handoff, while email registration and password recovery
SHALL retain the existing generated auth-client submissions and sanitized
return-route behavior.

**Ownership:** `user-app` and `@app/frontend-feature-user-i18n`.

**Evidence profile:** domain and journey evidence.

**Invariants:**

- The dark reference palette uses a near-black canvas, indigo-violet gradient
  panels, a blue primary, a gold value accent, and readable muted text; the
  light theme is an explicitly authored counterpart with equivalent hierarchy
  and states rather than an automatic colour inversion. Pure black is not used
  as a surface.
- Accent and success hues that pass contrast on the dark canvas MUST NOT be
  reused as text colours on light surfaces; each palette resolves its own
  readable text token.
- The gold accent marks settled commercial value only. The product MUST NOT
  present chance outcomes, streaks, reward loops, or winnings language.
- Status, category, and empty-state artwork is source-owned, themes from design
  tokens, and encodes meaning by distinct glyph shape so state survives
  greyscale or colour-vision differences.
- The header/footer render a transparent text wordmark and MUST NOT display the
  white-backed legacy raster mark.
- Controls expose visible hover, focus, selected, disabled, loading, empty,
  validation, denied, error, and success states with a consistent 44 px minimum
  target where space permits. A control MAY be drawn smaller than its target so
  long as its hit area meets that floor.
- Decorative motion collapses under `prefers-reduced-motion: reduce` without
  changing layout, hierarchy, or available actions.
- Guest favorites store only opaque public listing IDs in a versioned
  browser-local set, are described as device-local, and grant no authenticated
  authority. Signed-in live-listing favorites remain server-authoritative.
- Guest preview carts are bounded and versioned, remain device-local, group
  public listing projections by seller, and cannot create a server cart,
  checkout, contract, or authorization outcome.
- Production catalog, seller, offer, order, contract, verification, account,
  payment, provider, and AI facts come only from generated API responses.
  Storybook/browser fixtures are test-only, and API-empty/error states never
  fall back to them.
- Governed demo listings retain explicit demo provenance, remain browse-only,
  and may be bookmarked only through the local guest/demo favorite boundary.
- Public marketplace routes remain public when an optional authentication
  presentation or session bootstrap returns an anonymous response.
- Language and theme changes update presentation preferences without changing
  the current route or manufacturing an authentication redirect.
- Account-entry mode or registration-step changes remain on `/auth`, preserve
  drafted non-secret identity values, and never bypass authentication or expose
  secret or production credentials in URLs, browser storage, fixtures, or page
  copy. The fixed reviewer identities are explicitly public demo data and appear
  only with API-governed demo provenance.

**Failure behavior:**

- Missing product media renders an intentional category illustration rather
  than a broken image, white box, or unlabeled placeholder.
- Empty filters or result sets render labelled recovery/reset guidance; they do
  not show blank panels, empty-looking controls, or fabricate listings.
- Unsupported width, locale expansion, or either theme MUST NOT create
  horizontal page overflow, clipped primary actions, clipped navigation labels,
  invisible focus, or unreadable text.
- A navigation destination MUST NOT be presented as an unlabeled glyph, and a
  transient outcome MUST NOT be announced by replacing a control's accessible
  name.
- Local-storage denial or malformed stored data fails safely to empty local
  favorite and preview-cart state and never redirects, crashes, or changes
  server state.
- Changing account-entry mode or registration step MUST NOT trigger an
  unrelated navigation, discard drafted name or email fields, duplicate all
  registration questions on one screen, or replace a failed auth response with
  a browser-authored success.

#### Scenario: Reference-led home and catalog

- **WHEN** a visitor opens the home or catalog in the default dark theme or the
  light theme on a desktop, 375 px Russian, or 320 px viewport
- **THEN** the compact DehqonHub shell, hero, product content, labelled filters,
  localized placeholder examples, active controls, equal-padding actions, and
  responsive navigation remain readable and operable without duplicate
  marketing content or horizontal overflow

#### Scenario: Labelled mini-app navigation identifies the current route

- **WHEN** the mini-app shell renders its bottom navigation on any route
- **THEN** every destination shows a visible text label with its glyph, the
  destination matching the active path carries `aria-current="page"`, and the
  navigation island stays clear of the reported safe-area insets

#### Scenario: Sharing announces once without renaming the control

- **WHEN** a visitor activates either share control and the link is copied
  rather than handed to a host share sheet
- **THEN** the polite live region announces the copy result once, both share
  controls keep their original accessible name, and the visual affordance
  alone reflects the confirmed state

#### Scenario: Guest bookmark remains local

- **WHEN** a signed-out visitor bookmarks and later removes a public live or
  governed-demo listing
- **THEN** the favorite route and header count update from a versioned local
  opaque-ID set, the UI identifies the device-local boundary, no authentication
  redirect occurs, and no marketplace API mutation or commercial authority is
  claimed

#### Scenario: Guest cart remains a local preview

- **WHEN** a guest adds public listings from one or more sellers, changes a
  quantity, and requests checkout
- **THEN** seller-grouped cart lines persist only in versioned browser storage,
  the header and cart update without a marketplace mutation, and contract review
  requires focused sign-in or verification instead of a browser-authored order

#### Scenario: Governed demo exposes reviewer entry honestly

- **WHEN** the API supplies governed demo listings on the home route
- **THEN** the farmer, seller, and buyer reviewer identities are visibly labelled
  as demo accounts with copy controls, while a live-only, empty, or failed
  catalog does not publish the identity list

#### Scenario: Authoritative empty and demo states stay honest

- **WHEN** the public catalog API returns no records, an error, or explicitly
  governed demo listings
- **THEN** the UI respectively renders an actionable empty state, a retry state,
  or visibly labelled browse-only demo cards and never substitutes a frontend
  production fixture

#### Scenario: Focused account entry preserves registration progress

- **WHEN** a visitor opens `/auth`, chooses account creation, selects email,
  enters identity details, moves to credentials, and then steps backward and
  forward in either supported theme or a narrow viewport
- **THEN** the route first shows a focused sign-in task, registration exposes a
  localized method-identity-credentials trail, drafted name and email survive
  step changes, Telegram remains an optional configured method, the final form
  uses the existing auth submission, and sign-in and recovery remain available
  without an unexpected redirect or horizontal overflow

#### Scenario: Complete workflow visual parity

- **WHEN** an authorized actor opens an order, contract, verification, account,
  cart, favorites, or AI workflow
- **THEN** its authoritative state and actions remain unchanged while typography,
  spacing, icons, cards, status treatments, responsive behavior, and both themes
  follow the same DehqonHub product system
