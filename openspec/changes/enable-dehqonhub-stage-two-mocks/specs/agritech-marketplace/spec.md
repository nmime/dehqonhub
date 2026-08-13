## MODIFIED Requirements

### Requirement: [REQ-AGRITECH-WEB-006] Responsive user web exposes complete real workflows

The responsive user web application SHALL consume generated contracts for every
public and authenticated DehqonHub user journey and SHALL render localized
loading, offline, empty, validation, denied, conflict, provider-unavailable,
reconciliation, recovery, and success states without fabricated product,
authority, legal, financial, or operational records. Guest marketplace
discovery SHALL use the dedicated public API projection; authenticated commerce
SHALL use the same persisted domain APIs as every other client. Administrator
SPA and native Expo/Android/iOS marketplace presentation are outside this
requirement and MUST NOT be claimed by its evidence.

**Invariants:**

- No browser fixture, local store, caller-selected persona, or hidden bypass may
  create an authenticated marketplace outcome.
- External mock-provider results are returned by generated APIs, carry explicit
  `providerMode: mock` and `simulation: true`, and remain visibly labelled.
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
- A disabled or failed provider preserves the last authoritative persisted
  state and exposes a typed retry path.

#### Scenario: Complete user-web workflow

- **WHEN** a guest, buyer, seller, or farmer opens any user-owned marketplace journey in a desktop or 320 px browser
- **THEN** the user web app renders the matching generated public or private API state, action, status, and recovery path with no browser-authored operational claim

#### Scenario: Explicit external simulation

- **WHEN** a non-production deployment uses an approved mock external provider
- **THEN** the client displays its simulation status while all internal records, guards, idempotency, and state transitions remain authoritative

### Requirement: [REQ-AGRITECH-I18N-012] Uzbek Latin, Uzbek Cyrillic, Russian, and English have catalog parity

The platform SHALL support Uzbek Latin, Uzbek Cyrillic, Russian, and English
locale negotiation, preferences, product clients, bot messages, notifications,
problem details, and stored recipient language with identical semantic keys and
placeholder contracts. The stable locale `uz` SHALL continue to mean Uzbek
Latin, and the additive locale `uz-cyrl` SHALL mean Uzbek Cyrillic.

**Invariants:**

- Every scoped locale catalog contains exactly the default catalog's key and
  placeholder sets.
- Locale parsing is case-insensitive and resolves full tag, then
  language-script, then language; `uz-Cyrl-UZ` resolves to `uz-cyrl` before the
  `uz` base fallback.
- Stored values are canonical lowercase `en`, `ru`, `uz`, and `uz-cyrl`.
- The switcher presents Uzbek Latin and Cyrillic as separate choices in every
  locale. Existing `uz` users remain on Latin after migration.
- Provider metadata maps `uz-cyrl` to the provider's supported safe fallback
  instead of sending an unsupported locale code. Runtime response copy may still
  use the user's exact locale.

**Failure behavior:**

- Unsupported locale input follows the existing fallback and is not persisted.
- Missing catalogs, keys, placeholders, switcher labels, database constraints,
  or provider mappings fail static, type, migration, or browser validation.

#### Scenario: Uzbek Latin journey

- **WHEN** a user selects `O'zbekcha (Lotin)`
- **THEN** navigation, forms, errors, provider disclosures, notifications, and deal states render in Uzbek Latin and persist as `uz`

#### Scenario: Uzbek Cyrillic journey

- **WHEN** a user selects `Ўзбекча (Кирилл)`
- **THEN** navigation, forms, errors, provider disclosures, notifications, and deal states render in Uzbek Cyrillic and persist as `uz-cyrl`

### Requirement: [REQ-AGRITECH-INTEGRATION-013] External connectors fail closed and explicit mock providers remain isolated

Weather, agronomy, export, government, identity, document, signing, payment,
factoring, notification, and commercial provider adapters SHALL have explicit
configuration, bounded timeouts, source identity, request idempotency,
reconciliation status, readiness, and redacted telemetry. An absent live
contract or credential SHALL disable the connector. Development, test, and
staging runtimes MAY explicitly select a deterministic mock adapter while
preserving the real domain authorization and persistence boundary; production
SHALL reject mock mode during startup.

**Invariants:**

- `disabled`, `mock`, and `live` are distinct typed provider modes.
- Mock mode consumes no live credential, makes no external request, and is a
  production-startup error.
- Every mock result persists provider capability, mode, request fingerprint,
  safe receipt/reference, actor, tenant, status, and UTC timestamps.
- Idempotency is scoped to tenant, actor, capability, resource, and key.
  Same-key/same-input retries replay the first result; same-key/different-input
  attempts conflict.
- A provider result never grants marketplace authority by itself. Real guards,
  administrator decisions, party checks, and domain state machines consume only
  the provider facts they explicitly own.

**Failure behavior:**

- Missing live configuration remains disabled and MUST NOT auto-select mock.
- Invalid callbacks, changed-input replays, stale revisions, and reordered
  events fail without partial domain or provider-operation writes.
- Provider unavailability preserves the prior authoritative state and exposes
  reconciliation rather than inventing success.

#### Scenario: Disabled government connector

- **WHEN** no approved government identity contract is configured
- **THEN** readiness reports disabled and no request or synthetic production identity is produced

#### Scenario: Mock identity evidence still needs moderation

- **WHEN** a non-production user completes the mock OneID and document-storage steps
- **THEN** the real verification case records mock provenance and remains pending until an authorized administrator decides it

#### Scenario: Duplicate mock provider command

- **WHEN** the same actor retries an external-provider command with the same idempotency key and canonical input
- **THEN** the original persisted result is returned without repeating the transition or audit event

### Requirement: [REQ-AGRITECH-MARKETPLACE-016] DehqonHub marketplace transactions are real, isolated, and recoverable

The DehqonHub marketplace SHALL provide real tenant-isolated, persisted,
transactional catalog, cart, purchase-request, offer, sample, review, contract,
verification, and AI behavior. Anonymous publication and discovery SHALL be
governed exclusively by REQ-AGRITECH-PUBLIC-018. Every commercial write SHALL
derive authority, parties, organizations, prices, stock, and provider provenance
on the server and SHALL commit transactionally. Commands whose HTTP contract
declares an `Idempotency-Key` SHALL return the original result for an exact
replay, reject changed-input key reuse, and avoid duplicate outcomes under
concurrency. This contract applies explicitly to
`POST /marketplace/verification`,
`POST /marketplace/verification/submit`,
`PATCH /marketplace/contracts/{id}/delivery-quote`, and
`PATCH /admin/verifications/{id}`: each requires an 8-100 character safe
`Idempotency-Key` and integer `expectedRevision >= 0`. First verification
creation treats an absent aggregate as revision zero; rejected-case resume and
all later commands compare-and-set the current aggregate revision.

**Invariants:**

- Private reads remain tenant/party scoped. Visibility of one publication
  governed by REQ-AGRITECH-PUBLIC-018 does not grant access to its source tenant.
- `CartViewDto`, `BuyerRequestViewDto`, `OfferViewDto`, and `ContractViewDto`
  expose opaque marketplace identifiers and safe commerce fields only. Where
  counterparty identity is needed, they use the caller's actor relationship and
  allowlisted party display snapshots. Internal tenant, user, partner, source-row,
  and provider-operation identifiers remain absent from user responses.
- Every deal mutation requires an authenticated approved role and approved
  organization membership. Cross-organization writes reference only public
  opaque listing/request IDs and resolve authoritative rows server-side.
- Carts are buyer-owned and partitioned one per seller. Checkout freezes the
  seller organization, buyer organization, product lines, integer UZS unit
  prices and total, stock revision, delivery, payment terms, and source.
- Offer selection accepts exactly one offer, declines alternatives, and creates
  exactly one frozen contract in one transaction.
- Contract creation freezes the reviewable commercial terms owned here. Artifact
  generation, qualified party signing, signature-triggered activation and
  inventory commit, settlement, fulfillment, dispute, commission, and review
  eligibility are governed exclusively by REQ-AGRITECH-LIFECYCLE-020.
- Reviews require a `completed` contract containing the product and are unique
  per buyer/product. `active` alone is no longer sufficient.
- AI consultation creation is an idempotent persisted command. It queries only
  current approved public publications and freezes an allowlisted response with
  opaque publication/seller IDs, reviewed English/Russian/Uzbek Latin/Uzbek
  Cyrillic titles, public price, stock-at-consultation availability, semantic
  reason/explanation codes, and a seller-partitioned starter-cart preview. Exact
  retries return the same snapshot and changed-input key reuse conflicts.
- Seasonal advice without a verified calendar returns the deterministic
  `seasonal_calendar_unavailable` no-data explanation instead of an invented
  agronomic claim. Promotion weight and external-provider/network data are not
  AI grounding inputs.
- Starter-cart creation is a separate confirmed idempotent command that locks
  and revalidates the consultation, publication, seller authority, source, and
  stock, then atomically creates or updates one cart per seller. Cancel writes
  nothing; an unpublished or otherwise stale publication returns a safe refresh
  conflict without exposing a private source or tenant identifier.

**Failure behavior:**

- Missing, unpublished, suspended, wrong-party, wrong-tenant, unverified,
  stale, insufficient-stock, invalid-state, or changed-idempotency input fails
  closed with RFC 9457 and no partial write.
- Missing or malformed idempotency/revision input fails validation. Exact
  same-actor/resource/key/body replay returns the original persisted snapshot;
  same-key changed input and different-key stale revision return RFC 9457 409,
  and only one concurrent compare-and-set wins.
- A public projection outage or zero result does not query private records or
  fabricate products.
- A typed 404/409 refreshes the affected client resource without discarding safe
  user input.

#### Scenario: Verified buyer purchases across organizations

- **WHEN** an approved buyer adds another approved organization's published product and checks out
- **THEN** one buyer-owned seller cart becomes one frozen cross-organization contract without granting either party access to the other's tenant data

#### Scenario: Party responses minimize internal identity

- **WHEN** an authorized buyer or seller reads their carts, requests, offers, or contracts
- **THEN** the response contains only opaque marketplace relations and safe commerce fields, cart/offer/contract counterparty identity uses an allowlisted display snapshot and contract caller role, and internal tenant, user, partner, source-row, and provider-operation identifiers are absent

#### Scenario: Hardened retry and stale-revision boundaries

- **WHEN** an actor retries verification create/submit, delivery-quote update, or administrator verification decision with the same key and canonical input, changes the input under that key, or races a different key at the same expected revision
- **THEN** exact replay returns the original snapshot, changed-input and stale attempts conflict, one concurrent compare-and-set wins, and no duplicate case, quote, decision, audit, or notification outcome persists

#### Scenario: Completed deal permits one review

- **WHEN** the buyer submits a review for a product on a completed contract
- **THEN** one review is persisted and active, unsigned, cancelled, unrelated, or duplicate reviews are rejected

#### Scenario: Confirmed grounded starter cart

- **WHEN** a user creates a grounded consultation with an idempotency key and a verified buyer with active buyer membership confirms its opaque publication preview
- **THEN** an exact consultation retry returns the same immutable four-title/public-fact snapshot, changed-input key reuse conflicts, and confirmation revalidates current eligibility before atomically creating or updating one cart per seller exactly once
- **AND** cancellation creates nothing, deterministic seasonal no-data invents no advice, and a publication withdrawn after consultation returns a safe refresh conflict

## ADDED Requirements

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

**Evidence profile:** acceptance, API, domain, persistence, and security.

**Invariants:**

- Verification is a persisted four-step case. Mock OneID/document providers may
  supply synthetic evidence, but only an authorized administrator can approve
  or reject the case. Duplicate provider subjects and legal identifiers are
  rejected without exposing raw identifiers. Its retry, privacy, and
  expected-revision/CAS contract is governed exclusively by
  REQ-AGRITECH-MARKETPLACE-016.
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
- Promotions have a bounded plan/period, real persisted purchase/activation
  state, and visible `Ad` disclosure. They affect only catalog/shelf rank.
- Supplier, farmer, and buyer dashboards derive metrics from authorized current
  records. No precomputed fixture may claim revenue, deals, conversion, or
  completion.
- Notifications are created transactionally as durable in-app intents and stay
  queryable even when external delivery fails. The scheduler persists the
  recipient's canonical locale, uses Telegram as the primary external channel,
  and may transition a critical contract/factoring/dispute event once to SMS
  only after a definitely-not-accepted terminal Telegram result. Retry keys are
  stable per intent and channel; an ambiguous result enters reconciliation and
  never triggers fallback. Mock Telegram/SMS providers make no network request,
  may mark only a simulated attempt, and do not claim live delivery.
- AI consultation creation requires an idempotency key and persists an immutable
  allowlisted snapshot of current approved public facts: opaque publication and
  seller IDs, all four reviewed title variants, price, stock-at-consultation
  warning, semantic fit/ordering/seasonal codes, and seller partitions. Exact
  replay is stable; changed-input key reuse conflicts; no provider or promotion
  weight may invent or influence the answer.
- The user can explicitly confirm an AI starter-cart preview. Cancel performs no
  write; confirmation requires verified buyer authority, revalidates and locks
  current publication/source/stock, and is idempotent and seller-partitioned.
  Stale or unpublished publications return a safe refresh conflict.
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

- **WHEN** a user completes mock-provider identity and document evidence and an authorized administrator approves the real case
- **THEN** the persisted approved role and organization membership unlock matching commercial writes while raw provider identity remains private

#### Scenario: Promotion is catalog-only

- **WHEN** an approved seller activates a promoted listing
- **THEN** the product receives a localized `Ad` label and catalog placement while request matching, offer ordering, and AI grounding ignore the promotion weight

#### Scenario: Role dashboards derive authorized records

- **WHEN** a supplier, farmer, or buyer reads the matching role dashboard
- **THEN** every metric is derived from that actor's authorized persisted records and no fixture or source presence is presented as revenue, conversion, or completion

#### Scenario: Confirmed AI starter cart is exactly once

- **WHEN** a verified buyer cancels, then confirms and exactly retries a grounded seller-partitioned preview
- **THEN** cancellation writes nothing, confirmation revalidates current publication and stock, and the exact retry returns the original cart result while changed input conflicts

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

**Ownership:** `user-app`, `user-app-api`, `admin-app-api`, `acceptance-e2e`,
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

**Ownership:** `user-app-api`, `admin-app-api`,
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

**Ownership:** `@app/backend-common-i18n`, `@app/common-i18n-keys`,
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
