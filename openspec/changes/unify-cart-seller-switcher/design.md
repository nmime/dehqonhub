# Design

## Context

`MarketplaceCart` in
`apps/frontend/app/src/pages/marketplace/ui/marketplace-commerce.tsx` mapped the
grouped seller carts to two different renderers:

- the active cart to `ActiveSellerCartPanel` (lines, delivery, checkout);
- every other cart to `CollapsedSellerCart`, an `<article>` with the seller name,
  the verified seal, the region, a `<dl>` of count and total, and a
  `dh-button--secondary` labelled `agritech.marketplace.cart.switchTo`.

Above both sat `CartSwitcher`, a `role="tablist"` whose every tab already showed
the seller name, the verified seal, the item count and the total. So the route
carried two complete switchers over the same set of carts, and the second one
appeared only after the buyer switched — which is exactly when the owner asked
what it was.

Constraints on the fix: `marketplace.css` and `libs/common/i18n/keys/lib/src/index.ts`
are held by concurrent changes, and the edits had to stay inside the
`MarketplaceCart` region of a file whose `MarketplaceAccount` region is being
edited at the same time.

## Goals / Non-Goals

Goals:

- One switching affordance on the cart route.
- No information lost when the collapsed rows go.
- No `<dt>`/`<dd>` pair left where the value already contains its own label.
- Accessibility behavior identical after the removal.

Non-Goals:

- Redesigning the tab strip. It already satisfies the design language: pill
  controls, 44 px minimum target, horizontal scroll, muted captions.
- Refactoring helpers that become single-use. `SellerSeal` is now used by
  `CartSwitcher` and `CartLines`; `formatMoney` and `locale` remain widely used.
  Nothing else is consolidated.
- Removing `.dh-cart-groups`. It keeps wrapping the active panel and renders
  identically to the pre-existing single-cart case, so it stays rather than
  perturbing a stylesheet this change may not edit.

## Decisions

**Keep the tablist, delete the collapsed row.** The alternative — keep the rows
and delete the tab strip — was rejected on three counts: the rows scale
vertically rather than horizontally, they lose the ARIA tabs semantics the
requirement's invariant already names, and they carry a full-sentence swap button
per cart. The strip is one line regardless of cart count.

**Move the region into the tab caption, not into the seller line.** The seller
line is a flex row whose name is ellipsized at `min-width: 0`; adding the region
there would compete for that space. The caption below it is already a muted
`<small>` styled by `.dh-cart-tabs small`, so the region joins the item count
there as `{region} · {itemCountValue}`. The middot separator is the separator this
renderer already uses (for example the offer card's
`{seller.displayName} · {seller.region}`), so it needs no new key and no new
rule. On a narrow viewport the caption wraps to a second line; the tab is a
`display: grid` button and all tabs stretch to the tallest, so the strip stays
even and keeps its 44 px minimum height.

**Render the active panel directly instead of mapping.** With the collapsed
branch gone, `sellerCarts.map(...)` had one possible output, so the map became a
single `<ActiveSellerCartPanel>` keyed by the active cart id. `sellerCarts` is
still needed for the tab strip, `cartIds`, and `hasSwitcher`; `select` is still
needed as the tabs' `onSelect`. Keeping `key={active.id}` preserves the previous
remount-on-switch behavior, so nothing about focus or the delivery radios
changes.

**Fix the label doubling by deletion, not by adding a key.** The only
`<dt>`/`<dd>` pair in the cart region was inside `CollapsedSellerCart`. Removing
that component removes the doubling, so no bare-number value key is needed and no
key is added to a union another change is holding. The two surviving
`itemCountValue` call sites — the tab caption and the order-summary scope line —
are standalone captions where the full sentence is the correct rendering, and
both are left alone.

**Leave the orphaned keys in place, deliberately.** `switchTo`, `itemCount` and
`cartTotal` are now unused. `git diff --stat` shows
`libs/common/i18n/keys/lib/src/index.ts` carrying 72 uncommitted added lines from
a concurrent change — including the `cartTotal` and `switchTo` entries — so
touching it now risks a collision, and removing a key from the locale catalogs
without the union (or vice versa) is itself invalid. All three keys therefore stay
in all four locales and in the union, translation drift stays zero, and the
removal is recorded as follow-up.

**Hand the stylesheet delta over rather than applying it.** The
`.dh-cart-group--collapsed` and `.dh-cart-collapsed__*` rules — including the
whole `@media (max-width: 56rem)` block that contains nothing else, and the
single collapsed rule inside the `48rem` block — are dead once the component is
gone. They are written up verbatim for the file's owner. Nothing needs adding.

## Risks / Trade-offs

- An inactive cart's region is now one line inside a tab rather than its own row →
  asserted directly in the mapped evidence, and the tab is the only place it needs
  to be readable from.
- A buyer used to the second block loses a large, obvious swap button → the strip
  keeps its `switcherHint` caption beneath it, and each tab still shows the total
  that made the collapsed row worth reading.
- Three unused translation keys remain in the catalogs → visible only to
  maintainers, recorded in the proposal and in this change's tasks, and drift
  validation stays green because presence is symmetric across locales.
- The dead CSS rules remain until the stylesheet owner applies the handoff → no
  element matches them, so the route already renders correctly.

## Migration Plan

None. Presentation-only, deployed as one immutable `user-app` revision.
Rollback is redeploying the previous revision; the versioned active-cart storage
key and payload are unchanged, so a stored selection keeps working in both
directions.

## Open Questions

None.
