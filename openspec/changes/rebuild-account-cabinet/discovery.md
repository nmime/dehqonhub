## Participants and Owners

- Product/domain owner: `agritech-maintainers`, acting on the product owner's
  direct review of `/account`.
- Specification author: `agritech-maintainers`.
- User-web owner: `user-app` and `@app/frontend-feature-user-i18n`.
- Demo-fixture owner: `@repo/tooling`.
- Independent verification reviewer: `quality-engineering`.

## Actors and Outcomes

- A verified buyer opens `/account` and reads their open purchase requests, open
  carts, deals in progress, completed deals and completed spending, then the
  six-month chart, then their most recent contracts, and can open any of them.
- The same buyer opens the "my orders" section and sees each purchase request
  with its stage, its moderation state and how many offers it has received, plus
  every contract where they are the buyer.
- A verified seller opens the "orders I fulfil" section and reads published
  listings, offers awaiting a decision, offer acceptance rate, the contracts they
  are fulfilling, the listings that actually sold, and the open requests they can
  offer on.
- Either party opens "sales and spending" and reads the same six months as a
  chart plus the value table and window totals behind it.
- A screen-reader user reaches the chart's figures through a captioned table with
  column headers, not through a picture.
- A reviewer is sent `https://<host>/account/finance` and lands on that section
  directly.
- A keyboard-only user reaches every section with Tab and activates it with
  Enter or Space, and hears which section is current.
- A user on a 320 px viewport gets one column: the rail becomes a horizontal
  strip above the content, and the chart's month labels stay at or above the
  0.75rem type floor.
- A user whose dashboard read failed sees that it failed, with a retry, and no
  fabricated zero.

## Rules

- A section renders only members the generated client returns for that account.
  No figure is derived from another figure, defaulted, or padded.
- Buyer and seller work is separated on `ContractViewDto.actorParty`, which the
  API stamps per contract for the reading account.
- The chart plots a spend series only when the dashboard carries a `buyer` scope
  and a revenue series only when it carries a `seller` scope. A month with no
  completed contract draws no bar; a real but tiny amount keeps a visible stub.
- A six-month window with nothing completed states that in words. It does not
  plot a flat line and does not hide the value table.
- Money is formatted by the shared `formatMoney` helper; a ratio the API reports
  in basis points is formatted by `Intl` in the active locale. No figure is
  assembled by string concatenation.
- Every panel body can say loading, empty, error and ready. An error names the
  read that failed and offers a retry in place.
- `/account` is the overview. `/account/<section>` addresses one section. An
  unrecognised segment resolves to the overview.
- Every existing account capability stays reachable after the move.
- Each head — hero, section panel — uses the same 0.5rem grid rhythm as
  `.dh-page-heading > div` with the eyebrow's own margin zeroed.
- The demo fixture's contract rows satisfy the party-coherence trigger, the
  resolved-parties check, the frozen-line rule, the party-consent matrix and the
  delivery-price rule, and are trades between the `buyer`-verified and
  `seller`-verified demo logins only.

## Examples

- Buyer `xaridor@demo.dehqonhub.uz` on the seeded database: overview reports 3
  open purchase requests, 0 open carts, 3 deals in progress, 9 completed deals
  and 123,465,000 UZS completed spending; the chart shows six months at
  25,930,000 / 7,680,000 / 41,880,000 / 40,480,000 / 4,600,000 / 2,895,000 UZS.
- Seller `sotuvchi@demo.dehqonhub.uz`: the same six months as a revenue series,
  13 published listings, 1 offer awaiting a decision, 33.3% acceptance, and five
  listings that sold, led by the drip irrigation kit at 25,800,000 UZS and the
  urea line at 22,080,000 UZS.
- A buyer-scoped dashboard: the chart's table has a spend column and no revenue
  column.
- Two contracts, one `actorParty: buyer` and one `actorParty: seller`: the buying
  section lists only the first and names its seller; the selling section lists
  only the second and names its buyer.
- `/account/statistics`: not a section, so the overview renders.
- Publication queue read fails: the publications section states
  "publication status could not be loaded" with one retry, and lists nothing.

## Counterexamples and Boundaries

- Summing `activeDeals + completedDeals` and labelling it "contracts" is invalid:
  no endpoint reports that total, and the two counts have different scopes.
- Plotting six zero-height bars for a role that cannot sell is invalid: it
  presents an absent capability as a run of empty months.
- Interpolating, extending or repeating a month to make the trend look continuous
  is invalid under any circumstances.
- Showing the chart as a picture with no tabular equivalent is invalid.
- Loading a charting library or fetching one from a CDN is invalid: the
  deployment's CSP forbids remote scripts.
- Listing an account's own offers as a seller is out of scope, not deferred
  silently: no endpoint returns them, and constructing them from the buyer-only
  offer read would either 404 or leak another buyer's request.
- Hiding a section because the dashboard has not resolved yet is invalid: the
  deep link would work only after a round trip.
- Seeding a contract for the demo farmer is invalid: its verification role is
  `farmer`, and the party-coherence trigger resolves a party only against a role
  of exactly `buyer` or exactly `seller`.
- Seeding a contract with a fabricated `source_id` is invalid: it would assert a
  cart or offer provenance no row corroborates. These fixture rows carry no
  source.
