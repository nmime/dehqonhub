## ADDED Requirements

### Requirement: [REQ-AGRITECH-ROUTING-015] Product routes use the repository root ownership boundary

The platform SHALL expose the canonical user AgriTech workflow at `/`, SHALL
expose general AgriTech user API resources without an `agritech` prefix, SHALL
expose DehqonHub commerce APIs below `/marketplace/*`, SHALL expose the canonical
operator workflow at `/admin`, and SHALL expose privileged AgriTech API
resources directly below `/admin`. The `/marketplace/*` API namespace MUST keep
same-origin JSON resources distinct from SPA deep links such as `/catalog` and
`/cart`; `/marketplace` itself MUST NOT become a second product route.
First-party web routes, API controllers, reverse proxies, OpenAPI contracts,
generated clients, navigation, and payment return URLs MUST agree on those
canonical paths and MUST NOT register redirects or compatibility aliases for
`/admin/agritech`, `/agritech/*`, or `/admin/agritech/*`.

The `/admin` boundary, session authentication, tenant derivation, endpoint
permissions, request and response shapes, RFC 9457 failures, provider callback
authentication, concurrency, and idempotency behavior SHALL remain unchanged.
Domain identifiers and the Telegram `/agritech` command are outside the HTTP
path prohibition and SHALL retain their existing semantics.

**Evidence profile:** api

**Invariants:**

- Every canonical first-party HTTP path has one owner and no old-path alias.
- No user/admin OpenAPI path or generated client path contains `/agritech` or
  `/admin/agritech`.
- Every DehqonHub commerce operation uses `/marketplace/*`, while DehqonHub
  browser deep links remain SPA-owned without that prefix.
- `/admin` remains the privileged application and API boundary; collapsing the
  product namespace MUST NOT weaken RBAC or tenant isolation.
- Route migration MUST NOT alter write idempotency, callback replay handling,
  or concurrent inventory and order behavior.
- User/admin providers and their generated consumers are versioned and rolled
  out as one compatible revision.

**Failure behavior:**

- A removed web or API path receives the owning runtime's normal not-found
  outcome and is not redirected or rewritten.
- A stale generated artifact or client path fails contract freshness or
  product-route verification before release.
- A stale independently deployed consumer may receive a not-found response and
  must migrate to the regenerated contract; the server does not conceal that
  incompatibility.
- Rollback redeploys the prior immutable API and client revisions together;
  mixed-revision rollback is unsupported.

#### Scenario: User product and resources are rooted directly

- **WHEN** a user opens the product or a generated client addresses an
  authorized AgriTech resource
- **THEN** the product uses `/`, general APIs use direct resource paths such as
  `/orders`, `/produce`, or `/payments`, and DehqonHub commerce APIs use paths
  such as `/marketplace/catalog`, `/marketplace/cart`, or
  `/marketplace/contracts/{id}`

#### Scenario: Same-origin marketplace APIs do not collide with browser routes

- **WHEN** a same-origin deployment serves the `/catalog` or `/cart` browser
  deep link and the client requests the corresponding marketplace data
- **THEN** the browser route resolves to the SPA, the generated client uses
  `/marketplace/*`, and every supported frontend reverse proxy sends that API
  namespace to `user-app-api` rather than returning `index.html`

#### Scenario: Operator product retains its privilege boundary

- **WHEN** an authorized operator opens the product or a generated admin client
  addresses an AgriTech resource
- **THEN** the product uses `/admin` and the API uses a direct privileged path
  such as `/admin/partners`, `/admin/analytics`, or `/admin/integrations` with
  the existing guard and endpoint permission

#### Scenario: Removed namespaces do not survive as aliases

- **WHEN** a caller addresses `/marketplace` as a product-route alias,
  `/admin/agritech`, an `/agritech/*` API path, or an `/admin/agritech/*` API
  path
- **THEN** no product route, redirect, or compatibility shim recognizes that
  old path, while only the documented `/marketplace/*` API resources remain
  valid

#### Scenario: Payment returns to the canonical product

- **WHEN** an authorized user initiates a configured payment handoff
- **THEN** the client supplies a return URL whose pathname is `/` while all
  payment amount, provider, authentication, idempotency, and replay rules remain
  unchanged

#### Scenario: Stale consumer is observable

- **WHEN** post-rollout telemetry records a request for a removed HTTP path
- **THEN** operators can identify it as a stale consumer from the normal
  not-found request telemetry without a redirect masking the mismatch
