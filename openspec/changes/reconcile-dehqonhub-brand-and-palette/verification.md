# Verification

## REQ-AGRITECH-EXPERIENCE-026

- Risk: high journey and accessibility.
- Projects: `user-app`, `@app/frontend-feature-user-i18n`.
- Cucumber: not applicable. The reconciled clauses are renderer-owned markup,
  asset selection, accessible-name, target-size, and single-notice behavior that
  component and browser evidence falsify directly. Restating them in Gherkin
  would name selectors and asset files, which the acceptance project must not do.
- Evidence:
  - `apps/frontend/app/src/app/app.spec.tsx` proves the shell renders two
    `img.dh-brand__mark` elements, no inline vector mark, the 96 px source, the
    denser-screen source-set entry, the empty alternative text, and no theme
    control.
  - `apps/frontend/app/src/pages/marketplace/ui/marketplace-components.spec.tsx`
    proves a restricted card renders no visible reason block and no per-card
    recovery button, and that the add action references a visually hidden
    description carrying the demo or eligibility reason.
  - `apps/frontend/app/src/pages/marketplace/ui/marketplace-page.spec.tsx` proves
    exactly one catalog-level eligibility notice with its recovery control for a
    signed-in actor who fails closed on verification.
  - `apps/frontend/app/e2e/marketplace-authenticated.e2e-spec.ts` proves the
    emblem markup, the plain card-scoped cart label, the absent per-card block, and
    the single notice in a real browser at 375 px.
  - `apps/e2e/fullstack/src/fullstack.spec.ts` proves, against the running stack,
    that both marks load the 96 px asset, that the header lockup and mark clear
    44 px at the 320 px floor, that the wordmark stays visible, and that neither
    the marketplace shell nor settings exposes a theme control.

## Independent review

Review must challenge the accessible name of the lockup, the density behavior of
the source set, the target size at the 320 px floor, whether any restricted actor
is left without a reason, whether the demo chip survives, and whether any
remaining rule, asset, or stored preference reintroduces a second palette.

## Working-tree evidence

- `user-app:typecheck` and `user-app:e2e-typecheck` passed. The `fullstack-e2e`
  project typechecked clean.
- ESLint passed on every file this change touches.
- The user-app unit suite ran 234 tests. Every brand, card, and notice case in
  this change passed. The failures that remain belong to other in-flight work in
  the same worktree: the farmer-dashboard locale formatting case, the marketplace
  request and offer suites, `use-marketplace-data`, and the marketplace page
  action orchestration.
- `spec:validate` reports the trace inventory clean. Its OpenSpec strict step
  cannot spawn `pnpm` on this Windows host, so strict validation was run directly
  instead.
- Playwright lanes were not executed. The user-app authenticated journey and the
  fullstack runtime journey were edited and re-read for consistency only.

## Release boundary

This evidence belongs to a modified working tree and is not exact-SHA release
evidence. No commit, push, image publication, deployment, canary, or rollback
rehearsal is claimed.
