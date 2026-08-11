## REMOVED Requirements

### Requirement: [REQ-NOTIFY-PREFERENCE-006] Recipient preferences govern optional delivery

Session and user notification preferences SHALL be validated, scoped to the
current principal, and applied consistently across frontend controls and
backend delivery eligibility.

**Evidence profile:** domain, journey

**Invariants:**

- Preference changes cannot target another user.
- Mandatory security notifications remain governed by explicit policy.

**Failure behavior:**

- Invalid or unavailable preference state fails safely without widening sends.

#### Scenario: Disabled optional channel

- **WHEN** a recipient disables an optional delivery channel
- **THEN** new optional deliveries do not use that channel

**Reason:** Repository review found no optional-channel preference model, API,
delivery-eligibility enforcement, or browser journey. The existing locale/theme
hooks and generic feature flags do not implement this behavior, so retaining the
requirement would preserve a false assurance claim.

**Deferral:** A future notification-preference change must specify and implement
the channel model, principal-scoped API, delivery enforcement, UI, and runtime
journey together. That product work is outside this apex-routing hotfix.
