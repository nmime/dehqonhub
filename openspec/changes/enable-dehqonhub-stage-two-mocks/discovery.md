## Participants and Owners

- Product owner: `agritech-maintainers`.
- API/domain owner: `@app/backend-feature-agritech-main` and `user-app-api`.
- Persistence owner: `@app/backend-postgres-main-agritech`.
- Provider owner: AgriTech provider ports with explicit mock/live/disabled modes.
- Product UI owner: `user-app` and the scoped user i18n project.
- Independent reviewers: `quality-engineering`, `security-maintainers`, and
  `platform-operations`.

## Actors and Outcomes

- A guest can browse published products, public seller profiles, and public
  purchase requests without an account and without receiving private tenant
  fields.
- An authenticated but unverified user retains the same public reads but cannot
  create or mutate commercial state.
- An approved supplier or farmer can publish products, submit offers, manage
  samples and promotions, sign as the seller, and inspect persisted dashboard
  metrics for organizations they belong to.
- An approved farmer or buyer can create seller-partitioned carts and requests,
  choose offers, sign as the buyer, select payment terms, request samples, and
  review only completed deals.
- An administrator reviews real persisted verification, moderation, dispute,
  promotion, and audit records; external identity/storage evidence may carry
  explicit mock provenance.
- A provider operator can replace a mock adapter with a live adapter without
  changing marketplace domain authority or stored state-machine semantics.

## Rules

- `uz` remains Uzbek Latin. `uz-cyrl` is a separate canonical Uzbek Cyrillic
  locale and must negotiate before the `uz` base fallback.
- Anonymous public reads use dedicated repository methods and DTOs. They select
  only published active products and public requests from approved,
  non-suspended organizations, never accept a tenant selector, and never return
  tenant IDs, owner user IDs, legal identifiers, verification documents, private
  matching, carts, contracts, payments, or analytics.
- A published product remains owned by its seller organization and tenant. A
  buyer cart or request remains owned by the buyer tenant. Cross-organization
  references are permitted only through published opaque listing/request IDs;
  every mutation resolves and locks the authoritative row server-side.
- User cart, buyer-request, offer, and contract responses expose opaque
  marketplace identifiers and safe commerce fields only. Where counterparty
  identity is needed, they use caller relationship and allowlisted party display
  snapshots. Internal tenant, user, partner, and source-row identifiers remain
  persistence details.
- Every commercial write requires an authenticated user, approved marketplace
  verification, an approved organization membership for the acting role, and
  party authorization. Caller-supplied tenant, seller, buyer, counterparty,
  totals, verification, provider outcome, or signature authority is ignored or
  rejected.
- Idempotent commands require an opaque idempotency key scoped to tenant, actor,
  operation, and route resource. Reusing a key with a different canonical input
  is a conflict; retrying the same input returns the original result.
- Verification create/resume, submit, delivery-quote update, and administrator
  verification decision require an integer expected revision; creation binds
  revision zero and later commands bind the current aggregate revision.
  Concurrent stale or opposite transitions change nothing.
- Multi-row state changes run in one transaction with the required pessimistic
  lock or compare-and-set. Every accepted transition writes an audit/timeline
  event and notification intent in the same transaction.
- External providers have `disabled`, `mock`, and `live` modes. Mock mode is
  explicit, deterministic, allowed only in development, test, or staging, makes
  no network request, consumes no production credential, persists
  `providerMode: mock`, and is rejected when the server runtime is production.
- OneID mock results use generated non-real subjects and masked synthetic legal
  identifiers; duplicate verification constraints still apply. Document mock
  storage persists metadata, checksum, immutable object reference, and audit
  provenance without treating browser file names as authority.
- Contract PDFs are generated from the immutable contract snapshot. Mock-storage
  artifacts are persisted, checksummed, downloadable, and permanently marked
  `MOCK PROVIDER — NOT A LEGAL CONTRACT`.
- Qualified-signing mock results are party-specific, bind the contract artifact
  checksum and snapshot revision, and are idempotent. One party can never sign
  for the other; both signatures are required before fulfillment.
- Direct-payment and factoring records are persisted state machines. Mock bank
  events obey the same authenticated command/webhook idempotency, ordering,
  reconciliation, and contract-party rules as live events but never move money.
- Promotions have a visible `Ad` label, bounded period/plan, and affect catalog
  ranking only. They do not affect matching, public request ordering, offers, or
  AI relevance.
- AI responses may reference only published, in-stock products visible to the
  requester. Starter-cart creation is a separate confirmed idempotent command
  that revalidates stock and atomically creates one cart per seller.
- Reviews require a completed contract line for the product and are unique per
  buyer/product. This deliberately tightens the previous active-or-completed
  rule to match the newly approved Stage 1+2 source.
- GitHub workflow deletion removes hosted execution only. Required local or
  trusted-runner gates and exact-SHA evidence remain fail-closed.
- The responsive user web app owns every public and authenticated user journey,
  including bounded recent seller publication status, promotions, notifications,
  engagement, disputes, artifact download, and AI history. Administrator SPA and
  native mobile presentation are not part of this change.

## Examples

- A guest searches public corn seed listings across approved suppliers. The
  response contains public product/seller fields and promotion disclosure but no
  tenant or owner identity.
- A verified buyer adds a published product owned by another organization. The
  server derives the seller, locks the product, stores the cart under the buyer
  tenant, and later creates a contract containing both party organizations and
  tenants without granting either tenant arbitrary access to the other.
- A mock OneID callback persists a synthetic provider subject and `mock`
  provenance. A real administrator still decides the verification case; the
  provider mock does not grant approval by itself.
- Repeating verification create/submit, delivery-quote update, administrator
  verification decision, checkout, signature, payment event, promotion purchase,
  or AI-cart command with the same key and canonical input returns the original
  resource. Reusing the key with changed input or a stale expected revision
  returns conflict.
- A buyer and seller sign the same frozen mock-provider PDF from separate
  authenticated sessions. The contract advances only after both party-specific
  signatures bind the same artifact checksum.

## Counterexamples and Boundaries

- Removing `tenantId` predicates from the existing private catalog repository is
  not a public catalog implementation. Anonymous reads must use the dedicated
  projection query.
- Browser local storage, fixture records, a guard bypass, caller-selected roles,
  caller-supplied provider outcomes, or a parallel sandbox marketplace are not
  acceptable implementations of commercial behavior.
- A mock OneID result cannot approve verification; a mock bank result cannot
  directly change a contract; a mock signature cannot sign both parties.
- An authenticated buyer cannot query a seller tenant's private catalog,
  documents, dashboard, or contract list merely because one published product
  is visible.
- A promoted listing cannot rank higher in request matching or AI grounding.
- A mock-provider flag in a production runtime is a startup error, not a
  fallback or warning.
- Backend administrator-decision evidence does not prove an administrator user
  interface, and a 320 px responsive browser view does not prove an Expo,
  Android, or iOS application.

## Failure and Operational Modes

- Provider disabled/unavailable returns a typed recoverable problem and preserves
  the prior state. It never auto-selects mock mode.
- Invalid provider callbacks, stale versions, duplicate event IDs, reordered
  bank events, and changed-input idempotency reuse fail without partial state.
- Concurrent offer selection accepts one winner and creates one contract;
  concurrent final signing commits inventory at most once.
- A public projection failure returns an explicit unavailable state; it never
  falls back to private or fabricated records.
- Mock artifact generation/storage failure leaves the contract reviewable and
  unsigned, with retry using the same idempotency key.
- No deployment, live provider activation, credential change, money movement, or
  production data mutation is part of this change.

## Assumptions

- Four language choices are intended: English, Russian, Uzbek Latin, and Uzbek
  Cyrillic.
- External provider contract details are not yet supplied, so the initial
  adapters are explicit non-production mocks behind stable ports.
- Current DehqonHub visual and responsive rules remain authoritative.
- Commit authorship, commit count, and authored dates are delivery-history
  choices outside the observable product requirements in this change.

## Unresolved Questions

- Live provider-specific payloads, webhooks, legal signature qualification,
  bank pricing/scoring, and production document retention require later vendor
  and legal approval. Their domain-facing ports and persisted provenance are in
  scope now; live adapters are not.
