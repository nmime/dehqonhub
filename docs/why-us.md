# Why AgroUz — and not UFarmer, AgroHub, or the state platform

**Positioning report for the PTA 2026 application. August 2026.**

This document answers the question every judge, investor, and partner will
ask: *the market already has UFarmer with 12,000 farmers, AI, BNPL, and state
backing — why does Uzbekistan need another AgriTech platform, and why you?*

The short answer: **we are not building another UFarmer.** UFarmer digitizes
the 7% of agricultural trade that already works like a normal e-commerce
market. We digitize the other 93% — the informal, credit-based, trust-driven
trade between 414,000 dehqan farms and their local dealers — which no existing
platform serves because their unit economics do not allow it.

---

## 1. The market reality our own research established

From `docs/research/report_en.html` (120+ sources, August 2026):

| Fact | Value | Source class |
| --- | --- | --- |
| Total agricultural output (2024) | $34.2B (444.6 trln UZS) | stat.uz |
| Addressable B2B input+output TAM | $4.8–6.2B | our synthesis |
| Dehqan (smallholder) farms | **414,000** | stat.uz |
| Share of output from dehqan + subsidiary farms | **63.1%** | stat.uz |
| Average dehqan farm size | **< 0.2 ha** (homesteads: 508K ha across 5M+ households) | Wikipedia/stat.uz |
| Agricultural lending rate (average) | **23.13%** | bank disclosures |
| Players already in the ecosystem | 60+ | our mapping |
| UFarmer registered farmers | 12,000 (≈2.9% of dehqan farms) | ufarmer.uz |

Three conclusions follow directly from these numbers:

1. **The dominant producer is not the commercial farm — it is the household.**
   63.1% of everything grown in Uzbekistan comes from plots under 0.2 hectares
   and small dehqan farms. Any platform whose economics require large baskets,
   formal invoicing, or prepayment structurally excludes the majority of the
   sector.

2. **After years of operation and state visibility, the best private platform
   covers under 3% of farms.** This is not an execution failure by UFarmer —
   it is evidence that the *marketplace model itself* does not fit this
   segment. If it did, a platform with AI scanners, BNPL, ERP, and nationwide
   delivery would not be stuck at 12,000 farmers.

3. **The binding constraint is credit, not discovery.** Average lending at
   23.13% annual is unaffordable for a household buying 2 bags of fertilizer.
   The trade already runs on informal supplier credit (*nasia*): the local
   dealer knows the farmer, gives inputs now, collects after harvest. No
   digital platform participates in this flow — which is why the flow stays
   offline.

## 2. Why the incumbents cannot move down-market

### UFarmer (Xavfsiz Tarmoq MCHJ)

The strongest private player: marketplace + AI plant scanner + BNPL + ERP,
12,000+ farmers, 850+ sellers, tri-lingual. Its constraints are structural,
not fixable by effort:

- **Marketplace economics require basket size.** Delivery, payment processing,
  and support for a 170,000 UZS fertilizer order to a 0.15 ha household lose
  money. UFarmer rationally serves larger dehqan and commercial farms in the
  cotton/wheat belt — exactly the 12,000 it has.
- **BNPL ≠ nasia.** UFarmer's BNPL is a consumer-finance product: formal
  scoring, fixed schedules, penalties. The dehqan household's real credit
  relationship is personal and seasonal — pay-after-harvest, renegotiable in
  a bad year, enforced by reputation in the mahalla. Replacing that with a
  fintech product fails not on technology but on *fit*.
- **State-aligned focus.** Its growth path runs through government digital
  agriculture programs and the cotton-textile cluster system (134 clusters,
  ~88% of cotton area). That is where the money and the political cover are.
  Fergana Valley horticulture households are not on that path.

### AgroHub / AgroMart

Input marketplaces for professional buyers. They digitize the supplier→farm
catalog for customers who already buy formally, in volume, with prepayment.
They are distributors with a web storefront, not infrastructure for informal
trade.

### The state platform (integratsion.agro.uz)

A government data-integration layer — 20+ departmental systems, subsidies,
monitoring. It serves the state's need for visibility and the clusters' need
for contract farming administration. It will never be a trade counterparty
for a household selling 300 kg of tomatoes.

**The pattern:** every incumbent optimizes for the formal, large, state-visible
layer of agriculture. The informal majority is not underserved because nobody
tried — it is underserved because *their cost structures cannot reach it.*

## 3. Why us — the specific reasons we can do what they cannot

### 3.1 We start where the trade actually happens

Our unit of operation is not the marketplace listing — it is the **recorded
credit transaction between a known supplier and a known farmer**, confirmed
physically by a field agent. The product wraps around the existing nasia
relationship instead of demanding it be replaced:

1. Supplier gives inputs on credit, as today.
2. Field agent (local, employed by us) verifies delivery on-site — quantity,
   quality, photos.
3. The obligation is recorded against the farmer's verified profile.
4. After harvest, settlement is recorded — cash, produce offset, or bank
   transfer.

Nothing in this flow requires the farmer to change behavior on day one. The
platform earns trust by *documenting* trust relationships that already exist,
then monetizes the resulting data and distribution.

### 3.2 Our cost structure fits the segment

| Cost driver | Marketplace model | Our model |
| --- | --- | --- |
| Customer acquisition | Ads, onboarding funnels | Field agents recruited from the same mahallas — trust is inherited, not bought |
| Transaction minimum | Needs large baskets to cover logistics | Agent batch-verifies dozens of deals per trip; verification cost per deal is marginal |
| Credit risk | BNPL scorer with no data on this segment | 1–2 seasons of verified repayment history — data no bank or fintech has |
| App adoption | App install, account, UX learning | Telegram bot — already on every farmer's phone, zero new behavior |

UFarmer cannot copy this without abandoning its marketplace margin structure;
the state platform cannot copy it without becoming a commercial operator.

### 3.3 The money model is distribution margin and credit origination — not marketplace commission

We are explicit about this because judges correctly ask "where is the money":

1. **Now → pilot:** distribution margin. The platform aggregates input demand
   across recorded farmers, buys from manufacturers/importers, and sells
   through supplier-partners at 8–15% markup. DeHaat's input business works
   exactly this way; commission-only marketplaces in rural B2B do not survive.
2. **After 1–2 seasons of data:** credit origination. Uzbek banks are mandated
   to grow agricultural lending and have preferential funding lines, but they
   have zero underwriting data on 414,000 households. We sell verified credit
   histories and originate loans at 1–3% of disbursement — the farmer gets
   bank rates instead of 23.13% or informal premiums, the bank gets a scored
   borrower, we get paid per origination. DeHaat's financial services reached
   ~30% of revenue on the same arc.
3. **Later:** output aggregation — the same agent network grades and
   aggregates horticulture produce for processors and exporters, attacking
   the 20–30% post-harvest loss and the 4.9% cold-storage gap our research
   documented.

### 3.4 The beachhead is deliberately small — and that is the strategy

One district, one crop cycle, 100 farmers, 5–10 supplier-partners, 2–3 field
agents. This is not modesty; it is how the model is de-risked:

- A district is small enough that agents physically cover every deal —
  verification quality is provable, not assumed.
- One crop cycle produces a complete credit-history dataset: issuance,
  verification, settlement, default rate. That dataset *is* the pitch for
  phase 2 and for bank partnership.
- DeHaat ran the same play: 3 districts in Bihar to prove unit economics,
  then 12 states. Investors and judges know this precedent.

### 3.5 Why the team can execute this

- **Working software now, not a concept.** The platform is implemented and
  tested: tenant-isolated marketplace core, atomic produce reservation with
  pessimistic locking (no overselling), idempotent Click/Payme payment flows
  with replay protection, delivery state machine requiring proof-of-delivery,
  advisory publication with source attribution, pilot-cohort governance,
  operator console with RBAC. 370+ automated tests, strict TypeScript,
  requirement-traced specs — see the repository README.
- **Telegram-first distribution.** The bot and Mini App exist in the codebase;
  farmer onboarding does not depend on app-store installs.
- **Local ground truth.** The team is based in Uzbekistan; the pilot district,
  the suppliers, and the first agents are reachable without a remote
  organization.

## 4. The honest risks — and why they do not kill the thesis

| Objection | Answer |
| --- | --- |
| "UFarmer will copy you if it works" | Copying requires a physical agent network and abandoning marketplace margins. If they do it anyway, the segment gets validated and we compete on 18 months of local data and supplier relationships — the actual moat. |
| "Farmers won't repay recorded debts" | Selection works in our favor: agents enroll farmers through supplier referral, not open signup. The supplier already extends credit today — we make it visible, not riskier. Pilot default rate is a measured number, not an assumption. |
| "1 district is not a business" | Correct — it is the proof of one. The business begins at replication: district N costs a fraction of district 1 because the playbook, agent training, and software already exist. |
| "The state could crowd you out" | The state builds visibility infrastructure, not retail trade counterparties. The plausible state role is partner/regulator of last resort for the credit layer — which legitimates us. |
| "You are students" | True, and it constrains scale — which is why the plan is 100 farmers and verified repayment data, not "capture the market." PTA's own criteria (working MVP, real users, engagement metrics) are exactly what this plan produces. |

## 5. What we ask the reader to conclude

1. The 93% offline figure is not an adoption gap waiting for a better app —
   it is a structural mismatch between marketplace economics and the
   smallholder majority. UFarmer's 12,000/414,000 penetration after years of
   operation is the proof.
2. The wedge into that majority is documenting and financing the credit trade
   that already exists — with physical verification, Telegram distribution,
   and a cost structure a marketplace cannot match.
3. The beachhead is intentionally tiny because the asset being built is
   *verified repayment data at district scale* — the scarcest input in Uzbek
   agricultural finance, and the thing banks, donors, and the state all need
   and none of them have.

We are not the next UFarmer. We are the system that makes the other 400,000
farms legible to the formal economy — and gets paid for it.

---

*Data sources: `docs/research/report_en.html`, `docs/research/report_ru.html`
(stat.uz, president.uz, UzEx, bank disclosures, donor program documentation —
full citations in the reports). Product evidence: repository test suites and
`docs/agritech-platform.md`.*
