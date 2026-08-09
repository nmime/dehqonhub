## Participants and Owners

- Product/domain owner: `agritech-maintainers`; intent supplied by repository
  maintainer through the Russian business requirements and six unique reference
  surfaces.
- Specification author: `agritech-maintainers` implementation agent.
- Independent verification reviewer: `quality-engineering`; an independent
  review agent must audit the exact revision before merge.
- Security reviewer, when applicable: `security-maintainers`, for tenant,
  verification, cart, offer, contract, and AI boundaries.
- Operations reviewer, when applicable: `platform-operations`; no deployment or
  provider activation is part of this change.

## Actors and Outcomes

- A signed-out visitor can understand the marketplace and reach authentication;
  an authenticated but unverified user can discover and compare real tenant
  catalog records, save favorites, and understand which commercial action
  requires verification without seeing invented sellers, prices, counts, or
  guarantees.
- A verified farmer or buyer can keep separate carts per seller, request a
  sample within the persisted monthly allowance, create a purchase request,
  compare offers on their own request, and review a persisted draft contract.
- A verified farmer or supplier can discover another user's open purchase
  request and submit an attributable offer with price and delivery information.
- A contract party can review immutable commercial terms and sign only for
  their own party. Both parties can see the resulting state.
- A Russian-, Uzbek-, or English-speaking user receives the same semantic
  workflow, locale-aware values, and accessible recovery controls.
- An AI consultation user receives catalog-grounded recommendations and an
  explicit confirmation boundary; the assistant cannot silently mutate carts,
  contracts, samples, or orders.

## Rules

- `REQ-AGRITECH-MARKETPLACE-016` owns the cross-project DehqonHub transaction
  experience and the exact API/client behavior introduced by this change.
- DehqonHub browser routes remain rooted at `/`, `/catalog`, `/cart`,
  `/requests`, and their documented deep links. DehqonHub commerce APIs use the
  distinct `/marketplace/*` namespace, and every supported same-origin proxy
  routes that namespace to `user-app-api`; the bare `/marketplace` path is not a
  browser alias.
- The root marketplace has canonical deep links for home, catalog, product,
  favorites, carts, purchase requests, verification, account, and contracts.
  It does not render inside the generic mini-app product shell.
- Seeds, equipment, and agricultural produce are distinct catalog branches.
  Product categories map deterministically; a branch with no supported record
  renders an honest localized empty state rather than reclassifying a record by
  name or description.
- All catalog records come from tenant-scoped APIs. Product seller identity is
  server-owned and returned as a stable identifier; the client never supplies a
  seller display name as authority.
- Adding products from two sellers creates or updates two open carts. A cart
  contains records from exactly one server-derived seller.
- Tenant catalog browsing and favorites are available after authentication but
  before verification. Checkout, sample
  request, purchase-request creation, offer submission, offer selection,
  contract creation, and signing require the server to confirm verification and
  the actor's eligible role.
- Samples are free only with respect to the product sample itself. Copy states
  that delivery terms or cost are agreed separately. The persisted monthly
  limit is five; the UI never guesses allowance from local state.
- A user cannot bid on their own request. Only the request owner can select a
  pending offer. Selection atomically records the selected offer, declines the
  alternatives, and produces a persisted draft contract for explicit review;
  it does not pass through a seller cart.
- Catalog checkout also produces a persisted reviewable commercial record. It
  never returns or displays a random order identifier that has no database
  owner.
- A contract can be signed only by its buyer or seller. Signing records the
  actor-specific consent; the contract becomes active only after both parties
  have signed. Accepted offer or checkout terms do not mutate after generation.
- Factoring and platform payment are unavailable unless a configured provider
  and eligibility result are present. This change has neither, so the contract
  view exposes a disabled, explanatory state and never promises a partner bank,
  immediate supplier payment, a fixed term, legal guarantee, or service payment
  processing.
- OneID linking and document upload are external capabilities. The frontend
  shows current persisted verification state and role/document requirements,
  but does not set `oneIdLinked`, invent storage keys, or submit placeholder
  documents. An unavailable integration has a localized recovery/explanation
  state.
- AI responses are tenant-scoped and grounded in current active product IDs.
  Seasonal or agronomic advice is explicitly informational and must not claim
  certainty or invent a recommendation when no matching record exists. Any cart
  action remains a separate, seller-partitioned, confirmed user action.
- Every control is a semantic keyboard-operable element with a visible focus
  state. Notices use an appropriate live region; dialogs restore focus and can
  be dismissed; loading, empty, validation, denied, offline, unavailable,
  success, and retry states are localized.
- DehqonHub composition lives in the user app and uses repository semantic
  tokens in light and dark themes. It supports 320 px without horizontal
  overflow, Russian at 375 px, reduced motion, and WCAG AA contrast for normal
  action text.

## Examples

- A user adds seed `P1` from seller `S1`, then irrigation kit `P2` from seller
  `S2`; the API returns two carts and each checkout summary contains only its
  own seller's lines.
- A verified buyer publishes a request for ten tonnes of seed. A verified
  supplier submits an offer. When the buyer selects it, the UI opens the new
  draft contract and asks for explicit consent; it does not claim that payment
  or factoring has started.
- The Uzbek catalog contains no produce records. It displays the localized
  empty state and a purchase-request action; it does not reuse a seed product to
  make the branch appear populated.
- An AI response recommends product IDs `P1` and `P2` from current tenant data.
  The interface renders those real cards and asks the user to add each product;
  it never creates a mixed-seller cart on the user's behalf.

## Counterexamples and Boundaries

- A caller submits `sellerId: "Trusted Farm"` with an item owned by another
  supplier. The server ignores no authority from that field because the field
  does not exist; it derives the product supplier from tenant-scoped storage.
- A product ID from tenant `B` is used in a tenant `A` favorite, sample, review,
  or cart mutation. The operation returns a safe not-found response and creates
  no cross-tenant record.
- An unverified user changes client state to `verified` and calls checkout. The
  server denies the operation because persisted verification is authoritative.
- A seller signs a contract for which they are neither party, or the buyer
  submits the seller signature. The server denies it and leaves the contract
  unchanged.
- The UI receives `factoringEnabled: true` on a legacy record but no configured
  provider result. It describes financing as unavailable and does not infer a
  bank, fee, term, approval, or payout.
- The catalog, AI, or request endpoint is unavailable. Existing independently
  loaded sections remain usable where safe, and the failing section identifies
  the problem and retry action without fabricated fallback records.
- The supplied screenshots contain laptop framing, emoji product images, fixed
  prices, review counts, and legal/bank claims. Those elements are illustrative
  and are not product data or authorization.

## Failure and Operational Modes

- Public API failures remain RFC 9457 `application/problem+json` responses and
  do not expose internal exception messages. Generated client methods represent
  the actual success DTOs.
- A same-origin proxy that does not recognize `/marketplace/*` is a deployment
  validation failure because it would return the SPA document instead of the
  generated JSON contract.
- Concurrent cart mutations and offer selection use persisted owner/state
  checks; stale or already-selected operations fail with conflict/invalid-state
  semantics and the client reloads authoritative state.
- Catalog images may be missing or fail to load. The user app renders a neutral
  repository-owned placeholder with localized alternative text, not a product
  emoji or remote reference asset.
- A session can be absent while the root is rendered. Public discovery remains
  readable and authenticated subresources degrade independently instead of
  making the whole catalog fail.
- No provider, deployment, database cleanup, seed mutation, or credential
  change occurs. Rollback redeploys the prior API and generated client together;
  mixed old/new marketplace path revisions are unsupported. Expanded signing
  fields remain in place after marketplace traffic because schema contraction
  would be lossy.
- Exact-revision handoff requires regenerated OpenAPI/client artifacts, focused
  project tests, acceptance evidence, spec validation and impact verification,
  browser keyboard/accessibility checks, 320/375/desktop screenshots, and clean
  Git/remote parity.

## Assumptions

- `agritech-maintainers` accept DehqonHub as the user-facing marketplace brand;
  existing AgroUz strings are treated as fetched implementation drift.
- The reverse-auction decision is offer selection directly to explicit draft
  contract review. Catalog purchases retain seller-cart review before contract
  generation.
- The existing product domain's `supplierId` is the stable seller identity; its
  display name remains presentational.
- Current provider configuration contains no evidence of a live OneID upload,
  signing/PDF, bank, factoring, payment, or courier integration for this
  marketplace surface.

## Unresolved Questions

- None. External-provider activation and legal approval are separate future
  changes and remain visibly unavailable here rather than blocking this honest
  transaction backbone.
