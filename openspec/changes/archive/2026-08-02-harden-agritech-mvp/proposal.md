## Why

The AgriTech platform was merged into `main`, but the merged source does not
meet the repository's definition of a working feature: backend compilation
fails, nine Nx projects have no durable requirement ownership, two libraries
use forbidden roots, persistence has no migration, generated API consumers are
stale, and the web and Telegram surfaces present fabricated success data.

## What Changes

- Repair the farmer, catalog, order, payment, PostgreSQL, Telegram, and user-web
  owners in their canonical repository locations.
- Bind authenticated users to their own farmer profile and orders.
- Replace placeholder success, product, order, weather, advice, and payment
  behavior with source-backed states or explicit unavailable responses.
- Add safe RFC 9457 failures, schema migrations, generated OpenAPI/clients,
  localized UI copy, focused tests, and exact requirement ownership.
- Reconcile `AGRITECH.md` with the research report so implemented technical
  scope is separated from pilot, commercial, deployment, and provider canaries.

## Goals and Non-Goals

**Goals:**

- Make the checked-in technical MVP buildable, testable, and honest.
- Provide a functional authenticated farmer onboarding, catalog, and order
  path using the selected PostgreSQL runtime.
- Fail closed when Click or Payme credentials or verified provider behavior are
  unavailable.
- Compose AgriTech Telegram behavior through the selected Telegram runtime
  without static customer or agronomy claims.

**Non-Goals:**

- Deploying or publishing the product.
- Claiming 100 pilot farmers, supplier contracts, sales, payment settlement,
  weather/agronomy-provider canaries, or PTA readiness without external proof.
- Implementing the research report's later output-aggregation, quality-grading,
  delivery-network, or credit roadmap in this corrective branch.

## Capabilities

### New Capabilities

- `agritech-marketplace`: authenticated farmer profiles, input catalog, owned
  orders, fail-closed payment handoff, Telegram integration, and web states.

### Modified Capabilities

- `api-contracts`: regenerate the user API producer and clients from source.
- `frontend-experience`: replace fabricated AgriTech UI success data with real
  loading, empty, error, and success states.
- `social-integrations`: compose AgriTech commands through the Telegram owner.

## Impact

- `apps/backend/user/user-app-api/**`
- `apps/frontend/app/**`
- `libs/backend/feature/{farmer,product,order,payment,telegram}/**`
- `libs/backend/postgres/main/{agritech,payment}/**`
- `libs/frontend/api-client/**`, generated contracts and clients
- AgriTech locale catalogs, documentation, OpenSpec, and tests

## Risk, Rollout, and Rollback

API authorization, order totals, stock, provider callbacks, and schema changes
are high risk. Rollout is additive for the new tables and routes, with external
provider features disabled until configuration and canaries exist. Rollback
reverts the application revision and drops only the new empty/pilot AgriTech
tables through the reviewed down migration; no production migration or deploy
is authorized by this change.
