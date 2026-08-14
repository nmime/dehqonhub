## Participants and Owners

- Product/domain owner: `agritech-maintainers`, informed by the maintainer-provided
  DehqonHub HTML screens, `DESIGN.md`, functional brief, screenshots, and direct
  stakeholder review.
- Specification author: `agritech-maintainers`.
- User-web owner: `user-app` and `@app/frontend-feature-user-i18n`.
- Independent verification reviewer: `quality-engineering`.
- Security reviewer: `security-maintainers` for guest/authentication boundaries.
- Operations reviewer: `platform-operations` for immutable deployment, canary,
  and rollback evidence.

## Actors and Outcomes

- A signed-out visitor can browse, search, filter, change language or theme, and
  bookmark public or governed-demo listings locally without being redirected to
  authentication by presentation-only behavior.
- A buyer, seller, or farmer retains the real generated-API workflow and its
  authorization gates while every route uses the same DehqonHub visual system.
- A reviewer can exercise realistic populated, filtered, empty, error, and
  signed-out states without mistaking frontend fixtures for production records.
- An operator can deploy one immutable user-app revision at the apex and canary
  public, protected-entry, API, language, and light/black-theme behavior.

## Rules

- The selected Vite `user-app` remains the only DehqonHub apex renderer; the
  supplied static HTML is a design reference, not a replacement application.
- Poppins-compatible typography, cream/green light surfaces, explicit
  near-black theme tokens, pill controls, consistent padding, transparent text
  wordmarks, and normalized line icons apply across the marketplace shell.
- The home and catalog expose real public API results or explicitly governed
  demo records. Empty and failed API responses retain honest recovery states and
  never fall back to browser-authored production data.
- Filters are labelled, populated from authoritative values, keyboard operable,
  visibly active, resettable, and available without horizontal overflow at 320
  px, 375 px Russian, and desktop widths.
- Guest favorites persist only opaque public listing IDs in versioned local
  storage. They grant no commercial authority and never replace authenticated
  server-owned favorites.
- Language and theme changes apply locally first. An anonymous rejection from
  optional preference persistence must not change the current route or create
  an authentication requirement; backend authorization remains unchanged.
- Order, contract, verification, account, cart, favorites, and AI owners retain
  their generated clients, server state machines, and provider disclosures.

## Examples

- A visitor selects Dark on `/`; `boilerplate.theme=dark` is applied, an
  anonymous `PATCH /auth/me/preferences` may return 401, and the browser remains
  on `/` with the black theme rendered.
- A Russian visitor opens the catalog at 375 px, sees readable populated filter
  controls and placeholders, opens the mobile filter sheet, resets filters, and
  never receives horizontal page overflow.
- A guest bookmarks a governed-demo seed listing, sees the device-local favorite
  count and Favorites route update, then removes it without a marketplace write.
- A public catalog with no records renders a labelled empty state and reset or
  purchase-request guidance instead of blank filters or fabricated listings.

## Counterexamples and Boundaries

- Redirecting a guest to `/auth` because theme or language preference sync
  returned 401 is invalid; redirecting a protected profile request after session
  expiry remains required.
- A successful mocked preference write does not prove anonymous behavior; the
  browser regression must exercise the real 401 failure path.
- A white-backed raster logo, text glyphs used as unexplained navigation icons,
  unequal button padding, clipped placeholders, empty filter affordances, or an
  automatic dark-color inversion do not satisfy the reference.
- Storybook and Playwright fixtures cannot appear as authoritative production
  inventory, orders, contracts, verification, payment, or provider results.
- Desktop-only screenshots do not prove responsive, locale-expansion,
  keyboard, reduced-motion, or dark-theme behavior.

## Failure and Operational Modes

- Missing media uses an intentional category illustration; malformed or denied
  local storage fails to an empty guest-favorite set without navigation or
  server mutation.
- Public API empty/error results remain explicit and recoverable. Protected API
  401 responses still fail closed and preserve the sanitized return URL.
- Production release requires an immutable source/image SHA, database and
  environment rollback material, controller `doctor`, exact running-image
  checks, and browser/API canaries against the apex.
- A canary failure blocks a completion claim. The deployed revision may remain
  healthy while the source fix is prepared, but the failed behavior must be
  reproduced, requirement-owned, corrected, and re-canary-tested before the
  release checklist is closed.

## Assumptions

- The supplied HTML and `DESIGN.md` establish visual direction while existing
  generated APIs and route owners remain authoritative for functionality.
- Both light and black themes are required; black is intentionally designed,
  not removed.
- Public demo credentials are not required and must not be embedded in source or
  a public banner; realistic fixtures and governed demo provenance are the safe
  evaluation boundary.
- English, Russian, Uzbek Latin, and Uzbek Cyrillic remain the supported locale
  set.

## Unresolved Questions

- None.
