## Context

AgriTech is selected as the complete repository product, but HTTP ownership is
split across redundant namespaces. The user SPA's broad workflow is mounted at
`/marketplace`, the admin SPA's product workflow at `/admin/agritech`, user API
controllers below `/agritech`, and admin API controllers below
`/admin/agritech`. Those prefixes are copied into OpenAPI, shared types,
frontend generated clients, wrappers, navigation, and a payment return URL.

The route inventory shows that removing the segments creates no provider path
collision. The admin surface must retain `/admin` because it is a separate
application, reverse-proxy boundary, authentication surface, and RBAC boundary.
There is no database or payload migration.

## Goals / Non-Goals

**Goals:**

- Make the repository root hierarchy accurately express product ownership.
- Change provider source first and regenerate every committed consumer artifact.
- Remove old paths instead of maintaining dual route ownership.
- Give unknown user routes an explicit not-found view so a removed route cannot
  appear to work through the previous home fallback.
- Preserve security, tenant, payload, failure, concurrency, and idempotency
  behavior.

**Non-Goals:**

- Rename domain symbols, packages, features, OpenAPI tags, or Telegram commands.
- Change generic account/admin secondary resource names.
- Add version negotiation, redirects, or a compatibility period.
- Change persistence, deployment routing, provider configuration, or callback
  protocols.

## Decisions

### 1. Remove the namespace at the controller source

Nest controllers remain the contract source. The broad user controller uses an
empty prefix while its method resource paths remain unchanged; farmer, catalog,
orders, and payments use direct resource prefixes. The privileged controller
uses `admin`, preserving all class guards and method permissions.

Changing generated JSON or clients directly was rejected because it would
leave runtime routing stale and violate repository contract ownership.

### 2. Use product roots, not aliases, in both SPAs

The user index route renders the AgriTech operations page. The duplicate
`/marketplace` route and navigation item are removed, and payment handoff
returns to `/`. Unknown paths render an explicit localized not-found state.

The admin `/` route renders the AgriTech admin page behind
`canReadAgriTech`; the generic dashboard remains at `/dashboard`. Navigation
links the AgriTech entry to `/admin` and the dashboard to
`/admin/dashboard`. `/agritech` is removed from the route tree and matrix.

Keeping redirects was rejected because the maintainer explicitly selected the
root ownership model and aliases would preserve ambiguity indefinitely.

### 3. Regenerate every derived API artifact in dependency order

After controller edits, run the repository OpenAPI exporter, generated-client
generator, and API presentation generator. Wrapper path constants are updated
to the new generated `paths` keys. Freshness and OpenAPI lint gates compare the
committed artifacts with a clean source-derived export.

### 4. Treat the migration as one compatible release unit

User/admin APIs and all first-party frontends are versioned together. No code
supports mixed old/new revisions. Route metadata tests, frontend route tests,
contract freshness, and a targeted stale HTTP-path scan challenge partial
migration before release.

### 5. Distinguish HTTP namespaces from domain identity

The prohibition applies to registered browser/API paths and generated HTTP path
keys. AgriTech class names, filesystem paths, package names, OpenAPI tags, docs,
and the Telegram `/agritech` command remain because removing them would change
domain vocabulary or bot behavior rather than solve HTTP ownership.

## Risks / Trade-offs

- **Breaking callers** → Publish matching providers and generated consumers in
  one release and make old paths fail visibly instead of silently redirecting.
- **Controller collision after prefix removal** → Verify the transformed route
  inventory has no duplicates, export both OpenAPI documents, and lint them.
- **Admin privilege regression** → Keep `/admin`, `AdminRbacGuard`, and every
  endpoint permission intact; assert root route denial and direct controller
  prefixes.
- **Removed SPA path looks valid through fallback content** → Replace the user
  home fallback with an explicit localized not-found page.
- **Generated drift** → Regenerate OpenAPI, shared types, frontend clients, and
  presentation files, then run all freshness checks.
- **Loss of generic dashboard discoverability** → Keep the page and move only
  its navigation target to `/admin/dashboard`.
- **Telemetry ambiguity** → Do not redirect old paths; normal not-found request
  telemetry remains attributable to stale consumers.

## Migration Plan

1. Add the durable requirement and evidence mapping.
2. Change controller prefixes, SPA routes/navigation, not-found handling,
   callback return URL, wrappers, and documentation.
3. Add/adjust provider metadata and frontend routing tests.
4. Regenerate every committed contract/client/presentation artifact.
5. Run formatting, focused project builds/tests, API freshness/lint,
   specification validation/impact/evidence, stale-path scan, and repository
   diff checks.
6. Release matching API and client images together.
7. If rollback is required, redeploy the prior immutable API and client
   revisions together. No database action is required.

## Open Questions

- None.
