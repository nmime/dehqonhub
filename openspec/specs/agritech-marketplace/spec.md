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

### Requirement: [REQ-AGRITECH-WEB-006] Responsive user web exposes complete real workflows

The responsive user web application SHALL consume generated contracts for every
public and authenticated DehqonHub user journey and SHALL render localized
loading, offline, empty, validation, denied, conflict, provider-unavailable,
reconciliation, recovery, and success states without fabricated product,
authority, legal, financial, or operational records. Guest marketplace
discovery SHALL use the dedicated public API projection; authenticated commerce
SHALL use the same persisted domain APIs as every other client. External
mock-provider results MUST come from the real API/domain boundary and remain
visibly simulated. Administrator SPA and native Expo/Android/iOS marketplace
presentation are outside this requirement and MUST NOT be claimed by its
evidence.

**Invariants:**

- No browser fixture, local store, caller-selected persona, or hidden bypass may
  create an authenticated marketplace outcome.
- Desktop and responsive browser layouts down to 320 px, in English, Russian,
  Uzbek Latin, and Uzbek Cyrillic, expose equivalent state and recovery
  semantics.
- The user web app exposes guest search/suggestions, catalog, product, seller,
  reviews, and public-request discovery plus authenticated verification,
  bounded recent publication status, promotions, carts, purchase requests, offers,
  samples, favorites, reviews/replies/reports, contracts, artifact download,
  signing, settlement/factoring, fulfillment, disputes/evidence, notifications,
  dashboards, and AI consultation/history/starter-cart workflows when the actor
  is authorized for them.

**Failure behavior:**

- Failed public or authenticated requests render the owning recovery state and
  MUST NOT silently fall back to fixture data or relax authorization.
- A disabled or failed provider preserves the last authoritative persisted state
  and exposes a typed retry path.

#### Scenario: Complete user-web workflow

- **WHEN** a guest, buyer, seller, or farmer opens any user-owned marketplace journey in a desktop or 320 px browser
- **THEN** the user web app renders the matching generated public or private API state, action, status, and recovery path with no browser-authored operational claim

#### Scenario: Explicit external simulation

- **WHEN** a non-production deployment uses an approved mock external provider
- **THEN** the user web app displays its simulation status while all internal records, guards, idempotency, and state transitions remain authoritative

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

#### Scenario: Complete workflow visual parity

- **WHEN** an authorized actor opens an order, contract, verification, account,
  cart, favorites, or AI workflow
- **THEN** its authoritative state and actions remain unchanged while typography,
  spacing, icons, cards, status treatments, responsive behavior, and both themes
  follow the same DehqonHub product system

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

### Requirement: [REQ-AGRITECH-I18N-012] Uzbek Latin, Uzbek Cyrillic, Russian, and English have catalog parity

The platform SHALL support Uzbek Latin, Uzbek Cyrillic, Russian, and English
locale negotiation, preferences, product clients, bot messages, notifications,
problem details, provider-locale mapping, and stored recipient language with
identical semantic keys and placeholder contracts. `uz` SHALL remain Uzbek
Latin and `uz-cyrl` SHALL be the canonical Uzbek Cyrillic locale.

#### Scenario: Uzbek Latin journey

- **WHEN** a user selects `O'zbekcha (Lotin)`
- **THEN** supported AgriTech navigation, forms, states, errors, and notifications render in Uzbek Latin and persist as `uz`

#### Scenario: Uzbek Cyrillic journey

- **WHEN** a user selects `Ўзбекча (Кирилл)` or negotiates `uz-Cyrl-UZ`
- **THEN** supported AgriTech navigation, forms, states, errors, and notifications render in Uzbek Cyrillic and persist as `uz-cyrl` before any `uz` base fallback

### Requirement: [REQ-AGRITECH-INTEGRATION-013] External connectors fail closed and explicit mock providers remain isolated

Weather, agronomy, export, government, identity, document, signing, payment,
factoring, notification, and commercial provider adapters SHALL have explicit
configuration, bounded timeouts, source identity, idempotent cursor, command, or
callback semantics, reconciliation status, readiness, and redacted telemetry.
An absent live contract or credential SHALL disable the connector. Development,
test, and staging runtimes MAY explicitly select a deterministic mock adapter to
supply external-provider facts while all domain authorization and persistence
remain real; production SHALL reject mock mode during startup.

#### Scenario: Disabled government connector

- **WHEN** no approved Agroportal or Digital Agriculture API contract is configured
- **THEN** readiness reports disabled and no request, synchronization claim, or synthetic record is produced

#### Scenario: Mock provider does not grant authority

- **WHEN** a non-production user completes a mock identity, storage, signing, payment, or factoring provider operation
- **THEN** the idempotent result persists `mock` provenance and remains subject to the same administrator, party, tenant, and state-machine authorization as a live result

### Requirement: [REQ-AGRITECH-DEPLOYMENT-014] Selected deployment is operationally prepared

The selected Docker topology SHALL include every AgriTech runtime dependency,
migration, immutable build input, secret reference, public/internal route,
health/readiness probe, resource boundary, telemetry signal, backup/restore
contract, and rollback instruction required for staging and production
validation without embedding credentials or applying infrastructure. The
DehqonHub per-app deployment SHALL expose selected `user-app` at the configured
`PUBLIC_DOMAIN` apex and its root, SHALL exclude landing/site deployables and
their full-stack reference harness from the product selection and release set,
SHALL preserve the administrator application at `/admin` on its host, and SHALL
derive browser destinations, certificates, reverse-proxy hosts, allowed
origins, and enabled Telegram routes from that same selected topology.

**Evidence profile:** operations, security

**Invariants:**

- Public browser destinations never embed credentials, query strings, or
  fragments.
- The Admin destination includes its `/admin` router base path.
- The user application and Telegram Mini App use the apex origin; no
  `user-app.<domain>` compatibility host is published.
- Unselected landing/site applications contribute no image, listener, host,
  certificate name, trusted origin, or readiness expectation.
- CORS, Better Auth trusted/return origins, payment return origins, and public
  runtime URLs include the selected apex and exclude deselected or unknown
  landing/site/user-app hosts.
- Secret values remain file-backed and absent from rendered public
  configuration.

**Failure behavior:**

- Missing routes, invalid host derivation, incomplete certificate coverage, or
  unsupported proxy configuration fails validation before traffic changes.

#### Scenario: Deployment validation

- **WHEN** operators render and validate the selected deployment without secrets
- **THEN** all AgriTech services, migrations, routes, probes, and required secret references are internally consistent and no live change occurs

#### Scenario: Canonical selected destinations

- **WHEN** the public apex and application hosts are derived for production
- **THEN** users enter the complete user application at the apex `/`,
  administrators enter the admin host at `/admin`, Telegram opens the apex Mini
  App route, and no landing, site, or user-app subdomain is published or trusted

### Requirement: [REQ-AGRITECH-ROUTING-015] Product routes use the repository root ownership boundary

The platform SHALL expose the canonical user AgriTech workflow at `/` on the
configured `PUBLIC_DOMAIN` apex, SHALL expose general AgriTech user API
resources without an `agritech` prefix, SHALL
expose DehqonHub commerce APIs below `/marketplace/*`, SHALL expose the canonical
operator workflow at `/admin`, and SHALL expose privileged AgriTech API
resources directly below `/admin`, including marketplace operations below
`/admin/marketplace/*`. The `/marketplace/*` API namespace MUST keep
same-origin JSON resources distinct from SPA deep links such as `/catalog`,
`/cart`, and `/problems`; `/marketplace` itself MUST NOT become a second product
route. The apex MUST serve selected `user-app` and MUST NOT publish
`user-app.<domain>` or a
landing/site renderer as another first-party product entry point.
First-party web routes, API controllers, reverse proxies, OpenAPI contracts,
generated clients, navigation, and payment return URLs MUST agree on those
canonical paths and MUST NOT register redirects or compatibility aliases for
`/admin/agritech`, `/agritech/*`, or `/admin/agritech/*`.

The `/admin` boundary, session authentication, tenant derivation, endpoint
permissions, request and response shapes, RFC 9457 failures, provider callback
authentication, concurrency, and idempotency behavior SHALL remain unchanged.
Domain identifiers and the Telegram `/agritech` command are outside the HTTP
path prohibition and SHALL retain their existing semantics.

**Evidence profile:** api, journey, operations

**Invariants:**

- Every canonical first-party HTTP path has one owner and no old-path alias.
- The selected user SPA and Telegram Mini App share the apex origin; no user-app
  subdomain or marketing renderer is a second product entry point.
- No user/admin OpenAPI path or generated client path contains `/agritech` or
  `/admin/agritech`.
- Every DehqonHub commerce operation uses `/marketplace/*`, while DehqonHub
  browser deep links, including `/problems`, remain SPA-owned without that
  prefix.
- `/admin` remains the privileged application and API boundary; collapsing the
  product namespace MUST NOT weaken RBAC or tenant isolation.
- Route migration MUST NOT alter write idempotency, callback replay handling,
  or concurrent inventory and order behavior.
- User/admin providers and their generated consumers are versioned and rolled
  out as one compatible revision.

**Failure behavior:**

- A removed web path, API path, or unselected application host receives the
  edge/owner's normal rejection or not-found outcome and is not redirected or
  rewritten into a compatibility entry point.
- A stale generated artifact or client path fails contract freshness or
  product-route verification before release.
- A stale independently deployed consumer may receive a not-found response and
  must migrate to the regenerated contract; the server does not conceal that
  incompatibility.
- Rollback redeploys the prior immutable API and client revisions together;
  mixed-revision rollback is unsupported.

#### Scenario: User product and resources are rooted directly

- **WHEN** a user opens the public product or a generated client addresses an
  authorized AgriTech resource
- **THEN** `user-app` owns the configured apex `/`, general APIs use direct resource paths such as
  `/orders`, `/produce`, or `/payments`, and DehqonHub commerce APIs use paths
  such as `/marketplace/catalog`, `/marketplace/cart`, or
  `/marketplace/contracts/{id}` without publishing a user-app subdomain or
  marketing renderer

#### Scenario: Same-origin marketplace APIs do not collide with browser routes

- **WHEN** the apex serves the `/catalog`, `/cart`, or `/problems` browser deep
  link and the client requests any corresponding marketplace data
- **THEN** the browser route resolves to the SPA, the generated client uses
  `/marketplace/*`, and every supported frontend reverse proxy sends that API
  namespace to `user-app-api` rather than returning `index.html`

#### Scenario: Operator product retains its privilege boundary

- **WHEN** an authorized operator opens the product or a generated admin client
  addresses an AgriTech resource
- **THEN** the product uses `/admin` and the API uses a direct privileged path
  such as `/admin/partners`, `/admin/analytics`,
  `/admin/marketplace/commission-policies`, or
  `/admin/marketplace/engagement/review-reports` with the existing guard and
  endpoint permission

#### Scenario: Removed namespaces do not survive as aliases

- **WHEN** a caller addresses `/marketplace` as a product-route alias,
  `/admin/agritech`, an `/agritech/*` API path, or an `/admin/agritech/*` API
  path
- **THEN** no product route, redirect, or compatibility shim recognizes that
  old path, while only the documented `/marketplace/*` user APIs and
  `/admin/marketplace/*` privileged APIs remain valid

#### Scenario: Payment returns to the canonical product

- **WHEN** an authorized user initiates a configured payment handoff
- **THEN** the client supplies an apex return URL whose pathname is `/` while all
  payment amount, provider, authentication, idempotency, and replay rules remain
  unchanged

#### Scenario: Stale consumer is observable

- **WHEN** post-rollout telemetry records a request for a removed HTTP path or
  unselected application hostname
- **THEN** operators can identify it as a stale consumer from the normal
  rejection/not-found telemetry without a redirect masking the mismatch

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
concurrency. This contract applies explicitly to
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
- Product seller identity, request ownership, offer authorship, verification,
  approved buyer/supplier organization membership, contract parties, and
  signing actor MUST be derived from authenticated and persisted state, never a
  display label or caller-selected authority field.
- An open cart MUST contain products from exactly one server-derived seller;
  adding a different seller's product creates or updates another cart.
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

### Requirement: [REQ-AGRITECH-STAGE2-017] DehqonHub completes the persisted Stage 1+2 deal lifecycle

The platform SHALL coordinate the Stage 1+2 product through real persisted
internal state. This requirement owns persisted role-verification orchestration,
catalog-only promotion activation, derived role dashboards, and confirmed
grounded AI starter carts. It consumes, but does not redefine, the core commerce,
public discovery, engagement, contract lifecycle, notification, client, locale,
provider, and release-assurance requirements named below.

**Ownership:** `user-app-api`, `admin-app-api`, `acceptance-e2e`,
`@app/backend-feature-agritech-shared`,
`@app/backend-feature-agritech-main`, `@app/backend-feature-agritech-admin`,
and `@app/backend-postgres-main-agritech`.

**Evidence profile:** acceptance, API, domain, persistence, and security evidence.

**Invariants:**

- Verification is a persisted four-step case. Mock identity/document providers
  may provide synthetic evidence, but only an authorized administrator decides
  approval. Duplicate subject/legal-identity fingerprints are rejected without
  exposing raw identifiers. Its retry, privacy, and expected-revision/CAS
  contract is governed exclusively by REQ-AGRITECH-MARKETPLACE-016.
- Cart, request, offer, and contract-freeze semantics are governed by
  REQ-AGRITECH-MARKETPLACE-016. Publication and anonymous discovery are governed
  by REQ-AGRITECH-PUBLIC-018. Neither state machine is redefined here.
- Favorites, samples, reviews, replies, aggregates, and review reports are
  governed exclusively by REQ-AGRITECH-ENGAGEMENT-019.
- Artifact generation/download, qualified signing, settlement, fulfillment,
  disputes/evidence, commission, and review eligibility are governed exclusively
  by REQ-AGRITECH-LIFECYCLE-020.
- Transactional notification intents, external delivery, retry, reconciliation,
  and fallback are governed exclusively by REQ-AGRITECH-NOTIFICATION-022.
- Promotions have bounded plans/periods and visible `Ad` disclosure and affect
  catalog/shelf ordering only.
- Supplier, farmer, and buyer dashboards derive authorized metrics from real
  current records; fixtures and source presence are not activity.
- Notification intents are persisted transactionally with their triggering
  transition and remain available as tenant/party-authorized in-app records.
  Post-commit delivery persists the recipient locale, uses Telegram first, and
  may fall back once to SMS for the explicit critical contract/factoring/dispute
  allowlist only after a definitely-not-accepted terminal result. Mock delivery
  makes no network request and reports simulation, not live delivery.
- AI starter-cart confirmation revalidates published stock and atomically creates
  or updates one cart per seller. Cancel sends no mutation.
- Product-client rendering is governed by REQ-AGRITECH-WEB-006, locale semantics
  by REQ-AGRITECH-I18N-012, provider modes by REQ-AGRITECH-INTEGRATION-013, and
  clean exact-revision release proof by REQ-ASSURANCE-RELEASE-003.

**Failure behavior:**

- Invalid or oversized verification evidence, unsupported role, unauthorized
  moderation, promotion ownership/period conflicts, fabricated dashboard scope,
  or stale/changed AI-cart input returns a localized typed error and leaves the
  previous authoritative state intact.
- Provider-mode failures and all delegated public, engagement, lifecycle,
  notification, client, locale, and assurance failures retain the fail-closed
  behavior of their owning requirements; this umbrella requirement adds no
  fallback or alternate state machine.

#### Scenario: Persisted verification unlocks commerce

- **WHEN** a user completes mock-provider identity/document evidence and an authorized administrator approves the case
- **THEN** the persisted role and approved organization membership unlock matching writes while raw provider identity remains private

#### Scenario: Promotion is catalog-only

- **WHEN** an approved seller activates a promoted listing
- **THEN** the product receives a localized `Ad` label and catalog placement while matching, offers, and AI ignore promotion weight

#### Scenario: Confirmed AI starter cart is exactly once

- **WHEN** an approved user confirms a grounded starter-cart preview and retries the same command
- **THEN** current stock is revalidated and one seller-partitioned cart result is returned without duplicate lines or invented products

#### Scenario: Role dashboards derive authorized records

- **WHEN** a supplier, farmer, or buyer reads the matching role dashboard
- **THEN** every metric is derived from that actor's authorized persisted records and no fixture or source presence is presented as revenue, conversion, or completion

### Requirement: [REQ-AGRITECH-PUBLIC-018] Public marketplace discovery is explicit, moderated, and privacy bounded

The platform SHALL expose anonymous cross-organization listing, seller, search,
suggestion, and purchase-request discovery only through persisted, opt-in public
publications whose authoritative source, organization, verification, status, and
moderation remain eligible. Public reads SHALL use opaque identifiers, bounded
cursor pagination, and purpose-built response allowlists; they SHALL NOT accept a
tenant selector, create authentication or tenant state, query private fallback
records, or expose a private identifier or legal/provider field.

**Ownership:** `user-app-api`, `admin-app-api`, `acceptance-e2e`,
`@app/backend-feature-agritech-main`, `@app/backend-feature-agritech-admin`,
`@app/backend-feature-agritech-shared`, and
`@app/backend-postgres-main-agritech`.

**Evidence profile:** acceptance, API, domain, persistence, and security
evidence.

**Invariants:**

- Publication is opt-in and additive. No migration or read path backfills or
  infers a public row from an existing private product, produce listing,
  partner, or purchase request.
- A listing publication is bound to one public seller and exactly one governed
  source: a Product in the explicit Equipment or Seeds & crop inputs section,
  or an active ProduceListing in Produce. Seller, source, tenant, owner,
  organization, and farmer references MUST remain coherent at the database and
  query boundaries; `Product.other` is never guessed as Produce.
- A request publication is bound to the authoritative open request, buyer,
  tenant, and approved buyer organization. Its public commercial text is a
  frozen server-derived publication snapshot, not caller-authored terms or a
  live unrestricted read of the private request.
- Approved descriptive content is an immutable public snapshot revision: seller
  display/description, listing or request titles/descriptions, category or
  crop/grade, unit, region, safe assets, and buyer display. A later private
  source or display edit either leaves the approved revision unchanged or
  creates a new pending moderation revision; unreviewed descriptive or
  organization content never becomes guest-visible in place.
- Seller-profile content revisions are immutable. A listing submission whose
  seller display or description differs from the last approved profile creates
  or reuses a pending seller revision and pins that revision/fingerprint; it
  never overwrites the active approved seller snapshot or hides unrelated
  approved listings. Every older pending listing remains bound and decidable or
  is explicitly superseded/rebound through its own revisioned command.
- Price, available quantity, eligibility, and expiration remain live structured
  facts read from the coherently bound authoritative source. A committed stock
  decrement does not await moderation, zero availability hides immediately, and
  a current price update is exposed only after its normal owner authorization,
  validation, locking, and revision controls succeed.
- Anonymous reads return only publications and sellers with `published` status
  and `approved` moderation, a currently approved non-suspended organization,
  current verified authority, an eligible source, positive availability where
  applicable, and an unexpired open request where applicable. Pending,
  rejected, paused, suspended, verification-revoked, inactive, exhausted, and
  expired records remain indistinguishable from absence.
- Public listing payloads use a `product | produce` discriminator and expose
  only opaque public IDs, explicit section/category or crop/grade, authored
  English, Russian, Uzbek Latin, and Uzbek Cyrillic titles or the documented
  neutral fallback, public description, integer UZS price, unit, availability,
  region, safe assets, promotion disclosure, timestamps, and the allowlisted
  public seller summary. Seller and request payloads follow their own explicit
  allowlists.
- Public responses MUST NOT expose tenant, owner, partner, farmer, source-row,
  legal, tax, document, provider, idempotency, request-fingerprint, moderation,
  cart, contract, payment, private matching, or analytics fields.
- Public list and suggestion inputs, including section, price, availability,
  region, query, and sort, are normalized and bounded. Pagination uses an opaque
  keyset cursor tied to the active sort, not a caller-controlled offset;
  malformed, noncanonical, sort-mismatched, or oversized cursors fail before
  querying. No input can select a tenant, organization, user, source row,
  provider record, or moderation state.
- Publication commands require an authenticated verified owner who currently
  belongs to the matching approved organization. The server locks and derives
  the source and snapshot. Same-key/same-input retries return the original
  publication; same-key/changed-input reuse conflicts without another row.
- `GET /marketplace/publications/mine?limit=1..50` returns the authenticated
  actor's bounded recent listing and request publication receipts newest first,
  with opaque receipt and public-seller relations, current publication and
  moderation status, revision/timestamps, and safe submitted title or buyer
  display snapshots. A listing MAY include its public source-kind discriminator,
  but neither collection exposes the private listing source ID or purchase-request
  ID. It also omits internal tenant, user, partner, moderator, idempotency, and
  provider-operation identifiers, never returns another actor's unpublished
  state, and does not claim exhaustive history.
- Moderation queues and decisions require the tenant-scoped administrator
  permission. The queue exposes the exact allowlisted snapshot plus listing or
  request revision and seller-profile revision/fingerprint reviewed by the
  administrator. A decision compare-and-sets every bound revision/fingerprint
  so one reviewer wins; an exact completed replay is idempotent and a stale or
  opposite decision conflicts without approving unseen seller or publication
  content. Listing-content and seller-profile decisions are independently
  expressible: rejecting a listing never rejects a shared seller revision;
  rejecting a seller revision deterministically rejects or supersedes every
  still-pending listing pinned to it while the prior approved seller revision
  and unrelated approved listings remain visible.

**Failure behavior:**

- A wrong-tenant, wrong-owner, mismatched source/organization, unverified,
  unapproved, inactive, or missing publication command fails closed with a safe
  403, 404, or 409 and no seller, publication, or idempotency residue.
- A corrupt cross-reference is rejected by database coherence controls and by
  explicit equality joins. It is never projected by trusting a single foreign
  key or display label.
- A hidden or newly ineligible public record returns an empty page or safe 404;
  the handler never falls back to a private repository or stale browser data.
- A malformed or over-limit cursor, search, filter, or page size returns a safe
  validation problem before an unbounded persistence query runs.
- An unauthorized, foreign-tenant, stale, or contradictory moderation decision
  returns a safe denial or conflict and does not change publication visibility.
- A seller-revision decision never strands an older pending queue row and never
  cascades rejection or invisibility to a listing bound to another approved
  seller revision.

#### Scenario: Approved publication is anonymously discoverable across organizations

- **WHEN** an approved moderator accepts an opt-in publication from a currently verified approved seller with an eligible source
- **THEN** a guest from any organization can read the opaque public listing and seller summary without authentication, a tenant selector, or access to the source tenant

#### Scenario: Seller reloads recent publication status safely

- **WHEN** an authenticated verified seller reloads their publication management view after submitting listing and request publications
- **THEN** each listing and request collection returns at most the requested 1 through 50 newest safe receipts and current moderation statuses for that tenant and user, while older unrequested entries, another actor's unpublished records, and every internal identity remain absent

#### Scenario: Ineligible publication is hidden

- **WHEN** publication or moderation is pending, rejected, or paused, or its seller, verification, source, availability, or request becomes ineligible
- **THEN** anonymous catalog, detail, seller, suggestion, and request discovery return absence without consulting private fallback records

#### Scenario: Public payload stays discriminated and allowlisted

- **WHEN** a guest reads approved Product and Produce publications in any supported locale
- **THEN** each payload has the correct discriminator, explicit section, authored locale title or neutral fallback, and opaque public relations while every private identity, source, legal, provider, moderation, and commercial-workflow field is absent

#### Scenario: Edited descriptive content requires moderation while stock stays live

- **WHEN** approved seller display, descriptive listing/request content, category, crop, grade, unit, region, or safe assets change while authorized price or stock mutations also occur
- **THEN** the prior approved listing and seller snapshots remain stable and unrelated approved listings stay visible until the new pinned revisions are moderated, while current price is read from the valid source and a committed zero quantity hides immediately without waiting for moderation

#### Scenario: Seller and listing moderation do not fan out destructively

- **WHEN** an administrator separately rejects one listing revision or a newer seller-profile revision shared by pending listings
- **THEN** listing rejection leaves the seller decision unchanged, seller rejection deterministically rejects or supersedes only pending listings pinned to that revision, and the prior approved seller plus unrelated approved listings remain guest-visible

#### Scenario: Concurrent moderation decides once

- **WHEN** two authorized reviewers decide the same pending listing revision concurrently, a client repeats the completed decision, and the seller-profile revision is reviewed separately
- **THEN** one listing decision and audit identity persist without implicitly deciding the seller profile, both exact replays return their results, and a stale or opposite listing decision conflicts without changing unrelated guest visibility

#### Scenario: Publication command is tenant-safe and idempotent

- **WHEN** the verified owner publishes an eligible source and retries the same canonical input with the same idempotency key
- **THEN** one pending-moderation publication is returned, while a wrong-tenant source or changed input under that key fails without another write

#### Scenario: Anonymous keyset pagination and filters are bounded

- **WHEN** a guest searches listings, sellers, suggestions, or public requests with a valid sort-bound opaque cursor and bounded section, price, availability, region, or text filters
- **THEN** the response returns at most the configured page limit and a next keyset cursor without accepting an offset, tenant, organization, user, source, provider, or moderation selector

### Requirement: [REQ-AGRITECH-ENGAGEMENT-019] Public-listing engagement is opaque, quota bounded, and deal verified

The platform SHALL bind favorites, sample requests, sample feedback, public
reviews, seller replies, rating aggregates, and review reports to governed
public listings and exact authenticated parties. Engagement commands SHALL use
opaque public identifiers and persisted idempotency, authorization, quota, and
moderation state; they SHALL NOT accept or expose private product, produce,
tenant, owner, partner, provider, or lifecycle identifiers.

**Ownership:** `user-app`, `admin-app`, `user-app-api`, `admin-app-api`, `acceptance-e2e`,
`@app/backend-feature-agritech-main`,
`@app/backend-feature-agritech-admin`,
`@app/backend-feature-agritech-shared`, and
`@app/backend-postgres-main-agritech`.

**Evidence profile:** acceptance, API, domain, persistence, security, and
browser evidence.

**Invariants:**

- An authenticated favorite stores only the actor boundary and opaque listing
  publication. Add and remove are idempotent; a hidden or ineligible listing is
  omitted from the safe favorite projection without revealing why or falling
  back to the private source.
- `sampleAvailable` is an explicit owner-controlled Product or ProduceListing
  fact and a bounded public filter/field; it is never inferred from category,
  stock, fixtures, or reference copy.
- A sample request requires persisted verification plus current active buyer
  capability membership in an approved organization. The server locks and
  derives the public listing, source, seller organization, requester
  organization, and calendar-season key. Caller display, seller, source,
  tenant, quota, and price fields are never authoritative.
- The active versioned sample policy defaults to five requests per verified
  user per UTC calendar month. A request is unique per requester and governed
  source per server-derived calendar season. Concurrent same- or different-key
  requests cannot exceed the quota or create duplicate source-season rows;
  denied attempts consume no quota.
- A sample itself has zero item price, while pickup or seller delivery remains
  a separate requester-cost arrangement. Seller delivery requires a persisted
  non-negative quote before approval. The ordered state machine is `requested`
  to `approved | declined | cancelled`, then `shipped`, `received`, and
  optional requester feedback; only the current requester or an active member
  of the exact seller organization can perform its allowed transition.
- Sample transitions append audit and in-app notification intent state in the
  same transaction. Private sample feedback is visible only to the requester,
  exact seller organization, and authorized administrator and is not presented
  as a public deal review.
- A public review requires an unused persisted eligibility created by a
  completed contract line for the authenticated buyer and governed source.
  Eligibility consumption and review creation are one transaction. A buyer has
  at most one public review per governed source, including retries and
  concurrent completed contracts.
- Public review input is one integer rating from 1 through 5, bounded safe text,
  and optional allowlisted public asset references. Review text, assets, seller
  reply, and report reason reject control/bidirectional characters, contact
  leakage, private URLs, oversized content, and caller identity fields.
- A deal-verified review is visible through the public listing/seller
  projection with an explicit verified-deal label. Rating count and average are
  derived only from visible deal-verified reviews and update transactionally
  when moderation visibility changes; caller-provided aggregates are ignored.
- An active member of the exact reviewed seller organization may create one
  bounded public reply under idempotency and revision controls. Any
  authenticated user may report a visible review once per reason class without
  changing its visibility directly.
- Review reports enter a tenant-scoped administrator queue containing the exact
  allowlisted review/reply snapshot and revision. A permission-checked,
  expected-revision, idempotent decision either dismisses the report or hides
  the review; one reviewer wins, exact replay returns the result, and stale or
  opposite decisions conflict. History and audit identities are retained.
- User/admin responses use separate allowlisted DTOs. Public engagement reads
  expose opaque listing/seller/review IDs, safe localized source titles,
  rating/review counts, visible review/reply content, sample availability, and
  public timestamps only. Private party, source, contract, eligibility,
  provider, idempotency, moderation, and audit fields remain absent.

**Failure behavior:**

- An anonymous write, unverified sample requester, inactive membership,
  unapproved seller, self-authored listing, unavailable sample, hidden listing,
  exhausted quota, duplicate source-season request, invalid transition,
  non-completed contract, consumed eligibility, wrong seller, or foreign-tenant
  command returns a safe localized 401, 403, 404, or 409 and leaves every
  engagement, quota, aggregate, audit, and notification row unchanged.
- Same-key/same-input retries return the original command result;
  same-key/changed-input reuse conflicts. A timeout or concurrent collision is
  resolved from persisted state rather than optimistic browser state.
- Reporting never hides a review by itself. An unauthorized, stale, or
  contradictory moderation decision changes neither public visibility nor
  rating aggregates.

#### Scenario: Favorite uses an opaque public listing

- **WHEN** an authenticated user favorites an eligible public listing and repeats the add or remove command
- **THEN** one private favorite state is returned idempotently, public listing data remains allowlisted, and no private source or seller-tenant identifier crosses the API

#### Scenario: Monthly sample quota is concurrency safe

- **WHEN** a verified buyer with four requests this UTC month concurrently confirms two different eligible sample requests
- **THEN** exactly one fifth request persists with the active policy snapshot and requester-paid delivery boundary, while the other conflicts without consuming a sixth allowance

#### Scenario: Sample state is controlled by the exact parties

- **WHEN** the exact seller approves and ships a sample and the requester records receipt and private feedback
- **THEN** each idempotent ordered transition appends audit and notification intent state, while a foreign member, caller-selected seller, reordered command, or duplicate source-season request is denied

#### Scenario: Completed deal permits one public review

- **WHEN** the authenticated buyer uses a completed-contract eligibility to submit a bounded review twice or concurrently
- **THEN** one deal-verified review consumes the eligibility, one visible aggregate update persists, and a draft, active, cancelled, unrelated, or already-consumed eligibility creates no review

#### Scenario: Seller reply and report moderation are independent

- **WHEN** the exact seller replies once, a user reports the review, and two authorized administrators decide the same report revision
- **THEN** one safe reply and one winning moderation audit persist, reporting alone leaves visibility unchanged, and only a hide decision removes the review from public aggregates while exact replay is stable

#### Scenario: Engagement payloads remain private-field free in four locales

- **WHEN** public listing, seller, rating, and review data plus authenticated favorite/sample states are read in English, Russian, Uzbek Latin, and Uzbek Cyrillic
- **THEN** semantic state and localized authored titles remain equivalent while tenant, user, partner, source, contract, eligibility, provider, idempotency, and moderation internals are absent

### Requirement: [REQ-AGRITECH-LIFECYCLE-020] Contract lifecycle effects are durable, party-bound, and reconcilable

Every resolved cross-organization marketplace contract SHALL use one persisted,
ordered lifecycle for its immutable PDF artifact, qualified party signatures,
direct-payment or factoring settlement, fulfillment, dispute evidence and
moderation, configured commission, and completed-source review eligibility.
Unavailable external effects MAY use only an explicitly configured mock adapter
outside production; mock execution SHALL preserve every internal authorization,
idempotency, ordering, and persistence guard and SHALL never claim legal effect
or money movement.

**Ownership:** `admin-app`, `user-app-api`, `admin-app-api`,
`@app/backend-feature-agritech-main`,
`@app/backend-feature-agritech-admin`,
`@app/backend-feature-agritech-shared`, and
`@app/backend-postgres-main-agritech`.

**Evidence profile:** API, domain, persistence, security, document, and
operations evidence.

**Invariants:**

- The contract artifact freezes the resolved buyer and seller display snapshots,
  opaque public source references, integer-UZS line and delivery values,
  payment terms, legal/dispute/penalty copy, template version, snapshot
  fingerprint, checksum, and page metadata. Its downloadable PDF embeds a
  Unicode font, preserves Cyrillic, contains signature slots, exposes no
  private tenant, user, partner, provider-operation, source, or storage key, and
  permanently displays the non-legal mock watermark when simulated.
- Artifact storage has one contract-and-revision provider claim independent of
  initiating party. Qualified signature has one exact party-and-revision claim.
  A signature binds the authenticated active contract party to the artifact
  checksum, and the second signature activates the contract and commits the
  frozen cart inventory exactly once in the same authoritative transaction.
- Direct payment and factoring are mutually exclusive persisted settlement
  state machines. Both parties consent to factoring before its ordered provider
  commands. Direct-payment confirmation and factoring decision, payout,
  repayment, and close commands bind the exact amount, state revision, actor,
  provider event, and safe receipt without treating mock receipts as money.
- A canonical semantic provider claim is unique across different idempotency
  keys. Same-key/same-input replay is stable, changed input conflicts, stale
  attempts are fenced, and an external success whose ledger or domain
  completion is uncertain enters reconciliation and is never blindly invoked
  again.
- Only the exact active buyer or seller organization party may perform its
  ordered fulfillment, settlement, signature, dispute, or evidence action.
  Accepted transitions append an immutable timeline event and both party
  notification intents in the same transaction.
- Dispute evidence accepts one bounded PDF, JPEG, or PNG stream, validates
  filename, media type, magic bytes, size, truncation, and checksum, invokes a
  separately configured storage capability, and persists immutable safe
  metadata only. Moderator resolution binds an expected evidence revision and
  selected evidence IDs and emits one typed reputation outcome signal; caller
  input never directly mutates ratings.
- Completion persists exactly one commission using the active immutable,
  administrator-managed versioned basis-point policy and the frozen merchandise
  line total excluding separately negotiated delivery. The default policy is
  10 basis points and every calculated amount is integer UZS.
- Buyer review eligibility is created only by accepted completion and freezes
  the contract, opaque publication, `product | produce` source tuple, buyer
  identity, and seller organization. It is unique per contract and governed
  source and remains immutable for transactional consumption by the engagement
  boundary.
- User and administrator APIs use distinct explicit allowlists and localized
  RFC 9457 problems in English, Russian, Uzbek Latin, and Uzbek Cyrillic. User
  lifecycle responses omit private party IDs, private sources, storage keys,
  provider operations, provider receipts/references, internal notification
  routing, and moderator identities.

**Failure behavior:**

- An unresolved contract, inactive or revoked membership, wrong tenant or
  party, unsigned artifact, reordered settlement or fulfillment command, stale
  revision, unsupported evidence, changed idempotency input, or unselected
  dispute evidence returns a safe localized 400, 403, 404, or 409 and commits no
  partial lifecycle, inventory, commission, eligibility, reputation, event, or
  notification state.
- Provider disabled/live-unwired configuration fails before invocation. Mock
  configuration in production fails startup and deployment validation.
- Timeout or unknown provider outcome is durably reconciliation-required;
  retries reuse the persisted operation identity only when the prior outcome is
  definitely safe, and a stale callback cannot complete a newer attempt.

#### Scenario: Artifact and signatures bind one frozen agreement

- **WHEN** buyer and seller concurrently request the same artifact and each exact active party signs it
- **THEN** one Unicode PDF and one signature per party persist against the same checksum, the second signature activates inventory once, and the user download contains no private identifiers or storage key

#### Scenario: Direct payment and factoring remain ordered and simulated

- **WHEN** authorized parties replay direct-payment or factoring commands with mock providers
- **THEN** one command per canonical state revision advances in order with explicit simulation and safe receipts, while different-key races, reordered commands, and production mock configuration cannot invoke another effect

#### Scenario: Dispute evidence and decision are revision bound

- **WHEN** an exact contract party uploads one valid bounded evidence file and an authorized moderator resolves the dispute using its ID and current evidence revision
- **THEN** immutable metadata and mock-storage provenance persist without raw bytes or a private key, one typed outcome signal is written, and stale, foreign, malformed, or unselected evidence changes nothing

#### Scenario: Completion writes commission and review eligibility once

- **WHEN** the buyer accepts delivered Product and Produce lines after both signatures and settlement completion
- **THEN** one versioned 10-basis-point integer-UZS commission and one immutable eligibility per governed source commit with the completion event and notifications, while delivery charges are excluded from the commission base

#### Scenario: Provider crash gaps do not duplicate external effects

- **WHEN** an external artifact, signature, payment, factoring, or evidence call succeeds but completion persistence fails or a concurrent different-key command races it
- **THEN** the semantic command has one provider invocation, the uncertain row remains fenced for reconciliation, and replay either heals from the persisted success or conflicts without a second external call

### Requirement: [REQ-AGRITECH-NOTIFICATION-022] Contract lifecycle notifications are durable, localized, and safely delivered

Every accepted contract lifecycle transition SHALL create one durable in-app
notification intent for each contract party in the same database transaction as
the immutable lifecycle event. External delivery SHALL begin only after that
transaction commits and SHALL preserve a stable intent identity, tenant and
party authorization, bounded retries, explicit provider provenance, and an
auditable terminal or reconciliation state.

**Ownership:** `admin-app`, `@app/backend-common-i18n`, `@app/common-i18n-keys`,
`@app/backend-feature-agritech-main`,
`@app/backend-feature-agritech-admin`,
`@app/backend-feature-agritech-shared`,
`@app/backend-postgres-main-agritech`, `notification-scheduler`, and
`@repo/tooling`.

**Evidence profile:** API, domain, persistence, security, localization, and
operations evidence.

**Invariants:**

- The immutable lifecycle event and its buyer and seller notification intents
  commit or roll back together. The event and recipient-party identity is
  unique; dispatcher retries never create another intent or modify the
  authoritative commerce transition.
- The in-app record exists independently of external delivery and stays
  queryable after external failure. Recipient queries require the exact active
  buyer or seller membership; administrator queries derive the target tenant
  from the permission-checked principal.
- The scheduler claims pending work with a bounded lease and skip-locked
  semantics, persists the recipient's canonical locale, and durably begins an
  attempt before invoking a provider. Attempt counts are monotonic and stable
  idempotency keys are scoped to the intent and delivery channel.
- Telegram is the primary external channel. Only the explicit critical
  contract, factoring, and dispute event allowlist may transition once to SMS,
  and only after a definitely-not-accepted terminal Telegram result. An unknown
  outcome never retries or falls back.
- Provider mode and name are frozen after the first attempt. Provider references
  and receipts are bounded, provenance checked, and reject secret-like keys,
  bearer values, and token-shaped values before persistence.
- Mock Telegram and SMS delivery is allowed only in development, test, or
  staging, makes no network request, and persists `simulation: true`. Production
  rejects mock configuration, and an unwired live mode fails at startup rather
  than silently using mock delivery.
- Event copy is rendered from typed common catalogs in English, Russian, Uzbek
  Latin, and Uzbek Cyrillic using the locale frozen before delivery begins.
  Recipient DTOs expose only a safe event, localized message, in-app status,
  simulation flag, attempt time, delivery channel, and contract deep link;
  administrator DTOs are separate.

**Failure behavior:**

- Provider timeouts, untyped failures, ambiguous outcomes, provenance mismatch,
  unsafe receipts, and external success whose completion cannot be persisted
  enter reconciliation or remain fenced for stale-lease quarantine. None become
  an ordinary retry or roll back the committed commerce transition.
- A definitely-not-accepted retryable result uses bounded backoff. Exhaustion is
  terminal unless the event is in the critical Telegram-to-SMS allowlist.
- A stale claim token, expired active-party membership, foreign tenant, or
  missing administrator permission cannot read or mutate delivery state.

#### Scenario: Lifecycle transition and in-app intent commit together

- **WHEN** an authorized contract transition appends its immutable lifecycle event
- **THEN** exactly one buyer and one seller in-app intent commit in the same transaction, or neither the event nor either intent persists

#### Scenario: Concurrent delivery stays idempotent

- **WHEN** scheduler replicas contend for one pending intent or a started lease expires after an unknown provider outcome
- **THEN** only one owned attempt invokes the provider and the stale started claim enters reconciliation without another external send

#### Scenario: Critical delivery falls back safely

- **WHEN** a critical allowlisted Telegram attempt is definitely not accepted after its bounded attempts
- **THEN** the same in-app intent becomes one SMS attempt with a channel-scoped idempotency key and its persisted recipient locale
- **AND** an ambiguous Telegram result enters reconciliation without SMS fallback

#### Scenario: Mock and live modes fail closed

- **WHEN** mock delivery is selected outside development, test, or staging, or live delivery has no approved adapter
- **THEN** startup or deployment validation fails before a provider call and no mode is relabelled as another

#### Scenario: Notification reads preserve party and locale boundaries

- **WHEN** buyer, seller, foreign member, and tenant administrator read notification status in each supported locale
- **THEN** each active party sees only its safe localized in-app records, the administrator sees only the derived tenant scope, and internal lease, template, provider, receipt, and error fields remain absent from recipient responses

### Requirement: [REQ-AGRITECH-ONBOARDING-023] Marketplace access is progressive and explains restricted actions

The responsive user marketplace SHALL remain useful before marketplace
verification while every commercial mutation remains server-authoritative.
Public discovery SHALL remain anonymous. Signed-in users SHALL retain profile,
favorites, organization application, and verification readiness/history.
Controls for unavailable commercial actions SHALL remain visible when they aid
task understanding, SHALL be disabled, and SHALL state the exact missing
identity or approved-organization prerequisite with a next action.

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

### Requirement: [REQ-AGRITECH-DEMO-024] Administrator-governed demo catalog is honest and isolated

The platform SHALL expose a deterministic versioned demo catalog only while an
authorized tenant administrator enables the dedicated demo-catalog feature
flag. Demo listings SHALL be clearly labelled, browse-only, and carried through
the generated public API contract with explicit demo provenance and
non-transactional state. Disabling the flag SHALL remove the projection
immediately without creating, changing, or deleting real marketplace records.

**Evidence profile:** API, domain, persistence, security, journey

**Invariants:**

- Demo data creates no user, organization, source row, publication, inventory
  mutation, cart, order, contract, payment, review, notification, provider
  receipt, or authoritative metric.
- Demo identifiers are stable and disjoint from persisted publication sources.
- Repeated enable or disable writes are idempotent because the projection is
  derived from current flag state rather than materialized as commerce rows.
- Only the existing tenant-scoped, audited feature-flag admin permission can
  change demo visibility.

**Failure behavior:**

- Missing, disabled, malformed, or unreadable feature-flag state fails closed
  to no demo records while authoritative public records remain available.
- Any attempted transaction against a demo identifier returns safe not-found or
  denied behavior and creates no commercial state.

#### Scenario: Admin enables the demo catalog

- **WHEN** an authorized administrator enables the dedicated demo-catalog toggle
- **THEN** guests and users see localized labelled demo listings with disabled commercial actions and no change to authoritative marketplace metrics

#### Scenario: Admin disables the demo catalog

- **WHEN** the administrator disables the toggle
- **THEN** demo listings disappear immediately and all real publications, carts, orders, and analytics remain unchanged

#### Scenario: Unauthorized demo toggle is denied

- **WHEN** a caller without feature-flag write permission attempts to change demo visibility
- **THEN** the backend denies the request and the admin UI exposes no writable toggle

### Requirement: [REQ-AGRITECH-ADMIN-025] Administrator web completes marketplace operations

The responsive administrator web application SHALL provide authorized tenant
operators with deep-linkable overview, moderation, commerce, engagement, and
delivery workspaces that consume the generated admin API contract for every
supported marketplace administration workflow. The application SHALL expose
tenant-scoped analytics, partners, farmers, verification cases, seller/listing/
request moderation queues, contracts and dispute evidence, commission policy,
sample policy, review reports, lifecycle notifications, orders, deliveries,
advisories, pilots, integrations, and the governed demo toggle without browser-
authored operational state or hidden-identifier entry.

**Ownership:** `admin-app`, `admin-app-api`, `@app/frontend-api-client`,
`@app/frontend-feature-admin-i18n`, `@app/backend-feature-agritech-admin`,
`@app/backend-feature-agritech-main`, `@app/backend-feature-agritech-shared`,
and `@app/backend-postgres-main-agritech`.

**Evidence profile:** API, journey, and security evidence.

**Invariants:**

- Read-only, write, and approve controls exactly follow the existing AgriTech
  admin permissions; absent UI controls never replace backend authorization.
- Every mutation uses the authoritative queued revision, fingerprint, evidence
  identity, and a safe idempotency key where the contract requires one.
- A tenant-scoped lifecycle projection exposes only the safe contract party
  snapshots, open dispute, evidence metadata, fulfillment state, and timeline
  needed for moderation; provider receipts, leases, private storage references,
  and foreign-tenant records remain absent.
- All four supported locales provide equivalent state, action, failure, and
  recovery semantics at desktop and the 320 px responsive floor.
- Empty, loading, denied, conflict, provider simulation, reconciliation, and
  failed-read states remain distinct and never fall back to fabricated records.
- Native operator presentation and cross-tenant support tooling are excluded.

**Failure behavior:**

- A failed workspace read renders the owning retry state without fabricating
  fallback records or retaining stale privileged data.
- A stale revision/fingerprint, contradictory input, duplicate concurrent
  decision, or changed input under an idempotency key renders conflict recovery,
  refreshes authoritative data, and claims no optimistic success.
- A missing permission returns the existing safe denial and reveals no
  mutation control or foreign resource.

#### Scenario: Moderator clears authoritative queues

- **WHEN** an approving tenant operator opens verification and publication
  moderation, reviews the pinned identity/content context, and decides the
  current revisions
- **THEN** the generated commands submit the exact revisions, fingerprints,
  reasons, and idempotency keys, successful items leave their queues after
  refresh, and stale or concurrent decisions recover without duplicate effects

#### Scenario: Dispute moderator uses persisted evidence

- **WHEN** an approving tenant operator opens a disputed contract, selects
  persisted evidence from its current evidence revision, and records a valid
  resolution
- **THEN** the contract, safe parties, fulfillment state, evidence metadata,
  and outcome remain tenant-scoped, the resolution commits once, and no hidden
  evidence identifier must be typed

#### Scenario: Policies and engagement remain compare-and-set

- **WHEN** a writing operator activates commission or sample policy and an
  approving operator decides a reported review
- **THEN** the UI submits the displayed policy/report revision with a stable
  command key, presents exact basis-point or quota values, and refreshes the
  authoritative result after success or conflict

#### Scenario: Read-only operator has a complete safe view

- **WHEN** an operator with read but without write or approve permission opens
  every marketplace workspace at 320 px or desktop width in any supported locale
- **THEN** all tenant-scoped queues, contracts, notifications, analytics, and
  operational readiness remain inspectable and recoverable while every mutation
  control is absent
