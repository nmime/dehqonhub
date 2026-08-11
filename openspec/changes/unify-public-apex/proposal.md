# Make the DehqonHub user product the only public apex

## Why

The current single-server deployment publishes a separate marketing renderer at
`dehqonhub.uz` and moves the actual marketplace to `user-app.dehqonhub.uz`.
That is the wrong product boundary: DehqonHub users must enter the complete user
application directly at `https://dehqonhub.uz/`, and the landing/site
deployables must not be selected, built, started, hosted, or certificate-covered
for this product. The deployment also needs the already identified Nginx,
one-build activation, backend-listener, and TLS-safe redirect repairs.

## What Changes

- Make selected `user-app` own `PUBLIC_DOMAIN` and its root route in per-app production.
- Remove `landing-app`, `site-app`, and their full-stack reference harness from the DehqonHub product selection and release image set.
- Do not publish or certificate-cover `user-app.<domain>`, `landing-app.<domain>`, or `site-app.<domain>` for DehqonHub.
- Preserve the administrator application at `/admin` on its own host, mobile at its own host, and API/integration services on their derived hosts.
- Derive CORS, Better Auth trusted/return URLs, payment return origins, and the
  Telegram Mini App URL from the user apex while excluding deselected and
  unknown application hosts.
- Serve the RFC 9457 problem registry from selected `user-app` at `/problems`
  and root registered problem-type and occurrence identities at
  `https://dehqonhub.uz`.
- Render HTTP/2 syntax compatible with the supported Ubuntu Nginx 1.24 package.
- Fix idempotent host provisioning when UFW is intentionally disabled.
- Build local immutable images exactly once before systemd and activate those images with `--no-build`.
- Bind backend processes to the container interface while keeping every host-published application port loopback-only.
- Rewrite inner frontend `:8080` directory redirects to relative paths at the host TLS proxy.
- Add apex ownership, selected-host, certificate, and compatibility regression evidence.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `runtime-operations`
- `agritech-marketplace`
- `api-contracts`

## Impact

Affected owners are product selection/closure generation, production Compose
environment derivation, the single-server Nginx renderer and controller, the
user-app route tree and problem registry, the shared problem identity contract,
deployment tests, deployment documentation, and durable API/routing/deployment
evidence. Backend endpoint request/response schemas, database behavior,
credentials, and persistence behavior do not change.
