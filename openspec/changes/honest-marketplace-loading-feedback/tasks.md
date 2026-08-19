## 1. Specification

- [x] 1.1 Record the defect as specified behaviour rather than a bug: the requirement asked for a non-blank loading state and never for the shape or the height of the content it replaces.
- [x] 1.2 Determine which requirement owns the clause: `REQ-AGRITECH-EXPERIENCE-026`, which already owns control states and the purchase-request loading clause.
- [x] 1.3 Modify `REQ-AGRITECH-EXPERIENCE-026` in place, keeping the stable identifier: one behaviour paragraph, two invariants, one failure-behaviour bullet, one scenario.
- [x] 1.4 Keep the version 3 evidence sidecar valid: the new component suite joins the already-mapped `user-app` evidence for this requirement.

## 2. Implementation

- [x] 2.1 Add `marketplace-loading.tsx`: the skeleton primitives, the `.dh-skeleton-grid` container with its content shapes, the spinner, `MarketplaceBusyButton`, `MarketplaceLoadingStatus`, `MarketplaceLoadingRegion`, `useDeferredBusy` and `usePrefersReducedMotion`.
- [x] 2.2 Reimplement `MarketplaceSkeleton` on the kit, keeping its exported name, its `count` prop and its default so the renderers that import it are unaffected, and add the optional `shape` prop.
- [x] 2.3 Add `MarketplaceProductDetailSkeleton` and `MarketplaceSellerProfileSkeleton` in `marketplace-discovery.tsx`, `MarketplaceGallerySkeleton` in `marketplace-gallery.tsx`, and `MarketplaceProductSpecsSkeleton` in `marketplace-product-specs.tsx`, so each route skeleton is owned by the component whose geometry it copies.
- [x] 2.4 Give the seller route, the seller catalog section and favourites a persistent loading region that announces loading and then completion.
- [x] 2.5 Load reviews as plain white rows instead of catalog tiles.
- [x] 2.6 Load every management list, publication receipt, promotion detail and sample list as rows or definition-list rows, each with its own persistent status.
- [x] 2.7 Give the AI panel a pending block: the typing row plus a placeholder in the assistant bubble the answer will fill, behind the anti-flicker gate.
- [x] 2.8 Convert every in-flight control in the owned files to `MarketplaceBusyButton`: add to cart, request a sample, submit a review, reply to a review, report a review, publish a product listing, publish a produce listing, publish a purchase request, activate a promotion, advance a sample, confirm a starter cart, send an AI question.
- [x] 2.9 Track the starter-cart confirmation by consultation id, so an unrelated in-flight question no longer marks the confirm control as working.
- [ ] 2.10 Merge the loading stylesheet handoff into `apps/frontend/app/src/pages/marketplace/ui/marketplace.css`. Handed to the shared-CSS owner; not applied by this change.
- [ ] 2.11 Apply the ready-to-apply patch plan for `marketplace-commerce.tsx`, `marketplace-page.tsx` and `marketplace-product-card.tsx`. Those files are owned by concurrent work; the plan is delivered, not applied.

## 3. Evidence

- [x] 3.1 Add `marketplace-loading.spec.tsx`: every primitive renders and is `aria-hidden`, every container is `aria-busy` and not hidden, the shapes compose at the requested length, the spinner is decorative in both sizes.
- [x] 3.2 Cover the content shapes: the shared skeleton's row, definition-list and stat shapes; the product route's frame, strip, two spec groups and buy action; the gallery and spec blocks; the seller hero above its catalog grid.
- [x] 3.3 Cover the announcements: a settled region says nothing, a busy region announces loading, and the same element announces the region by name as ready.
- [x] 3.4 Cover the busy control: `aria-busy`, the reserved slot, the glyph-to-spinner swap, the unchanged accessible name, the announcement, and that a second click while busy does not reach the handler.
- [x] 3.5 Cover the anti-flicker policy with fake timers: no placeholder for work inside 120 ms, a placeholder held to its 320 ms minimum, an immediate drop once the minimum is past, a synchronous pass-through when the policy is disabled with no timer scheduled.
- [x] 3.6 Cover the reduced-motion path: the motionless placeholder is held to 480 ms, and the standard 320 ms applies when reduced motion is not requested.
- [x] 3.7 Run the user-app unit suite, typecheck, lint, Prettier on the touched files, the locale-catalog drift check, and strict OpenSpec validation.
- [ ] 3.8 Run the user-app Playwright lane, the Storybook interaction suite and the fullstack runtime lane. Not executed in this environment.

## 4. Documentation and rollback

- [x] 4.1 State the shape, the accessibility contract and the anti-flicker policy in the durable requirement, so a future renderer cannot reintroduce one generic tile for every region.
- [x] 4.2 Record the geometry source of every skeleton number in the stylesheet handoff, so the boxes can be re-derived without measuring a screenshot.
- [ ] 4.3 Rehearse the rollback: reverting the renderer files restores the single-tile skeleton, and the stylesheet replacements are independently revertible.

## 5. Release

- [ ] 5.1 Commit and push the exact revision with repository authorship.
- [ ] 5.2 Collect exact-SHA assurance evidence.
- [ ] 5.3 Confirm on a deployment that a throttled catalog, product and management route each show their own shape and that a throttled action shows its control working.
