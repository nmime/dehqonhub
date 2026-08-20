# Design decisions

## Why the database moved and not the authorization layer

Three authorities disagreed about whether a farmer may be the selling party:

| Authority                                                   | Selling-side role |
| ----------------------------------------------------------- | ----------------- |
| `marketplaceSellerRoles` / `canOfferInMarketplace` (shared) | `farmer`,`seller` |
| `lockAuthorizedMarketplaceParty` seller branch (repository) | `farmer`,`seller` |
| `assert_marketplace_resolved_commerce_parties` (persisted)  | `seller`          |

The seeded catalog settles the intent: `catalogSupplierOwners` assigns the
produce co-operative to the farmer login, and its comment says that owning it
"is what makes it a seller as well as a buyer". The `agritech.marketplace.access`
copy says the same to users — "Verify as a seller or farmer to continue". The
persisted rule is the single outlier, and being the strictest layer it could not
fail politely: the command cleared every check above it and then raised `23514`
inside the transaction, surfacing as an untyped HTTP 500 on 6 of 19 published
listings.

Tightening the repository to match the database was considered and rejected. It
removes a third of the published catalog from commerce, contradicts the seeded
ownership, and contradicts the role copy — a worse product outcome reached by
making the error message nicer. Widening the persisted role set to exactly the
authorized set removes the crash without granting anything the authorization
layer did not already grant.

`create or replace function` was chosen over drop-and-recreate so the three
constraint triggers on carts, offers, and contracts stay bound, and so `down()`
is symmetrical.

## Why adoption lives in the page and not in a new endpoint

A dedicated "adopt cart" endpoint would have to accept a client-authored list of
listings and quantities and then do exactly what `POST /marketplace/cart/items`
already does: derive the seller, partition by seller, revalidate stock, and
enforce one open cart per buyer and seller. It would duplicate that logic and add
a second, weaker path into the cart aggregate. Replaying the existing command
once per line reuses the guards, the tenancy, the advisory lock, the unique
partial index, and the idempotency receipt as they are, and adds no API surface.

## Why the idempotency key is derived, not generated

`runMutation` retains a generated key per command identity in a ref, which is
correct for a user-initiated action inside one page lifetime. Adoption has to
survive the page lifetime: the dangerous window is between the server accepting a
line and the browser releasing it locally. A key derived from
`buyerPartnerId`, `listingPublicationId`, and `quantity` makes the next mount's
attempt an exact replay, so the server returns the original cart instead of adding
the quantity again. Including the quantity is deliberate — the server rejects
same-key changed input, so a key that ignored quantity would turn an edited line
into a 409 instead of a fresh add.

## Why attempted keys are remembered per mount

Releasing a line is a state update, so a render can still hold the pre-release
line list. Remembering attempted keys stops that stale render from re-issuing a
command whose release has not yet been committed, and stops a permanently
rejected line from being retried on every data refresh. The set lives in a ref
per mount, so a real reload retries — which is safe, because the derived key makes
the retry a replay.

## Why the checkout control retries instead of explaining

For an actor who cannot transact, the honest answer is the missing step. For an
authorized buyer whose adoption was rejected, the honest answer is to try again —
so the control clears the rejected keys and re-attempts, and the server's own
message explains any second failure. There is no state in which the control
answers with a description of internal storage.

## Message reuse instead of new keys

The `TranslationKey` union is held by a concurrent change, so this change adds no
key. `agritech.marketplace.access.{signIn,verify,buyerRole,organization}` already
name the four barriers and are already what the control shows inline, so the toast
and the inline hint now say the same sentence.
`agritech.marketplace.cart.addedToSellerCart` names the seller from the server's
own cart response. Two keys would have read better and are recorded as follow-up
rather than invented here: a promotion confirmation that says a locally assembled
cart is now on the account, and a preview-checkout notice that says explicitly
that nothing was ordered.

## Windows-only environment defects met on the way

Neither is caused or fixed by this change; both are recorded so the next agent
does not re-diagnose them:

- `libs/backend/postgres/main/agritech/lib/vitest.component.config.mts` (and the
  same pattern in many other configs) resolves an alias with
  `new URL(..., import.meta.url).pathname`, which percent-encodes a non-ASCII
  repository path and makes the alias unresolvable. `workspaceTsconfigAliases()`
  already supplies that alias correctly with `fileURLToPath`.
- `hasDockerRuntime()` probes `spawnSync('docker', ['version'])` without a shell,
  which does not resolve `docker.exe` on Windows, so Docker-backed component
  evidence reports Docker as absent unless `CI=true` is set.
