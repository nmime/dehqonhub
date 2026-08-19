## 1. Specification

- [x] 1.1 Record the owner's review of `/account`: a cabinet with a left category rail, a right content panel, per-section deep links, month statistics as a chart, and uncramped heads.
- [x] 1.2 Determine which requirement owns the clause: `REQ-AGRITECH-EXPERIENCE-026`, which already owns the account, order, contract and verification surfaces.
- [x] 1.3 Modify `REQ-AGRITECH-EXPERIENCE-026` in place, keeping the stable identifier: the cabinet clause replaces the one-line account mention inside the coherence paragraph.
- [x] 1.4 Extend the version 3 evidence sidecar with the two new `user-app` suites; the modified behaviour stays inside already-owned projects.

## 2. Data investigation

- [x] 2.1 Confirm what `/marketplace/dashboard` returns: role scope, buyer/seller metric blocks, six-month `monthlyActivity`, `recentDeals`. No new aggregate endpoint is needed.
- [x] 2.2 Confirm `/marketplace/contracts` stamps `actorParty` per contract for the reading account.
- [x] 2.3 Confirm `/marketplace/requests/mine` carries `publicationId`, `publicationStatus` and `moderationStatus`.
- [x] 2.4 Confirm `/marketplace/publications/mine` returns owned listing and request publications with status and moderation state.
- [x] 2.5 Establish that no endpoint lists the offers an account made as a seller, and record the gap in the proposal instead of fabricating the list.

## 3. Implementation

- [x] 3.1 Add `MarketplaceCabinet`: hero, verification call to action outside the panels, left rail, one content panel.
- [x] 3.2 Add the six section panels, each with explicit loading, empty, error and ready states.
- [x] 3.3 Add `MarketplaceCabinetChart`: CSS bars, quartile gridlines, peak scale label, legend, and the captioned value table as its accessible equivalent.
- [x] 3.4 Add `/account/$cabinetSection` and subscribe the marketplace route components to `location.pathname` so a section switch re-renders instead of remounting.
- [x] 3.5 Reduce `MarketplaceAccount` to the cabinet's entry point with optional resources, and remove the client-side `activeDeals + completedDeals` total no endpoint reports.
- [x] 3.6 Add `formatPercent` and `formatMonth` to `marketplace-ui`, reusing the one locale map, so no figure is formatted by hand.
- [x] 3.7 Map the verification status `none` to the not-started copy, so a raw translation key can no longer reach the screen.
- [x] 3.8 Add the 54 cabinet keys to all four locale catalogs as a new catalog file, register it in the frontend catalog list and the tooling catalog inventory, and extend the `TranslationKey` union.
- [ ] 3.9 Merge the cabinet stylesheet handoff into `apps/frontend/app/src/pages/marketplace/ui/marketplace.css`. Handed to the shared-CSS owner; not applied by this change.

## 4. Demo fixture

- [x] 4.1 Add `marketplace-seed-contracts.ts`: twelve settled deals between the demo buyer and demo seller across the aggregated window, derived from the seeded catalog's own publications and prices.
- [x] 4.2 Write the rows in `postgres-seed.ts` with an `ON CONFLICT` that touches only the columns the frozen-authority trigger still allows.
- [x] 4.3 Re-seed the local database and verify the resulting figures through the live API for both the buyer and the seller login.

## 5. Evidence

- [x] 5.1 Add `marketplace-cabinet.spec.tsx`: deep-link resolution, rail navigation and `aria-current`, the chart's accessible table, series honesty, the empty window, buyer/seller separation, owned-request state, the publication queue's four states, the account section, and the dashboard failure.
- [x] 5.2 Add `marketplace-seed-contracts.test.ts`: the window, the future-date clamp, frozen lines, the consent matrix, the delivery-price rule, party eligibility, snapshot shape and id stability.
- [x] 5.3 Update the existing account coverage in `marketplace-components.spec.tsx` and the fail-closed publishing case in `marketplace-page.spec.tsx` for the sectioned layout.
- [x] 5.4 Run typecheck and lint for `user-app`, `@app/frontend-feature-user-i18n`, `@app/common-i18n-keys` and `@repo/tooling`, the full user-app unit suite, translation drift, and strict OpenSpec validation.
- [ ] 5.5 Run the user-app Playwright lane, the Storybook interaction suite, and the fullstack runtime lane. Not executed in this environment.

## 6. Follow-up

- [ ] 6.1 Add `GET /marketplace/offers/mine` through the source-first contract pipeline so the selling section can itemise an account's own offers and their outcome.
- [ ] 6.2 Remove the `.dh-stat-grid`, `.dh-compact-list` and `.dh-sample-list` rules once the stylesheet handoff is merged and the grep confirming they have no markup consumer still holds.
