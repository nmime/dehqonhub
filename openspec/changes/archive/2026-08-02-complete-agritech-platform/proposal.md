# Complete the AgriTech platform

## Why

The current AgriTech source implements only the farmer-side MVP subset of the
research roadmap. The product must provide the complete multi-actor operating
model described by `docs/research`: farmers, suppliers, buyers, field agents,
administrators, payments, advisory, output aggregation, fulfillment, analytics,
and deployment-ready operations.

## What Changes

- Expand the farmer marketplace into a tenant-isolated supplier, buyer, and
  field-agent platform.
- Add supplier approval, input catalog and inventory administration, farmer
  produce listings, buyer reservations, price discovery, grading, and delivery
  scheduling.
- Replace the disabled payment placeholder with persistent, idempotent Click,
  Payme, and BNPL payment state machines and authenticated provider boundaries.
- Add source-backed weather observations, agronomy recommendations, Telegram
  notification intents, pilot cohort management, and operational analytics.
- Deliver real user, admin, and Expo field-agent journeys in Uzbek, Russian,
  and English.
- Prepare the selected Docker deployment, health/readiness, environment,
  observability, rollback, and provider-canary contracts without applying a
  deployment or using live credentials.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `agritech-marketplace`

## Impact

The change affects the AgriTech farmer, product, order, payment, Telegram,
notification, PostgreSQL, user API, admin API, user SPA, admin SPA, mobile app,
i18n, generated OpenAPI/client, deployment configuration, and acceptance
evidence owners. Public API additions are additive; the payment endpoint changes
from an unconditional unavailable response to a configured provider boundary.
