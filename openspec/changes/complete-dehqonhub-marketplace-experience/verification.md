## Evidence Policy

`REQ-AGRITECH-MARKETPLACE-016` is critical because tenant isolation, seller
identity, verification, pricing, offer ownership, contract generation, and
two-party consent meet in one commercial journey. A green render or coverage
percentage cannot prove those invariants. The PR lane therefore requires
independent acceptance examples plus direct domain/service/persistence security
tests, generated API freshness, focused component interaction tests, typed
EN/RU/UZ catalog parity, migration proof, and a built browser smoke. The
Cucumber steps call the same
framework-independent marketplace domain service used by the Nest runtime
through a public in-memory adapter; carts, checkout contracts, selected offers,
and party consent are read back from that adapter rather than assigned in step
state. Compose-backed Playwright adds exact runtime, viewport, keyboard, locale,
theme, and history evidence in main/nightly because it requires the full Docker
topology.

The durable version 3 sidecar will assign this requirement only to projects that
own source or executable evidence:

`user-app`, `user-app-api`, `admin-app-api`, `@app/frontend-api-client`,
`@app/frontend-feature-user-i18n`, `@app/backend-feature-product-main`,
`@app/backend-feature-product-shared`, `@app/backend-feature-agritech-main`,
`@app/backend-feature-agritech-shared`,
`@app/backend-feature-agritech-admin`, `@app/backend-postgres-main-agritech`,
`acceptance-e2e`, and `fullstack-e2e`.

Its Cucumber disposition is `acceptance`. The mapped acceptance scenarios are
`SCN-AGRITECH-MARKETPLACE-01` through `SCN-AGRITECH-MARKETPLACE-05`; direct
tests remain mandatory alternative/challenging evidence rather than substitutes
for the stakeholder examples.

## Requirement Evidence

| Requirement                                               | Risk          | Required evidence                                                                                                                                                                                                                                                                                                                                                 | Repository owners                                                                                                                                                                                                                                                                                                                                                                         |
| --------------------------------------------------------- | ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `REQ-AGRITECH-MARKETPLACE-016`                            | critical      | Cucumber acceptance through the production domain service for server-derived seller carts, persisted checkout contracts, selected-offer contract generation, party-specific consent, and approved-organization enforcement                                                                                                                                        | `acceptance-e2e:apps/e2e/acceptance/features/agritech-marketplace.feature`; `acceptance-e2e:apps/e2e/acceptance/src/steps/agritech-marketplace.steps.ts`; `@app/backend-feature-agritech-main:libs/backend/feature/agritech/main/lib/src/marketplace.domain-service.ts`; `@app/backend-feature-agritech-main:libs/backend/feature/agritech/main/lib/src/marketplace.in-memory-adapter.ts` |
| `REQ-AGRITECH-MARKETPLACE-016`                            | critical      | Domain and authorization policy tests for eligible roles, self-offer denial, cart seller isolation, sample boundary, and party consent                                                                                                                                                                                                                            | `@app/backend-feature-agritech-shared:libs/backend/feature/agritech/shared/lib/src/marketplace-policies.spec.ts`                                                                                                                                                                                                                                                                          |
| `REQ-AGRITECH-MARKETPLACE-016`                            | critical      | Service tests for verification, canonical RFC 9457 errors, server-owned inputs, offer/checkout/contract orchestration, and fail-closed factoring                                                                                                                                                                                                                  | `@app/backend-feature-agritech-main:libs/backend/feature/agritech/main/lib/src/marketplace.service.spec.ts`                                                                                                                                                                                                                                                                               |
| `REQ-AGRITECH-MARKETPLACE-016`                            | critical      | Wire-level Nest/Fastify controller and service response mapping with mocked repository ports for sessions, malformed commercial DTOs, organization gating, stale selection, tenant mismatch, foreign resources/parties, and request, offer, quote, selection, and consent envelopes; real persistence is challenged separately by the PostgreSQL component target | `user-app-api:apps/backend/user/user-app-api/src/marketplace.e2e-spec.ts` target `user-app-api:e2e`                                                                                                                                                                                                                                                                                       |
| `REQ-AGRITECH-MARKETPLACE-016`                            | critical      | A validation-only Nest/Fastify harness proves verification-review DTO problem responses; production-controller unit coverage proves principal-derived tenant/reviewer delegation. Together they require a bounded semantic rejection reason only for rejected decisions and forbid fabricated reasons on approvals                                                | `admin-app-api:apps/backend/admin/admin-app-api/src/agritech-marketplace.e2e-spec.ts`; `@app/backend-feature-agritech-admin:libs/backend/feature/agritech/admin/lib/src/agritech-admin.controller.spec.ts`                                                                                                                                                                                |
| `REQ-AGRITECH-MARKETPLACE-016`                            | critical      | Persistence/security tests for tenant-scoped product reads, transaction use, frozen totals/terms, sibling offer decline, and party-specific signing                                                                                                                                                                                                               | `@app/backend-postgres-main-agritech:libs/backend/postgres/main/agritech/lib/src/repositories/marketplace.repository.spec.ts`                                                                                                                                                                                                                                                             |
| `REQ-AGRITECH-MARKETPLACE-016`                            | critical      | Forward/down migration and constraint proof for contract source, term snapshot, and buyer/seller consent fields                                                                                                                                                                                                                                                   | `@app/backend-postgres-main-agritech:libs/backend/postgres/main/agritech/lib/src/migrations/agritech.migration.spec.ts`                                                                                                                                                                                                                                                                   |
| `REQ-AGRITECH-MARKETPLACE-016`                            | critical      | Real PostgreSQL populated-upgrade, legacy-consent quarantine, final-consent and supplier-update inventory contention, concurrent offer selection, duplicate-source rollback, serialized verification review, immutable delivery quotes, idempotent favorites, migrated delivery-schema parity, and query-grounding proof                                          | `@app/backend-postgres-main-agritech:libs/backend/postgres/main/agritech/lib/src/repositories/marketplace-concurrency.component-spec.ts` target `@app/backend-postgres-main-agritech:component-test`                                                                                                                                                                                      |
| `REQ-AGRITECH-MARKETPLACE-016`                            | critical      | Product contract/domain proof that stable supplier identity is returned without changing tenant ownership                                                                                                                                                                                                                                                         | `@app/backend-feature-product-shared:libs/backend/feature/product/shared/lib/src/application/product.use-cases.spec.ts`; `@app/backend-feature-product-main:libs/backend/feature/product/main/lib/src/interfaces/http/product.controller.spec.ts` when controller-specific coverage is needed                                                                                             |
| `REQ-AGRITECH-MARKETPLACE-016`                            | critical      | Generated OpenAPI/client freshness and user API composition build                                                                                                                                                                                                                                                                                                 | `user-app-api:apps/backend/user/user-app-api/src/agritech-product-routes.spec.ts`; `@app/frontend-api-client:libs/frontend/api-client/lib/src/user.ts`; scripts `api:contracts:check`, `api:clients:check`, `api:openapi:lint`                                                                                                                                                            |
| `REQ-AGRITECH-MARKETPLACE-016`                            | critical      | Component interactions covering catalog filters and query synchronization, PDP sample recovery, unavailable offer recovery, closed-request controls, offer and delivery forms, separate carts, verification provider absence, contract consent and identity recovery, and grounded AI dialog focus                                                                | `user-app:apps/frontend/app/src/pages/marketplace/ui/marketplace-components.spec.tsx`                                                                                                                                                                                                                                                                                                     |
| `REQ-AGRITECH-MARKETPLACE-016`                            | critical      | Canonical route, history, signed-out entry, duplicate-shell absence, and preserved non-marketplace route proof                                                                                                                                                                                                                                                    | `user-app:apps/frontend/app/src/app/app.spec.tsx`; `user-app:apps/frontend/app/src/app/router/user-routing.spec.tsx` if route cases are split                                                                                                                                                                                                                                             |
| `REQ-AGRITECH-MARKETPLACE-016`                            | critical      | EN/RU/UZ semantic parity and typed-key proof                                                                                                                                                                                                                                                                                                                      | `@app/frontend-feature-user-i18n:libs/frontend/feature/user/i18n/lib/src/translations.ts`; `i18n/{en,ru,uz}/user/agritech-marketplace-*.json`; `@app/frontend-feature-user-i18n:test` or repository catalog validation target                                                                                                                                                             |
| `REQ-AGRITECH-MARKETPLACE-016`                            | critical      | Built static browser navigation smoke across the canonical marketplace routes                                                                                                                                                                                                                                                                                     | `user-app:apps/frontend/app/project.json` target `user-app:e2e`                                                                                                                                                                                                                                                                                                                           |
| `REQ-AGRITECH-MARKETPLACE-016`                            | critical      | Compose-backed Playwright for authenticated API state, deep links, viewport and overflow quality, keyboard behavior, locale and theme persistence, and browser history                                                                                                                                                                                            | `fullstack-e2e:apps/e2e/fullstack/src/fullstack.spec.ts` target `fullstack-e2e:e2e`                                                                                                                                                                                                                                                                                                       |
| `REQ-AGRITECH-ROUTING-015`, `REQ-AGRITECH-DEPLOYMENT-014` | high/critical | Generated marketplace paths remain distinct from SPA deep links, and Docker plus Helm same-origin nginx route `/marketplace/*` to `user-app-api`                                                                                                                                                                                                                  | `libs/frontend/api-client/lib/src/user.ts`; `docker/nginx-fullstack.conf`; `.helm/templates/configmap.yaml`; `scripts/validate-deployment-config.mjs`; scripts `api:clients:check`, `deploy:validate:helm`; `fullstack-e2e:e2e`                                                                                                                                                           |

Every executable test file above will contain exactly one inventory line beginning
`// @requirements REQ-AGRITECH-MARKETPLACE-016` (additional requirements on the
same line are allowed only when their sidecars own the same Nx project). The
fetched marketplace tests that incorrectly marked PROFILE-001 and CATALOG-002 in
AgriTech main/shared projects will be corrected rather than broadening those
unrelated requirement owners.

## Independence Review

The product/reference audit and baseline failure inventory were authored by
separate review agents before implementation. Backend implementation is owned by
one agent while frontend and OpenSpec implementation are owned separately. The
final `review-specification-assurance` audit must be performed after the exact
revision is frozen by an agent that did not author the implementation; it will
inspect scenario risk coverage, sidecar ownership, generated freshness, test
failure quality, browser screenshots, and Git evidence rather than accepting
the implementers' summaries.

Cucumber scenarios express stakeholder-visible invariants independently of HTTP
or database layout. Service and repository tests deliberately attack caller
authority and cross-tenant boundaries. Component tests mock only the generated
client boundary and assert user-observable behavior. Playwright challenges the
assembled providers, router, CSS, locale/theme persistence, and browser focus at
runtime. These layers fail for different defects and are not generated copies of
one implementation.

## PR, Main, Nightly, and Runtime Lanes

- **PR:** strict OpenSpec validation; requirement impact; five Cucumber
  scenarios; focused AgriTech/product/migration Vitest and real-PostgreSQL
  component tests; user-app component,
  routing, typecheck, lint, build and static browser e2e; FSD; EN/RU/UZ catalog
  parity; OpenAPI lint and generated contract/client checks; `git diff --check`.
- **Main:** all PR evidence at the merged SHA plus compose-backed
  `fullstack-e2e:e2e`, Docker migration forward/rollback, and immutable artifact
  publication checks if the normal pipeline performs them.
- **Nightly:** repeat fullstack browser journeys in 320, 375 Russian, desktop
  light/dark and reduced-motion variants; dependency/provider canaries remain
  explicitly unavailable until separately configured.
- **Runtime:** no deployment is authorized in this change. A future deployment
  requires current-SHA health, tenant isolation canaries, provider configuration
  proof, and safe rollback; local/browser success is not production evidence.

A required failure or skip is not a pass. If Docker/provider infrastructure is
unavailable, its lane remains pending and the handoff names that boundary.

## Residual Risk

- OneID, file upload, legal/PDF signature, marketplace payment, factoring, and
  delivery providers remain intentionally unavailable and unverified.
- Produce purchase unification and role-specific admin operations remain future
  capability work; the UI exposes honest empty/status paths rather than fake
  completion.
- No production runtime, real tenant data, or external provider is exercised by
  this local/PR delivery.

## Independent Verification Reviewer

- `quality-engineering`, executed through a fresh
  `review-specification-assurance` review agent after implementation and before
  commit/push.
