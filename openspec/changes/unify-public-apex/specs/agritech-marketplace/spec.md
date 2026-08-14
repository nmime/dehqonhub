## MODIFIED Requirements

### Requirement: [REQ-AGRITECH-DEPLOYMENT-014] Selected deployment is operationally prepared

The selected Docker topology SHALL include every AgriTech runtime dependency,
migration, immutable build input, secret reference, public/internal route,
health/readiness probe, resource boundary, telemetry signal, backup/restore
contract, and rollback instruction required for staging and production
validation without embedding credentials or applying infrastructure. The
DehqonHub per-app deployment SHALL expose selected `user-app` at the configured
`PUBLIC_DOMAIN` apex and its root, SHALL exclude landing/site deployables and
their full-stack reference harness from the product selection and release set,
SHALL preserve the administrator application at `/admin` on its host, and SHALL
derive browser destinations, certificates, reverse-proxy hosts, allowed
origins, and enabled Telegram routes from that same selected topology.

**Evidence profile:** operations, security

**Invariants:**

- Public browser destinations never embed credentials, query strings, or fragments.
- The Admin destination includes its `/admin` router base path.
- The user application and Telegram Mini App use the apex origin; no
  `user-app.<domain>` compatibility host is published.
- Unselected landing/site applications contribute no image, listener, host,
  certificate name, trusted origin, or readiness expectation.
- CORS, Better Auth trusted/return origins, payment return origins, and public
  runtime URLs include the selected apex and exclude deselected or unknown
  landing/site/user-app hosts.
- Secret values remain file-backed and absent from rendered public configuration.

**Failure behavior:**

- Missing routes, invalid host derivation, incomplete certificate coverage, or unsupported proxy configuration fails validation before traffic changes.

#### Scenario: Deployment validation

- **WHEN** operators render and validate the selected deployment without secrets
- **THEN** all AgriTech services, migrations, routes, probes, and required secret references are internally consistent and no live change occurs

#### Scenario: Canonical selected destinations

- **WHEN** the public apex and application hosts are derived for production
- **THEN** users enter the complete user application at the apex `/`,
  administrators enter the admin host at `/admin`, Telegram opens the apex
  Mini App route, and no landing, site, or user-app subdomain is published or trusted

### Requirement: [REQ-AGRITECH-ROUTING-015] Product routes use the repository root ownership boundary

The platform SHALL expose the canonical user AgriTech workflow at `/` on the
configured `PUBLIC_DOMAIN` apex, SHALL expose general AgriTech user API
resources without an `agritech` prefix, SHALL expose DehqonHub commerce APIs
below `/marketplace/*`, SHALL expose the canonical operator workflow at
`/admin`, and SHALL expose privileged AgriTech API resources directly below
`/admin`, including marketplace operations below `/admin/marketplace/*`. The
`/marketplace/*` API namespace MUST keep same-origin JSON resources distinct
from SPA deep links such as `/catalog`, `/cart`, and `/problems`;
`/marketplace` itself MUST NOT become a second product route. The apex MUST
serve selected `user-app` and MUST NOT publish `user-app.<domain>` or a
landing/site renderer as another
first-party product entry point. First-party web routes, API controllers,
reverse proxies, OpenAPI contracts, generated clients, navigation, and payment
return URLs MUST agree on those canonical paths and MUST NOT register redirects
or compatibility aliases for `/admin/agritech`, `/agritech/*`, or
`/admin/agritech/*`.

The `/admin` boundary, session authentication, tenant derivation, endpoint
permissions, request and response shapes, RFC 9457 failures, provider callback
authentication, concurrency, and idempotency behavior SHALL remain unchanged.
Domain identifiers and the Telegram `/agritech` command are outside the HTTP
path prohibition and SHALL retain their existing semantics.

**Evidence profile:** api, journey, operations

**Invariants:**

- Every canonical first-party HTTP path has one owner and no old-path alias.
- The selected user SPA and Telegram Mini App share the apex origin; no
  user-app subdomain or marketing renderer is a second product entry point.
- No user/admin OpenAPI path or generated client path contains `/agritech` or
  `/admin/agritech`.
- Every DehqonHub commerce operation uses `/marketplace/*`, while DehqonHub
  browser deep links, including `/problems`, remain SPA-owned without that
  prefix.
- `/admin` remains the privileged application and API boundary; collapsing the
  product namespace MUST NOT weaken RBAC or tenant isolation.
- Route migration MUST NOT alter write idempotency, callback replay handling,
  or concurrent inventory and order behavior.
- User/admin providers and their generated consumers are versioned and rolled
  out as one compatible revision.

**Failure behavior:**

- A removed web path, API path, or unselected application host receives the
  edge/owner's normal rejection or not-found outcome and is not redirected or
  rewritten into a compatibility entry point.
- A stale generated artifact or client path fails contract freshness or
  product-route verification before release.
- A stale independently deployed consumer may receive a not-found response and
  must migrate to the regenerated contract; the server does not conceal that
  incompatibility.
- Rollback redeploys the prior immutable API and client revisions together;
  mixed-revision rollback is unsupported.

#### Scenario: User product and resources are rooted directly

- **WHEN** a user opens the public product or a generated client addresses an
  authorized AgriTech resource
- **THEN** `user-app` owns the configured apex `/`, general APIs use direct
  resource paths such as `/orders`, `/produce`, or `/payments`, and DehqonHub
  commerce APIs use paths such as `/marketplace/catalog`, `/marketplace/cart`,
  or `/marketplace/contracts/{id}` without publishing a user-app subdomain or
  marketing renderer

#### Scenario: Same-origin marketplace APIs do not collide with browser routes

- **WHEN** the apex serves the `/catalog`, `/cart`, or `/problems` browser deep
  link and the client requests any corresponding marketplace data
- **THEN** the browser route resolves to the SPA, the generated client uses
  `/marketplace/*`, and every supported frontend reverse proxy sends that API
  namespace to `user-app-api` rather than returning `index.html`

#### Scenario: Operator product retains its privilege boundary

- **WHEN** an authorized operator opens the product or a generated admin client
  addresses an AgriTech resource
- **THEN** the product uses `/admin` and the API uses a direct privileged path
  such as `/admin/partners`, `/admin/analytics`,
  `/admin/marketplace/commission-policies`, or
  `/admin/marketplace/engagement/review-reports` with the existing guard and
  endpoint permission

#### Scenario: Removed namespaces do not survive as aliases

- **WHEN** a caller addresses `/marketplace` as a product-route alias,
  `/admin/agritech`, an `/agritech/*` API path, or an `/admin/agritech/*` API
  path
- **THEN** no product route, redirect, or compatibility shim recognizes that
  old path, while only the documented `/marketplace/*` user APIs and
  `/admin/marketplace/*` privileged APIs remain valid

#### Scenario: Payment returns to the canonical product

- **WHEN** an authorized user initiates a configured payment handoff
- **THEN** the client supplies an apex return URL whose pathname is `/` while
  all payment amount, provider, authentication, idempotency, and replay rules
  remain unchanged

#### Scenario: Stale consumer is observable

- **WHEN** post-rollout telemetry records a request for a removed HTTP path or
  unselected application hostname
- **THEN** operators can identify it as a stale consumer from the normal
  rejection/not-found telemetry without a redirect masking the mismatch
