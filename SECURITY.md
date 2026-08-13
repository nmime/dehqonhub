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

## Automated security scans

This repository includes the following checked-in security jobs. A job being
present does not prove that a hosting project has enabled required pipelines,
protected branches, or merge blocking.

| Platform | Checked-in coverage                                                                                                         | Enforcement notes                                                                                                                           |
| -------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| GitHub   | Collaboration metadata, npm/Docker Dependabot, local Gitleaks/native SAST, and `audit:ci` commands                          | No repository-owned GitHub Actions, CodeQL, Scorecard, dependency review, image scanning, signing, or hosted status checks are configured.  |
| GitLab   | Blocking Gitleaks and `audit:ci`, plus GitLab Secret Detection, Dependency Scanning, SAST, and Container Scanning templates | The checked-in jobs do not use `allow_failure`; availability of GitLab-managed scanner templates depends on the hosting tier/configuration. |

## Secured components

- First-party sessions: opaque IDs persisted by the selected PostgreSQL or replica-set MongoDB provider, HttpOnly cookies, rotation on authentication, and fail-closed account/RBAC reloads
- OAuth2/OIDC providers: state hash verification, PKCE where supported, signed-token validation, and isolated provider cookies/credentials
- RBAC: seeded role/permission catalog
- Network policies, PDB, HPA, rate limiting in production Helm values
