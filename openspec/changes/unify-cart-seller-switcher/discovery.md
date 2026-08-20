## Participants and Owners

- Product/domain owner: `agritech-maintainers`, acting on the product owner's
  direct report that the block appearing under a switched cart was unexplainable.
- Specification author: `agritech-maintainers`.
- User-web owner: `user-app`.
- Shared-stylesheet owner: the concurrent change that owns
  `apps/frontend/app/src/pages/marketplace/ui/marketplace.css`.
- Localization owner: `@app/frontend-feature-user-i18n` and the `TranslationKey`
  union, both currently held by a concurrent change.
- Independent verification reviewer: `quality-engineering`.

## Actors and Outcomes

- A buyer holding carts from several sellers sees one compact strip naming every
  cart, and picks the cart to work on from it. Nothing else on the route offers
  that action.
- The same buyer reads each cart's seller, verified seal, region, item count and
  total from that cart's own tab, without activating it.
- A keyboard-only buyer reaches the strip once, moves through it with
  ArrowLeft/ArrowRight/Home/End, and hears the newly active cart announced.
- A screen-reader user encounters one tablist, one tabpanel, and no second
  set of "switch to the cart from …" buttons duplicating the tabs.
- A buyer with exactly one seller cart sees no strip at all and still reads that
  seller's name on the cart heading.
- A buyer switching carts never sees a count or total presented as a bare label
  next to a value that repeats the same term.

## Rules

- The cart route offers switching between seller sub-carts exactly once.
- Every seller sub-cart appears in that one control, whether active or not, and
  carries its own seller name, verified seal when the listing projection reports
  it, region, item count and total.
- Only the active sub-cart renders line items, the delivery choice and the
  checkout action.
- A fact that would otherwise disappear with a removed control moves into the
  surviving control before the removal, not after it.
- A `<dt>`/`<dd>` pair carries a bare label and a bare value.
  `agritech.marketplace.cart.itemCountValue` is a complete sentence and is valid
  only as a standalone caption.
- Switching is still a tablist, not a radiogroup: it swaps which panel is shown
  rather than submitting a value.
- Roving tabIndex, ArrowLeft/ArrowRight/Home/End, `aria-selected`,
  `aria-controls`, and the polite active-cart announcement all survive the
  removal unchanged.
- One seller drops the tablist entirely; the active panel then labels itself from
  the cart heading and leaves no `aria-labelledby` pointing at an absent tab.
- Quantity and checkout still address the active sub-cart's cart id only.
- A key that becomes unused is removed from all four locales and the union
  together, or from none of them. It is never present in some locales and absent
  in others.

## Examples

- Two carts, `Zarafshon Agro` in Samarqand and `AgroSem Trade` in Jizzax: the
  strip holds two tabs, the first is selected, one tabpanel exists, and the
  inactive tab reads its seller, `Jizzax`, its 3-item count and its
  `UZS 6,000,000` total.
- The buyer clicks the `AgroSem Trade` tab: the panel swaps to that cart's lines,
  the corn-seed line from the other cart is gone from the document, and the live
  region announces the new active cart. Clicking the first tab returns.
- `ArrowRight` from the first tab, then `Home`, then `End`, then `ArrowLeft`:
  selection follows the key each time; `Enter` leaves it alone.
- One cart only: no tablist, no tabpanel, no switcher hint, and the seller's name
  is the level-2 heading of the cart.
- A quantity step on the active cart calls the update with that cart's id and no
  other.

## Counterexamples and Boundaries

- Rendering an inactive cart as a summary row below the strip, repeating its
  seller, count and total with its own swap button, is the defect this change
  removes — it is invalid even though every fact in it was accurate.
- Deleting the collapsed row without first moving the seller's region into the
  tab is invalid: an inactive cart's region would become unreadable.
- Pairing `agritech.marketplace.cart.itemCount` ("товаров") with
  `agritech.marketplace.cart.itemCountValue` ("Товаров: 2") is invalid; so is
  "fixing" it by shortening `itemCountValue`, because the tab strip and the order
  summary both need the full sentence.
- A switch control whose label repeats the seller name already shown as that
  row's heading is invalid: it produces a button half the screen wide and says
  nothing new.
- Keeping the tablist for a single seller is invalid, and so is leaving the panel
  pointing at a tab id that no longer renders.
- Removing `switchTo` from the four locale catalogs while leaving it in the
  `TranslationKey` union — or the reverse — is invalid.
- Weakening the switching or checkout-scoping assertions to make the removal
  pass is invalid; those are the requirement's load-bearing behaviors.

## Failure and Operational Modes

- A cart whose listing left the authoritative projection or sold out keeps its
  own flag and stays excluded from its cart total, unchanged by this change.
- A stored active-cart selection that is malformed, from another version, or
  points at a cart that no longer exists still resolves to the first remaining
  cart, and an empty cart route still clears the key.
- Loading, error and local-preview cart states are untouched.
- Until the stylesheet owner applies the handed-off deletion, the
  `.dh-cart-group--collapsed` / `.dh-cart-collapsed__*` rules remain in
  `marketplace.css` as dead selectors. No element carries those classes, so the
  rendered route is already correct.

## Assumptions

- The tab strip stays horizontally scrollable, so adding the region to a tab
  caption costs vertical space in the tab, never horizontal room on the route.
- The four supported locales stay English, Russian, Uzbek Latin and Uzbek
  Cyrillic, and a middot separator between region and count is acceptable in all
  four — it is already the separator used elsewhere in this renderer.
- `libs/common/i18n/keys/lib/src/index.ts` remains held by a concurrent change
  for the duration of this one.

## Unresolved Questions

- None blocking. One deferred item: `agritech.marketplace.cart.switchTo`,
  `agritech.marketplace.cart.itemCount` and `agritech.marketplace.cart.cartTotal`
  are now unused and must be removed from all four locale catalogs and the
  `TranslationKey` union in one revision, once the union file is no longer being
  edited concurrently.
