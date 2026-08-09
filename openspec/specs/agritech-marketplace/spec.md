# agritech-marketplace Specification

## Purpose

Defines the complete, tenant-isolated AgriTech operating platform for farmers, suppliers, buyers, field agents, administrators, payments, fulfillment, advisory, analytics, localization, integrations, and deployment readiness.

## Requirements

### Requirement: [REQ-AGRITECH-PROFILE-001] Farmer profiles are authenticated and operationally owned

The user API SHALL let an authenticated principal create, read, and update at
most one tenant-owned farmer profile, SHALL validate Uzbekistan profile fields,
SHALL NOT allow user-controlled role, verification, pilot, or field-agent state,
and SHALL expose assignments only to the assigned agent or an authorized
administrator.

#### Scenario: Owned farmer enrollment

- **WHEN** an authenticated member submits a valid farmer profile
- **THEN** the API persists one profile bound to that principal and returns only safe public fields

#### Scenario: Assignment denial

- **WHEN** an unassigned field agent or foreign tenant addresses the farmer
- **THEN** the API returns a safe denial or not-found response without disclosing the profile

### Requirement: [REQ-AGRITECH-CATALOG-002] The catalog supports governed inputs and produce

The platform SHALL expose active tenant catalog items, SHALL distinguish
supplier-owned inputs from farmer-owned produce, SHALL validate category,
region, availability, unit, grade, and inventory, and SHALL limit mutation to
the owning approved actor or an authorized administrator.

#### Scenario: Supplier input publication

- **WHEN** an approved supplier publishes a valid stocked input
- **THEN** farmers can discover it and only that supplier or an administrator can mutate it

#### Scenario: Produce listing publication

- **WHEN** an active farmer publishes graded produce with an availability window
- **THEN** approved buyers can discover the available quantity without seeing private farmer data

### Requirement: [REQ-AGRITECH-ORDER-003] Orders and reservations are atomic and trackable

The platform SHALL server-price owned input orders and produce reservations,
SHALL atomically lock and consume the appropriate inventory, SHALL expose only
authorized records, SHALL enforce legal cancellation and fulfillment
transitions, and SHALL keep a durable state history.

#### Scenario: Input order creation

- **WHEN** an active farmer orders available supplier inputs
- **THEN** server-derived lines, totals, stock mutation, history, and notification intent commit once

#### Scenario: Produce reservation conflict

- **WHEN** concurrent buyers reserve more than a listing's remaining quantity
- **THEN** at most the available quantity is reserved and losing requests fail without partial writes

### Requirement: [REQ-AGRITECH-PAYMENT-004] Payments are persistent and idempotent

The platform SHALL create exact-amount Click, Payme, or BNPL payment intents for
authorized orders, SHALL persist provider and idempotency identities, SHALL
authenticate callbacks before mutation, SHALL reject amount/order mismatches,
SHALL enforce legal transitions and idempotent replay, and SHALL expose explicit
disabled/degraded readiness when configuration or provider evidence is absent.

#### Scenario: Idempotent provider settlement

- **WHEN** an authenticated provider repeats a settlement callback with the same identity
- **THEN** the stored successful result is returned without duplicate payment or order mutation

#### Scenario: Invalid callback

- **WHEN** authentication, amount, order identity, state, or configuration is invalid
- **THEN** the callback fails safely and no payment or order state changes

### Requirement: [REQ-AGRITECH-TELEGRAM-005] Telegram messages are linked and event driven

The selected Telegram bot SHALL link an authenticated farmer identity, expose
source-backed marketplace navigation and status, and deliver typed localized
order, payment, delivery, and advisory notification intents through the
existing notification scheduler and consumer without fabricated data.

#### Scenario: Linked order notification

- **WHEN** a linked farmer's order advances state
- **THEN** one localized deduplicated Telegram notification intent is scheduled

#### Scenario: Unlinked identity

- **WHEN** a Telegram user requests private AgriTech data without a valid link
- **THEN** the bot returns a safe linking path and no tenant data

### Requirement: [REQ-AGRITECH-WEB-006] Product clients expose complete real workflows

The user SPA, admin SPA, and Expo mobile app SHALL consume generated contracts
for their authorized AgriTech journeys and SHALL render localized loading,
offline, empty, validation, denied, conflict, provider-unavailable, recovery,
and success states without fabricated business records or metrics.

#### Scenario: Multi-surface workflow

- **WHEN** farmer, supplier, buyer, administrator, or field agent opens an authorized workflow
- **THEN** the owning client renders the real API state with accessible recovery and no sample operational claims

### Requirement: [REQ-AGRITECH-PARTNER-007] Suppliers and buyers are approved organizations

The platform SHALL let authenticated users submit one or more tenant-owned
supplier or buyer organizations, SHALL require administrator approval before
commercial mutation, and SHALL enforce organization membership on every owned
catalog, reservation, and fulfillment action.

#### Scenario: Pending supplier cannot publish

- **WHEN** a pending supplier attempts to create or update an input item
- **THEN** the request is denied and no catalog record is written

### Requirement: [REQ-AGRITECH-OUTPUT-008] Output aggregation has explainable price and grade controls

The platform SHALL aggregate available produce listings, SHALL use normalized
quality grades and units, SHALL calculate an explainable tenant-and-region price
range from eligible active listings, and SHALL never represent the range as a
guaranteed exchange or export quote.

#### Scenario: Price discovery result

- **WHEN** an approved buyer requests price discovery for a crop and region
- **THEN** the response includes minimum, median, maximum, sample size, currency, unit, and observation time

### Requirement: [REQ-AGRITECH-ADVISORY-009] Advisory and weather states are source attributable

The platform SHALL store source-attributed weather observations and agronomy
recommendations, SHALL scope them to authorized farms, SHALL mark staleness and
provider availability, and SHALL not fabricate measurements or advice when a
configured upstream is absent or fails.

#### Scenario: Stale weather evidence

- **WHEN** the newest observation exceeds its freshness window
- **THEN** the farmer sees a stale state and recommendations that require fresh weather are withheld

### Requirement: [REQ-AGRITECH-FULFILLMENT-010] Field operations and delivery are controlled

The platform SHALL allow administrators to assign field agents and deliveries,
SHALL let agents update only assigned work, SHALL enforce ordered delivery
transitions, and SHALL record visits, grading, proof references, timestamps,
and an auditable actor identity.

#### Scenario: Assigned delivery completion

- **WHEN** the assigned agent records pickup, transit, and delivery with required proof
- **THEN** each legal state is appended once and the related order becomes delivered

### Requirement: [REQ-AGRITECH-ANALYTICS-011] Analytics and pilot cohorts are evidence bounded

The admin platform SHALL provide tenant-scoped funnel, GMV, commission,
inventory, fulfillment, retention, and pilot cohort metrics derived from stored
records, SHALL distinguish configured targets from achieved values, and SHALL
not count fixtures or source presence as real-world activity.

#### Scenario: Pilot progress

- **WHEN** an administrator views a pilot cohort
- **THEN** targets and actual verified farmer, supplier, order, payment, and delivery counts are reported separately

### Requirement: [REQ-AGRITECH-I18N-012] Uzbek, Russian, and English have catalog parity

The platform SHALL support Uzbek, Russian, and English locale negotiation,
preferences, product clients, bot messages, notifications, problem details, and
stored recipient language with identical keys and placeholder contracts.

#### Scenario: Uzbek journey

- **WHEN** a user selects Uzbek
- **THEN** supported AgriTech navigation, forms, states, errors, and notifications render in Uzbek and persist across sessions

### Requirement: [REQ-AGRITECH-INTEGRATION-013] External connectors fail closed and reconcile

Weather, agronomy, export, government, and commercial provider adapters SHALL
have explicit configuration, bounded timeouts, source identity, idempotent
cursor or request semantics, reconciliation status, readiness, and redacted
telemetry; an absent contract or credential SHALL disable the connector without
fabricated data.

#### Scenario: Disabled government connector

- **WHEN** no approved Agroportal or Digital Agriculture API contract is configured
- **THEN** readiness reports disabled and no request, synchronization claim, or synthetic record is produced

### Requirement: [REQ-AGRITECH-DEPLOYMENT-014] Selected deployment is operationally prepared

The selected Docker topology SHALL include every AgriTech runtime dependency,
migration, immutable build input, secret reference, public/internal route,
health/readiness probe, resource boundary, telemetry signal, backup/restore
contract, and rollback instruction required for staging and production
validation without embedding credentials or applying infrastructure.

#### Scenario: Deployment validation

- **WHEN** operators render and validate the selected deployment without secrets
- **THEN** all AgriTech services, migrations, routes, probes, and required secret references are internally consistent and no live change occurs

### Requirement: [REQ-AGRITECH-ROUTING-015] Product routes use the repository root ownership boundary

The platform SHALL expose the canonical user AgriTech workflow at `/`, SHALL
expose general AgriTech user API resources without an `agritech` prefix, SHALL
expose DehqonHub commerce APIs below `/marketplace/*`, SHALL expose the canonical
operator workflow at `/admin`, and SHALL expose privileged AgriTech API
resources directly below `/admin`. The `/marketplace/*` API namespace MUST keep
same-origin JSON resources distinct from SPA deep links such as `/catalog` and
`/cart`; `/marketplace` itself MUST NOT become a second product route.
First-party web routes, API controllers, reverse proxies, OpenAPI contracts,
generated clients, navigation, and payment return URLs MUST agree on those
canonical paths and MUST NOT register redirects or compatibility aliases for
`/admin/agritech`, `/agritech/*`, or `/admin/agritech/*`.

The `/admin` boundary, session authentication, tenant derivation, endpoint
permissions, request and response shapes, RFC 9457 failures, provider callback
authentication, concurrency, and idempotency behavior SHALL remain unchanged.
Domain identifiers and the Telegram `/agritech` command are outside the HTTP
path prohibition and SHALL retain their existing semantics.

**Evidence profile:** api

**Invariants:**

- Every canonical first-party HTTP path has one owner and no old-path alias.
- No user/admin OpenAPI path or generated client path contains `/agritech` or
  `/admin/agritech`.
- Every DehqonHub commerce operation uses `/marketplace/*`, while DehqonHub
  browser deep links remain SPA-owned without that prefix.
- `/admin` remains the privileged application and API boundary; collapsing the
  product namespace MUST NOT weaken RBAC or tenant isolation.
- Route migration MUST NOT alter write idempotency, callback replay handling,
  or concurrent inventory and order behavior.
- User/admin providers and their generated consumers are versioned and rolled
  out as one compatible revision.

**Failure behavior:**

- A removed web or API path receives the owning runtime's normal not-found
  outcome and is not redirected or rewritten.
- A stale generated artifact or client path fails contract freshness or
  product-route verification before release.
- A stale independently deployed consumer may receive a not-found response and
  must migrate to the regenerated contract; the server does not conceal that
  incompatibility.
- Rollback redeploys the prior immutable API and client revisions together;
  mixed-revision rollback is unsupported.

#### Scenario: User product and resources are rooted directly

- **WHEN** a user opens the product or a generated client addresses an
  authorized AgriTech resource
- **THEN** the product uses `/`, general APIs use direct resource paths such as
  `/orders`, `/produce`, or `/payments`, and DehqonHub commerce APIs use paths
  such as `/marketplace/catalog`, `/marketplace/cart`, or
  `/marketplace/contracts/{id}`

#### Scenario: Same-origin marketplace APIs do not collide with browser routes

- **WHEN** a same-origin deployment serves the `/catalog` or `/cart` browser
  deep link and the client requests the corresponding marketplace data
- **THEN** the browser route resolves to the SPA, the generated client uses
  `/marketplace/*`, and every supported frontend reverse proxy sends that API
  namespace to `user-app-api` rather than returning `index.html`

#### Scenario: Operator product retains its privilege boundary

- **WHEN** an authorized operator opens the product or a generated admin client
  addresses an AgriTech resource
- **THEN** the product uses `/admin` and the API uses a direct privileged path
  such as `/admin/partners`, `/admin/analytics`, or `/admin/integrations` with
  the existing guard and endpoint permission

#### Scenario: Removed namespaces do not survive as aliases

- **WHEN** a caller addresses `/marketplace` as a product-route alias,
  `/admin/agritech`, an `/agritech/*` API path, or an `/admin/agritech/*` API
  path
- **THEN** no product route, redirect, or compatibility shim recognizes that
  old path, while only the documented `/marketplace/*` API resources remain
  valid

#### Scenario: Payment returns to the canonical product

- **WHEN** an authorized user initiates a configured payment handoff
- **THEN** the client supplies a return URL whose pathname is `/` while all
  payment amount, provider, authentication, idempotency, and replay rules remain
  unchanged

#### Scenario: Stale consumer is observable

- **WHEN** post-rollout telemetry records a request for a removed HTTP path
- **THEN** operators can identify it as a stale consumer from the normal
  not-found request telemetry without a redirect masking the mismatch

### Requirement: [REQ-AGRITECH-MARKETPLACE-016] DehqonHub marketplace transactions are real, isolated, and recoverable

The platform SHALL expose DehqonHub as the canonical user marketplace at the
repository root and SHALL provide localized, accessible discovery, catalog,
product detail, favorites, seller-partitioned carts, samples, purchase requests,
offers, verification status, contract review, role account, and catalog-grounded
AI journeys using generated API contracts and persisted tenant-owned records.
Commercial mutations SHALL be server-authorized, SHALL preserve seller and
party identity, and SHALL fail closed when verification or an external provider
is unavailable.

**Ownership:** `user-app`, `@app/frontend-api-client`,
`@app/frontend-feature-user-i18n`, `@app/backend-feature-product-main`,
`@app/backend-feature-product-shared`, `@app/backend-feature-agritech-main`,
`@app/backend-feature-agritech-shared`,
`@app/backend-postgres-main-agritech`, `acceptance-e2e`, and `fullstack-e2e`.

**Evidence profile:** acceptance, api, domain, persistence, security, and
browser journey evidence.

**Invariants:**

- A marketplace record from one tenant MUST NOT be read, linked, mutated, or
  recommended in another tenant.
- Product seller identity, request ownership, offer authorship, verification,
  approved buyer/supplier organization membership, contract parties, and
  signing actor MUST be derived from authenticated and persisted state, never a
  display label or caller-selected authority field.
- An open cart MUST contain products from exactly one server-derived seller;
  adding a different seller's product creates or updates another cart.
- Catalog checkout and selected offers MUST resolve to persisted, reviewable
  commercial terms; the platform MUST NOT return a fabricated order or contract
  identifier.
- A purchase-request creator MUST NOT bid on their own request, only the owner
  can select a pending offer, and only a contract party can sign for that party.
- A contract becomes active only after both persisted party consents; accepted
  terms MUST remain stable during review and signing, and cart inventory MUST
  commit exactly once in the same transaction as the second consent.
- A review MUST come from the authenticated buyer of an active or completed
  contract containing the product, and a buyer MUST have at most one review per
  tenant product.
- Legacy contracts without trustworthy source and party-consent provenance MUST
  remain non-signable while their prior status, signing timestamp, and financing
  flag remain available as migration audit evidence.
- The sample allowance MUST come from persisted monthly usage and remain five
  per verified user per month. “Free sample” MUST NOT imply free delivery.
- Payment, factoring, OneID, upload, PDF signing, and delivery-provider claims
  MUST NOT be inferred from local UI state, a legacy boolean, or reference copy.
- AI recommendations MUST be limited to current active products in the user's
  tenant and MUST require a separate explicit action before any mutation.
- English, Russian, and Uzbek MUST expose the same semantic states. The UI MUST
  work at 320 px, Russian at 375 px, keyboard only, reduced motion, light and
  dark themes, and WCAG AA normal-text contrast without horizontal overflow.

**Failure behavior:**

- Missing, cross-tenant, stale, unauthorized, unverified, self-authored, or
  invalid-state mutations return safe RFC 9457 problem responses and preserve
  existing records.
- An unavailable subresource or provider renders a localized explanatory state
  and recovery path without fabricated fallback records, claims, or identifiers.
- Concurrent cart, offer, or signing conflicts reload authoritative state and
  do not duplicate or partially activate the transaction. A stock conflict on
  final consent leaves the pending consent and inventory unchanged.

#### Scenario: Canonical deep links and gated discovery

- **WHEN** a signed-out visitor or authenticated user opens `/`, `/catalog`, a
  product deep link, favorites, carts, purchase requests, verification, account,
  or a contract deep link
- **THEN** the canonical DehqonHub shell renders once without the generic
  mini-app shell or duplicated hero, the signed-out state provides a clear
  authentication path, and the authenticated state renders only its authorized
  real tenant data while gated actions explain verification requirements

#### Scenario: Distinct catalog branches and real records

- **WHEN** a user chooses Seeds, Equipment, or Agricultural produce and applies
  query, price, region, stock, or sort controls
- **THEN** the user app deterministically filters the tenant-scoped records for
  that branch, reflects active controls, opens a product detail for supported
  products, and renders a localized empty state when the branch has no records

#### Scenario: Tenant-owned stable seller identity

- **WHEN** the catalog returns a product and the user favorites it, requests a
  sample, reviews it, or adds it to a cart
- **THEN** the generated contract includes the stable product supplier ID and
  the server validates the product in the authenticated tenant and derives the
  mutation's seller from that record

#### Scenario: Cross-tenant product mutation is denied

- **WHEN** a tenant uses a product identifier that belongs only to another
  tenant in a favorite, sample, review, cart, or AI request
- **THEN** the API returns a safe not-found or denied problem and persists no
  cross-tenant marketplace record

#### Scenario: Seller-partitioned carts

- **WHEN** a user adds one product from seller A and another product from seller
  B, then changes quantities or removes a line
- **THEN** the API and UI expose two independently reviewable carts, preserve
  each seller boundary, show authoritative totals, and mutate only the selected
  cart line

#### Scenario: Verified catalog checkout reaches contract review

- **WHEN** a verified buyer or farmer confirms delivery terms and checks out a
  non-empty seller cart
- **THEN** the server atomically closes the cart and returns a persisted draft
  contract reference whose tenant, buyer, seller, lines, amount, and delivery
  terms can be reviewed before signing; pickup freezes a zero charge, while
  seller delivery remains visibly pending until the verified seller records a
  positive quote and consent is blocked until that quote exists

#### Scenario: Unverified commercial action is denied

- **WHEN** a user without persisted verified status attempts checkout, sample
  request, purchase-request creation, offer submission, offer selection,
  contract creation, or signing
- **THEN** the server denies the mutation, the user app preserves entered safe
  form data where applicable, and the verification surface explains the next
  available step

#### Scenario: Verified identity without organization approval is denied

- **WHEN** a verified actor without current membership in an approved buyer or
  supplier organization attempts a commercial mutation for that party
- **THEN** the server denies the mutation without changing carts, requests,
  offers, delivery quotes, contracts, consent, or inventory

#### Scenario: Honest unavailable verification integration

- **WHEN** no configured OneID and document-upload integration is available
- **THEN** the verification surface renders current persisted status, eligible
  roles and document requirements, but no public placeholder-evidence submission
  route exists and the UI does not claim a link or invent a storage key

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

#### Scenario: Stale or foreign offer selection is rejected

- **WHEN** a non-owner, a stale client, or the owner of another tenant selects an
  absent, non-pending, or already-decided offer
- **THEN** no offer or request state changes, no contract is created, and the UI
  reloads authoritative state from the safe problem response

#### Scenario: Both parties sign their own consent

- **WHEN** the persisted buyer and seller each sign the same draft contract
- **THEN** each consent is recorded once with its actor and time, the intermediate
  state remains awaiting the other party, and the contract becomes active only
  after both consents exist and its cart-backed inventory commits exactly once

#### Scenario: Concurrent final consent respects inventory

- **WHEN** two cart-backed contracts attempt their final consent concurrently
  for stock that can satisfy only one contract
- **THEN** one contract atomically becomes active and consumes its frozen line
  quantities, while the other receives a conflict without recording the final
  consent, changing stock, or partially activating

#### Scenario: Supplier stock edits serialize with final consent

- **WHEN** an approved supplier edits a product's absolute stock while a
  cart-backed contract attempts final consent for the same product
- **THEN** both mutations serialize on the product record, the completed sale's
  deduction cannot be restored by a stale supplier write, and each response
  reflects the authoritative committed stock

#### Scenario: Legacy commercial state requires review

- **WHEN** a pre-upgrade draft, signed, or active contract lacks trustworthy
  source and party-specific consent evidence
- **THEN** migration preserves its prior status, signing time, and financing flag
  as audit fields, forces live financing off, and exposes the contract as
  non-signable `legacy_review_required`

#### Scenario: Foreign or duplicate signature is safe

- **WHEN** a non-party signs, a party attempts to sign for the other party, or a
  party retries its completed signature
- **THEN** the server denies the foreign action, treats an exact completed-party
  retry idempotently or as an observable conflict, and never duplicates consent
  or advances the contract incorrectly

#### Scenario: Financing and payment remain fail closed

- **WHEN** a user reviews any contract and no configured marketplace payment or
  financing provider result exists
- **THEN** the UI labels financing and platform payment unavailable and does not
  display a partner bank, guarantee, fixed deferral term, approval, fee, payout,
  or processed-payment claim

#### Scenario: One qualifying review per buyer and product

- **WHEN** an authenticated buyer reviews a product from one of their active or
  completed contracts
- **THEN** the server persists one tenant-scoped review, rejects a second review
  for the same buyer and product, and denies users without a qualifying contract

#### Scenario: Verification decisions preserve bounded reason provenance

- **WHEN** an administrator approves or rejects a verification submission
- **THEN** a rejection requires exactly one supported semantic reason, an approval
  forbids a rejection reason, invalid combinations fail before persistence, and
  English, Russian, and Uzbek clients render equivalent localized explanations
  without persisting display-language prose

#### Scenario: Grounded AI consultation

- **WHEN** a user asks for a recommendation or cheaper option
- **THEN** the API queries only current active tenant products, returns the
  referenced product IDs with a non-display semantic result code, and the UI
  renders cautious localized copy plus real matching cards without mutating a
  cart, sample, order, or contract

#### Scenario: Catalog has no grounded AI result

- **WHEN** no active tenant product supports the AI request
- **THEN** the response returns `no_catalog_match` with no product ID, the UI
  states that no matching catalog record is available, and neither boundary
  invents agronomic certainty or a seller

#### Scenario: Localized accessible responsive journey

- **WHEN** the journey is exercised in English, Russian, and Uzbek at desktop,
  375 px Russian, and 320 px, with keyboard-only and reduced-motion settings
- **THEN** labels, values, statuses, dialogs, notices, focus order, live regions,
  theme colors, and reflow preserve equivalent meaning, visible focus, AA
  contrast, and no horizontal viewport overflow

#### Scenario: Partial API failure remains honest and recoverable

- **WHEN** catalog discovery succeeds but an authenticated cart, request,
  verification, contract, favorites, sample, or AI subresource is unavailable
- **THEN** catalog discovery remains usable, each failed section identifies its
  localized unavailable state and retry action, and no empty response is
  misrepresented as successful authoritative data
