## MODIFIED Requirements

### Requirement: [REQ-RUNTIME-DELIVERY-009] Deployment artifacts are reproducible

Docker, Compose, Helm, GitOps, PM2, and single-server artifacts SHALL derive
from validated source and render deterministic, secret-safe runtime topology.
The DehqonHub single-server per-app topology SHALL expose selected `user-app`
at `PUBLIC_DOMAIN`, and every image, service, listener, virtual host,
certificate name, trusted origin, readiness check, and runtime URL SHALL be
restricted to the fresh selected closure. Deselected landing/site applications,
their containers, and the `user-app.<domain>` compatibility hostname SHALL be
absent. Exact-host certificate mode SHALL reconcile the SAN set exactly rather
than accepting stale extra names. Generated Nginx SHALL use the 1.24-compatible
`listen ... http2` syntax from the documented Ubuntu baseline instead of the
unsupported standalone `http2 on` directive.
When single-server Compose uses local image provenance, the controller SHALL
build the selected immutable image tags exactly once before systemd activation,
and the generated unit SHALL start those prebuilt tags with `--no-build`
without pulling or loading source-build configuration.
Production backend processes SHALL bind `0.0.0.0:80` inside their containers so
Docker network and published-port traffic reaches the listener, while every
application and API host publication SHALL remain bound to `127.0.0.1`.
The host TLS renderer SHALL convert inner frontend `Location` values shaped as
`http://<host>:8080/<path>` into relative paths without applying that rewrite
to API proxy locations.

**Evidence profile:** operations, security

**Invariants:**

- Validation does not deploy.
- Bundled and external database modes remain explicit.
- Generated build outputs do not re-enter Nx source-project discovery before
  deployment artifacts are staged.
- Selected user, admin, API, mobile, and enabled integration hosts retain their
  canonical application ownership; deselected applications produce no public
  or runtime artifact.
- Activation stops and removes known application containers that are absent
  from the fresh selected closure before readiness is evaluated.
- Exact-host certificates contain the exact derived public host set; stale
  landing/site/user-app subdomain SANs are not accepted as healthy.
- Disabled UFW provisioning is an idempotent successful no-op, including under
  shell `errexit` behavior.
- Image provenance remains local while prebuilt unit activation omits both a
  registry pull and a second build.
- Container listener reachability does not widen the host exposure boundary.
- Frontend canonical redirects preserve the public TLS scheme and never expose
  the inner port.

**Failure behavior:**

- Missing tools, invalid manifests, unsupported proxy syntax, or unsafe secret
  placement blocks readiness before traffic reload.
- A failed Nginx render restores the previous valid configuration.
- A stale unselected application container, listener, virtual host, or exact
  certificate SAN blocks convergence.
- A missing prebuilt local image fails activation instead of triggering an
  implicit build inside systemd.
- A backend listener that is unreachable through its loopback-published host
  port blocks readiness.
- An inner frontend redirect that exposes HTTP or port `8080` on a public HTTPS
  response blocks readiness.

#### Scenario: Deployment validation

- **WHEN** the supported deployment profiles are rendered
- **THEN** each produces a valid topology without publishing or deploying it

#### Scenario: Selected user application owns the apex

- **WHEN** the DehqonHub selected closure and per-app routing choose `user-app`
  as the primary application
- **THEN** `user-app` serves the apex, stale landing/site containers and
  landing/site/user-app subdomain hosts and SANs are absent, and the selected
  admin, mobile, API, and Telegram owners retain their derived destinations

#### Scenario: Supported Nginx baseline

- **WHEN** generated TLS virtual hosts are validated by the supported Ubuntu
  Nginx 1.24 package
- **THEN** every HTTP/2 listener uses `listen ... http2`, no standalone
  `http2 on` directive is emitted, and configuration parses before reload

#### Scenario: Disabled UFW provisioning

- **WHEN** host provisioning runs with UFW explicitly disabled under shell
  `errexit` behavior
- **THEN** firewall installation returns success without changing firewall state
  and provisioning continues

#### Scenario: Prebuilt local image activation

- **WHEN** the single-server controller deploys with local image provenance
- **THEN** it builds the selected immutable tags once before systemd and the unit
  activates those tags with `--no-build` without pulling or rebuilding them

#### Scenario: Reachable private backend listener

- **WHEN** production Compose starts a backend service on container port 80
- **THEN** the process accepts container-network traffic on `0.0.0.0` and Docker
  publishes that port only on host `127.0.0.1`

#### Scenario: HTTPS-safe frontend directory redirect

- **WHEN** an inner frontend server returns
  `Location: http://dehqonhub.uz:8080/problems/` through the host TLS proxy
- **THEN** the public response returns `Location: /problems/` so the browser
  retains the outer HTTPS origin, while API redirects remain unchanged
