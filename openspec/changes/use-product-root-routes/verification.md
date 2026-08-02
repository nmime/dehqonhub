## Evidence Policy

`REQ-AGRITECH-ROUTING-015` is high risk because it intentionally breaks every
first-party product route and crosses two API providers, three client runtimes,
generated artifacts, payment return behavior, and the admin security boundary.
Its `api` profile is best challenged by direct route-metadata tests, SPA route
tests, a live multi-browser full-stack journey, source-to-generated contract,
client, and presentation freshness, typed client builds, and OpenAPI linting. Cucumber is not applicable
because the invariant is exact HTTP provider/consumer compatibility rather
than a stakeholder business example.

The durable version 3 sidecar will use `disposition: not-applicable` with
`alternativeEvidence: [vitest, playwright, contract, static]`. Generated artifacts and
coverage percentages are supporting output, not sufficient evidence by
themselves.

## Requirement Evidence

| Requirement                | Risk | Required evidence                                                                                                                          | Repository owners                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| -------------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `REQ-AGRITECH-ROUTING-015` | high | Vitest route metadata and SPA routing; live full-stack Playwright navigation; source-derived OpenAPI/client contracts; typed client builds | `user-app:apps/frontend/app/src/app/app.spec.tsx`; `admin-app:apps/frontend/admin/src/app/admin-routing.spec.tsx`; `user-app-api:apps/backend/user/user-app-api/src/agritech-product-routes.spec.ts`; `admin-app-api:apps/backend/admin/admin-app-api/src/agritech-product-routes.spec.ts`; `fullstack-e2e:apps/e2e/fullstack/src/fullstack.spec.ts`; `@app/frontend-api-client:libs/frontend/api-client/lib/src/user.ts`; `@app/frontend-api-client:libs/frontend/api-client/lib/src/admin.ts` |

The requirement owns these exact Nx projects in the durable sidecar:

- `user-app`, `admin-app`, `mobile-app`, `fullstack-e2e`
- `user-app-api`, `admin-app-api`
- `@repo/tooling`
- `@app/frontend-api-client`, `@app/frontend-feature-user-i18n`
- `@app/backend-feature-agritech-main`
- `@app/backend-feature-agritech-admin`
- `@app/backend-feature-farmer-main`
- `@app/backend-feature-order-main`
- `@app/backend-feature-payment-main`
- `@app/backend-feature-product-main`

New route-metadata tests receive an exclusive
`// @requirements REQ-AGRITECH-ROUTING-015` marker. Existing user/admin routing
tests add the new ID to their current shell marker because both durable
requirements own the containing application projects. Contract evidence source
files explicitly name the requirement. The full-stack Playwright inventory
also names the route requirement and verifies live cross-app navigation at the
product roots.

## Independence Review

Provider metadata tests inspect Nest decorator output rather than repeating the
controller implementation branch. SPA tests render the route matrix/application
at the public URL boundary rather than calling page components directly.
OpenAPI export discovers runtime controller metadata independently, and the
client freshness generator compares generated consumers against committed
provider documents. The exact evidence lane runs contract, client, presentation,
and OpenAPI lint freshness scripts; OpenAPI lint challenges structural validity
separately.

The implementation author may update expected paths, but
`quality-engineering` remains the independent verification owner responsible
for reviewing that the path inventories are exhaustive, old namespaces are
absent, admin permissions remain enforced, and evidence was collected from the
exact revision.

## PR, Main, Nightly, and Runtime Lanes

- **PR:** focused user/admin app tests, user/admin API tests, the full-stack
  Playwright route journey, API client build, API contract/client/presentation
  freshness, OpenAPI lint, specification validation, and the impacted PR
  evidence lane.
- **Main:** the same deterministic evidence is required against the exact
  integrated SHA through the requirement's `pr` and `main` evidence mappings.
- **Nightly:** no distinct nightly-only evidence is required; repository-wide
  tests continue to exercise all consumers.
- **Runtime:** deployment telemetry for removed-path not-found requests can
  identify stale consumers, but environment traffic is not substituted for the
  deterministic source/contract evidence and is not required to prove this
  source migration.

A skipped required command is not a pass. Hosted CI unable to start for an
external account/billing reason remains an external evidence boundary and does
not weaken the local exact-source gates.

## Residual Risk

- Independently deployed external consumers can remain stale even when every
  monorepo consumer is current. They must migrate from the regenerated OpenAPI
  document before the atomic release; no compatibility alias masks them.

## Independent Verification Reviewer

- `quality-engineering` (required verification owner for the high-risk
  requirement), with `security-maintainers` reviewing preservation of the
  `/admin` boundary.
