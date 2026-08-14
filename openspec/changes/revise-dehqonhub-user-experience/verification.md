# Verification

## REQ-AGRITECH-EXPERIENCE-026

- Risk: high journey and accessibility.
- Projects: `user-app`, `@app/frontend-feature-user-i18n`.
- Cucumber: not applicable; the requirement concerns renderer-owned layout,
  theme, responsive, local-storage, filter, and interaction behavior that is
  more directly falsified by Vitest, Storybook composition, and Playwright.
- Evidence:
  - marketplace component tests prove semantic structure, populated/active
    filters with localized example placeholders, local favorites, the
    seller-grouped preview cart, demo disclosure, and preserved API gates.
  - the selected user-app Playwright lane proves route navigation, light/black
    theme parity without navigation or authentication redirects, keyboard
    interaction, narrow-layout behavior, one browser marketplace chrome, and
    the separate Telegram Mini App boundary.
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

- Normal browser routes now render one marketplace chrome with a transparent
  inline emblem, compact locale/theme menus, and Lucide navigation icons.
  Telegram launch routes alone retain the Mini App shell and host controls.
  The governed demo banner renders only when the public catalog contains demo
  provenance, while the versioned guest cart persists bounded seller-grouped
  preview state locally and routes checkout to authentication without calling
  cart, order, contract, payment, or offer mutation APIs.

- `user-app:test` passed all 196 tests, including the live-only catalog banner
  exclusion and malformed/version-mismatched local-cart recovery.
- `user-app:lint`, `user-app:typecheck`, the selected user-app build, and the
  common i18n key build passed without cache reuse.
- `user-app:e2e-authenticated` passed all eight Chromium journeys, including
  320 px and 375 px layouts, keyboard focus behavior, reduced motion, local
  favorites, persistent preview cart, reviewer identities, progressive account
  entry, Russian copy, both approved themes, and horizontal-overflow checks.
- Storybook built successfully and its interaction suite passed 35 stories.
  Manual Chromium review covered the populated, filtered, and empty catalog,
  the purchase-request steps, and the authentication shell at desktop and
  375 px widths in both the cream/green and explicit black palettes. It also
  confirmed continuous search borders, visible placeholders, balanced button
  padding, transparent wordmarks, icon navigation, white-on-green form-button
  contrast, 16 px recovery-form rhythm, and zero horizontal overflow.
- The complete 22-story Chromium visual-regression suite passed after the
  reviewed user-home baseline and the stale current-main admin-navigation
  baseline were synchronized. The user-app CLI browser lane passed its 18%
  function threshold at 21.11% (163/772 functions) using the real marketplace
  chrome instead of removed Mini App Share/Back controls.
- FSD, documentation, strict OpenSpec, specification trace validation,
  repository tooling static checks, dependency audit, package-scoped licence
  review, selected closure validation, workspace doctor, formatting, and
  `git diff --check` passed. The native secret scan passed with the explicitly
  public demo identities, and the licence gate recognizes only the four shipped
  OFL font packages. The trace inventory is 116 projects, 621 behavior tests,
  84 requirements, and 401 evidence entries.
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

The three fixed reviewer email/password pairs are intentionally public,
non-secret demo seed identities and are shown in the home-page banner only when
the API catalog proves demo provenance. They are not production credentials.
Live-only catalogs do not render the banner, and demo/browse-only users remain
unable to create commercial server records; favorites and seller-grouped cart
previews stay in bounded browser storage until the user authenticates into an
eligible account.

## Release boundary

This evidence belongs to the modified working tree and is not exact-SHA release
evidence. No commit, push, immutable image publication, deployment, production
canary, or rollback rehearsal is claimed by this change record yet.
