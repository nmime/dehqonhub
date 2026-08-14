# Authentication and access specification

## Purpose

Keep authentication, tenant boundaries, sessions, roles, and permissions
fail-closed across backend and frontend entry points.

## Requirements

### Requirement: [REQ-AUTH-ACCESS-001] Malformed or unknown claims grant nothing

Authorization SHALL normalize untrusted role and permission claims
fail-closed. Unknown roles, malformed claim collections, and missing tenant
context MUST NOT produce permissions.

**Evidence profile:** acceptance, domain, security

**Invariants:**

- Only catalogued roles and permissions can become grants.
- Tenant-scoped access never falls back to a global principal.

**Failure behavior:**

- Invalid claims produce an empty grant set or an authorization denial.

#### Scenario: Malformed role claims

- **WHEN** a principal supplies a non-list role claim
- **THEN** the principal receives no normalized roles or permissions

#### Scenario: Unknown role

- **WHEN** a principal supplies a role outside the catalog
- **THEN** that role contributes no permissions

### Requirement: [REQ-AUTH-SESSION-002] Revoked and cross-tenant sessions are denied

Protected requests SHALL validate the persistent session and tenant context on
each access-sensitive path. Revoked, expired, disabled, or cross-tenant
sessions MUST be rejected.

**Evidence profile:** domain, persistence, security, journey

**Invariants:**

- UI state is not authority.
- Revocation takes effect at the protected backend boundary.

**Failure behavior:**

- Access fails with a safe RFC 9457 response and no protected data.

#### Scenario: Revoked persistent session

- **WHEN** a revoked session reaches a protected resource
- **THEN** access is denied even if a client still holds prior session state

### Requirement: [REQ-AUTH-CREDENTIAL-003] Credential flows are fail-closed

Registration, sign-in, verification, password reset, and session creation SHALL
validate credentials and one-time artifacts before granting authenticated state.

**Evidence profile:** domain, security

**Invariants:**

- Verification and reset artifacts are scoped, expiring, and single-purpose.
- Authentication failures do not reveal whether an account exists.

**Failure behavior:**

- Invalid, expired, replayed, or mismatched credentials grant no session.

#### Scenario: Replayed verification artifact

- **WHEN** an already consumed verification artifact is submitted
- **THEN** authentication state remains unchanged

### Requirement: [REQ-AUTH-TENANT-004] Tenant and RBAC boundaries are enforced

Tenant memberships, roles, permissions, guards, and admin actions SHALL enforce
the persistent principal and selected tenant at the backend boundary.

**Evidence profile:** domain, persistence, security

**Invariants:**

- A tenant-scoped role cannot grant another tenant's resource.
- Frontend visibility is not authorization.

**Failure behavior:**

- Missing membership or permission returns a safe denial without protected data.

#### Scenario: Cross-tenant administration

- **WHEN** an administrator targets a resource outside the active tenant
- **THEN** the operation is denied and audited

### Requirement: [REQ-AUTH-IDENTITY-005] External identities are linked safely

OAuth, OIDC, Telegram, and provider identity flows SHALL bind state, return
URLs, nonces, and provider subjects to the initiating authenticated boundary.

**Evidence profile:** domain, security, journey

**Invariants:**

- Provider callbacks cannot select arbitrary return origins.
- One provider identity cannot be linked to conflicting owners silently.

**Failure behavior:**

- Invalid state, nonce, provider, subject, or return URL rejects the link.

#### Scenario: Unsafe return URL

- **WHEN** a social authentication callback carries a cross-origin return URL
- **THEN** the client and backend reject or replace it with a safe destination

### Requirement: [REQ-AUTH-PROFILE-006] User profile access respects the authenticated owner

Profile reads and updates SHALL expose only the authenticated user's allowed
fields and SHALL validate update payloads before persistence.

**Evidence profile:** domain, api

**Invariants:**

- Private credential and provider metadata is never returned as profile data.
- A user cannot update another user's profile through client-supplied identity.

**Failure behavior:**

- Invalid or unauthorized profile operations return safe Problem Details.

#### Scenario: Foreign profile update

- **WHEN** a user attempts to update another profile
- **THEN** no foreign profile data is changed

### Requirement: [REQ-AUTH-PERSISTENCE-007] Authentication persistence remains consistent

Users, sessions, accounts, tokens, tenants, roles, and permissions SHALL retain
referential integrity, deterministic migration order, and safe transaction
semantics.

**Evidence profile:** persistence, domain

**Invariants:**

- Session and token revocation is durable.
- Duplicate identity or role assignment obeys declared uniqueness.
- Scheduled token cleanup does not overlap and cannot block application
  shutdown beyond its finite cleanup grace period.

**Failure behavior:**

- Persistence or migration failure does not leave a partially granted identity.

#### Scenario: Duplicate identity link

- **WHEN** a provider identity conflicts with an existing owner
- **THEN** the transaction fails without changing either owner

### Requirement: [REQ-AUTH-AUDIT-008] Privileged authentication changes are auditable

Administrative access changes, login analytics, security-sensitive identity
events, and authorization denials SHALL emit bounded, redacted audit evidence.

**Evidence profile:** domain, security, operations

**Invariants:**

- Audit records contain actor and action identity without secrets.
- Audit failure does not silently authorize the action.

**Failure behavior:**

- Required audit persistence failure rejects or explicitly degrades the action.

#### Scenario: Role change audit

- **WHEN** a privileged role assignment changes
- **THEN** the actor, tenant, subject, and outcome are auditable

### Requirement: [REQ-AUTH-FRONTEND-009] Authentication UI reflects backend authority

Web and native authentication, logout, social identity, profile, and TMA flows
SHALL handle loading, success, denial, expiry, and recovery without treating
client state as authority.

**Evidence profile:** domain, journey

**Invariants:**

- Logout clears local state and revokes through the backend contract.
- Expired sessions return users to a safe recoverable state.

**Failure behavior:**

- Failed auth requests expose safe actionable UI without protected content.

#### Scenario: Expired browser session

- **WHEN** the backend rejects an expired session
- **THEN** the UI clears protected state and offers a safe sign-in path

### Requirement: [REQ-AUTH-RECOVERY-010] Account assurance and recovery are complete and one-time

The platform SHALL expose the authenticated user's email-assurance state and
SHALL provide enumeration-safe email-verification and password-reset request
and confirmation flows. Confirmation artifacts MUST be tenant-bound, hashed,
purpose-bound, expiring, and single-use. A successful password reset MUST
invalidate every session created under the previous credential revision.

**Evidence profile:** API, domain, persistence, security, journey

**Invariants:**

- Request responses do not reveal whether an email exists.
- Email verification never grants marketplace identity verification.
- Password confirmation never returns or logs a credential artifact.
- A consumed, expired, wrong-purpose, wrong-tenant, or malformed token changes
  no user or session state.

**Failure behavior:**

- Invalid confirmation returns safe RFC 9457 Problem Details and a recoverable
  UI state without distinguishing token absence from prior consumption.
- Delivery failure does not reveal account existence and can be requested again.

#### Scenario: Email verification is completed once

- **WHEN** a registered user submits a valid email-verification code
- **THEN** the account records verified email assurance, the session projection exposes it, and replay changes nothing

#### Scenario: Password reset revokes prior sessions

- **WHEN** a user submits a valid password-reset code and a policy-compliant new password
- **THEN** the password and credential revision advance once, all older sessions are denied, and the new password can create a fresh session

#### Scenario: Recovery request is enumeration-safe

- **WHEN** a caller requests verification or reset for either a known or unknown email
- **THEN** both requests return the same public acknowledgement without disclosing account existence or a token

### Requirement: [REQ-AUTH-PROVISIONING-011] Explicit Telegram OIDC provisioning creates a safe local account

The platform SHALL create a local account for an unlinked Telegram OIDC subject
only when provider validation succeeds and the operator explicitly enables
external-auth auto-provisioning. The issuer and subject SHALL own the identity;
display name, username, photo, and unverified email claims MUST NOT select or
merge another account.

**Evidence profile:** domain, security, journey, operations

**Invariants:**

- Provisioning is off unless the explicit environment value is `true`.
- One provider issuer/subject cannot own two users in one tenant.
- A provider-created account has no password-based login method until the user
  completes a separate credential flow.

**Failure behavior:**

- Disabled provisioning returns a safe link-required outcome.
- Invalid callback state, nonce, issuer, audience, signature, subject, or return
  URL creates no user, method, identity, or session.

#### Scenario: Enabled Telegram provisioning

- **WHEN** an unlinked Telegram user completes a valid OIDC callback while auto-provisioning is enabled
- **THEN** one local user, one Telegram identity, one authentication method, and one server session are created without claiming email verification

#### Scenario: Disabled Telegram provisioning

- **WHEN** the same validated Telegram subject returns while auto-provisioning is disabled
- **THEN** the platform returns a link-required result and creates no local account
