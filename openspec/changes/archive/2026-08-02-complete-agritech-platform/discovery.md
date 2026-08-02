# Discovery

## Actors

- Farmer: enrolls a farm, buys inputs, lists produce, receives advice, and
  tracks payment and delivery.
- Supplier: submits an organization for approval, manages owned input products
  and inventory, and fulfills input orders.
- Buyer: submits an organization for approval, searches produce, makes a
  reservation, and tracks fulfillment.
- Field agent: sees only assigned farmers and records visits, grading, delivery,
  and advisory observations through the mobile client.
- Administrator: approves partners, assigns agents, moderates catalog and
  listings, advances controlled states, manages pilot cohorts, and reads
  tenant-scoped analytics.
- Payment provider: Click or Payme callback principal authenticated by the
  provider-specific protocol.
- External data provider: weather, agronomy, export, or government connector
  that is configured explicitly and fails closed when unavailable.

## Business Rules

- Every mutable record is tenant scoped; actor ownership comes from the
  authenticated principal or an administrator-controlled membership.
- Supplier and buyer organizations remain pending until approved. Membership,
  approval, field-agent assignment, listing ownership, and order ownership are
  never client assertions.
- Input catalog rows are owned by approved suppliers. Produce listings are
  owned by active farmers, carry a normalized grade, quantity, unit, region,
  availability window, and server-normalized UZS price.
- Price discovery returns an explainable bounded range from active tenant data;
  it is not represented as an exchange quote or guaranteed sale price.
- Reservations and input orders lock inventory atomically. Cancellation and
  terminal transitions cannot double-release or double-consume inventory.
- Delivery transitions follow `scheduled -> assigned -> picked_up -> in_transit
-> delivered` with explicit cancellation and proof metadata.
- Click, Payme, and BNPL intents persist exact amounts and idempotency keys.
  Callbacks authenticate before lookup or mutation, reject amount/order
  mismatches, and replay the stored result for duplicate provider requests.
- Advisory recommendations cite the observation and rule/provider source.
  Missing or stale weather data is explicit and never fabricated.
- Domain events create transport-neutral notification intents; the existing
  scheduler/consumer owns retry, deduplication, and terminal delivery.
- Pilot cohorts track enrollment and platform activity but never claim that a
  real-world farmer, supplier, payment, delivery, or field visit occurred merely
  because source code or fixture data exists.
- Uzbek, Russian, and English catalogs have key and placeholder parity.
- Deployment configuration contains references and validation only; secret
  values and live infrastructure changes remain external operations.

## Examples

- An approved supplier adds fertilizer stock; a farmer orders it; the stock is
  decremented once; payment settles once; a delivery is assigned and completed.
- A farmer lists Grade A cherries; an approved buyer reserves part of the lot;
  the remaining quantity is still discoverable and the price range explains
  its source sample size.
- A field agent records a visit only for an assigned farmer and cannot mutate a
  different tenant or unassigned profile.
- A duplicate Payme or Click callback returns the original transaction result
  without a second state transition.
- A weather connector timeout produces an unavailable/stale state and does not
  invent rainfall or agronomy advice.

## Counterexamples

- A client-supplied supplier, buyer, farmer, agent, tenant, amount, status, grade
  approval, or payment result never establishes authority.
- A callback URL, static redirect, sample dashboard metric, hard-coded forecast,
  or generated fixture is not external integration evidence.
- A pilot cohort with seeded members is not evidence of real partner contracts
  or field participation.

## Boundaries and Failure Modes

- Database write failures roll back the complete business transaction.
- Conflicting idempotency keys, exhausted inventory, illegal transitions,
  unapproved actors, foreign records, and duplicate assignments fail safely.
- Providers have bounded timeouts and explicit disabled/degraded readiness.
- Sensitive callback bodies, credentials, phone numbers, and location details
  are not written to public errors or unredacted telemetry.
- Existing farmer-side reads remain compatible; newly returned fields are
  additive.

## Reviewers

- Product/domain: repository maintainer.
- Security: authentication, tenant isolation, callbacks, and secret handling.
- Operations: migrations, readiness, deployment, observability, and rollback.
- Verification: acceptance, API, domain, persistence, frontend, and mobile
  evidence.

## Unresolved External Inputs

- Real Click/Payme merchant identifiers, secrets, sandbox accounts, and provider
  approval are not present.
- No named weather/agronomy/government API contract or credential is present.
- Real pilot participants, supplier agreements, buyer relationships, field
  agents, domains, certificates, and a deployment destination require external
  coordination.

These inputs block live canaries and field operations, not implementation of
the fail-closed source, configuration, state machines, and verification hooks.
