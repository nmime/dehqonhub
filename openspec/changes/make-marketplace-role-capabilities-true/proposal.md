# Make the marketplace role capability model true

## Why

The owner states the role model in three sentences:

- a **farmer** may buy everything and sell everything;
- a **buyer** may buy everything, and only buy;
- a **seller/supplier** may only sell, and buying is outside the role rather than
  a step it has not yet taken.

The domain policy has always agreed. `marketplaceBuyerRoles` is
`['farmer', 'buyer']`, `marketplaceSellerRoles` is `['farmer', 'seller']`, and
`canBuyInMarketplace` / `canOfferInMarketplace` are derived from them. Three
other layers did not.

- **The database.** Four constraint-trigger functions —
  `assert_marketplace_resolved_commerce_parties` (carts, offers, contracts),
  `assert_marketplace_resolved_request_party`,
  `assert_marketplace_listing_sample_coherence` and
  `assert_marketplace_listing_review_coherence` — demanded the buying party's
  verification role be exactly `buyer`. This is the same class of defect
  `Migration20260810140000AlignMarketplaceSellerPartyRole` repaired on the
  selling side, where it produced untyped HTTP 500s on every produce listing.
- **The repositories.** `lockAuthorizedMarketplaceParty` and its four siblings
  restated the accepted roles inline, one of them as
  `capability === 'buyer' ? 'buyer' : { $in: ['farmer', 'seller'] }`. Because the
  repository refused the farmer first, the buying side never reached its trigger
  and answered a plain `403` instead: a verified farmer with an active `buyer`
  membership on an approved `buyer` organization could not add a single item to a
  cart, could not create a purchase request, and could not read the sample
  allowance.
- **The wording.** Every blocked buying control offered "Open verification" as
  the remedy and navigated to `/verification`. For the one role that is genuinely
  blocked there — a verified seller — that is false twice over: the actor is
  already verified, and a settled verification role cannot be re-submitted, so
  the promised destination can only show the verification they already hold. The
  reviewer copy went further and called the farmer identity "dashboard only",
  which the same account contradicted by owning the co-operative that lists
  produce.

## What Changes

- **Migration `20260811110000AlignMarketplaceBuyerPartyRole`** replaces the four
  buying-side functions with `create or replace function`, widening only the
  accepted verification role to `('buyer', 'farmer')`. Organization kind,
  membership capability, approval state and verification status are untouched, no
  trigger is dropped or recreated, and `down()` restores the pre-migration
  predicate one function at a time.
- **One authority for the accepted roles.** A new
  `marketplace-role-predicates.ts` derives every repository filter and every
  hand-written SQL role list from `marketplaceBuyerRoles` /
  `marketplaceSellerRoles`. Five repositories stop restating them.
- **Two derived browser predicates**, `marketplaceRoleCanBuy` and
  `marketplaceRoleCanSell`, so the renderer decides capability in one place
  instead of at each control, and the sample-allowance read stops being withheld
  from a verified farmer.
- **Copy that distinguishes an open step from an absent capability** in all four
  locales: a missing verification or organization is still named with its next
  action, while a capability outside the role states which roles hold it and what
  the actor's own role does, and offers no next action at all.
- **Modify three requirements in place**, keeping their identifiers:
  `REQ-AGRITECH-MARKETPLACE-016` (the persisted invariant and the single role
  authority), `REQ-AGRITECH-ONBOARDING-023` (an open step versus an absent
  capability) and `REQ-AGRITECH-EXPERIENCE-026` (the reviewer identities' stated
  purpose).

## Impact

- Affected requirements: `REQ-AGRITECH-MARKETPLACE-016`,
  `REQ-AGRITECH-ONBOARDING-023`, `REQ-AGRITECH-EXPERIENCE-026`.
- Affected projects: `@app/backend-postgres-main-agritech`, `user-app`.
- No API contract, DTO or generated-client change. The buying commands already
  existed; they were refused.
- No new translation keys. Every string is a value rewrite inside an existing
  key, so `libs/common/i18n/keys/lib/src/index.ts` is untouched.
- Rollback is the migration's own `down()` plus reverting the repository
  predicates. The widened trigger accepts a strict superset of what it accepted
  before, so no persisted row becomes invalid in either direction.
