## ADDED Requirements

### Requirement: [REQ-AGRITECH-EXPERIENCE-026] DehqonHub user experience is coherent, responsive, and honestly previewable

The selected user web application SHALL present every DehqonHub marketplace
route through one reference-led product system with Poppins-compatible
typography, warm cream and green light surfaces, a deliberate black theme,
pill-shaped controls, rounded cards and panels, transparent wordmark treatment,
clear line icons, consistent field and button padding, and restrained
print-like elevation. Both themes SHALL preserve the same content hierarchy,
localized semantics, interaction states, and generated-API authority across
desktop, 375 px Russian, and the 320 px supported floor.

The home experience SHALL expose the compact marketplace header, search,
category chips, gradient hero, quick scenarios, real or governed-demo product
shelves, purchase-request explanation, verification entry, and footer without
duplicated category blocks or a separate marketing renderer. Catalog filters
SHALL be labelled, populated from current authoritative results, visibly active,
keyboard operable, resettable, and available in a mobile bottom sheet. Empty
text and price filter controls SHALL render localized example placeholders
without substituting those examples as submitted values. Order,
contract, verification, account, cart, favorites, and AI surfaces SHALL retain
their owning real state machines while following the same spacing, typography,
icon, card, and responsive rules.

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

- The light reference palette uses warm cream, white, DehqonHub green, soft
  green, charcoal ink, and sand borders; the black theme uses explicit near-black
  green surfaces and readable contrast rather than an automatic color inversion.
- The header/footer render a transparent text wordmark and MUST NOT display the
  white-backed legacy raster mark.
- Controls expose visible hover, focus, selected, disabled, loading, empty,
  validation, denied, error, and success states with a consistent 44 px minimum
  target where space permits.
- Guest favorites store only opaque public listing IDs in a versioned
  browser-local set, are described as device-local, and grant no authenticated
  authority. Signed-in live-listing favorites remain server-authoritative.
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
  credentials in URLs, browser storage, public fixtures, or page copy.

**Failure behavior:**

- Missing product media renders an intentional category illustration rather
  than a broken image, white box, or unlabeled placeholder.
- Empty filters or result sets render labelled recovery/reset guidance; they do
  not show blank panels, empty-looking controls, or fabricate listings.
- Unsupported width, locale expansion, or either theme MUST NOT create
  horizontal page overflow, clipped primary actions, invisible focus, or
  unreadable text.
- Local-storage denial or malformed stored data fails safely to an empty local
  favorite set and never redirects, crashes, or changes server state.
- Changing account-entry mode or registration step MUST NOT trigger an
  unrelated navigation, discard drafted name or email fields, duplicate all
  registration questions on one screen, or replace a failed auth response with
  a browser-authored success.

#### Scenario: Reference-led home and catalog

- **WHEN** a visitor opens the home or catalog in light or black theme on a
  desktop, 375 px Russian, or 320 px viewport
- **THEN** the compact DehqonHub shell, hero, product content, labelled filters,
  localized placeholder examples, active controls, equal-padding actions, and
  responsive navigation remain readable and operable without duplicate
  marketing content or horizontal overflow

#### Scenario: Guest bookmark remains local

- **WHEN** a signed-out visitor bookmarks and later removes a public live or
  governed-demo listing
- **THEN** the favorite route and header count update from a versioned local
  opaque-ID set, the UI identifies the device-local boundary, no authentication
  redirect occurs, and no marketplace API mutation or commercial authority is
  claimed

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
