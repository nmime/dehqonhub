## Why

The supplied DehqonHub Stage 1+2 specification expands the reviewed marketplace
from an authenticated Stage-1 slice into the complete transaction product: safe
guest discovery, verified cross-organization commerce, provider-backed
verification, immutable contract artifacts, payments and factoring, promotions,
role dashboards, notifications, and confirmed AI starter carts. The maintainer
allows unavailable external systems to be represented by mocks, but explicitly
requires authorization, persistence, idempotency, transaction integrity, and
tenant boundaries to remain real.

The same direction adds Uzbek Cyrillic beside the existing Uzbek Latin locale and
removes repository-owned GitHub Actions execution. These are cross-cutting
contract changes and need one exact-revision assurance plan rather than UI-only
shortcuts.

## What Changes

- Add dedicated anonymous public catalog, product, seller, and purchase-request
  projections. They intentionally read only published records owned by approved,
  non-suspended organizations and never expose tenant, identity, document,
  contract, cart, or analytics fields.
- Make the Stage 1+2 commercial flow real and persistent: cross-organization
  published listings, one buyer cart per seller, purchase requests and offers,
  frozen contracts, two-party signing, payment/factoring state, samples,
  completed-deal reviews, promotions, dashboards, notifications, disputes,
  commission records, and audit history.
- Enforce Stage 1+2 writes through authenticated role/organization authorization,
  tenant-safe references, database constraints, locked transactions, and explicit
  state machines. Every retryable command uses a persisted idempotency key, and
  every stale-sensitive aggregate transition compare-and-sets the expected
  revision. No browser or API authorization bypass may manufacture a commercial
  outcome.
- Introduce typed external-provider ports for OneID, document storage, qualified
  signing, and bank/payment/factoring. Until live contracts exist, explicitly
  configured development, test, or staging mock adapters return deterministic
  results without credentials or network calls; production rejects mock mode at
  startup. Their `mock` provenance is persisted and rendered on every affected
  artifact.
- Add server-generated, immutable, watermarked mock-provider PDF artifacts and
  real downloadable API responses. Mock signatures and bank events have no legal
  or financial effect but still obey the real party, ordering, idempotency, and
  reconciliation rules.
- Add real persisted promoted listings, role dashboards, completed-only reviews,
  and a grounded AI starter-cart command that requires confirmation and atomically
  partitions products by seller.
- Extend locale negotiation, preferences, catalogs, switchers, provider-locale
  mapping, and tests from English, Russian, and Uzbek Latin (`uz`) to also include
  Uzbek Cyrillic (`uz-cyrl`).
- **BREAKING (repository automation):** remove GitHub Actions workflows and the
  repository-owned composite action. Keep GitHub collaboration metadata and
  runner-neutral local/trusted-runner assurance commands.

## Goals and Non-Goals

**Goals:**

- Deliver the Stage 1+2 backend and the complete responsive user-web product
  through real APIs and PostgreSQL-backed state in all four locale choices.
- Preserve privacy and tenant isolation while intentionally publishing a small,
  moderated cross-organization read model.
- Keep unavailable external providers replaceable behind stable ports and make
  their mock status impossible to mistake for a live identity, signature,
  payment, factoring decision, notification delivery, or legal artifact.
- Prove persisted idempotent commands, stale revisions, concurrent offer
  selection, concurrent inventory updates, provider retries, and cross-tenant
  authorization fail safely, including verification create/submit, contract
  delivery-quote update, and administrator verification decision.
- Retain exact-SHA executable assurance after GitHub-hosted workflow removal.

**Non-Goals:**

- Calling a live OneID, object-storage, qualified-signature, bank, SMS, or courier
  provider before its contract, credentials, legal approval, and readiness policy
  are supplied.
- Moving money, issuing a legally enforceable qualified signature, or presenting
  a mock provider decision as authoritative.
- Publishing private orders or arbitrary tenant records. Only explicitly public,
  moderated projection fields are anonymous.
- Stage 3 freight auctions, driver tracking, or courier-network integration.
- Deployment or production activation in this change.

## Product Surface Boundary

- Authenticated cart, buyer-request, and offer responses expose only opaque
  marketplace identifiers and safe commerce fields. Where counterparty identity
  is needed, they use the caller's actor relationship and allowlisted party
  display snapshots. Internal tenant, user, partner, and source-row identifiers
  never cross the user API.
- `POST /marketplace/verification`,
  `POST /marketplace/verification/submit`,
  `PATCH /marketplace/contracts/{id}/delivery-quote`, and
  `PATCH /admin/verifications/{id}` participate in the persisted idempotency and
  stale-revision contract and receive evidence only from direct replay,
  changed-input, authorization, rollback, and concurrency tests.
- This completion owns the responsive user web application. Administrator UI
  and native Expo/Android/iOS marketplace screens are intentionally deferred and
  MUST NOT be claimed by user-web or Stage 2 evidence. The administrator API
  verification-decision boundary remains in scope because user verification
  cannot complete safely without it.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `agritech-marketplace`: complete real Stage 1+2 marketplace behavior, explicit
  mock external-provider adapters, safe public projections, four-locale parity,
  and runner-neutral assurance after GitHub Actions removal.

## Impact

This change affects DehqonHub user-web routes and responsive UI, the public user
API, generated OpenAPI/contracts/clients, AgriTech domain services and provider
ports, PostgreSQL entities/migrations/repositories, administrator moderation
APIs, notification events, auth locale persistence, user-scoped locale catalogs,
repository tooling, documentation, acceptance evidence, and user-web browser
validation. It does not claim administrator or native-mobile presentation.

## Risk, Rollout, and Rollback

The highest risks are cross-tenant data disclosure, mock authority escaping into
production, duplicate financial/legal state, and partial multi-record writes.
The design therefore uses purpose-built public DTOs, organization-scoped writes,
database uniqueness, transactional locks, idempotency records, append-only audit
events, typed provider mode, and production startup rejection for mock providers.

Roll out schema and provider ports first, then public reads, commercial commands,
generated clients, and UI. Mock providers are enabled only by explicit
non-production configuration. Rollback keeps the expanded schema and provider
provenance so already-created history remains readable; application rollback
must not run destructive down migrations after marketplace traffic. GitHub
workflow files can be restored from version control independently.
