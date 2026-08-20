# Design

## Where the code lives

| Concern                                 | File                                                                                 |
| --------------------------------------- | ------------------------------------------------------------------------------------ |
| Cabinet shell, rail, six section panels | `apps/frontend/app/src/pages/marketplace/ui/marketplace-cabinet.tsx`                 |
| Month chart and its value table         | `apps/frontend/app/src/pages/marketplace/ui/marketplace-cabinet-chart.tsx`           |
| Account view entry point                | `MarketplaceAccount` in `marketplace-commerce.tsx`                                   |
| Section deep link                       | `/account/$cabinetSection` in `apps/frontend/app/src/app/router/user-route-tree.tsx` |
| Demo trading history                    | `packages/tooling/src/commands/db/marketplace-seed-contracts.ts`                     |

`MarketplaceAccount` stays the route's entry point and delegates to
`MarketplaceCabinet`. Its new props are optional and default to empty resources,
so a host that renders the account view without a publication queue or a seller
feed gets honest empty panels instead of a type error, and the mocked page tests
keep working untouched.

## Section selection

`marketplaceCabinetSectionFromLocation(pathname)` is a pure function over the
path: it strips a trailing slash, takes the segment after `/account/`, and
returns it only if it is one of the six known sections. Anything else is the
overview. `marketplaceCabinetPath(section)` is its inverse, with `overview`
mapping back to the bare `/account`.

The route component subscribes to `state.location.pathname` and passes it down
as `locationPathname`, rather than the cabinet reading `globalThis.location`.
That matters for two reasons: `/account/buying` → `/account/selling` stays inside
one route, so only a subscription makes the page re-render; and a test can
address a section without touching browser history.

Both `/account` and `/account/$cabinetSection` use the same component, so the
section change is a re-render and the dashboard is not re-read.

The rail is a `<nav>` of native `<button>` elements with `aria-current="page"`
on the active one. Buttons, not a tablist: the panels are separately addressable
destinations, so this is navigation, and Tab plus Enter is the behaviour a
reviewer expects. A roving-tabindex tablist would have made five of the six
sections unreachable by Tab for no gain.

## Why all six sections stay listed for every role

Hiding a section behind the dashboard's role would make its deep link resolve
only after the dashboard read returns, and would flicker on every load. It would
also be wrong: a seller who is also verified as a buyer owns both capabilities,
and the API decides that per contract, not per role. So the rail is constant and
a section with nothing in it says so.

## The chart

CSS bars, not inline SVG. No charting library is installed and the deployment's
CSP forbids a remote one, so the choice was between hand-drawn SVG and CSS. SVG
loses on the 320 px floor: an SVG scaled to fit takes its text down with it,
while a CSS bar chart's labels are ordinary DOM text at an ordinary font size and
reflow. The bars therefore live in a grid of one column per returned month, each
column a fixed-height box whose bar takes `height: var(--dh-bar-share)`.

Accessibility is structural rather than decorative:

- the plot carries `aria-hidden="true"` — it is the picture;
- the accessible equivalent is a `<table>` with a `<caption>`, `<th scope="col">`
  headers per series, `<th scope="row">` per month and a `<tfoot>` total row;
- the overview renders that table with `.dh-sr-only`, the finance section renders
  it visibly, so sighted and assistive readers get the same numbers;
- the quartile gridlines and the peak label give the plot a scale;
- every figure carries `font-variant-numeric: tabular-nums`;
- the shared `prefers-reduced-motion` block already neutralises the bar's height
  transition, and the handoff restates it for the bars explicitly.

`barShare` gives a non-zero amount a 4% floor so a small real month is visible,
and returns exactly `0` for zero. A window whose peak is `0` renders the empty
note above the plot and keeps the table, because the record still exists even
when the trend does not.

## Series honesty

`chartSeriesFor(dashboard)` reads the presence of the `buyer` and `seller`
blocks, not the values inside them. A buyer-scoped dashboard reports
`salesRevenueUzs: 0` for all six months — correct, and meaningless as a series,
because the account cannot sell. Drawing it would turn an absent capability into
a visible run of zero months.

## Buyer / seller separation

`/marketplace/contracts` returns `actorParty` per contract, computed server-side
for the reading account by `toContractSelfView`. The cabinet filters on it. No
comparison of user ids, partner ids or party snapshots happens in the client.

## The demo fixture

Twelve rows, buyer `xaridor` against seller `sotuvchi`, over the six months the
dashboard buckets. Four database rules shaped them, and each one is asserted in
`marketplace-seed-contracts.test.ts` so a bad fixture fails a unit test rather
than aborting the whole seed transaction with a bare constraint name:

- **Party coherence.** `assert_marketplace_resolved_commerce_parties` resolves a
  party only against an active membership on an approved partner whose owner
  holds a marketplace verification with the role exactly `buyer` or exactly
  `seller`. The demo farmer trades as `farmer`, so it cannot be a party.
  Memberships are created by the partner-approval trigger and are never inserted.
- **Frozen lines and snapshots.** Each line quotes a real seeded listing
  publication, its catalog product as `sourceId`, revision 1, the product's own
  unit and price, and a line total that is exactly price × quantity. The contract
  amount is the sum of the line totals and excludes delivery, matching
  `PostgresMarketplaceRepository`. Each party snapshot names the same
  tenant/user/partner triple as the row.
- **Frozen authority.** `enforce_marketplace_contract_frozen_authority` refuses
  an update that moves a resolved contract's parties, snapshots, lines, subject,
  amount or delivery terms. The seed's `ON CONFLICT` therefore updates only
  status, the signature timestamps and `updated_at`. Changing a fixture's
  commercial terms needs a new fixture key, not an edited row.
- **Consent and delivery.** `active` carries both signatures and a settlement
  timestamp, `signed` carries exactly one and no settlement, `cancelled` carries
  none; `pickup` prices delivery at zero, `seller_delivery` above zero, and
  `by_agreement` not at all.

Dates are derived from the seed run rather than hard-coded, so a re-seed keeps
the history inside the rolling six-month window instead of letting it age out; a
row placed in the current month is clamped so it never claims a future date. Ids
stay content-derived, so a re-seed refreshes rows in place.

`source_type` and `source_id` stay null. A real contract points at the cart or
offer it came from; inventing an id for a cart the seed never wrote would assert
a provenance nothing corroborates.

## The seller-offer gap

There is no endpoint that lists the offers an account made as a seller.
`GET /marketplace/requests/{id}/offers` resolves the request publication by
`buyerUserId`, so a seller calling it answers 404 by design. The selling section
is built from what exists and nothing else. Closing the gap means
`GET /marketplace/offers/mine` through the shared repository interface, both
adapters, the controller DTO and the openapi → contracts → clients pipeline; it
is out of scope here and named in the proposal rather than papered over.
