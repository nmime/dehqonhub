# Verification

## REQ-AGRITECH-EXPERIENCE-026

- Risk: high journey.
- Projects: `user-app`, `@app/frontend-feature-user-i18n`.
- Cucumber: not applicable, unchanged from the requirement's standing
  disposition. The modified clauses are renderer-owned control identity, ARIA
  tabs semantics and label composition. A Gherkin restatement would have to name
  a tablist, a tab caption and a `<dt>`/`<dd>` pair, which the acceptance project
  must not do; component evidence falsifies them directly.
- Evidence:
  - `apps/frontend/app/src/pages/marketplace/ui/marketplace-seller-carts.spec.tsx`
    (already mapped for this requirement) proves that a two-seller cart renders
    one tablist with two tabs, exactly one tabpanel labelled by the active tab,
    the inactive cart's seller, region, item count and total inside its own tab,
    exactly one `.dh-cart-group` in the document, no non-tab button named for the
    inactive seller, and neither `agritech.marketplace.cart.itemCount` nor
    `agritech.marketplace.cart.cartTotal` rendered as a bare label. It also proves
    switching in both directions from that one strip with the other cart's lines
    leaving the document each time and the polite announcement naming each
    seller, the ArrowLeft/ArrowRight/Home/End and roving-tabIndex behavior, the
    versioned-storage round trip and its malformed/other-version fallbacks,
    deterministic reactivation after the active cart loses its last line, the
    single-seller degradation with no tablist and no tabpanel, quantity updates
    addressing the active cart id only, and checkout submitting exactly one
    seller's cart.
  - `apps/frontend/app/src/pages/marketplace/ui/marketplace-components.spec.tsx`
    proves the same tab-driven switch and single-cart checkout through the
    component's own props, independently of the seller-cart suite's fixtures.
  - `apps/backend/user/user-app-api/contracts/openapi/user-app-api.json` shows
    `region` as a required member of `MarketplaceSafePartyDto`, which
    `CartViewDto.seller` references. The region now rendered in each tab is
    therefore always present in the authoritative cart projection and can never
    become a placeholder value.
  - `apps/frontend/app/e2e/marketplace-authenticated.e2e-spec.ts` carries the
    browser-level cart-route coverage for this requirement. It holds no
    collapsed-row assertion, so it needed no edit for this change.

## Independent review

Review must challenge whether any path still offers a second switch control for
an inactive cart, whether the seller region became unreadable for a cart the
buyer has not activated, whether any `<dt>`/`<dd>` pair anywhere in the cart
still pairs a bare label with a value that repeats the term, whether the roving
tabIndex and Arrow/Home/End behavior is genuinely unchanged rather than merely
still asserted, whether the single-seller case leaves an `aria-labelledby`
pointing at a tab that does not render, and whether the switching or
checkout-scoping assertions were weakened anywhere to accommodate the removal.

## Working-tree evidence

- `user-app:typecheck` passed (`tsc --noEmit -p tsconfig.app.json`).
- `user-app:lint` passed (`eslint .`).
- The user-app unit suite ran 238 tests in 28 files, all passing — the same
  238/238 as before this change. The rewritten cases replace collapsed-row
  assertions with tab-strip assertions inside the existing 13-test per-seller
  cart file; no case was added or removed.
- `prettier --check` passed for
  `apps/frontend/app/src/pages/marketplace/ui/marketplace-commerce.tsx`,
  `apps/frontend/app/src/pages/marketplace/ui/marketplace-seller-carts.spec.tsx`,
  `openspec/specs/agritech-marketplace/spec.md`, and every file in this change
  directory.
- Translation drift is zero. All four locale catalogs held 1775 keys before and
  after; no key was added or removed. `switchTo`, `itemCount` and `cartTotal`
  remain present in all four locales and in the `TranslationKey` union, so no key
  is present in some locales and missing in others.
- Strict OpenSpec validation passed for this change
  (`validate unify-cart-seller-switcher --type change --strict --no-interactive`)
  and for the whole repository (`validate --all --strict --no-interactive`,
  15 of 15 items).
- `spec validate` reported `status: ok` with 0 errors and 0 warnings: 116 of 116
  projects covered, 624 of 624 behavior tests traced, 84 requirements each with a
  Cucumber disposition. It runs with `--skip-openspec` on this Windows host,
  because its OpenSpec step spawns a bare `pnpm` with a replaced environment and
  fails with `ENOENT`; the OpenSpec commands above were run directly instead.
- The running Vite dev server serves the edited module from
  `http://[::1]:4201/src/pages/marketplace/ui/marketplace-commerce.tsx` with zero
  occurrences of `CollapsedSellerCart` and `sellerCart.region` present in the tab
  markup, so the transform reflects the change.
- The live stand was reachable (`user-app-api` and `auth-app-api` health both
  200), but no cart was seeded through the API. Playwright browser binaries are
  not installed on this host, so a real multi-seller cart could not be observed in
  a browser; seeding rows would have left state behind without producing
  evidence a renderer-only change needs. Stated plainly rather than implied.
- The user-app Playwright lane, the Storybook interaction suite and the fullstack
  runtime lane were not executed. Their files contain no collapsed-row assertion
  and were not edited.
- The collapsed-row stylesheet deletion was handed to the shared-CSS owner rather
  than applied, so those rules remain in `marketplace.css` as dead selectors that
  no element matches.

## Release boundary

This evidence belongs to a modified working tree and is not exact-SHA release
evidence. No commit, push, image publication, deployment, canary, or rollback
rehearsal is claimed.
