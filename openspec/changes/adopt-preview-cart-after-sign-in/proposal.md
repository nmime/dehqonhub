# Let the assembled cart survive signing in, and say why it cannot check out yet

## Why

The product owner filled a cart, pressed checkout, and read
"Заказ собран в этом браузере. Войдите в аккаунт, чтобы подписать договор."
His words: "why can't I place an order? the error is incomprehensible."

Two independent defects sit behind that sentence.

**The cart was orphaned.** A cart assembled before sign-in lives in
`dehqonhub.marketplace.guest-cart.v1` and its ids carry a `guest-cart:` prefix.
`checkout` short-circuits on that prefix, because a local id addresses no server
cart. The store is versioned browser storage, so it outlives authentication, and
the cart route merges it with the buyer's real carts. A visitor who assembled a
cart as a guest and then signed in therefore kept a cart that was permanently
un-checkoutable: the checkout control stayed enabled and could only ever answer
with a notice. The same trap caught a _signed-in_ buyer, because `addToCart`
routes to the local store whenever the actor is not yet a verified buyer with an
approved buyer organization — so the notice told an already-signed-in user to
sign in. No adoption, merge, or claim path existed on either side.

**The notice was a dead end.** It reads like an error, describes internal state
("assembled in this browser"), implies an order exists ("Order assembled"), and
offers nothing to act on. The one honest fact it carries — that nothing was
ordered — is the one a buyer cannot extract from it.

While verifying that authenticated checkout works end to end, a third and larger
defect surfaced: `POST /marketplace/cart/items` answered **HTTP 500** for every
produce listing in the seeded catalog — 6 of 19 published listings.
`assert_marketplace_resolved_commerce_parties` accepted only a `seller`
verification on the selling side, while `marketplaceSellerRoles` — the single
policy behind `canOfferInMarketplace` and behind the repository's own
`lockAuthorizedMarketplaceParty` seller branch — has always been
`['farmer', 'seller']`. The produce co-operative is owned by the farmer login on
purpose, so every produce add-to-cart passed every application check and then
raised `23514` inside the transaction. A stricter persisted rule than the
authorization layer enforces cannot fail closed politely: it fails as an
unexpected server error, which
`REQ-AGRITECH-MARKETPLACE-016` already forbids.

## What Changes

- The database catches up to the domain policy. A new migration replaces
  `assert_marketplace_resolved_commerce_parties` so the selling side accepts
  `seller` or `farmer`, exactly the roles `marketplaceSellerRoles` authorizes and
  the repository already locks. Membership capability, organization kind,
  organization approval, verification status, and the whole buying side are
  unchanged.
- A preview cart no longer outlives the actor's authority to transact. Once the
  signed-in actor is a verified buyer with an approved buyer organization, every
  stored preview line is promoted through the same
  `POST /marketplace/cart/items` the catalog uses. The server derives the seller,
  keeps one open cart per buyer and seller, and revalidates price and stock.
  Nothing runs while signed out or unverified.
- That promotion is idempotent by construction. Each line's `Idempotency-Key` is
  derived from the acting organization, the listing publication, and the quantity
  instead of generated, so a reload between an accepted request and the local
  release replays the same command and returns the original cart. An accepted
  line is released from browser storage immediately, which makes the pass a no-op
  on every later render.
- A rejected line stays local, is reported once instead of retried on every data
  refresh, and stays retryable — the cart's checkout control now re-attempts
  adoption for an authorized buyer rather than showing a notice.
- The dead-end toast is replaced by the same sentence the checkout control
  already shows inline, naming the one step still missing: sign in, verification,
  or an approved buyer organization. It never claims an order exists. Sign-in
  reached from the cart now carries `returnUrl=/cart`, from the toast and from
  the inline entry alike, so the buyer lands back on the assembled cart.
- Modify `REQ-AGRITECH-EXPERIENCE-026`: the preview cart paragraph gains the
  adoption contract, its idempotency and fail-closed rules, and the requirement
  that the boundary is stated at the checkout control before it is used.
- Modify `REQ-AGRITECH-MARKETPLACE-016`: a new invariant fixes the accepted
  verification roles on each side of the persisted party-coherence rule and says
  that a persisted rule stricter than the authorization layer is a defect.

Not changed: who may transact. `marketplaceSellerRoles` and
`marketplaceBuyerRoles` are untouched, no guest gains a server mutation, and the
guest-local boundary in `REQ-AGRITECH-EXPERIENCE-026` is preserved — adoption
begins only after the actor is authorized.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `agritech-marketplace`: `REQ-AGRITECH-EXPERIENCE-026` and
  `REQ-AGRITECH-MARKETPLACE-016`.

## Risk

- **Product**: an authorized buyer's first cart read after sign-in now issues one
  add-to-cart per stored preview line. Bounded by the store's own 100-line and
  999-quantity caps, and skipped entirely for an empty store.
- **Security**: none added. Promotion runs only for a signed-in, verified buyer
  holding an approved buyer organization, and it goes through the authenticated
  endpoint with its existing guards, tenancy, and idempotency. The relaxed
  persisted role predicate still requires an active `seller` membership on an
  approved `supplier` organization plus a verified verification.
- **Compatibility**: the migration is a `create or replace function`, so the three
  constraint triggers stay bound and no table is rewritten. Existing carts,
  offers, and contracts are untouched.
- **Operational**: the derived idempotency key is the only defence against a
  double-add if the browser dies between an accepted request and the local
  release; the component and unit evidence assert exactly that replay.

## Rollout

Ship the migration and the user-web revision together. The migration is
additive-in-place and safe to apply before the new frontend is served: it only
widens an accepted role set.

## Rollback

`down()` restores the seller-only predicate with another
`create or replace function`, dropping no trigger and no function. Rolling back
the frontend alone leaves preview carts un-promoted but not corrupted, because
adoption only ever removes a line the server has already accepted.
