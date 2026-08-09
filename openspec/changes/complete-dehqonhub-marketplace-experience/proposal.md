## Why

The fetched DehqonHub marketplace slice exposes a visually rich root page but
does not yet provide a complete, accessible, or contract-correct transaction
journey: several controls are inert, key API response schemas are wrong, the
root shell is duplicated, and unresolved payment and legal claims are presented
as if they were operational. The supplied Russian requirements and RU/EN design
references make this the right point to establish one evidence-backed product
experience before those gaps harden into public behavior.

## What Changes

- Replace the static marketplace composition with a responsive DehqonHub
  experience for home discovery, URL-independent in-page catalog filtering,
  product detail, favorites, seller-partitioned carts, verification, purchase
  requests and offers, contract review, role-aware account summaries, samples,
  and a grounded AI consultation panel.
- Make every state use generated user API contracts and localized English,
  Russian, and Uzbek copy, including loading, empty, denied, validation,
  provider-unavailable, success, and recovery states.
- Preserve seller-specific carts and require explicit user confirmation before
  checkout, offer selection, contract signing, sample requests, or AI-assisted
  mutations.
- Correct public OpenAPI response schemas and product seller identity so the
  generated user client matches runtime responses.
- **BREAKING:** Move DehqonHub commerce APIs below `/marketplace/*` while
  retaining `/catalog`, `/cart`, and the other documented paths as SPA routes;
  update Docker and Helm same-origin proxies, generated clients, and route
  evidence in the same revision without compatibility aliases.
- Keep payment and factoring fail closed. The UI may explain that financing is
  unavailable, but it must not promise a partner bank, fixed deferral, legal
  guarantee, or payment processing without configured provider evidence.
- Move DehqonHub visual composition out of the shared web design-system CSS,
  scope it to the user application, provide light/dark token parity, and meet
  keyboard, contrast, reduced-motion, 320 px, and Russian-at-375 px contracts.
- Repair stale root-route tests and invalid requirement markers introduced by
  the fetched marketplace branch.

## Goals and Non-Goals

**Goals:**

- Deliver the complete current MVP transaction backbone from discovery through
  explicit contract review using real persisted marketplace records.
- Keep the signed-out entry useful and let authenticated, unverified users
  browse while verification gates commercial mutations.
- Make the RU-primary, UZ-required, EN-supported experience semantically and
  visually consistent without duplicated locale-specific pages.
- Bind the changed behavior to focused frontend, backend, contract, acceptance,
  accessibility, and responsive evidence.

**Non-Goals:**

- Activating or simulating a bank, factoring, payment, OneID, document-upload,
  courier, PDF-signature, or legal-guarantee integration that is not configured.
- Deploying, publishing, seeding fabricated business records, or changing
  existing admin/mobile product ownership.
- Reproducing third-party Yandex Market or Thynk Unlimited assets, trade dress,
  fonts, or proprietary claims from the illustrative references.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `agritech-marketplace`: add the durable DehqonHub marketplace experience and
  transaction-boundary requirement, including generated contracts, seller cart
  isolation, verification gates, fail-closed providers, localization,
  accessibility, and responsive behavior.

## Impact

The change affects the user Vite application and its i18n catalogs, the product
and AgriTech marketplace HTTP DTOs/services, the generated user OpenAPI client,
focused backend and frontend tests, acceptance scenarios, and the
`agritech-marketplace` requirement/evidence contract. It adds no new runtime
dependency or external service. It expands the marketplace contract schema with
source metadata, frozen line snapshots, delivery details, party-consent fields,
source uniqueness, and financing constraints while keeping legacy rows readable.

## Risk, Rollout, and Rollback

Product risk is high because catalog, verification, cart, offer, and contract
states meet in one surface. Security risk is concentrated in preserving tenant
ownership, verification gates, and safe failure copy. Compatibility risk comes
from correcting generated response types, exposing the stable seller ID that
already exists in the product domain, and moving marketplace API consumers to
the collision-free `/marketplace/*` namespace. Operational risk is moderate
because contract persistence, rollback semantics, and same-origin reverse-proxy
routing change even though no provider or deployment is activated.

Roll out only after exact-revision API generation, focused tests, specification
validation, browser accessibility/responsive checks, and independent assurance
pass. Roll back application code while retaining the expanded schema. The
migration down path is pre-traffic only: after marketplace writes use the new
fields, dropping frozen terms, provenance, and party-consent timestamps would be
lossy. Existing non-root user routes and backend records remain intact.
