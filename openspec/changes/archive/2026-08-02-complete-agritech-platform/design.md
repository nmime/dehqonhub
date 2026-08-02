# Design

## Context

The repository already owns safe farmer, input catalog, input order, disabled
payment, Telegram, notification, PostgreSQL, user/admin web, and Expo
boundaries. The full product must extend those owners instead of creating a
parallel platform. Two generated libraries add the missing shared operations
and privileged admin HTTP ownership.

## Goals

- One tenant-isolated multi-actor marketplace across existing deployables.
- Atomic inventory, reservation, payment, fulfillment, and history semantics.
- Provider adapters that are production-capable but disabled without real
  configuration and controlled canaries.
- Source-backed user, admin, mobile, Telegram, analytics, and pilot states.
- EN/RU/UZ parity and non-deploying operational readiness.

## Non-Goals

- Creating real merchant accounts, contracts, pilot participants, field visits,
  or government API access.
- Applying infrastructure, DNS, certificates, or production migrations.
- Claiming external canary, pilot, settlement, or commercial evidence from
  source tests.

## Decisions

### Extend existing bounded contexts

Farmer retains farmer and assignment ownership; product owns inputs and produce
listings; order owns reservations, state history, and deliveries; payment owns
provider state. `@app/backend-feature-agritech-main` orchestrates cross-domain
user operations and provider ports. `@app/backend-feature-agritech-admin` owns
privileged approval, assignment, moderation, analytics, and pilot HTTP routes.

### Keep persistence in the selected AgriTech PostgreSQL owner

New organization, membership, listing, price observation, order history,
delivery, field visit, advisory, payment, integration cursor, and pilot cohort
tables live in `@app/backend-postgres-main-agritech`. A new reversible migration
uses additive tables/columns and explicit indexes/constraints.

### Use deterministic state machines

Partner approval, listing, order/reservation, payment, delivery, recommendation,
connector, and pilot membership transitions are explicit unions validated in
application services and database constraints. Idempotency identities are
unique per tenant/provider.

### Preserve provider isolation

Click, Payme, BNPL, weather, agronomy, export, and government connectors expose
typed ports. Configuration is validated at startup/readiness. Callback auth is
provider-specific and occurs before persistent lookup. Transport bodies are
never stored or logged unredacted.

### Reuse notification infrastructure

AgriTech emits typed template intents through the existing notification
application service. Scheduler and consumer remain the only delivery owners;
templates carry EN/RU/UZ versions and deterministic deduplication keys.

### Use generated clients on every product surface

Controllers and DTOs are source; OpenAPI and clients are regenerated. User and
admin Vite routes implement the complete portal workflows. Expo implements the
field-agent assignment/visit/delivery journey with offline and denied states.

## Risks and Mitigations

- Cross-domain transaction complexity -> repository orchestration uses one
  MikroORM transaction and deterministic lock order.
- Provider protocol drift -> isolate adapters, retain raw provider IDs only,
  contract-test callbacks, and require controlled canaries before readiness.
- Migration load -> additive schema first, indexed foreign keys, no destructive
  rewrite, reversible down path.
- Analytics overclaim -> derive only from production tables and label targets,
  verified activity, and unavailable external evidence separately.
- Locale expansion drift -> use one supported locale source and repository-wide
  parity/placeholder checks.
- Broad UI scope -> reuse existing shell primitives and generated API wrappers;
  keep page ownership explicit and test critical routes.

## Migration and Rollback

1. Apply additive schema and new indexes before enabling new endpoints.
2. Deploy provider-disabled source and verify readiness.
3. Configure and canary one external provider at a time under operations
   authorization.
4. Roll back application source while additive tables remain compatible, or
   run the reversible migration only after confirming no retained business data
   is required.

## Open Questions

Only external selections remain: merchant credentials/contracts, chosen
weather/agronomy/government APIs, pilot participants, deployment destination,
DNS/TLS, and field-operations staffing. They do not change the fail-closed
source contract.
