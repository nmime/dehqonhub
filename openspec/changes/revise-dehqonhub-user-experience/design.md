# Design

## Context

The maintainer supplied six DehqonHub HTML reference screens, a detailed
`DESIGN.md`, and a functional product brief. Those references define a warm,
print-like agricultural marketplace: cream canvas, white or cream cards,
DehqonHub green, rounded pills and panels, compact line icons, Poppins
typography, a dense marketplace header, a gradient hero, product shelves,
functional catalog filters, order offers, contract status, verification steps,
and a right-side AI advisor. They are product direction, not a separate app.

The selected Vite `user-app` already owns the real routes and generated API
flows. Replacing those flows with static HTML would regress authentication,
authorization, tenancy, localization, and commerce. The reference therefore
maps onto the existing React owners and state machines.

## Goals

- Make the current `user-app` visually and behaviorally faithful to the supplied
  DehqonHub references at desktop, 375 px Russian, and the 320 px support floor.
- Make the light theme the reference expression and keep a deliberate black
  theme with identical information hierarchy and component affordances.
- Remove crowded controls, boxed logo artwork, uneven field/button spacing,
  ambiguous icons, empty-looking filters, and unnecessary duplicate home
  category blocks.
- Let guests bookmark public listings locally while keeping authenticated
  favorites persisted and API-owned.
- Make governed API demo data and frontend test fixtures useful for evaluation
  without ever inventing a transactional production record.

## Non-goals

- No static replacement app, cross-import from landing/site, or new renderer.
- No browser fixture fallback after an API failure or empty API response.
- No client-authored cart, order, offer, contract, verification, payment,
  provider, seller, or account outcome.
- No public demo credential embedded in source. Test-account credentials require
  separately provisioned accounts and an explicitly public operator-owned
  delivery channel.
- No backend API schema, persistence, tenancy, or deployment-topology change.

## Decisions

### Translate references into the existing route owners

The marketplace header and footer remain in `marketplace-page.tsx`; discovery
and catalog composition remain in `marketplace-discovery.tsx`; commerce,
verification, contract, account, and AI owners remain unchanged. Visual changes
are expressed through the app-owned marketplace stylesheet and small semantic
markup adjustments rather than a parallel component tree.

### Keep one token system with two complete themes

Light uses `#FAF0DE`, `#FDF6E9`, white, `#1CA24C`, `#17924B`, `#7ED957`,
`#0E7A3C`, `#2B2B2B`, `#6B6B63`, and `#E9DFC9`. Black uses near-black green
surfaces with the same green hierarchy, restrained borders, and readable muted
text. Both themes preserve visible focus, validation, selected, disabled,
loading, empty, and error states. System preference remains supported through
the existing theme control.

### Use a transparent text wordmark and owned line icons

The header/footer use the DehqonHub text wordmark from the approved reference.
The current white-backed raster logo is not rendered. Existing app-owned SVG
line icons remain the semantic icon source and are normalized through consistent
containers, stroke weight, and control sizing.

### Separate local bookmarks from server favorites

Signed-out visitors and demo listings may use a versioned local-storage set of
opaque public listing IDs. The UI labels this as device-local behavior and never
uses it to authorize a mutation or claim server persistence. Signed-in live
listing favorites continue to use the generated API and persisted domain state.

### Keep demo data honest

Production catalog content continues to come only from the public catalog API.
When the existing governed feature flag adds demo listings, the UI shows their
demo provenance and disables commerce while allowing local bookmarks. Storybook
and Playwright use deterministic multi-category fixtures solely as test
evidence. An API error or genuinely empty authoritative catalog remains an
explicit recoverable/empty state.

## Risks and mitigations

- **Large visual change hides a workflow regression** -> retain route owners,
  add focused component assertions, and exercise key routes in Playwright.
- **Dark mode becomes a low-contrast inversion** -> define explicit black-theme
  tokens and test both themes instead of relying on automatic color mixing.
- **Guest favorites are confused with an account** -> local-only copy and
  implementation never enter transaction gates or authenticated API payloads.
- **Reference density overflows Russian/mobile layouts** -> compact menus,
  horizontal category scrolling, two-column mobile catalog where viable, and
  browser checks at 375 px and 320 px.
- **Demo preview is mistaken for real inventory** -> preserve visible Demo
  badges, browse-only controls, and server-owned feature-flag provenance.

## Rollout

1. Land the semantic and style changes behind the existing user-app build.
2. Verify light and black themes locally with deterministic API routes.
3. Run the selected user-app tests/build/browser lane and exact-revision spec
   evidence.
4. Deploy the immutable user-app revision only after the existing apex hotfix is
   released, then canary `/`, `/catalog`, `/favorites`, `/verification`, and the
   AI panel in both themes.
