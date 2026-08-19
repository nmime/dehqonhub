## 1. Specification

- [x] 1.1 Record the owner report: a second block appeared under the cart after switching sellers and could not be explained.
- [x] 1.2 Determine which requirement owns the clause: `REQ-AGRITECH-EXPERIENCE-026`, not `REQ-AGRITECH-MARKETPLACE-016`, which owns the server-side one-cart-per-seller rule rather than the route's presentation.
- [x] 1.3 Modify `REQ-AGRITECH-EXPERIENCE-026` in place, keeping the stable identifier: the cart-route paragraph, the cart invariant, and the scenario "Active seller sub-cart is switched and checked out alone".
- [x] 1.4 State in the invariant that switching is offered exactly once and that a count or total is never a bare label beside a value spelling the same term out, so the duplication is not reintroduced.
- [x] 1.5 Keep the version 3 evidence sidecar valid: `marketplace-seller-carts.spec.tsx` is already mapped to this requirement with `user-app:test`, so projects, risk, disposition and evidence stay unchanged.

## 2. Implementation

- [x] 2.1 Move the seller's region into that cart's tab caption beside the item count, before removing anything, so the one fact held only by the collapsed row is not lost.
- [x] 2.2 Delete `CollapsedSellerCart` and its `CollapsedSellerCartProps` type.
- [x] 2.3 Replace the two-branch `sellerCarts.map(...)` with the active panel alone, keyed by the active cart id.
- [x] 2.4 Confirm no import, prop, helper or type is orphaned: `SellerSeal` is still used by the tab strip and the cart heading, `formatMoney` and `locale` are still used throughout, `select` is still the tabs' `onSelect`, and `sellerCarts` still feeds the strip, `cartIds` and `hasSwitcher`.
- [x] 2.5 Remove the `<dt>`/`<dd>` label doubling with the row that held it, and leave the two standalone `itemCountValue` captions — the tab strip and the order summary — untouched.
- [x] 2.6 Refresh the region's comments so `MarketplaceCart`, `CartSwitcher` and `ActiveSellerCartPanel` describe one switcher.
- [ ] 2.7 Merge the collapsed-row stylesheet deletion into `apps/frontend/app/src/pages/marketplace/ui/marketplace.css`. Handed to the shared-CSS owner as a verbatim delete list; not applied by this change.
- [ ] 2.8 Remove `agritech.marketplace.cart.switchTo`, `agritech.marketplace.cart.itemCount` and `agritech.marketplace.cart.cartTotal` from all four locale catalogs and from the `TranslationKey` union in one revision. Deferred: `libs/common/i18n/keys/lib/src/index.ts` is being edited concurrently, and a key must never be present in some locales and absent in others.

## 3. Evidence

- [x] 3.1 Rewrite the mapped case that asserted the collapsed row so it asserts the tab strip instead: two tabs with their `aria-selected` states, one tabpanel labelled by the active tab, and the inactive cart's seller, region, count and total read from its own tab.
- [x] 3.2 Add the duplication regression guards to that case: exactly one `.dh-cart-group` in the document, no non-tab button named for the inactive seller, and neither `agritech.marketplace.cart.itemCount` nor `agritech.marketplace.cart.cartTotal` rendered as a bare label.
- [x] 3.3 Strengthen rather than weaken the switching case: switch both directions from the one strip, assert the other cart's lines leave the document each time, and assert the polite announcement for both sellers.
- [x] 3.4 Keep every existing keyboard, roving-tabIndex, versioned-storage, last-line, single-seller-degradation, quantity-scoping and checkout-scoping assertion unchanged.
- [x] 3.5 Grep `dh-cart-collapsed`, `dh-cart-group--collapsed`, `CollapsedSellerCart` and `switchTo` across `apps/**`, `libs/**`, `e2e`, Storybook and the docs, and confirm every remaining hit is either the stylesheet handoff or the deliberately retained translation key.
- [x] 3.6 Run the user-app unit suite, `user-app:typecheck`, `user-app:lint`, Prettier on every touched file, the translation key counts, and strict OpenSpec validation for this change and for the whole repository.
- [ ] 3.7 Run the user-app Playwright lane, the Storybook interaction suite and the fullstack runtime lane. Not executed in this environment; no cart-switcher assertion exists in those files.

## 4. Documentation and rollback

- [x] 4.1 Record in the durable requirement that the switcher is singular, so an expanded-plus-collapsed arrangement is not reintroduced as a "richer" cart.
- [x] 4.2 Record the three orphaned translation keys and their removal condition in the proposal, the design decisions and this task list.
- [ ] 4.3 Record the rollback rehearsal (redeploy the previous `user-app` revision and confirm a stored active-cart selection still resolves).

## 5. Release

- [ ] 5.1 Commit and push the exact revision with repository authorship.
- [ ] 5.2 Collect exact-SHA assurance and deploy the immutable `user-app` revision.
- [ ] 5.3 Confirm on the deployment that a multi-seller cart offers exactly one switcher and that a single-seller cart offers none.
