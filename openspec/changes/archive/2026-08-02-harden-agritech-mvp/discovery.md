## Participants and Owners

- Product/domain owner: repository maintainer.
- Backend owners: user API, farmer, product, order, payment, and PostgreSQL
  maintainers.
- Frontend owner: user-app maintainers.
- Verification owner: quality-engineering.
- External readiness owners: merchant operations, agronomy operations, and
  deployment operations.

## Actors and Outcomes

- An authenticated member enrolls one farmer profile and sees only that
  profile and its orders.
- A farmer browses active input products and creates an order using server-side
  product names and prices.
- A configured payment provider may supply a checkout handoff; missing or
  unverified configuration never produces a fake success URL.
- A Telegram user sees navigation and source-backed order/catalog states; the
  bot does not fabricate personal orders, forecasts, or agronomy advice.
- Operators can distinguish local source evidence from external pilot,
  provider, deployment, and sales evidence.

## Rules

- Farmer ownership is derived from the authenticated principal, never a client
  supplied user or farmer identifier.
- A principal owns at most one farmer profile; phone numbers are unique.
- Role and verification status are not self-assignable through the user API.
- Order lines use current server-side products, require positive integral
  quantities, and calculate totals on the server.
- Users can list only their own orders. State transitions and product writes are
  not exposed through the farmer-facing API until a privileged owner exists.
- Provider handoff requires explicit provider configuration, an owned order,
  an exact amount, and an allowlisted HTTPS return URL.
- Payment callbacks require provider authentication, idempotent persistent
  transactions, and exact order-amount validation before they may be enabled.
- Telegram commands use injected ports and explicit unavailable/empty states.
- All supported user-app locales have catalog parity; no user-visible AgriTech
  copy is embedded in JSX or bot handlers.

## Examples

- A member registers a valid Uzbekistan farmer profile and later retrieves the
  same profile using the authenticated session.
- Repeating registration returns a safe conflict without disclosing another
  user's phone or profile.
- A farmer orders two units of an active product; the stored line and total use
  the server-side price even if the client sends unrelated fields.
- An unknown or inactive product produces a safe not-found/bad-request problem.
- A payment request without merchant configuration returns a bounded service
  unavailable problem and no redirect URL.
- `/orders` returns an empty-state message when the Telegram identity is not
  linked or owns no orders.

## Counterexamples and Boundaries

- Client-supplied `farmerId`, `supplierId`, role, status, amount, or order state
  cannot establish authority.
- A static array of sample products or orders is not runtime evidence.
- A checkout-looking URL assembled without required provider configuration is
  not payment integration.
- Logging an unredacted callback body is forbidden.
- The research roadmap is not an executable acceptance source for later-phase
  commercial, logistics, lending, or field-agent work.

## Failure and Operational Modes

- Database failures map to a generic safe server problem and retain private
  diagnostics only in server telemetry.
- Duplicate profile creation and duplicate provider transactions are
  deterministic conflicts/idempotent replays, not duplicate records.
- Missing provider credentials, merchant approval, Telegram linkage, or
  upstream agronomy/weather providers is explicit unavailable evidence.
- Migration checks must prove fresh apply and safe down/up locally; production
  execution remains outside this task.

## Assumptions

- `user-app-api` remains the selected authenticated farmer API.
- PostgreSQL remains the selected durable provider in `.nrb/workspace.json`.
- Input catalog seeding/administration will be performed by a later privileged
  owner; this change provides farmer-facing read behavior only.

## Unresolved Questions

- Merchant-issued Click credentials and its credential-gated API documents are
  unavailable in this repository, so live Click callbacks remain disabled.
- Payme merchant credentials and sandbox approval are unavailable, so provider
  settlement remains runtime-unverified.
- Pilot farmers, suppliers, field agents, deployment, weather, and agronomy
  providers require external coordination and cannot be proven by source code.
