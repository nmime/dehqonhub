# Verification

## REQ-AGRITECH-EXPERIENCE-026

- Risk: high journey and disclosure.
- Projects: `user-app`, `@app/frontend-feature-user-i18n`.
- Cucumber: not applicable, unchanged from the requirement's standing
  disposition. The modified clauses are renderer-owned layout, deep-link
  resolution, series selection, accessible-equivalent structure and state
  handling, which component evidence falsifies directly. Restating them in
  Gherkin would name a rail button, a table caption and a CSS class, which the
  acceptance project must not do.
- Evidence:
  - `apps/frontend/app/src/pages/marketplace/ui/marketplace-cabinet.spec.tsx`
    (new, to be mapped) proves that every section resolves from its own path and
    that an unknown segment falls back to the overview; that the rail lists all
    six sections as native buttons, marks the current one with
    `aria-current="page"` and navigates by deep link; that the chart's plot is
    `aria-hidden` while a captioned value table carries the same figures,
    screen-reader-only beside the overview and visible with totals in the finance
    section; that a buyer-scoped dashboard gets a spend column and no revenue
    column and a seller-scoped one the reverse; that a six-month window with
    nothing completed states so while still listing all six months; that deals
    separate on `actorParty` and each side names its counterparty; that an owned
    request carries its status, moderation state and offer count; that the
    publication queue has distinct loading, empty, error-with-retry and ready
    states; that verification state, level, identity link and sample history stay
    reachable; that a `none` verification status renders the not-started copy
    rather than a raw key; and that a failed dashboard read is reported instead of
    shown as a zero.
  - `apps/frontend/app/src/pages/marketplace/ui/marketplace-components.spec.tsx`
    (already mapped) now proves that each section owns its own failure and retry,
    that the overview stat region and recent deals open a contract, that the
    buying section lists the buyer contract and the seller section refuses it, and
    that the account section lists sample history.
  - `apps/frontend/app/src/pages/marketplace/ui/marketplace-page.spec.tsx`
    (already mapped) proves that the fail-closed publishing controls are reached
    through the publications section's own address.
  - `packages/tooling/src/commands/db/marketplace-seed-contracts.test.ts` (new)
    proves the demo fixture satisfies every contract constraint the database
    enforces, keeps its rows inside the aggregated window, never dates a row in
    the future, and keeps stable ids across re-seeds.

## Independent review

Review must challenge whether any figure on any panel comes from something other
than a member the generated client returned; whether the chart can ever draw a
series for a scope the dashboard did not report; whether a sparse window is
distinguishable from a failed read; whether the buyer/seller split can be
satisfied by anything other than `actorParty`; whether every capability that was
on the old account view is still reachable; whether the rail is operable by
keyboard alone and announces the current section; and whether the demo fixture
asserts any provenance the database cannot corroborate.

## Live-stand evidence

Both figures below were read from the running stand after re-seeding, not from
the SQL that wrote them.

- `GET /marketplace/dashboard` as `xaridor@demo.dehqonhub.uz`: `role: buyer`,
  `buyer.openPurchaseRequests: 3`, `buyer.openCarts: 0`, `buyer.activeDeals: 3`,
  `buyer.completedDeals: 9`, `buyer.completedSpendUzs: 123465000`, and six
  `monthlyActivity` buckets `2026-03` … `2026-08` with `purchaseSpendUzs`
  25930000, 7680000, 41880000, 40480000, 4600000, 2895000.
- `GET /marketplace/dashboard` as `sotuvchi@demo.dehqonhub.uz`: `role: seller`,
  `seller.activeListings: 13`, `seller.pendingOffers: 1`,
  `seller.offerConversionBps: 3333`, `seller.completedRevenueUzs: 123465000`, the
  same six buckets as `salesRevenueUzs`, and five `topListings`.
- `GET /marketplace/contracts` returns 13 items for each login, every one stamped
  with that login's own `actorParty`.
- `GET /marketplace/requests/mine` returns the three owned requests with
  `publicationStatus: published` and `moderationStatus: approved`.
- `GET /marketplace/publications/mine` returns 13 listing publications and 0
  request publications for the seller login.

## Working-tree evidence

- `user-app:typecheck`, `@app/frontend-feature-user-i18n:typecheck` and
  `packages/tooling/tsconfig.json` typecheck passed.
- `lint` passed for `user-app`, `@app/frontend-feature-user-i18n`,
  `@app/common-i18n-keys` and `@repo/tooling`.
- The user-app unit suite ran 249 tests in 29 files, all passing — 238 in 28
  files before this change, plus the eleven new cabinet cases.
- The demo-fixture suite ran 10 tests, all passing.
- Translation drift is zero and the new catalog holds 54 keys over 56 non-empty
  lines in each of the four locales, inside the 60-key and 90-line limits.
- Strict OpenSpec validation passed for this change and for the whole repository.
  `spec:validate` runs with `--skip-openspec` on this Windows host because its
  OpenSpec step cannot spawn `pnpm` with a replaced environment.
- `tooling:static-check` fails on two pre-existing cases unrelated to this change
  — `closure-otel-install.test.ts` cannot spawn `pnpm`, and
  `planner.test.ts:735` fails its opposite-provider closure assertion. Both fail
  identically with this change stashed.
- Playwright, Storybook interaction and fullstack runtime lanes were not
  executed.
- The cabinet stylesheet was handed to the shared-CSS owner rather than applied,
  so the cabinet's new classes currently render unstyled in a local build.

## Release boundary

This evidence belongs to a modified working tree and is not exact-SHA release
evidence. No commit, push, image publication, deployment, canary or rollback
rehearsal is claimed.
