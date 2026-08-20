## MODIFIED Requirements

### Requirement: [REQ-AGRITECH-EXPERIENCE-026] DehqonHub user experience is coherent, responsive, and honestly previewable

The selected user web application SHALL present every DehqonHub marketplace
route through one reference-led product system with Poppins-compatible
typography, warm cream and green light surfaces, pill-shaped controls, rounded
cards and panels, a transparent brand mark beside a transparent text wordmark,
clear line icons, consistent field and button padding, and restrained
print-like elevation. The product SHALL ship that single light palette and SHALL
expose no theme control on any route. The palette SHALL preserve the same
content hierarchy, localized semantics, interaction states, and generated-API
authority across desktop, 375 px Russian, and the 320 px supported floor.

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

The product detail route SHALL state the listing's own attributes, grouped as
category-specific facts before commercial terms, using the same vocabulary the
catalog facets filter on, and SHALL repeat the availability, sample, promotion,
region, and verified-seller tags the catalog card carries. It SHALL render only
members the generated listing projection actually returns and SHALL omit an
absent member instead of printing a placeholder value. The route SHALL present
every image the listing carries: one main frame, a thumbnail strip once more
than one image exists, and a modal fullscreen viewer with previous/next
controls, Left/Right arrow keys, Escape dismissal, and touch swipe. The viewer
SHALL be a labelled modal dialog that traps focus, returns focus to the frame
that opened it, locks page scrolling while open, and restores scrolling when it
closes or unmounts.

Every route SHALL report work in progress in the shape of the content that is
coming. A region whose data has not arrived SHALL render placeholders that
occupy approximately the box the content will occupy — a catalog grid as cards,
a management or offer list as rows, a definition list as label and value rows, a
dashboard as stat tiles, and the product route as its image frame, thumbnail
strip and grouped specifications — rather than one generic tile shape reused for
every region. A control whose action is in flight SHALL show that it is working
through a spinner in an affordance slot the control reserves in both states,
SHALL carry `aria-busy`, SHALL keep its accessible name and its box unchanged,
and SHALL stay disabled so the action cannot be submitted twice.

The cart route SHALL present the seller-separated carts owned by
REQ-AGRITECH-MARKETPLACE-016 through exactly one switching control: a single
compact strip in which every sub-cart appears once, naming its seller with the
verified seal the listing projection reports, its region, its own item count, and
its own total. Exactly one sub-cart SHALL be active, and only the active sub-cart
SHALL render line items, the delivery choice, and the checkout action. An
inactive sub-cart SHALL NOT be repeated outside that strip as a second summary
row carrying the same facts and its own swap control. The active selection SHALL
persist in versioned browser storage on the same fail-closed discipline as the
local preview cart, and SHALL resolve deterministically to the first remaining
cart when the stored one is gone.

The purchase-request experience SHALL separate the buyer's own purchase requests
from the seller's incoming request feed as distinct addressable deep links, and
SHALL give a single request its own view. That view SHALL state the request facts,
a five-stage progress scale of draft, moderation, collecting offers, offer
selected, and contract, the received offers as cards carrying price, delivery
terms, and the seller display with its verified seal, and exactly one
unmistakable primary action for the stage the request is in. Creating a request
SHALL be a step-by-step flow whose fieldsets all remain mounted so moving between
steps loses no entered value. Every purchase-request view SHALL carry explicit
loading, empty, error, and awaiting-moderation states rather than a blank region.

Guests and unverified visitors MAY assemble a versioned browser-local preview
cart grouped by seller. That preview SHALL be explicitly local, SHALL use only
safe public listing projections, and SHALL NOT invoke add-to-cart, update-cart,
checkout, contract, or verification mutations.

The home experience MAY publish the three fixed reviewer identities created by
the guarded demo seed while the deployment's reviewer-access runtime flag is
enabled, on a live, demo, or mixed catalog alike, because reviewer entry is a
deployment decision rather than a property of the catalog. That reviewer entry
SHALL name the identities as demo accounts in visible copy, SHALL state what
each role is for — including that the farmer identity is a dashboard role and
not a party to a marketplace transaction — and SHALL state qualitatively that a
purchase request, competing offers, and a signed contract are already prepared
between the buyer and seller identities without asserting counts or identifiers
the page cannot read. It SHALL NOT present the seeded activity as production
activity. A deployment SHALL be able to withdraw the identity list through that
runtime flag alone, with no code change, and an unset or unparsable flag value
SHALL fall through to the build-time default instead of an undefined state.

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

- The reference palette uses warm cream, white, DehqonHub green, soft green,
  charcoal ink, and sand borders. It is the only palette the product ships: no
  route, control, or stored preference offers a second theme, and no automatic
  color inversion stands in for one.
- The header and footer render the DehqonHub emblem beside a transparent text
  wordmark. The emblem MAY be raster or vector but MUST be transparent: no
  opaque or white plate, and never the white-backed legacy raster mark. Where
  the mark renders small it MUST be served from an asset sized for that box
  rather than a full-resolution master, and it MUST stay presentational so the
  clickable lockup keeps its own localized accessible name. That lockup is
  itself an interactive target and MUST meet the 44 px minimum.
- Controls expose visible hover, focus, selected, disabled, loading, empty,
  validation, denied, error, and success states with a consistent 44 px minimum
  target where space permits.
- The product ships exactly one shimmer treatment and exactly one spinner, both
  built from the existing palette tokens. A placeholder is never a control, a
  heading, or a landmark: it is hidden from assistive technology while its
  container carries `aria-busy` and a screen-reader-only status announces the
  region as loading and then, by name, as ready. A busy control never changes
  its accessible name to report its state.
- A placeholder that would appear and disappear within a few frames is not
  shown. A placeholder appears only once the work has outlasted the
  instantaneous-response window, and once it has appeared it stays for a minimum
  duration. Under `prefers-reduced-motion` the shimmer and the spinner take a
  deliberate reduced treatment rather than a frozen animation, and because the
  reduced placeholder does not move, its minimum visible duration is longer.
- The buyer's own purchase requests and the seller's incoming request feed are
  never rendered as one mixed list; each is its own addressable view, a single
  request is addressable on its own, and the request creation flow hides the
  inactive steps rather than unmounting their fields.
- Guest favorites store only opaque public listing IDs in a versioned
  browser-local set, are described as device-local, and grant no authenticated
  authority. Signed-in live-listing favorites remain server-authoritative.
- Guest preview carts are bounded and versioned, remain device-local, group
  public listing projections by seller, and cannot create a server cart,
  checkout, contract, or authorization outcome. The add action reads as the same
  plain add-to-cart call in every eligibility state. The device-local boundary
  SHALL be stated where the buyer will see it — the add confirmation, the cart
  route, and the catalog eligibility notice — and never as extra wording on the
  button.
- The cart route never merges two sellers into one prospective order. Switching
  sub-carts is offered exactly once, as a tablist with roving tab focus and
  Arrow/Home/End keys; no second control repeats an inactive sub-cart's seller,
  count and total beside its own swap button. The active sub-cart is announced in
  a polite live region, and every count and total is rendered with the sub-cart it
  belongs to, whether in that cart's tab or in the active panel. A count or total
  never appears as a bare label paired with a value that already spells the same
  term out. A single seller drops the switcher yet still names that seller and
  leaves no dangling tab reference behind. A line whose listing left the
  authoritative projection or sold out is labelled and excluded from its cart
  total instead of being silently priced. Quantity and checkout actions address
  the active sub-cart's cart id only.
- A restricted catalog card carries the demo or eligibility reason on its own
  action as an accessible description and MUST NOT print that reason as visible
  copy under every card. Governed demo provenance stays visible on the card, and
  a signed-in actor who cannot yet transact receives exactly one catalog-level
  notice holding the reason and its recovery route.
- Product detail attributes and tags are projections of the generated public
  listing response. Produce states crop and grade, inputs state the category the
  catalog offers as a facet, and no attribute is inferred, defaulted, or
  reworded into a claim the API did not make.
- The fullscreen image viewer is a single modal dialog with `aria-modal`, a
  labelled close control, labelled previous/next controls, a trapped tab ring,
  and an announced position; page scrolling is locked for exactly as long as it
  is open.
- Production catalog, seller, offer, order, contract, verification, account,
  payment, provider, and AI facts come only from generated API responses.
  Storybook/browser fixtures are test-only, and API-empty/error states never
  fall back to them.
- Governed demo listings retain explicit demo provenance, remain browse-only,
  and may be bookmarked only through the local guest/demo favorite boundary.
- Public marketplace routes remain public when an optional authentication
  presentation or session bootstrap returns an anonymous response.
- Language changes update presentation preferences without changing the current
  route or manufacturing an authentication redirect.
- Account-entry mode or registration-step changes remain on `/auth`, preserve
  drafted non-secret identity values, and never bypass authentication or expose
  secret or production credentials in URLs, browser storage, fixtures, or page
  copy. The fixed reviewer identities are explicitly public demo data, stay
  labelled as demo accounts wherever they are published, and appear only while
  the deployment's reviewer-access flag is enabled.

**Failure behavior:**

- Missing product media renders an intentional category illustration rather
  than a broken image, white box, or unlabeled placeholder. A listing without
  images offers no thumbnail strip and no fullscreen viewer, a single image
  offers no strip and no previous/next controls, and an image URL that fails to
  load degrades to that same labelled category illustration in the frame, the
  strip, and the viewer.
- Empty filters or result sets render labelled recovery/reset guidance; they do
  not show blank panels, empty-looking controls, or fabricate listings.
- A region that is still loading never renders a blank area, and never renders a
  placeholder whose shape or height is not the shape or height of the content it
  stands in for. An action that is in flight never reads as a dead control that
  merely greyed out, and a placeholder is never left on screen as a substitute
  for an error or empty state once the response has arrived.
- Unsupported width or locale expansion MUST NOT create horizontal page
  overflow, clipped primary actions, invisible focus, or unreadable text.
- Local-storage denial or malformed stored data fails safely to empty local
  favorite and preview-cart state and never redirects, crashes, or changes
  server state.
- Changing account-entry mode or registration step MUST NOT trigger an
  unrelated navigation, discard drafted name or email fields, duplicate all
  registration questions on one screen, or replace a failed auth response with
  a browser-authored success.

#### Scenario: Reference-led home and catalog

- **WHEN** a visitor opens the home or catalog on a desktop, 375 px Russian, or
  320 px viewport
- **THEN** the compact DehqonHub shell, hero, product content, labelled filters,
  localized placeholder examples, active controls, equal-padding actions, and
  responsive navigation remain readable and operable without duplicate
  marketing content or horizontal overflow

#### Scenario: One brand lockup and one restriction notice

- **WHEN** a signed-in actor who is not yet eligible to transact opens the home
  or catalog in any supported locale
- **THEN** the header and footer each render the transparent DehqonHub emblem
  from its small-asset source beside the text wordmark on a lockup that meets the
  44 px target, the route shows exactly one notice naming the eligibility reason
  and its recovery route, and no product card prints that reason while governed
  demo cards keep their visible demo label

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

#### Scenario: Active seller sub-cart is switched and checked out alone

- **WHEN** a buyer holding carts from several sellers switches the active
  sub-cart with the pointer or the keyboard, changes a quantity, reloads, and
  requests contract review
- **THEN** the one switching strip lists every sub-cart with its seller, region,
  count and total, only the chosen sub-cart renders lines, delivery and checkout,
  no inactive sub-cart is repeated below the strip as a second switch row, the
  selection survives the reload from versioned browser storage, and checkout
  submits that one seller's cart id without ever mixing sellers into a single
  order

#### Scenario: Reviewer entry follows its deployment flag and stays honest

- **WHEN** the home route renders a live-only catalog while the deployment's
  reviewer-access flag is enabled, and renders again after a deployment turns
  that flag off
- **THEN** the enabled case publishes the farmer, seller, and buyer identities
  with visible demo labelling, copy controls, each role's purpose including the
  farmer's dashboard-only limit, and a qualitative note that a purchase request,
  competing offers, and a signed contract are already prepared between the buyer
  and seller identities, while the disabled case publishes no identity list at
  all

#### Scenario: Authoritative empty and demo states stay honest

- **WHEN** the public catalog API returns no records, an error, or explicitly
  governed demo listings
- **THEN** the UI respectively renders an actionable empty state, a retry state,
  or visibly labelled browse-only demo cards and never substitutes a frontend
  production fixture

#### Scenario: Focused account entry preserves registration progress

- **WHEN** a visitor opens `/auth`, chooses account creation, selects email,
  enters identity details, moves to credentials, and then steps backward and
  forward on a narrow viewport
- **THEN** the route first shows a focused sign-in task, registration exposes a
  localized method-identity-credentials trail, drafted name and email survive
  step changes, Telegram remains an optional configured method, the final form
  uses the existing auth submission, and sign-in and recovery remain available
  without an unexpected redirect or horizontal overflow

#### Scenario: Purchase requests separate ownership and show real progress

- **WHEN** a buyer opens their own purchase requests, the seller feed, and one
  single request
- **THEN** the two lists are separate addressable views rather than one mixed
  list, the single request shows its facts, the five-stage progress scale, the
  offers as cards, and one primary action for its stage, the creation flow keeps
  every step's fields mounted, and a request still awaiting moderation says so
  instead of rendering an empty offer list

#### Scenario: Product detail states the attributes the catalog filtered on

- **WHEN** a visitor opens a produce or input listing after filtering the catalog
  by crop, grade, category, availability, or seller trust
- **THEN** the detail route shows those same values in a grouped attribute block
  with the catalog's own labels, repeats the availability, sample, promotion,
  region, and verified-seller tags, and omits every member the generated listing
  projection did not return

#### Scenario: Fullscreen image viewer is keyboard and touch operable

- **WHEN** a visitor opens the main image of a listing that carries several
  images and then uses thumbnails, arrow keys, swipes, and Escape
- **THEN** a labelled modal dialog opens on the selected image with focus on its
  close control, previous/next controls and Left/Right keys move through the
  images, a horizontal swipe moves the same way, page scrolling stays locked
  while it is open, and Escape closes it and returns focus to the frame that
  opened it

#### Scenario: Complete workflow visual parity

- **WHEN** an authorized actor opens an order, contract, verification, account,
  cart, favorites, or AI workflow
- **THEN** its authoritative state and actions remain unchanged while typography,
  spacing, icons, cards, status treatments, and responsive behavior follow the
  same single-palette DehqonHub product system

#### Scenario: Loading carries the shape of the content and the state of the action

- **WHEN** a visitor opens a catalog grid, a management list, a seller profile,
  and a product route while the responses are slow, submits an action from one of
  them, and repeats the same journey with reduced motion requested
- **THEN** each region renders placeholders in its own content shape inside a
  container marked `aria-busy` with every placeholder hidden from assistive
  technology and one status announcing the region as loading and then as ready,
  the submitted control shows a spinner in a slot it already reserved while
  staying disabled and keeping its accessible name, no placeholder is painted for
  work that resolves inside the instantaneous-response window, and the
  reduced-motion journey shows the deliberate static treatment held for longer
  instead of a frozen animation
