# Security Policy

## Supported versions

Security fixes target the current `main` branch. Supported release windows are
defined when a production release is published.

## Reporting a vulnerability

Please report suspected vulnerabilities privately. Do not open public issues for exploitable findings.

### GitHub

Report through [GitHub Security Advisories](https://github.com/nmime/dehqonhub/security/advisories/new). This is the canonical private intake channel for this repository.

### GitLab

If you are using a GitLab mirror, contact that mirror's owner privately or use a
private vulnerability-report feature that its maintainers have explicitly
enabled. Do not post an exploitable finding in a public issue.

Production operations must configure and document a monitored security contact
before launch; this repository does not publish a fallback mailbox.

### Response targets

- We acknowledge a private vulnerability report within 3 business days.
- We complete initial severity and ownership triage within 5 business days.
- We keep the reporter informed when remediation timing or disclosure plans change.

## Security validation

Repository-owned commands provide the security checks; running them locally or
on a trusted external runner does not by itself prove protected branches or
merge enforcement.

- `pnpm run tooling:static-check` enforces repository policy and secret-safe
  configuration.
- `pnpm run audit:ci` and the native security tests validate dependencies and
  source-owned security rules.
- The optional `.gitlab-ci.yml` runner adds Gitleaks, Secret Detection,
  Dependency Scanning, SAST, and Container Scanning.
- GitHub-hosted automation is intentionally disabled. Dependency and security
  checks run only through repository-owned commands or a trusted external
  runner selected by the operator.

## Secured components

- First-party sessions: opaque IDs persisted by the selected PostgreSQL or replica-set MongoDB provider, HttpOnly cookies, rotation on authentication, and fail-closed account/RBAC reloads
- OAuth2/OIDC providers: state hash verification, PKCE where supported, signed-token validation, and isolated provider cookies/credentials
- RBAC: seeded role/permission catalog
- Network policies, PDB, HPA, rate limiting in production Helm values
