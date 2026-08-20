## Participants and Owners

- Product/domain owner: `agritech-maintainers`, acting on the product owner's
  direct report that he could not place an order and that the message explaining
  why was incomprehensible.
- Specification author: `agritech-maintainers`.
- User-web owner: `user-app`.
- Persistence owner: `@app/backend-postgres-main-agritech`.
- Localization owner: `@app/frontend-feature-user-i18n` and the `TranslationKey`
  union, both currently held by a concurrent change; this change adds no key and
  reuses existing ones.
- Cart-route presentation owner: the concurrent change that owns
  `apps/frontend/app/src/pages/marketplace/ui/marketplace-commerce.tsx`.
- Independent verification reviewer: `quality-engineering`.

## Actors and Outcomes

- A guest assembles a cart, signs in as a verified buyer with an approved buyer
  organization, and finds the same lines in his server carts, at the same
  quantities, ready to check out. No preview cart remains on the route.
- The same buyer reloads mid-adoption and still sees each line once. The replayed
  command returns the cart it already created.
- A guest who is not signed in reads, at the checkout control and before pressing
  it, that the cart is on this device and that signing in is the next step. He
  presses it, is told the same thing, is told nothing was ordered, and lands on
  sign-in with the cart as his return address.
- A signed-in but unverified buyer is told to complete verification, not to sign
  in, and is taken to verification.
- A verified buyer with no approved buyer organization is told an approved buyer
  organization is required and is taken to the account route.
- A buyer whose stored quantity exceeds current stock is told once that the
  action conflicts with the current state; the line stays in the preview and the
  cart's checkout control retries it.
- A buyer adds a produce listing from the farmer-owned co-operative to his cart
  and reaches a draft contract, instead of an unexplained server error.

## Rules

- A preview cart is browser-local while, and only while, the actor cannot
  transact. It is promoted the moment the actor can.
- Promotion goes through the authenticated add-to-cart command. No client-side
  cart is ever written to the database directly, and no guest mutation precedes
  authentication.
- Promotion is idempotent. The replay identity is derived from the acting
  organization, the listing publication, and the quantity — never generated —
  and an accepted line is removed from browser storage.
- Server-side rules are the authority on the promoted result: the seller comes
  from the listing publication, one open cart exists per buyer and seller, and
  price and availability are revalidated at the command.
- A rejected line is not lost, not silently dropped, and not retried on every
  data refresh. It is reported once and stays retryable from the cart.
- A boundary is stated where the decision is made. The checkout control names the
  single missing step before it is used.
- A message about a preview cart never describes it as an order that exists.
- The persisted party-coherence invariant accepts exactly the verification roles
  the authorization layer accepts for that side, never fewer.

## Counterexamples

- Promoting the preview cart by writing to the cart table, or by any path other
  than the authenticated command, is forbidden — the server must derive the
  seller and revalidate the terms.
- Generating a fresh `Idempotency-Key` per attempt is forbidden: it converts a
  reload into a second add and doubles the quantity.
- Clearing the whole local store after a partially successful pass is forbidden:
  a rejected line would be silently discarded.
- Running adoption for a signed-out or unverified actor is forbidden even though
  it would "fix" the dead end, because
  `REQ-AGRITECH-EXPERIENCE-026` makes the preview explicitly local for exactly
  those actors.
- Telling an already signed-in user to sign in is forbidden.
- Relaxing the persisted buying-side role, or the membership, organization-kind,
  organization-approval, or verification-status requirements, is out of scope and
  forbidden here. Only the selling-side role set moves, and only to the set the
  authorization layer already enforces.
- Suppressing the produce failure by making those listings non-transactional in
  the public projection is rejected: it would remove a third of the published
  catalog from commerce and contradict the seeded ownership, whose own comment
  states that owning the produce co-operative is what makes the farmer login a
  seller.

## Boundaries

- The preview store caps at 100 lines and 999 per line, so one adoption pass
  issues at most 100 commands.
- Zero stored lines: adoption is a no-op and issues nothing.
- Exactly one authorization step missing: the control names that one step, not a
  list.
- A stored line whose listing left the catalog, or whose quantity now exceeds
  stock, is rejected by the server and retained locally.
- A second browser tab holding the same store: the `storage` event already
  re-reads the store, and the derived key makes a concurrent duplicate command a
  replay rather than a second add.

## Authorization

- Adoption requires `data.auth === 'signed-in'`, a verified verification whose
  role can buy, and an approved buyer organization. The acting organization id is
  read from the persisted partner list, never from a form field.
- The endpoint re-checks all of it server-side; the client condition only avoids
  a request that would be refused.
- The relaxed persisted predicate still requires, on the selling side, an active
  `seller` membership, an approved `supplier` organization, and a verified
  verification whose role is `seller` or `farmer`.

## Concurrency And Idempotency

- One adoption pass at a time, guarded in a ref, so a re-render during an
  in-flight command cannot start a second pass.
- Lines are promoted sequentially on purpose: two lines from one seller resolve
  to one open cart, and issuing them together would contend for that cart's
  advisory lock instead of merging into it.
- Attempted keys are remembered for the mounted session, so a stale render cannot
  re-issue a command whose release has not yet been committed.
- The derived key makes a reload, a second tab, and a retry all replays of the
  same command.

## Failure And Observability

- A rejected line produces one localized message from the existing status mapping
  (401 sign-in, 403 verification, 404 unavailable, 409 conflict) and leaves the
  line in place.
- A pre-fix produce add-to-cart produced an untyped HTTP 500 with no
  `problemType`; after the fix the same command either succeeds or returns a
  typed problem.

## Rollout And Rollback

- The migration is `create or replace function`: no trigger is dropped, no table
  is rewritten, and it is safe to apply ahead of the frontend.
- `down()` restores the seller-only predicate the same way.
- Rolling back the frontend leaves preview carts un-promoted but never corrupted,
  because a line is released only after the server accepted it.

## Unresolved Questions

- None blocking. One item is handed to the concurrent reviewer-access change:
  its new copy `agritech.marketplace.demo.purpose.farmer` asserts that the farmer
  role "cannot be a buyer or seller party in a marketplace deal", which
  contradicts `marketplaceSellerRoles`, the `agritech.marketplace.access.*`
  role copy that invites a farmer to verify as a seller, and the seeded
  ownership. It should be reworded to describe the demo identity's purpose rather
  than a capability.
- `agritech.marketplace.demo.checkoutDone` is now orphaned. Removing it needs the
  four locale catalogs and the `TranslationKey` union in one revision, and that
  union is held by a concurrent change; the removal is deferred, not forgotten.
