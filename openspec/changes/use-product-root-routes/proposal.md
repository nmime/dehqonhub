## Why

AgriTech is the product owned by this repository, not an optional capability
mounted below a second product namespace. Keeping `/agritech` in first-party
web and API routes duplicates that ownership, makes the canonical entry point
ambiguous, and leaks boilerplate-era routing into generated contracts.

## What Changes

- **BREAKING** Remove the leading `/agritech` segment from every user API
  endpoint; for example, `/agritech/catalog` becomes `/catalog`.
- **BREAKING** Remove the nested `agritech` segment from every privileged API
  endpoint while retaining the authorization boundary; for example,
  `/admin/agritech/partners` becomes `/admin/partners`.
- **BREAKING** Make `/` the canonical AgriTech user workflow and `/admin` the
  canonical AgriTech operator workflow. Remove the duplicate `/marketplace`
  and `/admin/agritech` page routes rather than preserving aliases.
- Keep domain/package names, OpenAPI tags, requirement names, and the Telegram
  `/agritech` command unchanged because they identify the domain or bot action,
  not a redundant HTTP page/API namespace.
- Regenerate committed OpenAPI artifacts, shared contract types, frontend
  clients, and API presentation configuration from the changed controllers.
- Update navigation, payment return URLs, docs, route tests, and exact
  requirement evidence to identify the product-root contract.

## Goals and Non-Goals

**Goals:**

- Establish one canonical product URL hierarchy with no first-party HTTP route
  containing an `agritech` path segment.
- Preserve `/admin` as the privileged surface boundary and preserve all
  existing authorization, tenant isolation, request, response, and error
  behavior.
- Fail contract freshness checks if a removed route returns or a generated
  consumer still targets it.

**Non-Goals:**

- Renaming AgriTech domain types, packages, modules, OpenAPI tags, or product
  copy.
- Replacing the Telegram `/agritech` command with `/`, which is not an HTTP
  route and cannot serve the same command semantics.
- Adding redirects or compatibility aliases for the removed routes.
- Changing deployment hostnames, authentication, persistence, or provider
  behavior.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `agritech-marketplace`: add a stable product-root routing requirement for
  user, admin, API, generated-client, navigation, and callback-return surfaces.

## Impact

The change affects Nest controller prefixes in the AgriTech, farmer, catalog,
order, payment, and AgriTech-admin owners; the user/admin SPA route trees and
navigation; frontend API wrappers; payment return URLs; generated OpenAPI and
TypeScript clients; API presentation output; route/contract tests; and the
canonical AgriTech platform guide. Existing external consumers of the removed
paths must migrate atomically to the regenerated contract.

## Risk, Rollout, and Rollback

- **Product risk:** bookmarked or independently implemented old URLs stop
  working. This is intentional and exposed as a breaking migration rather than
  hidden behind aliases.
- **Security risk:** collapsing `/admin/agritech` to `/admin` must not collapse
  admin guards or permissions. The admin controller retains its guard and all
  endpoint permissions; route tests prove the product root is still RBAC
  gated.
- **Compatibility risk:** source controllers, OpenAPI, generated clients, SPA
  links, and callback return URLs can drift. They are regenerated and checked
  in one revision, with stale-segment scans over source and generated HTTP
  paths.
- **Operational risk:** independently deployed clients and servers must roll
  together. Roll out the matching API and clients as one release; no database
  migration is involved.
- **Rollback:** redeploy the prior immutable client and API revision together.
  Reverting only one side is unsupported because this is an atomic contract
  break.
