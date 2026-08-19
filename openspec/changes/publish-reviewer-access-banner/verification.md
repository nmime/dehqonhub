# Verification

## REQ-AGRITECH-EXPERIENCE-026

- Risk: high journey and disclosure.
- Projects: `user-app`, `@app/frontend-feature-user-i18n`.
- Cucumber: not applicable, unchanged from the requirement's standing
  disposition. The modified clauses are renderer-owned presence, labelling, and
  deployment-flag resolution, which component evidence falsifies directly.
  Restating them in Gherkin would name a runtime-config global and a banner
  element, which the acceptance project must not do.
- Evidence:
  - `apps/frontend/app/src/pages/marketplace/ui/marketplace-components.spec.tsx`
    (already mapped for this requirement) proves the visible demo-accounts label,
    the guarded-demo-seed notice, the qualitative prepared-evidence row, all three
    identities with their per-role purpose lines, three per-account copy controls,
    the clipboard payload, the sign-in navigation, that a live-only home still
    publishes the list while the flag is enabled, and that stubbing
    `__APP_RUNTIME_CONFIG__` with `reviewerAccessEnabled: false` removes it.
  - `apps/frontend/app/src/pages/marketplace/ui/marketplace-coverage.spec.tsx`
    proves the same flag-driven presence and absence through the home renderer's
    own props, replacing its previous provenance-gated assertion.
  - `libs/frontend/api-support/lib/src/frontend-env.spec.ts` proves the flag
    precedence that the requirement now states: runtime, then build value, then
    the shipped default, with an unparsable value falling through.
  - `apps/frontend/app/e2e/marketplace-authenticated.e2e-spec.ts` carries the
    browser-level heading and demo-label assertions for the 375 px home route.

## Independent review

Review must challenge whether any path publishes the identities while the
deployment flag is off, whether an unparsable flag value can silently publish
them, whether the demo labelling is visible rather than only programmatic,
whether the prepared-evidence copy asserts anything the page cannot read, and
whether the farmer identity is anywhere described as a trading party.

## Working-tree evidence

- `user-app:typecheck` and `@app/common-i18n-keys:typecheck` passed.
- `lint` passed for `user-app`, `@app/common-i18n-keys`, and
  `@app/frontend-api-support`.
- The user-app unit suite ran 238 tests in 28 files, all passing (236 before this
  change, plus the two new flag cases).
- The `@app/frontend-api-support` unit suite ran 115 tests, all passing.
- Translation drift is zero and every locale catalog stays inside the thin-catalog
  key and line limits.
- Strict OpenSpec validation passed for this change and for the whole repository.
  `spec:validate` runs with `--skip-openspec` on this Windows host because its
  OpenSpec step cannot spawn `pnpm` with a replaced environment.
- Playwright, Storybook interaction, and fullstack runtime lanes were not
  executed. Their files were edited and re-read for consistency only.
- The banner stylesheet delta was handed to the shared-CSS owner rather than
  applied, so the banner's new rows currently render unstyled in a local build.

## Release boundary

This evidence belongs to a modified working tree and is not exact-SHA release
evidence. No commit, push, image publication, deployment, canary, or rollback
rehearsal is claimed.
