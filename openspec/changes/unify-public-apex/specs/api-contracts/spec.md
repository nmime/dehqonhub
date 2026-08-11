## MODIFIED Requirements

### Requirement: [REQ-API-PROBLEM-001] Public failures are safe RFC 9457 documents

HTTP API failures SHALL use registered problem types, safe details, matching
HTTP and body status, an opaque absolute occurrence URI, and the
`application/problem+json` media type. Registered custom problem types SHALL
use `https://dehqonhub.uz/problems#<validated-code>`, opaque occurrences SHALL
use `https://dehqonhub.uz/problem-instances/<encoded-request-id>`, and selected
`user-app` SHALL serve the shared public registry at apex `/problems`.

**Evidence profile:** acceptance, api, domain

**Invariants:**

- Internal exception messages and private metadata never become public detail.
- Problem codes and request identifiers are validated before URI construction.
- Problem identity is derived from the DehqonHub product root, never a request
  host, repository, package, template, or removed application hostname.
- The apex registry documents `about:blank` and every registered custom problem
  type from the same shared definitions used to construct response identities.

**Failure behavior:**

- Invalid public identifiers are rejected rather than interpolated into a URI.
- A registry route that is absent from selected `user-app` or disagrees with
  the shared definitions fails contract and route evidence before release.

#### Scenario: Valid problem occurrence

- **WHEN** a valid request identifier is converted to an occurrence URI
- **THEN** the result uses the DehqonHub apex occurrence namespace and contains
  only its encoded opaque identifier

#### Scenario: Unsafe request identifier

- **WHEN** an invalid problem code or request identifier is supplied
- **THEN** problem URI construction fails

#### Scenario: Product problem registry

- **WHEN** a user opens `/problems` on the DehqonHub apex
- **THEN** selected `user-app` renders `about:blank` and every registered custom
  problem type at its canonical `https://dehqonhub.uz/problems#...` identity
