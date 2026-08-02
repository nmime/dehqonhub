# AgriTech Platform

This is the canonical product and operator guide for the AgriTech marketplace
derived from the Uzbekistan market research in `docs/research/report_en.html`
and `docs/research/report_ru.html`. The selected product is intentionally larger
than the research report's twelve-week MVP: it owns the input marketplace,
output aggregation, partner controls, farmer field operations, fulfillment,
payments, advisories, analytics, and pilot governance as one tenant-isolated
platform.

## Product scope

| Actor         | Implemented journey                                                                                                                                  |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Farmer        | Tenant-scoped profile, produce listing, grade and availability, source-attributed advisory, order and delivery visibility                            |
| Supplier      | Organization application and approval, localized input catalog, stock and price maintenance                                                          |
| Buyer         | Organization application and approval, produce discovery, regional price statistics, atomic quantity reservation, payment handoff                    |
| Field agent   | Assigned-farmer list, field-visit observations, quality grade, assigned delivery transitions, proof reference                                        |
| Operator      | Partner and farmer approval, field-agent assignment, advisory publication, delivery scheduling, pilot lifecycle, analytics and integration readiness |
| Telegram user | Linked-identity localized event notifications and a Mini App entry point                                                                             |

The source of truth for requirements is
`openspec/specs/agritech-marketplace/spec.md`. Public user operations are owned
by `@app/backend-feature-agritech-main`; privileged operations are owned by
`@app/backend-feature-agritech-admin`; PostgreSQL persistence and state-machine
transactions are owned by `@app/backend-postgres-main-agritech`.

## Runtime selection

The checked-in `nrb.config.json` selects the complete runtime closure:

- user, admin, mobile, landing, and site frontends;
- auth, user, admin, Telegram bot, notification consumer, and notification
  scheduler backends;
- AgriTech, PostgreSQL, Redis, S3, authorization, i18n, feature flags, design
  tokens, and notifications.

Run `pnpm nrb setup --config nrb.config.json` to reproduce generated module
wiring and `.nrb` ownership metadata. AgriTech has no implicit default app: the
capability explicitly wires its user module to `user-app-api`, its admin module
to `admin-app-api`, and its persistence adapter to both processes.

## State and isolation guarantees

- Every mutable marketplace record carries `tenantId`; user operations derive
  tenant and user identity from the authenticated principal.
- Partner approval is required before supplier publication or buyer
  reservation.
- Produce reservation locks the listing, verifies the remaining quantity, and
  creates the order in the same PostgreSQL transaction.
- Payment initiation is idempotent per tenant, provider, order, and idempotency
  key. Provider callbacks lock the transaction, verify amount and provider
  identifiers, and reject invalid state transitions or replay changes.
- Delivery transitions are explicit and append actor/time history. A delivered
  transition requires a proof reference.
- Advisory entries retain provider/source attribution, observation time, expiry
  time, and an API-derived stale flag.
- Analytics counts persisted tenant records and paid payment totals. Commission
  uses `AGRITECH_COMMISSION_BASIS_POINTS` (default `800`, meaning 8%) and exposes
  the basis points beside the calculated amount.

## Payment providers

Click, Payme, and BNPL share one provider-neutral initiation API. Providers are
fail-closed: a checkout method is unavailable until its non-secret identity,
HTTPS return-origin allowlist, and secret are configured. BNPL remains disabled
until a contracted provider supplies an HTTPS checkout endpoint and callback
contract.

Payme implements `CheckPerformTransaction`, `CreateTransaction`,
`PerformTransaction`, `CancelTransaction`, `CheckTransaction`, and
`GetStatement` with Basic authentication and the provider's integer-tiyn amount
contract. Click implements prepare and complete callbacks with MD5
authentication, exact amount verification, and the prepare identifier bound to
the completed order.

Production secrets must use Docker secret files:

```dotenv
PAYMENT_TENANT_ID=<tenant-id>
PAYMENT_RETURN_URL_ORIGINS=https://app.example.uz
AGRITECH_COMMISSION_BASIS_POINTS=800
PAYME_MERCHANT_ID=<issued-id>
PAYME_SECRET_KEY_FILE=/run/secrets/payme_secret_key
CLICK_SERVICE_ID=<issued-id>
CLICK_MERCHANT_ID=<issued-id>
CLICK_SECRET_KEY_FILE=/run/secrets/click_secret_key
BNPL_CHECKOUT_URL=
```

Merchant onboarding, credential issuance, and real-money canaries are external
provider actions. They are not replaced with test credentials or marked ready
by source code.

## Telegram and notifications

Select the Compose `telegram`, `notification-consumer`, and
`notification-scheduler` profiles. The bot opens the selected Mini App and the
AgriTech application publishes localized EN/RU/UZ durable notification intents
for partner decisions, field-agent assignments, advisories, scheduled
deliveries, and produce reservations. User-targeted Telegram delivery resolves
the linked provider identity through the auth boundary.

The following must be issued outside the repository before live execution:

- Telegram bot token, webhook secret, and public HTTPS webhook URL;
- Telegram OIDC client identity and secret;
- notification payload encryption key;
- an actual linked test account for the live provider canary.

See [Social Auth and Bots](social-auth-bots.md) and
[Notifications](notifications.md) for the transport-specific contract.

## Localization

English, Russian, and Uzbek (`en`, `ru`, `uz`) are first-class runtime locales.
AgriTech user, admin, mobile, bot, error, and operation catalogs are loaded by
their owning applications. Product names may carry localized Russian and Uzbek
variants while preserving the supplier's canonical name. A missing key fails
the static catalog checks instead of silently creating an AgriTech-only
fallback.

## Pilot governance

Pilot cohorts persist targets, dates, lifecycle, and actual tenant metrics. The
admin application can create, activate, and complete a cohort and compares the
target farmer/supplier counts with actual approvals, orders, paid payments, and
deliveries.

The research milestone of 100 Fergana farmers and 5–10 live suppliers is a real
business outcome. The repository provides the cohort, onboarding, and analytics
mechanics, but names, consent, contracts, and production transactions must come
from actual counterparties. Operators must not seed fabricated participants to
claim that milestone.

## Deployment and rollback

1. Copy `.env.production.example` through the production initializer and set
   all required non-secret values.
2. Configure the merchant identity and secret-file path only for enabled
   providers. The production wrapper adds the provider-specific secret overlay;
   uncontracted providers stay disabled and require no placeholder secret file.
3. Run `pnpm run deploy:validate:docker`, `pnpm run test:deploy`, and
   `pnpm run docker:prod:config:check`.
4. Back up PostgreSQL, render the exact selected Compose profiles, and apply the
   additive AgriTech migrations before accepting traffic.
5. Verify readiness for user/admin APIs, notification workers, Telegram (when
   enabled), and the chosen payment providers.

Application rollback uses the prior immutable image. Database rollback is
available through the reversible AgriTech migration, but destructive down
migrations require a maintenance window and a verified backup. Provider
callbacks must be disabled before rolling back a schema that owns their
transaction rows.

## Evidence boundaries

Repository validation can prove types, lint, unit/component behavior, migration
shape, OpenAPI/client parity, localized catalog parity, selected Compose
rendering, and exact-revision requirement mappings. It cannot prove production
DNS/TLS, credential validity, provider settlement, live weather/agronomy data,
restored backups, device-network behavior, or genuine pilot conversion without
the corresponding environment and counterparties. Those remain explicit launch
gates in the OpenSpec verification sidecar.
