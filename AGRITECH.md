# AgroUz AgriTech scope

The reports in [`docs/research`](docs/research/) describe the market thesis and
a proposed 12-week roadmap. They are research inputs, not evidence that the
product, pilot, provider integrations, or deployment exist.

## Implemented source boundary

- Authenticated farmer profile create/read/update, owned by `tenantId` and
  `userId`; callers cannot choose their role or verification status.
- Read-only active input catalog. Supplier/admin product management is not
  exposed by the farmer API.
- Owned order create/read/list with positive integral lines, server-owned
  prices, pessimistic stock locking, and one PostgreSQL transaction.
- Versioned PostgreSQL schema migration for farmers, products, and orders.
- Generated user OpenAPI contracts and frontend client paths.
- User registration, catalog, and dashboard pages with real loading, error,
  empty, and success states; no sample business records.
- `/agritech` in the selected Telegram bot opens the configured web app or
  returns an explicit localized unavailable state. It does not fabricate
  orders, weather, or agronomy advice.
- Click and Payme handoff returns `503` until merchant configuration,
  provider authentication, idempotent persistence, and canary evidence exist.
  Callback routes are deliberately absent.

## Current API

All routes require the user API's authenticated session guard.

| Method  | Path                    | Behavior                           |
| ------- | ----------------------- | ---------------------------------- |
| `POST`  | `/agritech/farmer`      | Create the caller's farmer profile |
| `GET`   | `/agritech/farmer`      | Read the caller's farmer profile   |
| `PATCH` | `/agritech/farmer`      | Update allowed profile fields      |
| `GET`   | `/agritech/catalog`     | List active catalog products       |
| `GET`   | `/agritech/catalog/:id` | Read one active catalog product    |
| `POST`  | `/agritech/orders`      | Create a server-priced owned order |
| `GET`   | `/agritech/orders`      | List the caller's orders           |
| `GET`   | `/agritech/orders/:id`  | Read one owned order               |
| `POST`  | `/agritech/payments`    | Explicit unavailable response      |

## Not delivered by this source revision

The following research milestones still require separate product decisions,
owners, credentials, external systems, runtime evidence, or field operations:

- supplier onboarding/admin product mutation and inventory operations;
- live Click/Payme checkout, callbacks, settlement, refunds, and sandbox canaries;
- field-agent workflows and output aggregation/buyer marketplace;
- price discovery, grading, logistics, weather, and agronomy providers;
- Uzbek runtime locale (the selected repository locales are currently EN/RU);
- deployment, production observability, security review, and disaster recovery;
- the proposed 100-farmer/5-10-supplier pilot and its commercial metrics.

These items must not be described as production-ready until their own
requirements and exact-revision/runtime evidence exist.

## Verification

```bash
pnpm exec nx run user-app-api:build
pnpm exec nx run user-app:build
pnpm exec nx run-many -t test -p @app/backend-feature-farmer-shared,@app/backend-feature-product-shared,@app/backend-feature-order-shared,@app/backend-feature-payment-main,@app/backend-postgres-main-agritech
pnpm exec nx run @app/backend-feature-telegram-bot:test
pnpm run api:contracts:check
pnpm run api:clients:check
pnpm run spec:validate
```

## Research

- [English report](docs/research/report_en.html)
- [Russian report](docs/research/report_ru.html)
