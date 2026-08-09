## Context

The current user root mounts a 1,100-line local-state marketplace inside the
generic `MiniAppShell`. It loads the catalog and every authenticated marketplace
resource as one request group, so one unavailable dependency hides the whole
product. Its header duplicates the generic shell; filters, favorites, purchase
request creation, product detail, and several verification controls are inert;
seller display names are used as cart authority; and static bank/legal copy
overstates unavailable integrations.

The backend already persists verifications, seller carts, samples, favorites,
reviews, purchase requests, offers, contracts, and AI consultations, but several
lookups omit the tenant, input DTOs trust caller-selected seller identity,
checkout returns an unpersisted random order ID, contract signing has one
undifferentiated timestamp, and generated success schemas do not match runtime
objects. `REQ-AGRITECH-MARKETPLACE-016` makes these boundaries one cross-project
contract.

The supplied references contribute the warm cream/green market character,
compact cards, pill controls, strong price hierarchy, verification seal, and
dense desktop composition. They do not authorize laptop framing, emojis,
third-party trade dress, external fonts, fake records, bank terms, or legal
claims. Repository semantic tokens, generated clients, i18n, tenant ownership,
and exact-revision evidence remain authoritative.

## Goals / Non-Goals

**Goals:**

- Make the repository root and marketplace deep links one route-driven,
  localized DehqonHub experience without duplicate product chrome.
- Make server-derived tenant, product seller, verification, approved
  organization membership, request owner, offer author, and contract party
  state authoritative for every mutation.
- Turn both cart checkout and offer selection into persisted draft-contract
  review, followed by actor-specific two-party consent.
- Let independently loaded UI resources degrade and recover independently.
- Deliver a product-scoped, responsive, accessible visual system in light and
  dark themes and bind it to domain, contract, acceptance, and browser evidence.

**Non-Goals:**

- Activating OneID, file storage, PDF/e-signature, bank, factoring, payment,
  courier, deployment, or production-data integrations.
- Replacing the existing admin/mobile products or unrelated user routes.
- Inventing public catalog tenancy for signed-out users. A visitor sees the
  product entry and authentication path; authenticated context owns tenant data.
- Importing a component registry entry or new runtime dependency when existing
  repository primitives and semantic HTML are sufficient.

## Decisions

### 1. Server derives authority and persists the transaction boundary

`ProductViewDto` exposes the existing stable `supplierId`. `AddToCartDto` carries
only `productId` and `quantity`; `RequestSampleDto` carries only `productId`.
Repository product reads include `tenantId`, and the server derives seller ID.
Favorites, reviews, samples, carts, and AI use the same tenant predicate.

Checkout accepts explicit delivery terms. Pickup freezes a zero delivery charge;
seller delivery creates a draft with a visibly pending charge that only the
verified, approved contract seller can quote once before either party consents;
the quote endpoint rejects accepted-offer contracts because the offer already
froze its seller-authored charge. Delivery by agreement remains explicitly
unpriced. The server rejects consent while a seller-delivery quote is pending.
In one repository transaction checkout
locks/validates the open cart and its tenant products, computes the server total,
snapshots line/product terms, marks the cart ordered, and creates a draft
contract. It returns `{ cartId, contractId }`, not an unpersisted order ID.

An offer carries the seller's delivery choice and, for seller delivery, a
required positive delivery quote. Offer selection likewise validates request
ownership and offer state, accepts one offer, declines its pending siblings,
marks the request selected, snapshots the accepted product and delivery terms,
creates one draft contract, and returns its contract ID in one transaction. A
unique source link prevents duplicate contract creation.

Alternative considered: keep the current caller-supplied seller IDs and random
checkout IDs. Rejected because display names and random values have no ownership
or persistence proof and permit cross-seller/cross-tenant corruption.

### 2. Contracts record each party's consent

Contracts gain nullable `buyerSignedAt` and `sellerSignedAt` fields plus a
source type/ID and JSON terms snapshot when required to preserve the accepted
cart or offer facts. The signing operation derives the actor from the session,
sets only that party's field, leaves the status awaiting the other party after
the first consent, and advances to active after both exist. For cart-backed
contracts, the second consent locks every frozen product and decrements stock in
the same transaction; a losing concurrent signer records no second consent and
reloads authoritative state. Existing `signedAt` is retained only if required
for safe migration/legacy read compatibility and is not used as new
authorization evidence.

A forward-compatible MikroORM migration adds nullable columns and the source
uniqueness boundary. Pre-upgrade draft, signed, and active rows lack trustworthy
source and per-party consent evidence, so the migration preserves their prior
status, signing time, and financing flag in audit fields, forces live financing
off, and moves them to non-signable `legacy_review_required`. It also normalizes
legacy AI and verification-rejection values and deduplicates reviews before
adding bounded checks and one-review-per-buyer/product uniqueness. Its down path
removes the new metadata only after code rollback and is safe before marketplace
traffic; once expanded fields contain business evidence, application rollback
retains the expanded schema because contraction would discard frozen terms,
provenance, and party-specific consent timestamps.

Alternative considered: preserve the single `signedAt`. Rejected because it
cannot establish which party consented or prevent one actor from completing
both sides.

### 3. Public API schemas match runtime values, then clients regenerate once

Dedicated DTOs describe favorite mutation results, checkout/offer-selection
contract references, and actor-specific contract state. Arbitrary public
contract-party input is removed or constrained to a server-owned source; API
errors use repository RFC 9457 exceptions rather than Nest's message-bearing
exception class. OpenAPI is generated from source and the user client is
regenerated once after the backend slice stabilizes.

DehqonHub commerce controllers use `/marketplace/*`. Browser deep links keep
their product paths (`/catalog`, `/cart`, `/requests`, and the other canonical
routes), so using root-level commerce API paths would make same-origin nginx
return the SPA document for JSON requests. Docker and Helm frontend proxies
therefore route `/marketplace/*` directly to `user-app-api`, while the bare
`/marketplace` path is not a product alias. This is a coordinated breaking API
change with regenerated clients and no compatibility rewrite.

Alternative considered: cast mismatched generated methods in the frontend.
Rejected because it preserves a false public contract and hides regressions
from typecheck and client consumers.

Alternative considered: negotiate `/catalog` between the SPA and API by the
`Accept` header. Rejected because it leaves browser/API ownership ambiguous,
varies by proxy topology, and already returned `index.html` in the assembled
same-origin runtime.

### 4. Marketplace navigation is route-driven, not hidden component state

TanStack routes own `/`, `/catalog`, `/products/$productId`, `/favorites`,
`/cart`, `/requests`, `/verification`, `/account`, and
`/contracts/$contractId`. Marketplace paths bypass the generic `MiniAppShell`
but retain the existing provider and router context. Other user routes keep the
current shell unchanged. One marketplace layout supplies the product header,
category navigation, preferences, notices, main landmark, AI panel, mobile
navigation, and footer.

Route components share a marketplace data/model layer. Navigation uses the
existing typed user navigation boundary; modals are reserved for short confirmed
mutations such as sample requests and offer forms, while product/contract states
remain addressable pages.

Alternative considered: retain a `view` union inside one root component.
Rejected because refresh, browser history, deep links, focus restoration, and
test ownership remain ambiguous.

### 5. Data loads and mutations are granular

Catalog is the primary authenticated resource. Verification, carts, favorites,
requests, contracts, samples, and usage load independently with explicit
`idle/loading/ready/empty/error` state. A failure in one resource does not coerce
it to an authoritative empty array or hide independently available catalog data.
Mutations expose pending/disabled state, map typed problem outcomes to localized
notices, refresh only their affected resources, and preserve safe form input.

Product category mapping is explicit: `seed` maps to Seeds;
`equipment`/`irrigation` map to Equipment; no product enum is guessed as Produce.
Produce renders records only when a supported real contract is available;
otherwise its localized empty state offers the purchase-request journey.

Alternative considered: load everything in `Promise.all` and catch authenticated
resources as `undefined`. Rejected because it conflates unauthorized,
unavailable, and genuinely empty states.

### 6. Unconfigured providers are first-class unavailable states

The verification page reads persisted status and documents but does not fake
OneID linking, file upload, or storage keys. With no trusted ingestion provider,
the public placeholder-evidence submission route is absent; existing status and
admin review remain readable. Contract review never turns `factoringEnabled`
into a live bank promise; it shows payment/financing as unavailable without a
configured provider result. PDF/signature controls are not rendered as working
unless a corresponding contract exists.

Alternative considered: keep the reference's 90-day partner-bank and hardcoded
verification success path. Rejected because the business requirements explicitly
leave those integrations unresolved and fabricated success is a security and
legal defect.

### 7. AI is a grounded consultation, not an autonomous commerce agent

The backend queries active products with the authenticated tenant and returns
only product IDs it actually considered. It persists only `catalog_match` or
`no_catalog_match`; seasonal advice fails closed instead of storing unsupported
agronomy. The UI localizes cautious informational copy from that semantic result,
renders returned IDs against the already-loaded catalog, labels informational
limits, makes prompts semantic buttons, provides close/focus/loading/retry
behavior, and never mutates commerce state from the response.

Alternative considered: let the AI “build a starter cart.” Rejected because the
reference crosses seller-cart boundaries and lacks user confirmation.

### 8. Reviews and rejection reasons have durable provenance

A review is accepted only from the authenticated buyer of an active or
completed contract whose frozen lines contain the product. A transaction-scoped
lock plus a database unique constraint permits one review per tenant, buyer, and
product; duplicate legacy reviews are reduced deterministically before the
constraint is added. Verification rejection stores one supported semantic code,
not display-language prose, and every locale maps the code to equivalent copy.

Alternative considered: allow any verified buyer to review any active product
and persist administrator-entered prose. Rejected because it enables rating spam
and leaks one operator language into other locales.

### 9. Product styling is scoped and token-backed

The legacy `:root` AgroUz variables and product classes remain stable in
`@app/frontend-ui-web` for the existing legacy route, but DehqonHub neither
reuses nor expands that layer. Its composition lives in the user app stylesheet
under `.dh-marketplace`, mapping warm cream, deep accessible green, white cards,
status tints, radii, spacing, typography, focus rings, and shadows to existing
`--xr-*` semantics with scoped light/dark overrides. No Google Font request is
added. Repository-owned inline SVG line icons and neutral image placeholders
replace emoji; real API images use safe `img` fallbacks.

Desktop uses the reference's dense 1320 px marketplace rhythm. At tablet and
mobile, filters become a disclosure/sheet, grids collapse, the header reflows,
touch targets remain at least 44 px, and a compact mobile nav replaces overflow.
Motion respects `prefers-reduced-motion`.

Alternative considered: build DehqonHub by extending the shared global product
CSS and exact reference palette/font. Rejected because it would further pollute
all apps, lacks dark parity, fails normal-text contrast, and relies on
undocumented third-party typography.

### 10. Localized copy and evidence are generated from owned sources

All visible and accessible copy is added in English, Russian, and Uzbek with
typed keys regenerated/validated through repository i18n tooling. Prices, dates,
units, and counts use the active locale. Legal guarantees, “no middlemen,” fixed
review times, free delivery, bank factoring, and platform-payment claims are
removed or replaced with precise unavailable/informational language.

Focused evidence includes domain/service/persistence tests, generated-contract
builds, marketplace component tests, root routing tests, Cucumber acceptance for
tenant/cart/verification/offer/contract invariants, and Playwright keyboard,
dialog, locale, 320/375/desktop, dark-theme, and overflow checks. Every test
uses only requirements that own its Nx project.

## Risks / Trade-offs

- **[Cross-module transaction complexity]** → Keep cart checkout and offer
  selection inside one PostgreSQL repository transaction and test rollback,
  stale state, and duplicate source behavior.
- **[Migration on newly fetched marketplace tables]** → Add compatible source,
  line-snapshot, delivery, consent, audit, check, and uniqueness schema;
  quarantine unprovable legacy contracts without destroying their prior state,
  verify populated forward/down behavior, and treat contraction as pre-traffic
  only.
- **[Route expansion breaks legacy root assumptions]** → Keep non-marketplace
  routes and the generic shell unchanged; update root/back/history tests and add
  direct-deep-link coverage.
- **[Authenticated subresource failures dominate the page]** → Use granular
  state and expose an explicit signed-out entry rather than inventing public
  tenant selection.
- **[Large user bundle remains expensive]** → Route/lazy-load marketplace
  sections where the router supports it and record build size; bundle splitting
  is secondary to correctness in this change.
- **[Reference fidelity conflicts with accessibility]** → Preserve composition
  and character while using darker action green, semantic icons, local fonts,
  visible focus, reflow, and reduced motion.
- **[Incomplete external integrations feel less “finished”]** → Make unavailable
  states intentional and useful; do not trade honesty for a fake happy path.

## Migration Plan

1. Add the nullable contract consent/source/snapshot schema and repository
   behavior with focused migration, tenant, authorization, and transaction tests.
2. Correct HTTP DTOs and product seller identity; generate OpenAPI and the user
   client once the backend contract passes.
3. Introduce the route-driven marketplace layout/model, granular resource states,
   real forms and confirmations, and scoped DehqonHub styling/i18n.
4. Keep the legacy shared product CSS stable, isolate DehqonHub in the user app,
   and repair stale root/Storybook tests.
5. Add acceptance and browser evidence, synchronize the durable requirement
   sidecar, and run exact-revision spec impact/verify plus proportional Nx gates.
6. Publish a focused topic branch and pull request. No deployment is performed.

Rollback is a normal code revert while retaining the expanded schema. The
migration down path may follow only before marketplace traffic and after the old
code is restored; once new metadata is written, schema contraction is lossy and
must not be used as the application rollback mechanism.

## Open Questions

None. Provider activation, produce purchase unification, and legal approval are
future changes; this implementation renders their absent state honestly.
