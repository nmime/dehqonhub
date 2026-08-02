# agritech-marketplace Specification

## Purpose

TBD - created by archiving change harden-agritech-mvp. Update Purpose after archive.

## Requirements

### Requirement: [REQ-AGRITECH-PROFILE-001] Farmer profiles are authenticated and owned

The user API SHALL let an authenticated principal create, read, and update at
most one farmer profile owned by that principal, SHALL validate Uzbekistan
profile fields, and SHALL NOT allow user-controlled role or verification
status.

#### Scenario: Owned farmer enrollment

- **WHEN** an authenticated member submits a valid farmer profile
- **THEN** the API persists one profile bound to that principal and returns only
  safe public profile fields

#### Scenario: Duplicate or foreign profile access

- **WHEN** a principal repeats enrollment or attempts to address another
  profile
- **THEN** the API returns a safe conflict or not-found response without
  disclosing the foreign profile

### Requirement: [REQ-AGRITECH-CATALOG-002] Farmers browse source-backed active inputs

The user API SHALL return only active catalog products from the selected
durable provider, SHALL validate category and region filters, and SHALL NOT
expose farmer-facing product mutation routes without a privileged product
owner.

#### Scenario: Catalog result and empty state

- **WHEN** a farmer browses the catalog with valid filters
- **THEN** the API returns matching active products or an explicit empty list
  without inserting sample records

### Requirement: [REQ-AGRITECH-ORDER-003] Orders are priced and scoped on the server

The user API SHALL create and list orders only for the authenticated principal's
farmer profile, SHALL require positive integral quantities, SHALL derive product
identity and price from active server-side catalog data, and SHALL calculate and
persist the total on the server.

#### Scenario: Owned order creation

- **WHEN** an enrolled farmer orders available active products
- **THEN** the persisted order contains server-derived line prices and is
  visible only in that farmer's order list

#### Scenario: Invalid product or quantity

- **WHEN** an order contains an unknown, inactive, unavailable, duplicate, or
  non-positive line
- **THEN** the request fails safely and no partial order is persisted

### Requirement: [REQ-AGRITECH-PAYMENT-004] Payment integration fails closed

The user API SHALL create a provider handoff only for an order owned by the
authenticated principal, with an exact server-derived amount, explicit merchant
configuration, and an allowlisted HTTPS return URL. Provider callbacks SHALL
remain unavailable until provider authentication, persistent idempotency, and
exact state transitions are implemented and verified.

#### Scenario: Missing or unverified provider configuration

- **WHEN** payment handoff or callback prerequisites are absent
- **THEN** the API returns a bounded unavailable response and does not return a
  fabricated redirect or mutate the order

### Requirement: [REQ-AGRITECH-TELEGRAM-005] Telegram AgriTech states are source-backed

The selected Telegram bot SHALL compose AgriTech navigation through its
existing runtime owner and SHALL use linked, injected data ports or explicit
unavailable/empty responses instead of fabricated orders, weather, or agronomy
claims.

#### Scenario: Unlinked Telegram identity

- **WHEN** a Telegram user requests personal AgriTech data without a linked
  farmer profile
- **THEN** the bot gives a safe linking or unavailable response and no sample
  customer data

### Requirement: [REQ-AGRITECH-WEB-006] The user app exposes real request states

The user-app SHALL consume the generated user API client for farmer enrollment,
catalog, and order behavior and SHALL render localized loading, validation,
empty, failure, recovery, and success states without fabricated business data.

#### Scenario: Enrollment and catalog recovery

- **WHEN** a user submits enrollment or loads the catalog
- **THEN** the screen reflects the real API outcome and provides an accessible
  retry or correction path on failure
