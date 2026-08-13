## Context

DehqonHub already has a persisted tenant-scoped marketplace for products, carts,
requests/offers, samples, reviews, contracts, verification status, and grounded
AI results. The combined Stage 1+2 specification adds anonymous discovery,
cross-organization commerce, external identity/document/signature/bank flows,
promotions, complete dashboards, notifications, and AI cart mutation.

The maintainer explicitly requires all internal authority and state to remain
real. Only unavailable external services may be mocked. Therefore this change
must extend the existing domain and PostgreSQL model rather than introduce a
browser store, fixture gateway, guard bypass, or parallel sandbox marketplace.

## Goals / Non-Goals

**Goals:**

- Provide safe public discovery and complete real Stage 1+2 transactions.
- Keep tenant privacy while allowing intentional commerce between published
  organizations.
- Make mock external-provider behavior replaceable, persisted, idempotent,
  auditable, visibly simulated, and impossible to activate in production.
- Support four locale choices and complete responsive user-web journeys down to
  the 320 px browser boundary.
- Remove GitHub-hosted execution without weakening local exact-SHA assurance.

**Non-Goals:**

- Implementing live vendor protocols, credentials, webhooks, legal templates,
  money movement, or qualified-signature certification.
- Turning private tenant tables into an anonymous unrestricted query surface.
- Creating a demo persona, fixture market, or browser-only authoritative store.
- Building administrator SPA marketplace screens or native Expo/Android/iOS
  marketplace screens. Privileged API behavior required by the user flow remains
  in scope.
- Stage 3 logistics or deployment.

## Decisions

### 1. Extend the existing domain; do not build a sandbox marketplace

All catalog, verification, cart, request, offer, contract, payment, sample,
promotion, review, dashboard, notification, dispute, commission, and AI-cart
state lives in the existing API/domain/PostgreSQL ownership graph. The frontend
continues to use generated clients. There is no runtime in-memory acceptance
adapter, localStorage commerce store, caller-selected role, or bypass route.

External adapters implement narrow ports consumed by domain services. Initial
OneID, document-storage, qualified-signing, and bank/factoring implementations
are deterministic mock adapters enabled only by explicit non-production config.

### 2. Separate public projections from private repositories

Add `/marketplace/public/catalog`, product, seller, search/suggestions, and public
request endpoints with dedicated public DTOs. Their repository queries cross
tenant boundaries intentionally but only over explicit publication/moderation
state and approved, non-suspended seller organizations. They accept filters,
sort, cursor, and opaque public IDs, never a tenant selector.

The canonical catalog projection is a persisted discriminated publication over
the two existing source aggregates: governed input/equipment `ProductEntity` and
farmer `ProduceListingEntity`. A publication row has an opaque `publicId`, an
explicit `equipment | seeds | produce` section, and two nullable real foreign
keys with a database check that exactly one source is present. The `seeds`
section is explicitly presented as **Seeds & crop inputs** and may contain seed,
fertilizer, and crop-protection product categories. `other` requires an explicit
section at publication and is never guessed. Produce always comes from the
produce aggregate.

Cart and contract lines reference the opaque publication plus a frozen source
kind/snapshot. Inventory mutation dispatches to and locks the real product or
produce row. This avoids copying a stale normalized stock counter and makes
Produce participate in the same real contract lifecycle without pretending it
is a product category.

Public DTOs omit tenant IDs, owner IDs, legal identifiers, provider receipts,
verification documents, private matching, carts, contracts, payments, and
analytics. Private endpoints retain tenant/party filters. Public projection code
has an explicit field allowlist test so entity additions do not leak by default.

### 3. Model cross-organization trade with explicit party tenancy

A product remains seller-tenant owned. A cart/request remains buyer-tenant
owned. Published listing/request identifiers are the only cross-organization
entry points. Mutations resolve and lock the publication, product, organization,
membership, verification, price, and stock server-side.

Contracts store buyer and seller organization/user/tenant references separately
plus frozen public/legal display snapshots. Those internal references remain in
the persistence model only. User cart, buyer-request, offer, and contract DTOs
return opaque marketplace identifiers and safe commerce fields; where
counterparty identity is needed, they use the caller's actor relationship and
allowlisted party display snapshots. They never serialize internal tenant, user,
partner, or source-row identifiers. Contract list/detail authorization permits
only the correct party membership or an authorized moderator; it never opens
either tenant generally. Database constraints ensure the two parties and source
are coherent.

### 4. Use one reusable provider-operation idempotency boundary

Add a provider-operation table keyed by tenant, actor, capability, resource, and
idempotency key with canonical request fingerprint, provider mode/name, status,
safe receipt/reference, result fingerprint, timestamps, and error/reconciliation
metadata. Provider commands run inside the same transaction as the owned domain
transition where atomicity is required.

Same-key/same-fingerprint retries return the stored result. Same-key/different-
fingerprint attempts conflict. Provider callbacks use provider/event uniqueness
and compare-and-set ordering. Raw credentials, tokens, PINFL/TIN, document bytes,
and unrestricted provider payloads are never stored in this table.

### 5. Keep provider modes explicit and production-safe

Provider configuration is a typed enum: `disabled | mock | live`. Selection is
per capability, not one global boolean. `mock` is allowed only for development,
test, and staging runtimes and causes startup/deployment-validation failure in
production. It makes no network request and loads no live credential.

Every affected domain record persists provider mode and safe provenance. Mock
outputs use synthetic values that cannot collide with live namespaces. UI/API
copy displays a localized simulation disclosure; artifacts also carry the mark.
Disabled does not fall back to mock.

### 6. Persist verification evidence; keep approval human-authorized

Verification is a four-step persisted case. The OneID provider links a subject;
the document-storage provider records immutable evidence metadata/checksum;
the user selects one role and submits. In mock mode uploaded bytes are validated
in-request and discarded after the deterministic provider receipt and immutable
metadata/checksum are persisted; arbitrary identity-document bytes are not kept
in PostgreSQL or browser storage. A later live object-storage adapter owns
encrypted object retention and malware scanning. Mock providers generate only
synthetic, non-secret evidence and do not approve the case.

Verification create/resume and submit use persisted command identities and an
integer expected revision. Creation requires revision zero; later commands bind
the current case revision. Exact same-key/same-input replay returns the original
case, changed-input key reuse conflicts, and a different-key stale transition
conflicts. This keeps browser retries from creating or advancing a case twice.

Only the existing authorized admin review path approves/rejects. Optimistic
versioning plus a persisted idempotency key and expected-revision compare-and-set
prevents two reviewers from deciding the same pending case. Exact replay returns
the first decision; stale, opposite, or changed-input reuse conflicts. Duplicate
provider-subject/legal-identity fingerprints are globally unique without
exposing raw identifiers. User DTOs omit private provider/storage fields; admin
DTOs expose only review-safe metadata.

### 7. Generate immutable contract artifacts and party signatures

Offer selection or checkout freezes lines, party organization/legal snapshots,
unit/total integer UZS, delivery, payment, source, inventory revision, template
version, and timeline. Server PDF generation consumes only this snapshot.

Artifact storage records checksum, media type, byte size, storage reference,
provider mode, watermark state, and immutable content revision. The mock storage
adapter stores the generated artifact through a persisted repository boundary
and permanently embeds `MOCK PROVIDER — NOT A LEGAL CONTRACT` in the PDF.

The signing provider receives acting party, artifact checksum, and snapshot
revision. A signature record is unique per contract/party and idempotency key.
Both separate authenticated party contexts are required; neither can sign for
the other. A changed artifact invalidates unsigned attempts and cannot be
silently substituted after one party signs.

### 8. Persist direct payment and factoring state machines

Payment terms are selected before artifact generation. Direct payment records
buyer confirmation then seller receipt. Factoring records consent, request,
provider decision, seller payout, buyer repayment, and close. Illegal, skipped,
duplicated, or reordered transitions conflict.

The mock bank adapter produces deterministic safe receipts through the same
idempotent port and never claims funds moved. Timeline, audit, notification
intent, dashboard metrics, and reconciliation state are real. Completion creates
one commission record from a versioned category rate.

### 9. Add real promotions, dashboards, notifications, and reviews

Promotions store product, owner organization, plan, bounded period, activation,
integer UZS price/reference, and audit state. Catalog ranking may boost an active
promotion; matching, offers, public request order, and AI retrieval cannot read
promotion weight.

Role dashboards are query models derived from authorized domain records, not
fixture metrics. Notifications are transactionally persisted in-app intents and
may use mock external-channel providers. The post-commit scheduler persists the
recipient's canonical locale, leases due intents with claim-token fencing,
freezes provider provenance at attempt start, applies bounded per-channel retry,
and quarantines ambiguous results for reconciliation. Telegram is primary;
after a definitely-not-accepted terminal Telegram failure, only the explicit
contract/factoring/dispute critical-template allowlist may transition once to
SMS with a channel-qualified idempotency key. An unknown Telegram outcome never
falls back because that could duplicate a delivered message. Recipient reads
require current exact-party membership; administrator reads are scoped to the
tenant of the targeted party. Mock Telegram and SMS delivery is
non-production-only, performs no network request, and is stored and returned as
`simulation: true`, never as live delivery.
Reviews require a completed contract line and a
unique buyer/product key; the prior active-or-completed allowance is removed.

### 10. Make AI cart mutation a separate confirmed command

AI retrieval uses the public/published catalog index and returns semantic result
codes plus product IDs. Agronomic guidance must be sourced/configured and fails
closed when unavailable. The client previews the proposed products and seller
partition before confirmation.

`POST /marketplace/ai/consultations/:id/starter-cart` is authenticated,
verified, organization-authorized, and idempotent. The server locks/revalidates
the consultation and products, rejects stale/unavailable items, and atomically
creates or updates one buyer cart per seller. Cancel sends no command.

### 11. Add `uz-cyrl` without changing `uz`

The canonical locale list becomes `en`, `ru`, `uz`, `uz-cyrl`. Negotiation uses
full tag, language-script, then language, so `uz-Cyrl-UZ` selects Cyrillic before
the base `uz` Latin fallback. All scoped catalogs, persisted auth preferences,
switchers, SSR/client state, problem details, notifications, and tests gain the
new locale.

Provider boundaries map script-specific locales only to documented supported
codes; Telegram/payment may use provider `uz`, Discord metadata may omit
unsupported Uzbek, while application responses still use the user's exact
catalog. Product authored content adds Cyrillic fields where the domain supports
localized names; missing content uses a visibly neutral fallback and is not
claimed as translated.

### 12. Remove GitHub execution while retaining collaboration metadata

Delete `.github/workflows/**` and `.github/actions/**`. Keep CODEOWNERS, issue/PR
templates, release categorization, and npm/Docker Dependabot configuration;
remove only the GitHub Actions Dependabot ecosystem. A static check rejects
future workflow/action execution files.

Update workflow-coupled validators, GitLab/trusted-runner commands,
documentation, and OpenSpec mappings. `ci:pr`, focused Nx targets, migration,
security, browser, visual, fullstack, `spec:impact`, and exact-SHA `spec:verify`
remain runner-neutral. Documentation explicitly records that hosted CodeQL,
Scorecard, dependency review, artifacts, status checks, image signing, and
automatic promotion are no longer supplied by this repository.

### 13. Keep the HTTP surface explicit

The user API owns these public read groups under `/marketplace/public/*`:

- catalog/search/suggestions with opaque listing IDs;
- listing detail with a discriminated Product or Produce payload;
- sanitized seller profile and its published listings;
- sanitized active purchase-request feed.

Public handlers are explicitly auth-optional and never accept tenant, user,
organization, source-row, or provider identifiers. Pagination is cursor-based
and bounded.

Authenticated generated-client command groups remain under `/marketplace/*`:

- verification case, identity link, evidence upload/finalize, and submit;
- listing publication, seller products/produce, promotions, and samples;
- carts, purchase requests, offers, and offer selection using opaque public IDs;
- contract artifact generation/download, delivery quote, signing, fulfillment,
  dispute, completion, direct payment, and factoring;
- role dashboard, notifications, AI consultation, and starter-cart confirmation.

`GET /marketplace/publications/mine?limit=1..50` exposes an authenticated,
tenant-and-user-scoped bounded recent seller read model containing listing and
request publication receipts plus current moderation status in newest-first
order. The allowlist contains opaque receipt/public-seller relations, safe
submitted titles or buyer display, status, revision, and timestamps; it excludes
the private listing source ID and purchase-request ID alongside tenant, user,
partner, moderator, idempotency, and provider-operation fields. The user web app
reloads this read model after navigation or refresh instead of treating a prior
command response as durable browser state. It does not claim an unbounded
exhaustive history.

Administrator verification, publication moderation, and notification reads stay
under `/admin/*`. Administrator lifecycle policy/dispute commands and engagement
policy/report commands use the existing AgriTech owner routes under
`/agritech/marketplace/*`. Every retryable command requires the
`Idempotency-Key` header and an integer `expectedRevision >= 0`. Verification
creation treats an absent aggregate as revision zero; rejected-case resume,
submit, delivery-quote update, and administrator verification decision bind the
current aggregate revision. Query/list/read
endpoints do not manufacture idempotency keys. RFC 9457
distinguishes validation 400,
authentication 401, authorization 403, missing/hidden 404, stale/replay 409, and
provider unavailable 503.

## Risks / Trade-offs

- [Public data leak] → dedicated allowlisted DTO/query, publication/moderation
  state, negative field tests, no tenant selector.
- [Cross-tenant confused deputy] → explicit buyer/seller tenancy, organization
  membership checks, opaque publication IDs, locked server-side resolution.
- [Mock becomes authority] → typed per-capability mode, persisted provenance,
  visible disclosure, synthetic namespace, production startup rejection.
- [Duplicate legal/financial transition] → canonical fingerprints, unique keys,
  compare-and-set state, transactional audit and component contention tests.
- [Large migration rollback loses history] → additive/nullable rollout,
  expand-migrate-contract order, pre-traffic-only down warning.
- [Cyrillic copy quality] → structural/placeholder checks plus rendered linguistic
  review; do not equate copied English text with translation.
- [Removing hosted security] → retain local scans/audits and document the lost
  hosted services rather than claiming equivalence.

## Migration Plan

1. Land requirements, evidence ownership, provider-mode/config contracts, and
   four-locale runtime.
2. Add nullable provider-operation, verification evidence, publication/party,
   artifact/signature, payment/factoring, promotion, commission, dispute, and
   audit schema with constraints and legacy-safe backfills.
3. Deploy source-compatible readers, then write paths; regenerate OpenAPI and
   clients only after the source API is stable.
4. Enable the dedicated public projection and real Stage 1+2 frontend routes.
5. Enable mock external providers only in explicit development, test, or staging
   config and execute the complete responsive user-web flow plus direct API
   evidence for privileged verification decisions.
6. Remove GitHub workflows/actions and update runner-neutral assurance.
7. Run migration up/down/up before traffic, real PostgreSQL concurrency, API,
   acceptance, browser, accessibility, visual, security, and exact-SHA evidence.

Application rollback keeps expanded tables/columns and reads their nullable
fields. Database down migrations are pre-traffic only once Stage 1+2 writes
exist. Provider mode can be changed from mock to disabled without deleting
history; live mode requires a later approved adapter/config rollout.

## Product and Release Boundaries

- This change completes only the responsive user web application. Administrator
  SPA and native Expo/Android/iOS marketplace presentation remain deferred; API
  and persistence evidence MUST NOT be relabelled as those user interfaces.
- Comprehensive authenticated multi-principal Docker fullstack, reviewed visual
  baselines, and clean exact-SHA release assurance remain separate release
  evidence. Focused source-lane tests cannot be generalized into those claims.
- Commit author selection, history shape, and timestamps are repository delivery
  policy, not observable marketplace behavior, and do not belong in OpenSpec
  product requirements.

## Open Questions

- Live OneID, storage, qualified-signature, payment/factoring, Telegram/SMS, and
  legal template vendor contracts remain future integration decisions. No open
  question permits weakening internal authorization or persistence.
