# Design

## Context

Two facts about the shipped app had drifted away from
`REQ-AGRITECH-EXPERIENCE-026`: the brand mark and the palette. A third, the
repeated per-card eligibility hint, is a product-owner correction. All three are
presentation-only and live inside the `user-app` marketplace owners.

## Goals

- Put the maintainer's transparent emblem in the header and footer without a
  plate, without a redundant accessible name, and without shipping a 512 px
  download for a 44 px box.
- Make the requirement state the single light palette the product actually
  ships.
- Delete the repeated per-card eligibility copy while keeping the reason
  discoverable for every user, including screen-reader users.

## Non-goals

- No return of the dark theme and no dark-theme styling.
- No change to the product detail panel's own restriction block, which is a
  single instance on a single route rather than a per-card repetition.
- No change to authorization, the preview-cart boundary, or any API contract.

## Decisions

### The mark is one image element that carries `dh-brand__mark`

`MarketplaceBrandMark` renders the emblem directly instead of wrapping it, so
there is no plate element to style and no second node to keep in sync. The
element keeps the `dh-brand__mark` class, which is why the evidence selectors
move from `svg.dh-brand__mark` and `.dh-brand__mark img` to
`img.dh-brand__mark`.

The source set offers `dehqonhub-emblem-96.png` at `96w` and the
`dehqonhub-emblem.png` master at `512w` with `sizes="3rem"`. At 1x and 2x the
browser takes the 96 px file for both the 2.75rem header mark and the 3rem footer
mark; denser screens can still reach the master. An empty alternative text keeps
the image presentational because the lockup button already carries the localized
brand name.

### The lockup, not the artwork, owns the tap target

The 44 px minimum belongs to the interactive element, so `.dh-brand` gains a
`min-height` and `min-width` of 2.75rem. The header mark is also set to 2.75rem
so the artwork resolves at that size, which keeps the runtime assertion on
`.dh-header .dh-brand__mark` meaningful instead of measuring a box smaller than
the control around it.

### One notice replaces one hint per card

`MarketplaceProductCard` keeps `aria-describedby` on its add action and points it
at a visually hidden description holding the demo or eligibility reason. The
reason therefore stays bound to the control it qualifies, which is stronger than
the previous free-floating block, while nothing visible repeats.

The visible half moves up one level. `MarketplaceCatalogAccessNotice` renders
once above the catalog or home content for a signed-in actor whose catalog read
succeeded and who cannot yet transact, reusing the existing `.dh-state-inline`
treatment. Signed-out visitors are deliberately excluded: the header sign-in
entry, the preview-cart confirmation, and the cart route already state that
boundary, and a permanent sign-in banner would rebuild the noise this change
removes.

`transactionActionLabel` and `onTransactionAction` are gone from the card's prop
contract, together with the five discovery grid pass-throughs that fed them
(home shelves, catalog, similar products, seller profile, favorites). The product
detail panel keeps its own copies: it renders one restriction block on one route,
which is not the per-card repetition this change removes. The card keeps
`transactionHint`, which is what the accessible description says.

### The add label is plain in every eligibility state

The product owner instructed directly that the restricted button read plainly
"add to cart" and nothing else. The long preview-cart wording wrapped onto two
lines inside the card button, and a shorter distinct wording would still spend
the button on a boundary the buyer meets three other times: the add confirmation
names this browser's preview cart, the cart route states that the preview stays
on the device until sign-in and verification, and the new catalog notice names
the eligibility reason. `agritech.marketplace.product.addToPreviewCart` therefore
holds the same value as `agritech.marketplace.product.addToCart` in all four
locales. The separate key is kept rather than collapsed at the call sites so the
restricted path stays addressable if the owner ever wants it worded again; that
redundancy is deliberate, not an oversight.

## Alternatives considered

- **Drop `aria-describedby` entirely.** Rejected: the add action stays enabled
  for restricted actors, so without a description nothing on the control explains
  what the resulting cart is.
- **Show the eligibility notice to signed-out visitors too.** Rejected: it
  reproduces the copy the owner removed, on the busiest route, for the largest
  audience.
- **Give the restricted action its own short wording.** Rejected by the product
  owner, who asked for the plain label. The boundary is carried by the add
  confirmation, the cart route, and the catalog notice instead.
