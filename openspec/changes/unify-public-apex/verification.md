# Verification

## REQ-RUNTIME-DELIVERY-009

- Risk: critical operations and security.
- Projects: `@repo/tooling`.
- Cucumber: not applicable; selected-image/host/port derivation, Nginx syntax,
  one-build activation, listener reachability, and secret safety require direct
  operations/security assertions.
- Evidence:
  - `scripts/single-server-deployment.spec.mjs` proves the renderer reads the
    selected closure, serves `user-app` at the apex, omits deselected
    landing/site/user-subdomain hosts and ports, and keeps runtime hardening.
  - `scripts/compose-production.spec.mjs` proves `PRIMARY_APP=user-app`, apex
    runtime/auth/Telegram URLs, selected services, and private host binds.
  - `pnpm run server:validate` and `pnpm run deploy:validate:docker` prove the
    rendered deployment contracts.
  - `scripts/deploy.spec.mjs` and the deployment validator prove every
    standalone migrator runtime source is explicitly owned by UID 1000 before
    the image switches to its non-root user.
  - The same deployment evidence proves backend and SSR artifacts are assigned
    to UID 1000, static frontend bundles are immutable and readable by UID 101,
    and representative locale/server/index assets are checked after each final
    runtime user switch.

## REQ-AGRITECH-DEPLOYMENT-014

- Risk: critical operations and security.
- Projects: `@repo/tooling`.
- Cucumber: not applicable; product selection, host derivation, certificate
  coverage, reverse-proxy behavior, trusted/return origins, and readiness are
  deployment contracts.
- Evidence:
  - setup/closure checks prove landing/site/fullstack are not selected or
    released.
  - Compose and single-server deployment tests prove the apex user origin,
    admin/API/Telegram destinations, exact certificate host set, selected-only
    CORS/auth/payment origins, and absence of removed hosts.
  - Post-deployment doctor, HTTPS, and browser canaries prove the exact revision.

## REQ-AGRITECH-ROUTING-015

- Risk: high API, journey, and operations.
- Projects: selected user/admin/API/tooling owners; the unselected full-stack
  reference harness is not evidence for this product change.
- Cucumber: not applicable; exact browser/API route ownership is more faithfully
  proven by route tests, generated contracts, deployment renderer assertions,
  operations checks, and Playwright.
- Evidence:
  - existing user/admin route and API contract evidence remains authoritative.
  - selected `user-app:e2e-authenticated` Playwright evidence proves the
    signed-out marketplace remains public when the optional presentation
    bootstrap is unauthorized, plus SPA deep links and exact same-origin
    `/marketplace/*` browser requests, without selecting the
    landing/site-dependent full-stack reference harness.
  - deployment tests prove the user router is mounted at the apex and
    `/marketplace/*` remains before the SPA fallback.
  - post-deployment HTTPS/browser canaries separately prove the exact deployed
    apex revision; they are runtime evidence, not pre-release PR evidence.

## REQ-API-PROBLEM-001

- Risk: high acceptance, API, and domain behavior.
- Projects: `user-app`, `@app/backend-common-exception`,
  `@app/backend-common-response`, and `@app/common-problem-details`.
- Cucumber: existing acceptance examples remain authoritative for valid opaque
  occurrences and unsafe identifier rejection; direct contract and route tests
  prove exact product identity and registry rendering.
- Evidence:
  - `libs/common/problem-details/lib/src/index.spec.ts` proves registered custom
    types use `https://dehqonhub.uz/problems#...`, occurrences use the product
    root, and unsafe codes or request identifiers fail closed.
  - `apps/frontend/app/src/app/router/user-routing.spec.tsx` proves selected
    `user-app` serves the shared registry at apex `/problems`.
  - `user-app:test` and `user-app:e2e-authenticated` reproduce the production-mode
    anonymous `/auth/problem-presentations` response and independently assert
    that a read-only `/auth/me` session event does not redirect the public
    registry to authentication.
  - `apps/e2e/acceptance/features/api-problems.feature` preserves the two
    stakeholder-readable occurrence scenarios.

## Independent review

Specification assurance must challenge apex ownership, complete removal of
landing/site runtime artifacts, canonical problem identity and registry
ownership, same-origin API precedence, selected-only certificate/doctor
inventories, rollback, and exact-revision evidence.

## Evidence boundaries corrected during review

- `landing-app` and `site-app` remain unselected reference renderers. Their
  renderer-local Vitest evidence is mapped to PR/main; their truthful Playwright
  hydration evidence is runtime-only. Both renderer targets passed after the
  supported `pnpm run tooling:install` maintainer dependency install; that test
  install did not change the selected product closure or deployment inventory.
- `REQ-NOTIFY-PREFERENCE-006` previously claimed optional-channel preference
  behavior and a full-stack browser journey that do not exist in source. This
  change removes the unsupported durable requirement, its sidecar entry, and
  every false source marker. Existing locale/theme preference tests are retagged
  to `REQ-FRONTEND-SHELL-004`; generic feature-flag tests are retagged to
  `REQ-AGRITECH-DEMO-024`. Optional notification-channel preferences remain
  deferred to a separately specified product change outside this apex hotfix.
