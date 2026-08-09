## Participants and Owners

- Product/domain owner: repository maintainer, through the explicit direction
  that this repository is the AgriTech product and therefore owns `/`.
- Specification author: `agritech-maintainers`.
- Independent verification reviewer: `quality-engineering`, through the
  version 3 evidence owner and exact-revision verification lane.
- Security reviewer, when applicable: `security-maintainers` for preservation
  of the `/admin` RBAC boundary.
- Operations reviewer, when applicable: `platform-operations` for atomic
  client/API rollout and immutable rollback.

## Actors and Outcomes

- Farmers, suppliers, buyers, and field agents open the AgriTech product at
  `/` and use browser resources such as `/catalog` plus general API resources
  such as `/orders` and `/produce` without a redundant `agritech` segment.
- Administrators open the AgriTech operating surface at `/admin`; secondary
  generic admin capabilities remain on explicit subroutes such as
  `/admin/dashboard`, `/admin/users`, and `/admin/audit`.
- Browser and mobile clients consume generated paths that exactly match the
  changed user and admin providers.
- Payment providers return users to the canonical `/` product surface after
  handoff.
- Operators deploy matching client and API revisions and can detect any old
  HTTP namespace in generated contracts before release.

## Rules

- The canonical user product page SHALL be `/`; the duplicate `/marketplace`
  page route SHALL NOT be registered.
- The canonical AgriTech admin page SHALL be `/admin`; the generic dashboard
  remains available at `/admin/dashboard`, and `/admin/agritech` SHALL NOT be
  registered.
- General user API routes SHALL be rooted at the resource name: `/farmer`,
  `/orders`, `/partners`, `/supplier/products`, `/produce`,
  `/field-agent/farmers`, `/deliveries`, `/field-visits`, `/advisories`, and
  `/payments`.
- DehqonHub commerce API routes SHALL use `/marketplace/*`, including
  `/marketplace/catalog`, `/marketplace/cart`, `/marketplace/requests`, and
  `/marketplace/contracts/{id}`, while the corresponding browser journeys stay
  at SPA routes such as `/catalog` and `/cart`.
- Privileged AgriTech API routes SHALL retain the `/admin` boundary but SHALL
  use direct resources such as `/admin/partners`, `/admin/farmers`,
  `/admin/orders`, `/admin/deliveries`, `/admin/advisories`,
  `/admin/analytics`, `/admin/pilots`, and `/admin/integrations`.
- The migration SHALL NOT add redirects, duplicate controllers, fallback route
  aliases, or client-side compatibility shims for removed paths.
- Existing session authentication, tenant derivation, admin guards,
  permissions, DTOs, response envelopes, RFC 9457 failures, and provider
  authentication SHALL remain unchanged.
- Domain identifiers may retain `AgriTech`, and the Telegram `/agritech`
  command remains because bot commands are not HTTP route namespaces.

## Examples

- A farmer loading `/` sees the real AgriTech operations workflow; loading
  `/catalog` reaches the governed input catalog.
- `GET /marketplace/catalog` is present in the user OpenAPI document and
  generated user client, while `GET /catalog` and `GET /agritech/catalog` are
  absent from the API contract because `/catalog` is SPA-owned.
- An authorized operator loading `/admin` sees the AgriTech admin workflow;
  the same operator can load the generic dashboard at `/admin/dashboard`.
- `GET /admin/analytics` remains protected by the existing AgriTech read
  permission and appears in the regenerated admin contract.
- A payment initiated from the canonical workflow receives a return URL whose
  pathname is `/`.

## Counterexamples and Boundaries

- `/agritech/catalog`, `/admin/agritech/partners`, `/admin/agritech`, and the
  bare `/marketplace` browser alias are removed paths, not silent aliases to
  the new routes; documented `/marketplace/*` commerce APIs remain valid.
- `/admin` is not collapsed to `/`; it is the stable privilege and reverse
  proxy boundary for the separate admin application and API.
- `/profile`, `/auth/*`, `/settings`, `/health`, `/live`, and `/ready` are
  existing non-AgriTech infrastructure or account routes and remain unchanged.
- The path migration changes no record ownership. A foreign tenant or
  unprivileged administrator receives the same safe denial after the route
  move.
- Generated code may contain AgriTech operation names and tags, but no generated
  HTTP path may retain `/agritech` or `/admin/agritech`.
- The Telegram text command `/agritech` is expected to remain and must be
  excluded from HTTP-path stale scans.

## Failure and Operational Modes

- A partial rollout can produce client/server 404 responses. Build, publish,
  and deploy matching API and client revisions as one release unit.
- Contract or client regeneration drift fails `api:contracts:check`,
  `api:clients:check`, or the stale-path scan before release.
- An accidental controller collision after prefix removal fails OpenAPI export
  or produces duplicate operations; the pre-change route inventory has no
  transformed collisions in either provider.
- Admin RBAC regression is challenged at the route matrix and controller
  contract boundaries; removal of the path segment does not remove guards.
- There is no data migration, cache conversion, replay, or callback-state
  migration. Rollback redeploys the prior immutable API and client revisions
  together.
- Logs and telemetry should show the new resource paths after rollout; traffic
  to old paths represents a stale consumer and is not rewritten.

## Assumptions

- The maintainer's direction explicitly authorizes the breaking removal of the
  redundant route namespace and resolves the canonical-path choice.
- First-party consumers are released from this monorepo and can move atomically
  with the providers; any external consumer must use the regenerated OpenAPI
  contract before rollout.
- Existing reverse-proxy ownership of `/admin` remains valid.
- Supported same-origin reverse proxies route `/marketplace/*` to
  `user-app-api` before SPA fallback.

## Unresolved Questions

- None.
