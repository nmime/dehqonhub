## MODIFIED Requirements

### Requirement: [REQ-AGRITECH-MARKETPLACE-016] DehqonHub marketplace transactions are real, isolated, and recoverable

The platform SHALL provide persisted, transactional catalog, cart,
purchase-request, offer, sample, review, contract-review, verification, and
catalog-grounded AI behavior through generated API contracts. Anonymous
publication and discovery SHALL be governed exclusively by
REQ-AGRITECH-PUBLIC-018. Browser routing and rendering SHALL be governed by
REQ-AGRITECH-WEB-006, and locale parity SHALL be governed by
REQ-AGRITECH-I18N-012. Commercial mutations SHALL be authenticated,
organization-authorized, tenant-safe, transactional, and fail closed when
verification or an external provider is unavailable. Commands whose HTTP
contract declares an `Idempotency-Key` SHALL return the original result for an
exact replay, reject changed-input key reuse, and avoid duplicate outcomes under
concurrency. An owned purchase-request read SHALL carry that request's public
request-publication correlation — the opaque publication identifier plus the
current publication and moderation status whenever a publication exists — because
the request publication, and never the private request row, is what
`GET /marketplace/requests/{id}/offers`,
`POST /marketplace/requests/{id}/offers`, and
`POST /marketplace/requests/{id}/offers/{offerId}/choose` address. This contract
applies explicitly to
`POST /marketplace/verification`,
`POST /marketplace/verification/submit`,
`PATCH /marketplace/contracts/{id}/delivery-quote`, and
`PATCH /admin/verifications/{id}`: each requires an 8-100 character safe
`Idempotency-Key` and integer `expectedRevision >= 0`. First verification
creation treats an absent aggregate as revision zero; rejected-case resume and
all later commands compare-and-set the current aggregate revision.

**Ownership:** `user-app`, `user-app-api`, `admin-app-api`,
`@app/frontend-api-client`, `@app/frontend-feature-user-i18n`,
`@app/backend-feature-product-main`, `@app/backend-feature-product-shared`,
`@app/backend-feature-agritech-main`,
`@app/backend-feature-agritech-admin`, `@app/backend-feature-agritech-shared`,
`@app/backend-postgres-main-agritech`, and `acceptance-e2e`.

**Evidence profile:** acceptance, API, domain, persistence, and security
evidence.

**Invariants:**

- Private marketplace records from one tenant MUST NOT be read, linked, mutated,
  or recommended through another tenant. Visibility of one publication governed
  by REQ-AGRITECH-PUBLIC-018 does not grant access to its source tenant.
- `CartViewDto`, `BuyerRequestViewDto`, `OfferViewDto`, and `ContractViewDto`
  expose opaque marketplace identifiers and safe commerce fields only. Where
  counterparty identity is needed, they use the caller's actor relationship and
  allowlisted party display snapshots. Internal tenant, user, partner, source-row,
  and provider-operation identifiers remain absent from user responses.
  `BuyerRequestViewDto` additionally carries the request's own opaque publication
  identifier and that publication's status and moderation status, which describe a
  public row the same actor owns and are not internal identity.
- Offer reads and offer selection for a purchase request are addressed by the
  request publication identifier only. A request with no publication is not
  addressable by those endpoints at all, and the client MUST report that the
  request is awaiting moderation instead of presenting an empty or silently failed
  offer list.
- Product seller identity, request ownership, offer authorship, verification,
  approved buyer/supplier organization membership, contract parties, and
  signing actor MUST be derived from authenticated and persisted state, never a
  display label or caller-selected authority field.
- An open cart MUST contain products from exactly one server-derived seller;
  adding a different seller's product creates or updates another cart.
- Every persisted party-coherence invariant — behind a cart, an offer, a
  contract, a purchase request, a sample request, and a listing review — MUST
  accept exactly the verification roles the marketplace role policy authorizes
  for that side: `buyer` or `farmer` on the buying side, and `seller` or
  `farmer` on the selling side, each still requiring an active membership of the
  matching capability on an approved organization of the matching kind. A
  stricter persisted rule than the authorization layer enforces is a defect,
  because the command then passes every check and fails as an unexpected server
  error instead of a typed problem response.
- The marketplace role policy is one authority. Repository predicates and
  persisted trigger predicates MUST derive the accepted roles from it rather
  than restate them as literals, so a persisted rule cannot drift away from the
  authorization layer again.
- Catalog checkout and selected offers MUST resolve to persisted, reviewable
  commercial terms; the platform MUST NOT return a fabricated order or contract
  identifier.
- A purchase-request creator MUST NOT bid on their own request, and only the
  request owner can select a pending offer.
- Contract creation freezes the reviewable commercial terms owned here. Artifact
  generation, qualified party signing, signature-triggered activation and
  inventory commit, settlement, fulfillment, dispute, commission, and review
  eligibility are governed exclusively by REQ-AGRITECH-LIFECYCLE-020.
- A review MUST come from the authenticated buyer of a completed contract
  containing the product, and a buyer MUST have at most one review per product.
- Legacy artifact/signature provenance and lifecycle migration behavior are
  governed exclusively by REQ-AGRITECH-LIFECYCLE-020.
- The sample allowance MUST come from persisted monthly usage and remain five
  per verified user per month. “Free sample” MUST NOT imply free delivery.
- Provider claims MUST NOT be inferred from local UI state, a legacy boolean, or
  reference copy. Provider-mode and provenance behavior is governed by
  REQ-AGRITECH-INTEGRATION-013, while contract lifecycle effects are governed by
  REQ-AGRITECH-LIFECYCLE-020.
- AI recommendations MUST be limited to current published in-stock products
  visible to the requester. Starter-cart mutation requires a separate confirmed,
  idempotent server command that revalidates stock and partitions by seller.
- English, Russian, Uzbek Latin, and Uzbek Cyrillic semantic parity is governed
  by REQ-AGRITECH-I18N-012. Responsive, keyboard, reduced-motion, theme, and
  contrast behavior is governed by REQ-AGRITECH-WEB-006 and is not credited as
  evidence for this transaction requirement.

**Failure behavior:**

- Missing, unpublished, cross-tenant, stale, unauthorized, unverified,
  self-authored, changed-idempotency-input, or invalid-state mutations return
  safe RFC 9457 problem responses and preserve existing records.
- Missing or malformed idempotency/revision input fails validation. Exact
  same-actor/resource/key/body replay returns the original persisted snapshot;
  same-key changed input and different-key stale revision return RFC 9457 409,
  and only one concurrent compare-and-set wins.
- An unavailable subresource or provider renders a localized explanatory state
  and recovery path without fabricated fallback records, claims, or identifiers.
- Concurrent cart or offer conflicts reload authoritative state and do not
  duplicate or partially create the transaction. Post-freeze concurrency and
  inventory effects are governed by REQ-AGRITECH-LIFECYCLE-020.

#### Scenario: Canonical deep links and public discovery

- **WHEN** a signed-out visitor or authenticated user opens `/`, `/catalog`, a
  product deep link, favorites, carts, purchase requests, verification, account,
  or a contract deep link
- **THEN** the canonical DehqonHub shell renders once without the generic
  mini-app shell or duplicated hero, the signed-out state renders only the safe
  public projection plus a clear authentication path, and private actions/data
  remain gated by real verification and organization authorization

#### Scenario: Distinct catalog branches and real records

- **WHEN** a user chooses Seeds, Equipment, or Agricultural produce and applies
  query, price, region, stock, or sort controls
- **THEN** the user app deterministically filters explicitly sectioned published
  records for that branch, reflects active controls, opens supported product
  detail, never guesses Produce from an unrelated category, and renders a
  localized empty state when the branch has no records

#### Scenario: Published stable seller identity

- **WHEN** the catalog returns a product and the user favorites it, requests a
  sample, reviews it, or adds it to a cart
- **THEN** the generated contract includes the stable published seller
  organization and the server resolves the authoritative seller tenant, owner,
  price, publication, and stock from persistence instead of caller fields

#### Scenario: Cross-tenant private access is denied

- **WHEN** a caller attempts to use an unpublished foreign product or query the
  seller tenant's private catalog, documents, dashboard, cart, or contract data
- **THEN** the API returns a safe not-found or denied problem and persists or
  discloses no unauthorized cross-tenant marketplace record

#### Scenario: Verified buyer purchases a published cross-organization listing

- **WHEN** an approved buyer adds another approved organization's published
  listing and checks out
- **THEN** the server stores one buyer-owned seller cart and one frozen contract
  with explicit buyer/seller organization and tenant references without granting
  either party general access to the other's tenant

#### Scenario: Party responses minimize internal identity

- **WHEN** an authorized buyer or seller reads their carts, requests, offers, or contracts
- **THEN** the response contains only opaque marketplace relations and safe commerce fields, cart/offer/contract counterparty identity uses an allowlisted display snapshot and contract caller role, and internal tenant, user, partner, source-row, and provider-operation identifiers are absent

#### Scenario: Hardened retry and stale-revision boundaries

- **WHEN** an actor retries verification create/submit, delivery-quote update, or administrator verification decision with the same key and canonical input, changes the input under that key, or races a different key at the same expected revision
- **THEN** exact replay returns the original snapshot, changed-input and stale attempts conflict, one concurrent compare-and-set wins, and no duplicate case, quote, decision, audit, or notification outcome persists

#### Scenario: Seller-partitioned carts

- **WHEN** a user adds one product from seller A and another product from seller
  B, then changes quantities or removes a line
- **THEN** the API and UI expose two independently reviewable carts, preserve
  each seller boundary, show authoritative totals, and mutate only the selected
  cart line

#### Scenario: Every authorized selling role is a valid persisted party

- **WHEN** a verified buyer adds a published listing sold through an approved
  supplier organization whose owner holds an active seller membership and a
  verified verification in any role the marketplace seller policy authorizes
- **THEN** the cart and its frozen contract persist with that organization as the
  selling party, and no command that the authorization layer accepted fails as an
  unexpected server error from a stricter persisted rule

#### Scenario: Verified catalog checkout reaches contract review

- **WHEN** a verified buyer or farmer confirms delivery terms and checks out a
  non-empty seller cart
- **THEN** the server atomically closes the cart and returns a persisted draft
  contract reference whose tenant, buyer, seller, lines, amount, and delivery
  terms can be reviewed before lifecycle actions; pickup freezes a zero charge, while
  seller delivery remains visibly pending until the verified seller records a
  positive quote and lifecycle progression is blocked until that quote exists

#### Scenario: Unverified commercial action is denied

- **WHEN** a user without persisted verified status attempts a cart addition or
  cart-line mutation, checkout, sample request, purchase-request creation, offer
  submission, offer selection, or contract creation
- **THEN** the server denies the mutation, the user app preserves entered safe
  form data where applicable, and the verification surface explains the next
  available step

#### Scenario: Verified identity without organization approval is denied

- **WHEN** a verified actor without current membership in an approved buyer or
  supplier organization attempts a commercial mutation for that party
- **THEN** the server denies the mutation without changing carts, requests,
  offers, delivery quotes, or contracts

#### Scenario: Provider-backed verification remains administratively approved

- **WHEN** OneID and document storage are disabled or explicitly mocked in a
  non-production deployment
- **THEN** the verification surface renders real persisted steps and typed
  provider provenance, and only an authorized administrator can approve or
  reject the submitted case

#### Scenario: Monthly sample boundary

- **WHEN** a verified user with fewer than five persisted requests this month
  confirms a sample request
- **THEN** the real product and server-derived seller are recorded and the UI
  reports the remaining allowance plus the separate delivery-cost boundary

#### Scenario: Sample limit or unavailable product

- **WHEN** the persisted allowance is exhausted or the tenant product is absent
- **THEN** the server rejects the request without consuming allowance and the UI
  renders the localized limit or unavailable state

#### Scenario: Verified seller submits a valid offer

- **WHEN** a verified seller or farmer who does not own an open purchase request
  submits a positive product price, a delivery choice, a positive seller-
  delivery quote when that choice applies, and optional delivery note/duration
- **THEN** the offer is attributed to the authenticated user, persisted in the
  request tenant with those seller-authored delivery terms, visible to the
  request owner, and remains pending until an owner decision

#### Scenario: Self-offer and ineligible role are denied

- **WHEN** the request owner or a verified buyer-only role submits an offer
- **THEN** the server denies the offer and leaves the request and existing offers
  unchanged

#### Scenario: Offer selection creates explicit contract review

- **WHEN** the verified request owner selects one pending offer while the
  request is open for offers
- **THEN** the server atomically marks it accepted, declines alternatives,
  selects the request, creates one persisted draft contract from the accepted
  product price and delivery terms, and returns that contract reference for
  explicit review without adding the offer to a cart

#### Scenario: Owned request reads correlate their own publication

- **WHEN** the request owner reads `GET /marketplace/requests/mine`
- **THEN** each published request carries its opaque request-publication
  identifier together with the current publication and moderation status, a
  request without a publication omits all three, and the client addresses offer
  reads and offer selection with that publication identifier rather than the
  private request identifier

#### Scenario: A request awaiting moderation has no offer surface

- **WHEN** the owner of a request that is not published yet opens it or attempts
  to select an offer on it
- **THEN** no offer endpoint is called with the private request identifier, the
  surface states that the request is awaiting moderation, and no offer, request,
  or contract state changes

#### Scenario: Stale or foreign offer selection is rejected

- **WHEN** a non-owner, a stale client, or the owner of another tenant selects an
  absent, non-pending, or already-decided offer
- **THEN** no offer or request state changes, no contract is created, and the UI
  reloads authoritative state from the safe problem response

#### Scenario: One completed-deal review per buyer and product

- **WHEN** an authenticated buyer reviews a product from one of their completed
  contracts
- **THEN** the server persists one tenant-scoped review, rejects a second review
  for the same buyer and product, and denies active-only or unrelated contracts

#### Scenario: Verification decisions preserve bounded reason provenance

- **WHEN** an administrator approves or rejects a verification submission
- **THEN** a rejection requires exactly one supported semantic reason, an approval
  forbids a rejection reason, invalid combinations fail before persistence, and
  English, Russian, and Uzbek clients render equivalent localized explanations
  without persisting display-language prose

#### Scenario: Grounded AI consultation and confirmed starter cart

- **WHEN** a user asks for a recommendation or cheaper option
- **THEN** the API queries only current published in-stock products visible to
  the requester, returns product IDs with a semantic result code, and mutates no
  cart until a separate explicit confirmed idempotent command revalidates and
  partitions the products by seller

#### Scenario: Catalog has no grounded AI result

- **WHEN** no active tenant product supports the AI request
- **THEN** the response returns `no_catalog_match` with no product ID, the UI
  states that no matching catalog record is available, and neither boundary
  invents agronomic certainty or a seller

#### Scenario: Partial API failure remains honest and recoverable

- **WHEN** catalog discovery succeeds but an authenticated cart, request,
  verification, contract, favorites, sample, or AI subresource is unavailable
- **THEN** catalog discovery remains usable, each failed section identifies its
  localized unavailable state and retry action, and no empty response is
  misrepresented as successful authoritative data

### Requirement: [REQ-AGRITECH-ONBOARDING-023] Marketplace access is progressive and explains restricted actions

The responsive user marketplace SHALL remain useful before marketplace
verification while every commercial mutation remains server-authoritative.
Public discovery SHALL remain anonymous. Signed-in users SHALL retain profile,
favorites, organization application, and verification readiness/history.
Controls for unavailable commercial actions SHALL remain visible when they aid
task understanding, SHALL be disabled, and SHALL distinguish a prerequisite the
actor can still clear from a capability that lies outside their role. A missing
identity or approved-organization prerequisite SHALL be named exactly and offered
as a next action. A capability outside the verified role SHALL instead state
which roles hold it and what the actor's own role does, and SHALL offer no next
action, because a settled verification role cannot be changed from these
surfaces and presenting verification as the remedy would be false.

**Evidence profile:** API, domain, security, journey, accessibility

**Invariants:**

- UI hints are not authority; every command repeats the persistent identity,
  role, organization, tenant, resource, and state checks it requires.
- Email assurance, Telegram authentication, marketplace identity verification,
  and organization approval are distinct facts and never imply one another.
- A pending, rejected, expired, disabled, or unavailable verification provider
  does not hide public discovery or safe authenticated account capabilities.
- Commercial commands retain the verified-role and organization prerequisites
  owned by their existing requirements.

**Failure behavior:**

- An unavailable capability is disabled before submission with localized
  guidance, while a direct API attempt still returns safe RFC 9457 denial.
- Stale cached verification or organization state never enables a command; a
  denial refreshes the authoritative readiness state.

#### Scenario: Unverified user keeps safe marketplace access

- **WHEN** a signed-in user has no verified marketplace identity
- **THEN** public discovery, favorites, profile, organization application, and verification remain usable while commercial controls show a verification-required hint

#### Scenario: Verified user still needs an approved organization

- **WHEN** a verified buyer or seller lacks the matching approved organization membership
- **THEN** role-specific commercial controls remain disabled with a link to create or review the organization application

#### Scenario: Fully eligible actor receives only role capabilities

- **WHEN** a verified actor has an approved buyer, seller, or farmer organization relationship
- **THEN** the UI enables only that role's commands and the backend independently authorizes every submitted mutation

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
icon, card, and responsive rules; the account surface additionally follows the
cabinet clause below.

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

A preview cart SHALL NOT outlive the actor's authority to transact. Once the
signed-in actor is a verified buyer with an approved buyer organization, every
stored preview line SHALL be promoted through the same authenticated add-to-cart
command any other client uses, so the server derives the seller, keeps one open
cart per buyer and seller, and revalidates price and availability. That promotion
SHALL be idempotent: each line's replay identity SHALL be derived from the acting
organization, the listing publication, and the quantity rather than generated, an
accepted line SHALL be removed from browser storage, and a reload SHALL NOT
increase any quantity. A line the server rejects SHALL remain local, SHALL be
reported once rather than retried on every refresh, and SHALL stay retryable from
the cart. Promotion SHALL NOT run for a signed-out or unverified actor.

While a preview cart cannot be checked out, the cart route SHALL state the
boundary at the checkout control before it is used, naming the single step the
actor has to clear — sign in, a settled verification, or an approved buyer
organization — and offering that step as a direct action. The control's own label
SHALL carry that step and its action SHALL open the surface that step names, so a
control never names a step the actor has already cleared: a signed-in actor SHALL
NOT be told to sign in. A verified role that does not buy is not a missing step
at all: buying is outside that role. The route SHALL then state which roles may
buy and what the actor's own role does, and SHALL offer no entry point, because
verification cannot change a settled role and offering it would be a dead end. While the
session or the buyer organization is still being read, the route SHALL report
that check instead of naming a step it cannot yet know, and SHALL offer no entry
point. Sign-in reached from the cart SHALL return the actor to the cart. Any
confirmation the route emits after the control is used SHALL repeat that same
step and SHALL NOT describe the preview as an assembled, placed, or submitted
order.

The home experience MAY publish the three fixed reviewer identities created by
the guarded demo seed while the deployment's reviewer-access runtime flag is
enabled, on a live, demo, or mixed catalog alike, because reviewer entry is a
deployment decision rather than a property of the catalog. That reviewer entry
SHALL name the identities as demo accounts in visible copy, SHALL state what
each role is for and, where a role cannot do something, that the capability is
absent rather than pending — the farmer identity buys everything and sells
everything, the buyer identity only buys, and the seller identity only sells —
and SHALL state qualitatively that a
purchase request, competing offers, and a signed contract are already prepared
between the buyer and seller identities without asserting counts or identifiers
the page cannot read. It SHALL NOT present the seeded activity as production
activity. A deployment SHALL be able to withdraw the identity list through that
runtime flag alone, with no code change, and an unset or unparsable flag value
SHALL fall through to the build-time default instead of an undefined state.

The account route SHALL present a personal cabinet: a left rail listing its
sections beside one large content panel showing the selected section. Those
sections SHALL cover an overview of headline figures with the month chart, the
account's own purchase requests and buyer-side contracts, the seller-side offers
work and contracts it is fulfilling, sales and spending with the totals behind
the chart, the publication and moderation queue, and the verification and account
state. Each section SHALL have its own address, so a reviewer can be sent
directly to one; an unrecognized section SHALL resolve to the overview rather
than to an empty frame. The rail SHALL be operable by keyboard alone and SHALL
announce which section is current. The cabinet SHALL collapse to a single column
on narrow viewports. Moving between sections SHALL NOT re-read the account's
resources.

Every cabinet figure SHALL come from a member the generated client actually
returned for that account, and SHALL NOT be derived from another figure,
defaulted, or padded. Buyer-side and seller-side work SHALL be separated on the
party the contract projection stamps for the reading account, never on a
client-side comparison of identities. The month chart SHALL plot a spending
series only while the dashboard reports a buyer scope and a sales series only
while it reports a seller scope, SHALL draw no bar for a month that completed
nothing, SHALL NOT interpolate, repeat, or extend a month, and SHALL state in
words when the whole window completed nothing instead of plotting a flat line. It
SHALL carry a scale, a legend, and a captioned value table with column headers as
its accessible equivalent rather than presenting the figures only as a picture,
SHALL render every amount through the shared money formatter with tabular
figures, and SHALL respect reduced-motion preferences. Every cabinet panel SHALL
carry explicit loading, empty, error, and ready states, and an error SHALL name
the read that failed and offer a retry in place instead of showing a zero. Every
capability the account surface offered before the cabinet SHALL remain reachable
inside it. Each cabinet head SHALL separate its eyebrow, heading, and description
on the same rhythm the page and panel heads use, so a description never collapses
onto the eyebrow's own margin.

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
- The cabinet never shows a figure it cannot source. A count, an amount, or a
  chart point exists on screen only because an endpoint returned it for this
  account; a failed read is reported as a failed read. A series is chosen from
  the role scope the dashboard reports, not from whether its values happen to be
  zero, so an absent capability never reads as a run of empty months.
- Every cabinet section is separately addressable, resolves an unknown address to
  the overview, and is reachable with Tab and Enter alone.
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

#### Scenario: Preview cart is promoted once its owner may transact

- **WHEN** a visitor who assembled a browser-local preview cart becomes a
  signed-in verified buyer holding an approved buyer organization, and then
  reloads the route
- **THEN** every stored line is submitted once through the authenticated
  add-to-cart command with a replay identity derived from the acting
  organization, listing publication, and quantity, each accepted line leaves
  browser storage, no quantity is increased by the reload, and a line the server
  rejects stays local, is reported once, and remains retryable from the cart

#### Scenario: Blocked preview checkout names its one missing step

- **WHEN** an actor who may not yet transact reaches the checkout control of a
  preview cart, before and after using it
- **THEN** the route names the single step still required — sign in, a settled
  verification, or an approved buyer organization — the checkout control's own
  label carries that step, the offered action opens the surface that step names, a
  sign-in returns to the cart, no cart, checkout, or contract mutation is invoked,
  and the preview is never presented as an assembled, placed, or submitted order

#### Scenario: The checkout control never names a cleared step

- **WHEN** a signed-in actor whose verification is confirmed for a role that
  cannot buy reaches the cart's checkout control, and when another actor reaches
  it while the session or the buyer organization is still being read
- **THEN** the first control states that buying belongs to farmers and buyers and
  what the actor's own role does, offers no verification or sign-in entry point
  because neither would change the outcome, the second reports the access check
  in progress and offers no entry point, and neither control claims a step the
  actor has already cleared or a remedy that does not exist

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
  farmer's two-sided reach and the single-sided limit of the buyer and seller
  identities, and a qualitative note that a purchase request,
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

