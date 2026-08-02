# agritech-marketplace Specification

## Purpose

Defines the complete, tenant-isolated AgriTech operating platform for farmers, suppliers, buyers, field agents, administrators, payments, fulfillment, advisory, analytics, localization, integrations, and deployment readiness.

## Requirements

### Requirement: [REQ-AGRITECH-PROFILE-001] Farmer profiles are authenticated and operationally owned

The user API SHALL let an authenticated principal create, read, and update at
most one tenant-owned farmer profile, SHALL validate Uzbekistan profile fields,
SHALL NOT allow user-controlled role, verification, pilot, or field-agent state,
and SHALL expose assignments only to the assigned agent or an authorized
administrator.

#### Scenario: Owned farmer enrollment

- **WHEN** an authenticated member submits a valid farmer profile
- **THEN** the API persists one profile bound to that principal and returns only safe public fields

#### Scenario: Assignment denial

- **WHEN** an unassigned field agent or foreign tenant addresses the farmer
- **THEN** the API returns a safe denial or not-found response without disclosing the profile

### Requirement: [REQ-AGRITECH-CATALOG-002] The catalog supports governed inputs and produce

The platform SHALL expose active tenant catalog items, SHALL distinguish
supplier-owned inputs from farmer-owned produce, SHALL validate category,
region, availability, unit, grade, and inventory, and SHALL limit mutation to
the owning approved actor or an authorized administrator.

#### Scenario: Supplier input publication

- **WHEN** an approved supplier publishes a valid stocked input
- **THEN** farmers can discover it and only that supplier or an administrator can mutate it

#### Scenario: Produce listing publication

- **WHEN** an active farmer publishes graded produce with an availability window
- **THEN** approved buyers can discover the available quantity without seeing private farmer data

### Requirement: [REQ-AGRITECH-ORDER-003] Orders and reservations are atomic and trackable

The platform SHALL server-price owned input orders and produce reservations,
SHALL atomically lock and consume the appropriate inventory, SHALL expose only
authorized records, SHALL enforce legal cancellation and fulfillment
transitions, and SHALL keep a durable state history.

#### Scenario: Input order creation

- **WHEN** an active farmer orders available supplier inputs
- **THEN** server-derived lines, totals, stock mutation, history, and notification intent commit once

#### Scenario: Produce reservation conflict

- **WHEN** concurrent buyers reserve more than a listing's remaining quantity
- **THEN** at most the available quantity is reserved and losing requests fail without partial writes

### Requirement: [REQ-AGRITECH-PAYMENT-004] Payments are persistent and idempotent

The platform SHALL create exact-amount Click, Payme, or BNPL payment intents for
authorized orders, SHALL persist provider and idempotency identities, SHALL
authenticate callbacks before mutation, SHALL reject amount/order mismatches,
SHALL enforce legal transitions and idempotent replay, and SHALL expose explicit
disabled/degraded readiness when configuration or provider evidence is absent.

#### Scenario: Idempotent provider settlement

- **WHEN** an authenticated provider repeats a settlement callback with the same identity
- **THEN** the stored successful result is returned without duplicate payment or order mutation

#### Scenario: Invalid callback

- **WHEN** authentication, amount, order identity, state, or configuration is invalid
- **THEN** the callback fails safely and no payment or order state changes

### Requirement: [REQ-AGRITECH-TELEGRAM-005] Telegram messages are linked and event driven

The selected Telegram bot SHALL link an authenticated farmer identity, expose
source-backed marketplace navigation and status, and deliver typed localized
order, payment, delivery, and advisory notification intents through the
existing notification scheduler and consumer without fabricated data.

#### Scenario: Linked order notification

- **WHEN** a linked farmer's order advances state
- **THEN** one localized deduplicated Telegram notification intent is scheduled

#### Scenario: Unlinked identity

- **WHEN** a Telegram user requests private AgriTech data without a valid link
- **THEN** the bot returns a safe linking path and no tenant data

### Requirement: [REQ-AGRITECH-WEB-006] Product clients expose complete real workflows

The user SPA, admin SPA, and Expo mobile app SHALL consume generated contracts
for their authorized AgriTech journeys and SHALL render localized loading,
offline, empty, validation, denied, conflict, provider-unavailable, recovery,
and success states without fabricated business records or metrics.

#### Scenario: Multi-surface workflow

- **WHEN** farmer, supplier, buyer, administrator, or field agent opens an authorized workflow
- **THEN** the owning client renders the real API state with accessible recovery and no sample operational claims

### Requirement: [REQ-AGRITECH-PARTNER-007] Suppliers and buyers are approved organizations

The platform SHALL let authenticated users submit one or more tenant-owned
supplier or buyer organizations, SHALL require administrator approval before
commercial mutation, and SHALL enforce organization membership on every owned
catalog, reservation, and fulfillment action.

#### Scenario: Pending supplier cannot publish

- **WHEN** a pending supplier attempts to create or update an input item
- **THEN** the request is denied and no catalog record is written

### Requirement: [REQ-AGRITECH-OUTPUT-008] Output aggregation has explainable price and grade controls

The platform SHALL aggregate available produce listings, SHALL use normalized
quality grades and units, SHALL calculate an explainable tenant-and-region price
range from eligible active listings, and SHALL never represent the range as a
guaranteed exchange or export quote.

#### Scenario: Price discovery result

- **WHEN** an approved buyer requests price discovery for a crop and region
- **THEN** the response includes minimum, median, maximum, sample size, currency, unit, and observation time

### Requirement: [REQ-AGRITECH-ADVISORY-009] Advisory and weather states are source attributable

The platform SHALL store source-attributed weather observations and agronomy
recommendations, SHALL scope them to authorized farms, SHALL mark staleness and
provider availability, and SHALL not fabricate measurements or advice when a
configured upstream is absent or fails.

#### Scenario: Stale weather evidence

- **WHEN** the newest observation exceeds its freshness window
- **THEN** the farmer sees a stale state and recommendations that require fresh weather are withheld

### Requirement: [REQ-AGRITECH-FULFILLMENT-010] Field operations and delivery are controlled

The platform SHALL allow administrators to assign field agents and deliveries,
SHALL let agents update only assigned work, SHALL enforce ordered delivery
transitions, and SHALL record visits, grading, proof references, timestamps,
and an auditable actor identity.

#### Scenario: Assigned delivery completion

- **WHEN** the assigned agent records pickup, transit, and delivery with required proof
- **THEN** each legal state is appended once and the related order becomes delivered

### Requirement: [REQ-AGRITECH-ANALYTICS-011] Analytics and pilot cohorts are evidence bounded

The admin platform SHALL provide tenant-scoped funnel, GMV, commission,
inventory, fulfillment, retention, and pilot cohort metrics derived from stored
records, SHALL distinguish configured targets from achieved values, and SHALL
not count fixtures or source presence as real-world activity.

#### Scenario: Pilot progress

- **WHEN** an administrator views a pilot cohort
- **THEN** targets and actual verified farmer, supplier, order, payment, and delivery counts are reported separately

### Requirement: [REQ-AGRITECH-I18N-012] Uzbek, Russian, and English have catalog parity

The platform SHALL support Uzbek, Russian, and English locale negotiation,
preferences, product clients, bot messages, notifications, problem details, and
stored recipient language with identical keys and placeholder contracts.

#### Scenario: Uzbek journey

- **WHEN** a user selects Uzbek
- **THEN** supported AgriTech navigation, forms, states, errors, and notifications render in Uzbek and persist across sessions

### Requirement: [REQ-AGRITECH-INTEGRATION-013] External connectors fail closed and reconcile

Weather, agronomy, export, government, and commercial provider adapters SHALL
have explicit configuration, bounded timeouts, source identity, idempotent
cursor or request semantics, reconciliation status, readiness, and redacted
telemetry; an absent contract or credential SHALL disable the connector without
fabricated data.

#### Scenario: Disabled government connector

- **WHEN** no approved Agroportal or Digital Agriculture API contract is configured
- **THEN** readiness reports disabled and no request, synchronization claim, or synthetic record is produced

### Requirement: [REQ-AGRITECH-DEPLOYMENT-014] Selected deployment is operationally prepared

The selected Docker topology SHALL include every AgriTech runtime dependency,
migration, immutable build input, secret reference, public/internal route,
health/readiness probe, resource boundary, telemetry signal, backup/restore
contract, and rollback instruction required for staging and production
validation without embedding credentials or applying infrastructure.

#### Scenario: Deployment validation

- **WHEN** operators render and validate the selected deployment without secrets
- **THEN** all AgriTech services, migrations, routes, probes, and required secret references are internally consistent and no live change occurs
