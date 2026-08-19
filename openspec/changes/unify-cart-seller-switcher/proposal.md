# Leave the cart with one seller-cart switcher

## Why

The product owner opened the cart with carts from two sellers, switched the
active cart, saw a second block appear underneath, and asked what it was for.
The block is not a bug in isolation — it is a duplicate. `CartSwitcher` already
renders a `role="tablist"` in which every seller sub-cart appears with its seller
name, its item count and its total. `CollapsedSellerCart` then rendered each
_inactive_ cart a second time as a summary row repeating those same three facts
plus a full-width "switch to the cart from …" button. Two controls offering the
same action, one of them nameless in the layout, is why the second block read as
a mystery.

Two smaller defects were visible in that same row and disappear with it:

- The row paired `<dt>{cart.itemCount}</dt>` with
  `<dd>{cart.itemCountValue}</dd>`, so the bare term "товаров" sat beside the
  value "Товаров: 2". `agritech.marketplace.cart.itemCountValue` is a whole
  sentence and is only correct as a standalone caption, which is how the tab
  strip uses it. `cartTotal` was paired the same way.
- The swap button repeated the seller name that was already the row's heading —
  `agritech.marketplace.cart.switchTo` is "Перейти в корзину продавца
  {{seller}}" — producing a button half the screen wide.

This is specified behavior, not an implementation slip:
`REQ-AGRITECH-EXPERIENCE-026` said every inactive sub-cart "collapses to a
labelled count-and-total row with one swap control". Removing the duplication
therefore requires changing the requirement.

## What Changes

- Keep exactly one switching affordance on the cart route: the existing tab
  strip. It is compact, horizontally scrollable, keyboard operable, and already
  carries each cart's seller, verified seal, item count and total.
- Move the one fact that lived only in the collapsed row — the seller's region —
  into that cart's tab caption, beside the item count, so nothing is lost.
- Delete `CollapsedSellerCart` and its props type. The cart body now renders the
  active sub-cart only; inactive carts are reachable from their tab.
- Remove the `<dt>`/`<dd>` label doubling with the row that held it. The two
  surviving uses of `itemCountValue` are standalone captions (the tab strip and
  the order summary), where the full sentence is correct, and are unchanged.
- Modify `REQ-AGRITECH-EXPERIENCE-026`: the cart-route paragraph, the cart
  invariant, and the scenario "Active seller sub-cart is switched and checked out
  alone" now describe one switcher instead of an expanded-plus-collapsed
  arrangement, and forbid a bare label paired with a value that spells the same
  term out.
- Update the mapped per-seller cart evidence to assert the tab strip rather than
  the collapsed rows, keeping switching and checkout scoping coverage intact.

Not changed: no API, persistence, authorization, contract, or cart state machine
behavior. Grouping, versioned active-cart storage, quantity updates and
checkout scoping are untouched.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `agritech-marketplace`

## Impact

Owned by `user-app`. Two files carry the change:
`apps/frontend/app/src/pages/marketplace/ui/marketplace-commerce.tsx` (the
`MarketplaceCart` region only) and
`apps/frontend/app/src/pages/marketplace/ui/marketplace-seller-carts.spec.tsx`.

`agritech.marketplace.cart.switchTo`, `agritech.marketplace.cart.itemCount` and
`agritech.marketplace.cart.cartTotal` become unused by the product. They are
deliberately **left in place** in all four locale catalogs and in the
`TranslationKey` union: the union file
`libs/common/i18n/keys/lib/src/index.ts` has concurrent uncommitted edits from
another change, and removing keys from it now would collide. Translation drift
stays zero because no key is added or removed on either side. Removing the three
keys is queued as follow-up work once the union file is quiet.

The stylesheet delta is a pure deletion of the
`.dh-cart-group--collapsed` / `.dh-cart-collapsed__*` rules in
`apps/frontend/app/src/pages/marketplace/ui/marketplace.css`. That file is owned
by a concurrent change, so the delta is handed to its owner rather than applied
here; until it is applied the removed rules are dead but harmless, because no
element carries those classes any more.

`REQ-AGRITECH-MARKETPLACE-016` was inspected and is deliberately left
unmodified: it owns the server-side one-cart-per-seller rule, not the cart
route's presentation. The version 3 evidence sidecar already maps
`marketplace-seller-carts.spec.tsx` to `REQ-AGRITECH-EXPERIENCE-026`, so
ownership, risk, disposition and evidence stay valid unchanged.

The delta in `specs/agritech-marketplace/spec.md` carries the requirement's
complete current text so the modified wording can be read in place. Only the
cart-route paragraph, the cart invariant, and the cart switching scenario belong
to this change.

## Rollout

Presentation only, one immutable `user-app` revision. No flag, migration, or
configuration accompanies it.

## Rollback

Redeploy the previous `user-app` revision. The cart's server state, the
versioned active-cart storage key and its payload shape are unchanged, so a
rollback needs no data step and a buyer's stored selection keeps working in both
directions.

## Risk

- Information-loss risk: the collapsed row was the only place an inactive cart's
  region appeared. Mitigated by moving the region into that cart's tab caption
  and asserting it there.
- Accessibility-regression risk: the tabs own the roving tabIndex,
  Arrow/Home/End keys, `aria-selected`, `aria-controls` and the polite
  announcement, and the single-seller case must still drop the tablist without a
  dangling `aria-labelledby`. Mitigated by keeping every existing keyboard,
  announcement and single-seller assertion and adding a both-directions
  switching case.
- Discoverability risk: a buyer might not notice the strip is the switcher.
  Mitigated by the switcher hint that already sits under it
  (`agritech.marketplace.cart.switcherHint`) and by every tab carrying its own
  total, which the collapsed row was previously needed for.
