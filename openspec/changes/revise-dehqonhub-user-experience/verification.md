# Verification

## REQ-AGRITECH-EXPERIENCE-026

- Risk: high journey and accessibility.
- Projects: `user-app`, `@app/frontend-feature-user-i18n`.
- Cucumber: not applicable; the requirement concerns renderer-owned layout,
  theme, responsive, local-storage, filter, and interaction behavior that is
  more directly falsified by Vitest, Storybook composition, and Playwright.
- Evidence:
  - marketplace component tests prove semantic structure, populated/active
    filters with localized example placeholders, local favorites, demo
    disclosure, and preserved API gates.
  - the selected user-app Playwright lane proves route navigation, light/black
    theme parity without navigation or authentication redirects, keyboard
    interaction, and narrow-layout behavior.
  - Storybook renders deterministic realistic multi-category API fixtures for
    visual review while production empty/error behavior remains authoritative;
    it also covers filtered, empty-catalog, and signed-out authentication states.
  - focused auth component and selected user-app browser evidence prove compact
    sign-in, progressive registration, draft retention, provider delegation,
    recovery availability, route stability, and narrow light/black rendering.

## Independent review

Review must challenge reference fidelity, black-theme completeness, Russian and
Uzbek overflow, focus visibility, guest/server favorite separation, demo
provenance, optional-bootstrap redirect stability, and the absence of any
browser-authored commercial record.

## Working-tree evidence

- A production browser canary exposed that an anonymous
  `PATCH /auth/me/preferences` rejection redirected theme changes to `/auth`.
  The auth bridge now treats only that presentation-preference write as
  optional, while protected-route authentication failures still redirect. The
  focused app-shell test and the selected Playwright journey exercise the real
  401 failure path instead of mocking a successful preference save.

- Account entry now renders compact sign-in by default and a separate
  method-identity-credentials registration flow on demand. Four focused Vitest
  cases prove step focus, one-request submission, non-secret draft retention,
  Telegram delegation, and provider-disabled behavior. The selected Playwright
  journey proves the 375 px light/black flow, exact route retention, recovery
  availability, and no horizontal overflow.

- `user-app:test` passed 191 tests; shared `ui-web` passed 116 tests.
- `user-app:lint`, `user-app:typecheck`, the selected user-app build, and the
  common i18n key build passed without cache reuse.
- `user-app:e2e-authenticated` passed all eight Chromium journeys, including
  320 px and 375 px layouts, keyboard focus behavior, reduced motion, local
  favorites, progressive account entry, Russian copy, both approved themes, and
  horizontal-overflow checks.
- Storybook built successfully and its interaction suite passed 35 stories.
  Manual Chromium review covered the populated, filtered, and empty catalog,
  the purchase-request steps, and the authentication shell at desktop and
  375 px widths in both the cream/green and explicit black palettes. It also
  confirmed continuous search borders, visible placeholders, balanced button
  padding, transparent wordmarks, icon navigation, and zero horizontal overflow.
- The selected visual-regression story passed after its reviewed Darwin Chromium
  baseline was updated. The user-app CLI browser lane passed its 18% function
  threshold at 21.2% (155/731 functions).
- FSD, documentation, strict OpenSpec, specification trace validation,
  repository tooling static checks, dependency audit, package-scoped licence
  review, selected closure validation, workspace doctor, formatting, and
  `git diff --check` passed. The trace inventory is 116 projects, 620 behavior
  tests, 84 requirements, and 400 evidence entries.
- The first exact-SHA PR lane exposed three repository-wide blockers that the
  focused frontend lane could not see. Frontend proxy parity now keeps nested
  `/profile/*` paths API-owned (114 tests passed); the PostgreSQL review seed
  now writes provenance that satisfies the migrated verification constraint
  and replays idempotently (the complete tooling target passed 764 unit tests,
  10 PostgreSQL migration/seed tests, and 4 MongoDB ledger tests); and the
  runner-neutral release guard again rejects checked-in GitHub workflows and
  composite actions. The release-provenance acceptance suite passed all 33
  scenarios and 104 steps after its source assertions were synchronized with
  the current exact-revision implementation.

## Demo identity boundary

The governed Storybook and browser fixtures provide realistic catalog and
signed-out account states without creating publicly reusable production
credentials. Passwords are not embedded in the application or announced in a
public banner; authenticated identities remain isolated to test and seed
environments, while the home-page demo banner identifies browse-only fixture
data and disables commercial mutations.

## Release boundary

This evidence belongs to the modified working tree and is not exact-SHA release
evidence. No commit, push, immutable image publication, deployment, production
canary, or rollback rehearsal is claimed by this change record yet.
