## Context

The merged AgriTech source created separate farmer, product, order, payment,
Telegram, and PostgreSQL projects without using the repository generator or
specification lifecycle. Several project roots are incomplete or invalid, the
user API does not compile, persistence providers are not visible to feature
modules, and product-facing screens are static demonstrations.

## Goals / Non-Goals

**Goals:** canonical owners, authenticated scoping, deterministic domain rules,
safe public failures, real persistence migration, generated consumers, and
honest UI/bot states.

**Non-Goals:** output aggregation, field-agent/admin products, live settlement,
weather/agronomy integrations, deployment, and pilot/commercial evidence.

## Decisions

### Keep farmer, product, and order as existing bounded contexts

Their canonical `main` and `shared` roots already exist, so they are repaired in
place with generator-standard configs, local guidance, tests, and exports. No
replacement or `v2` project is generated.

### Move payment into a canonical main owner and keep it disabled

The flat payment project is invalid. The bounded unavailable contract and HTTP
behavior move to `payment/main`. No payment persistence is created because the
source cannot create an intent before provider prerequisites exist. Existing
invalid aliases are removed in the same corrective revision.

### Fold Telegram behavior into the existing bot project

The standalone Telegram-AgriTech project is dead and non-canonical. A small
AgriTech composer and injectable data port live inside
`@app/backend-feature-telegram-bot`, preserving the selected deployable and its
single runtime composition.

### Use authenticated principal ownership

Farmer records store `tenantId` and `userId`; the pair is unique. Controllers
read `@CurrentUser()` and never accept authority-bearing IDs. Farmer list,
product mutation, and order state mutation routes are removed from the
farmer-facing user API until privileged owners are specified.

### Make order creation one persistence transaction

The order port accepts normalized requested lines and resolves/locks active
products inside one PostgreSQL transaction. It validates quantities and stock,
decrements stock, writes server-priced lines, and persists the order atomically.
Unit tests cover domain validation; component/migration evidence covers database
semantics when Docker is available.

### Disable handoff and callbacks until full provider state machines exist

Payme's official Merchant API requires authenticated JSON-RPC, persistent
transactions, exact amount checks, retries, cancellation, and idempotency.
Click's full API documentation and merchant credentials are credential-gated.
This correction returns an explicit unavailable problem for handoff and does
not register callback routes. Enabling either boundary is a separate high-risk
requirement and provider-canary change.

### Generate contracts and typed clients from source

Controllers/DTOs change first. The user API contract, shared generated types,
frontend client, and toast mappings are regenerated with repository commands.
The user-app owns screen composition while request wrappers remain in the
frontend API client boundary.

## Risks / Trade-offs

- Removing unsafe mutation/callback routes is a corrective compatibility break
  from code that never built or produced a current contract.
- PostgreSQL-only AgriTech persistence matches the selected workspace but does
  not claim MongoDB parity.
- A checkout handoff is less featureful than fabricated callbacks, but it is an
  honest and reversible provider boundary.
- Real browser, Docker, and provider canaries remain separate evidence lanes.

## Migration Plan

1. Repair/move project roots and aliases; remove committed absolute symlinks.
2. Add durable entities and reversible migrations.
3. Implement scoped APIs and focused unit/e2e tests.
4. Regenerate OpenAPI and frontend clients.
5. Replace static UI/bot data with typed request states.
6. Reconcile documentation and run exact-revision verification.

## Open Questions

External merchant, pilot, deployment, and agronomy decisions remain as explicit
runtime/operations blockers and do not block this source correction.
