# Design

## Context

DehqonHub currently selects separate Astro and Vike reference frontends and
publishes the Astro renderer at `dehqonhub.uz`, while the actual marketplace
SPA lives at `user-app.dehqonhub.uz`. The maintainer requires one product entry:
the complete user SPA at the apex. The selected closure is the only honest
source for which images, ports, hosts, certificates, and readiness checks exist.
The incident also exposed independent one-build activation, backend binding,
Nginx compatibility, and frontend redirect defects that remain applicable.

## Goals

- Make `user-app` own `https://dehqonhub.uz/` and every SPA deep link.
- Remove landing/site/fullstack reference apps from the selected DehqonHub
  product and production artifact set.
- Keep admin, mobile, API, and Telegram ownership explicit on their selected
  hosts, with the Telegram Mini App on the apex.
- Derive Compose runtime URLs, Nginx hosts, exact-host certificates, expected
  ports, and doctor checks from the same selected closure.
- Serve the registered RFC 9457 problem catalog from `user-app` at apex
  `/problems`, with type and occurrence identities rooted at the DehqonHub
  product domain.
- Retain the idempotent Ubuntu 24.04 runtime repairs.

## Non-goals

- No user-app visual redesign or route-base migration beyond adding the
  product-owned problem registry route.
- No backend endpoint request/response schema, database, authentication,
  credential, or persistence contract change.
- No deletion of reusable unselected reference project source from the
  monorepo; removal means absence from this product's selection and every
  release/runtime/public artifact.

## Decisions

### Select the product, not a marketing handoff

`PRIMARY_APP=user-app` maps `USER_APP_DOMAIN` to `PUBLIC_DOMAIN`. The user SPA
owns `/`, `/catalog`, `/requests`, `/problems`, `/telegram-mini-app`, and all
other browser routes already defined by its router. Same-origin API namespaces
continue to be proxied before the SPA fallback.

### Root public failure identities in the selected product

Registered custom problem types use
`https://dehqonhub.uz/problems#<validated-code>`, opaque occurrences use
`https://dehqonhub.uz/problem-instances/<encoded-request-id>`, and selected
`user-app` renders the shared registry at `/problems`. Identity construction
does not derive from a request host, repository name, package, or removed
application hostname, and invalid codes or request identifiers still fail
before URI construction.

### Remove reference renderers from the selected closure

`landing-app`, `site-app`, and their `fullstack-e2e` reference harness are
removed through the repository setup workflow. They therefore produce no
release image, systemd/Compose activation, loopback listener, Nginx virtual
host, certificate SAN, or doctor expectation. Their generic source remains an
unselected repository extension point and the DehqonHub marketing-page changes
are reverted.

### Make single-server rendering closure-aware

The host renderer reads the same validated `.nrb/closure.json` used by the
Compose wrapper. It rejects an unselected primary app and builds host, port,
certificate, static/proxy, and readiness inventories only from selected
deployables. This removes the previous all-core-app fallback.

### Keep one canonical user origin

`user-app.dehqonhub.uz` is not rendered or certificate-covered as a
compatibility host. The exact public contract has one user origin: the apex.
Existing wildcard DNS may still resolve unknown names, but the explicit Nginx
host allowlist rejects them and does not serve product content.
CORS, Better Auth trusted/return origins, payment return origins, and public
runtime destinations derive only from selected frontend origins, so removed or
unknown hosts cannot remain an authentication or payment destination.

### Retain the runtime hardening

Local immutable images build once before systemd, which always activates with
`--no-build`; backends bind the container interface while host publications
remain loopback-only; the Nginx 1.24 syntax is used; optional UFW is an
idempotent no-op; and frontend directory redirects cannot leak inner HTTP port
`8080`.

## Risks and trade-offs

- **Removed host bookmarks stop working** -> this is deliberate; there is no
  compatibility alias, and operator/browser canaries prove the apex journey.
- **Selection drift could reintroduce reference apps** -> setup-generated
  closure checks, renderer tests, and doctor assert the exact selected set.
- **Apex SPA and API paths can collide** -> API/auth/admin proxy locations are
  emitted before the user SPA fallback and `/marketplace/*` has direct tests.
- **Local builds consume server disk** -> build once outside systemd, preserve
  the healthy revision until convergence, and prune only disposable cache.

## Migration plan

1. Back up the protected production environment and preserve the deployed
   revision.
2. Remove landing/site/fullstack from the product selection, set
   `PRIMARY_APP=user-app`, and expose the shared problem registry from the user
   route tree.
3. Build the selected immutable images once, install closure-aware Nginx, and
   activate the exact tag with `--no-build`.
4. Run doctor, exact-host/certificate checks, apex SPA/API/Telegram canaries,
   and a real browser journey.
5. If any required canary fails, restore the environment backup and rebuild the
   previous source revision; database migrations are not reversed.

## Open questions

None. The maintainer explicitly selected apex-only `user-app` ownership and
removal of landing/site from the DehqonHub product.
