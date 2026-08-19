import { DemoProducts } from "../../../../../libs/backend/feature/product/shared/lib/src/domain/demo-catalog.ts";
import { buyerEmail, farmerEmail, marketplaceFixtureUuid, sellerEmail } from "./marketplace-seed-data.ts";
import { demoMarketplaceListingPublications } from "./marketplace-seed-publications.ts";

/**
 * Trading history between the demo buyer and the demo seller.
 *
 * The cabinet's month chart and its buyer/seller totals are computed by
 * `PostgresMarketplaceDashboardAiRepository` from `marketplace_contracts` rows
 * whose `status` is `completed`, bucketed by the month of `updated_at` over the
 * six months ending now. Before this fixture the database held a single draft
 * contract, so every reviewer saw a one-point chart and two zeroes — a shape
 * that says nothing about whether the aggregation works at all.
 *
 * Three constraints shaped how these rows are built, all of them enforced by the
 * database rather than by application code:
 *
 * - `ct__contracts__party_coherence` resolves a party only against an active
 *   membership on an approved partner whose owner holds a verified marketplace
 *   role the policy admits for that side. Since
 *   `Migration20260811110000AlignMarketplaceBuyerPartyRole` that is
 *   `('buyer', 'farmer')` for the buying side, matching `marketplaceBuyerRoles`
 *   — so the demo farmer, which holds an approved buyer partner and an active
 *   buyer membership, is a second buyer this fixture can trade as. Every row is
 *   still sold by `sotuvchi`, which owns all fourteen supplier partners.
 * - `ck__marketplace_contracts__resolved_parties` requires both party snapshots
 *   to name the same tenant/user/partner triple as the row, and requires each
 *   line to be a frozen quote: a real publication id, a source kind, a source
 *   id, a revision of at least one, a name, a unit, a positive unit price, a
 *   positive quantity, and a line total that is exactly their product.
 * - `tr__marketplace_contracts__frozen_authority` refuses any update that moves
 *   a resolved contract's parties, snapshots, lines, subject, amount or
 *   delivery terms. The seed therefore upserts only the mutable columns; a
 *   fixture whose commercial terms change needs a new id, not an edited row.
 *
 * `source_type` and `source_id` stay null on purpose. A real contract points at
 * the cart or the offer it came from, and inventing an id for a cart that was
 * never seeded would assert a provenance the database cannot corroborate.
 */

export interface DemoContractLineFixture {
  sourcePublicationId: string;
  sourceKind: "product";
  sourceId: string;
  sourceRevision: number;
  name: string;
  unit: string;
  unitPriceUzs: number;
  quantity: number;
  lineTotalUzs: number;
}

export interface DemoContractPartyFixture {
  ownerEmail: string;
  partnerId: string;
  legalName: string;
  region: string;
}

export interface DemoContractFixture {
  id: string;
  buyer: DemoContractPartyFixture;
  seller: DemoContractPartyFixture;
  subject: string;
  amountUzs: number;
  lines: readonly DemoContractLineFixture[];
  deliveryTerms: "pickup" | "seller_delivery" | "by_agreement";
  deliveryPriceUzs: number | null;
  deliveryDays: number | null;
  deliveryNote: string | null;
  status: "signed" | "active" | "completed" | "cancelled";
  buyerSignedAt: Date | null;
  sellerSignedAt: Date | null;
  signedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const productByName = new Map(DemoProducts.map((product) => [product.name, product] as const));

/**
 * The publication a line quotes, addressed by the same fixture key
 * `marketplace-seed-publications` writes it under. Looking it up rather than
 * recomputing the key keeps a line from pointing at a publication the seed
 * never wrote — a produce-shaped catalog row, for instance, publishes as a
 * produce listing and has no `listing-publication:` row at all.
 */
const publicationByProductId = new Map(
  demoMarketplaceListingPublications
    .filter((publication) => publication.productId !== null)
    .map((publication) => [publication.productId as string, publication] as const),
);

const line = (productName: string, quantity: number): DemoContractLineFixture => {
  const product = productByName.get(productName);
  if (!product) {
    throw new Error(`Demo contract fixture references an unknown catalog product: ${productName}.`);
  }
  const publication = publicationByProductId.get(product.id);
  if (!publication) {
    throw new Error(`Demo contract fixture references ${productName}, which the seed never publishes as a listing.`);
  }
  return {
    sourcePublicationId: publication.id,
    sourceKind: "product",
    sourceId: product.id,
    sourceRevision: 1,
    name: product.name,
    unit: product.unit,
    unitPriceUzs: product.priceUzs,
    quantity,
    lineTotalUzs: product.priceUzs * quantity,
  };
};

/**
 * The seller behind a set of lines. A contract has exactly one seller, and the
 * catalog already records which organization sells each listing, so deriving it
 * removes the chance of a fixture naming a seller that does not stock the goods.
 */
const sellerForLines = (lines: readonly DemoContractLineFixture[]): { partnerId: string; slug: string } => {
  const slugs = new Set(
    lines.map((entry) => {
      const product = DemoProducts.find((candidate) => candidate.id === entry.sourceId);
      if (!product) {
        throw new Error(`Demo contract line ${entry.name} has no catalog product behind it.`);
      }
      return product.supplierId;
    }),
  );
  if (slugs.size !== 1) {
    throw new Error(`Demo contract lines span ${slugs.size} suppliers; a contract has exactly one seller.`);
  }
  const slug = [...slugs][0] as string;
  return { partnerId: marketplaceFixtureUuid(`partner:supplier:${slug}`), slug };
};

const supplierRegionBySlug = new Map(
  DemoProducts.map((product) => [product.supplierId, product.region] as const),
);

const supplierNameBySlug = new Map(
  DemoProducts.map((product) => [product.supplierId, product.supplierName] as const),
);

const demoBuyerParty: DemoContractPartyFixture = {
  ownerEmail: buyerEmail,
  partnerId: marketplaceFixtureUuid("partner:buyer:buyer"),
  legalName: "Xaridor Demo Savdo",
  region: "Toshkent",
};

/**
 * The demo farmer buying as a farm rather than as a trading house.
 *
 * A marketplace with one buyer can never show a listing more than one review:
 * `uq__marketplace_listing_reviews__buyer_tenant_id_buyer_87d1c30f` allows a
 * buyer exactly one review per product, so an average would always equal the
 * single rating behind it. Trading as the farmer too gives the overlapping
 * listings a genuine second opinion, and the rounding of a real average
 * something to round.
 */
const demoFarmerBuyerParty: DemoContractPartyFixture = {
  ownerEmail: farmerEmail,
  partnerId: marketplaceFixtureUuid("partner:buyer:farmer"),
  legalName: "Dehqon Demo Xo'jaligi",
  region: "Toshkent",
};

const buyerParties = {
  farmer: demoFarmerBuyerParty,
  trader: demoBuyerParty,
} as const;

interface ContractSeed {
  key: string;
  /** Which demo buyer signs it; the trading house unless stated otherwise. */
  buyer?: keyof typeof buyerParties;
  lines: readonly DemoContractLineFixture[];
  deliveryTerms: "pickup" | "seller_delivery" | "by_agreement";
  deliveryPriceUzs: number | null;
  deliveryDays: number | null;
  deliveryNote: string | null;
  status: DemoContractFixture["status"];
  /** Whole months back from the current month; 0 is the month being reviewed. */
  monthsAgo: number;
  dayOfMonth: number;
}

/**
 * Twelve deals across the six months the dashboard aggregates, varied in size,
 * delivery terms and outcome so the chart has a shape rather than a plateau and
 * the status badges all appear at least once. Amounts follow the seeded catalog
 * prices exactly, because a line total that disagreed with the listing it quotes
 * would be a number no screen could source.
 */
const contractSeeds: readonly ContractSeed[] = [
  {
    key: "contract:cotton-seed",
    lines: [line("Cotton seed “Omad” F1", 40)],
    deliveryTerms: "seller_delivery",
    deliveryPriceUzs: 1_200_000,
    deliveryDays: 5,
    deliveryNote: "Delivered to the Andijon depot.",
    status: "completed",
    monthsAgo: 5,
    dayOfMonth: 6,
  },
  {
    key: "contract:ammophos",
    lines: [line("Ammophos 12:52", 3)],
    deliveryTerms: "pickup",
    deliveryPriceUzs: 0,
    deliveryDays: null,
    deliveryNote: "Collected from the Navoiy warehouse.",
    status: "completed",
    monthsAgo: 5,
    dayOfMonth: 21,
  },
  {
    key: "contract:sprayers",
    lines: [line("Knapsack sprayer, 16 L", 12)],
    deliveryTerms: "seller_delivery",
    deliveryPriceUzs: 320_000,
    deliveryDays: 3,
    deliveryNote: "Two pallets, kerbside delivery.",
    status: "completed",
    monthsAgo: 4,
    dayOfMonth: 9,
  },
  {
    key: "contract:water-pump",
    lines: [line("Diesel water pump 4”", 1)],
    deliveryTerms: "by_agreement",
    deliveryPriceUzs: null,
    deliveryDays: null,
    deliveryNote: null,
    status: "cancelled",
    monthsAgo: 4,
    dayOfMonth: 18,
  },
  {
    key: "contract:winter-wheat",
    lines: [line("Winter wheat “Durdona”", 60)],
    deliveryTerms: "seller_delivery",
    deliveryPriceUzs: 2_100_000,
    deliveryDays: 7,
    deliveryNote: "Certificates travel with the shipment.",
    status: "completed",
    monthsAgo: 3,
    dayOfMonth: 4,
  },
  {
    key: "contract:drip-kits",
    lines: [line("Drip irrigation kit, 1 ha", 2)],
    deliveryTerms: "seller_delivery",
    deliveryPriceUzs: 1_800_000,
    deliveryDays: 10,
    deliveryNote: "Includes commissioning on site.",
    status: "completed",
    monthsAgo: 3,
    dayOfMonth: 23,
  },
  {
    key: "contract:urea",
    lines: [line("Urea 46% N", 8)],
    deliveryTerms: "seller_delivery",
    deliveryPriceUzs: 3_400_000,
    deliveryDays: 6,
    deliveryNote: "Eight tonnes in one run.",
    status: "completed",
    monthsAgo: 2,
    dayOfMonth: 11,
  },
  {
    key: "contract:plough",
    lines: [line("Reversible plough, 3 furrow", 1)],
    deliveryTerms: "pickup",
    deliveryPriceUzs: 0,
    deliveryDays: null,
    deliveryNote: "Collected from the Farg'ona yard.",
    status: "completed",
    monthsAgo: 2,
    dayOfMonth: 26,
  },
  {
    key: "contract:alfalfa",
    lines: [line("Alfalfa seed, first reproduction", 25)],
    deliveryTerms: "pickup",
    deliveryPriceUzs: 0,
    deliveryDays: null,
    deliveryNote: null,
    status: "completed",
    monthsAgo: 1,
    dayOfMonth: 7,
  },
  {
    key: "contract:tractor",
    lines: [line("Tractor TTZ-80, 2023", 1)],
    deliveryTerms: "seller_delivery",
    deliveryPriceUzs: 4_500_000,
    deliveryDays: 14,
    deliveryNote: "Low-loader delivery, handover on site.",
    status: "active",
    monthsAgo: 1,
    dayOfMonth: 19,
  },
  {
    key: "contract:tomato-seed",
    lines: [line("Tomato “Nurafshon”", 30)],
    deliveryTerms: "pickup",
    deliveryPriceUzs: 0,
    deliveryDays: null,
    deliveryNote: null,
    status: "completed",
    monthsAgo: 0,
    dayOfMonth: 3,
  },
  {
    key: "contract:trailer",
    lines: [line("Tipping trailer 2PTS-4, used", 1)],
    deliveryTerms: "by_agreement",
    deliveryPriceUzs: null,
    deliveryDays: null,
    deliveryNote: null,
    status: "signed",
    monthsAgo: 0,
    dayOfMonth: 12,
  },
];


/**
 * The farmer's own purchases: inputs and implements a working farm buys, settled
 * across the same six months. Four of them quote listings the trading house also
 * bought, so those listings carry two independent ratings; the rest are the
 * farmer's alone and widen how much of the catalog carries any rating at all.
 *
 * They are all `completed` because their purpose is review eligibility, and an
 * eligibility exists only for a completed contract line. They do not disturb the
 * trading house's cabinet: the dashboard aggregates per authenticated user, and
 * these rows belong to a different buyer.
 */
const farmerContractSeeds: readonly ContractSeed[] = [
  {
    key: "contract:farmer:urea",
    buyer: "farmer",
    lines: [line("Urea 46% N", 4)],
    deliveryTerms: "pickup",
    deliveryPriceUzs: 0,
    deliveryDays: null,
    deliveryNote: "Collected by the farm's own truck.",
    status: "completed",
    monthsAgo: 5,
    dayOfMonth: 12,
  },
  {
    key: "contract:farmer:cotton-seed",
    buyer: "farmer",
    lines: [line("Cotton seed “Omad” F1", 18)],
    deliveryTerms: "seller_delivery",
    deliveryPriceUzs: 600_000,
    deliveryDays: 4,
    deliveryNote: "Delivered to the farm gate.",
    status: "completed",
    monthsAgo: 5,
    dayOfMonth: 27,
  },
  {
    key: "contract:farmer:dap",
    buyer: "farmer",
    lines: [line("DAP 18:46", 6)],
    deliveryTerms: "seller_delivery",
    deliveryPriceUzs: 450_000,
    deliveryDays: 6,
    deliveryNote: "One pallet, kerbside.",
    status: "completed",
    monthsAgo: 4,
    dayOfMonth: 9,
  },
  {
    key: "contract:farmer:sprayers",
    buyer: "farmer",
    lines: [line("Knapsack sprayer, 16 L", 4)],
    deliveryTerms: "pickup",
    deliveryPriceUzs: 0,
    deliveryDays: null,
    deliveryNote: null,
    status: "completed",
    monthsAgo: 4,
    dayOfMonth: 24,
  },
  {
    key: "contract:farmer:disc-harrow",
    buyer: "farmer",
    lines: [line("Disc harrow, 2.4 m", 1)],
    deliveryTerms: "seller_delivery",
    deliveryPriceUzs: 900_000,
    deliveryDays: 8,
    deliveryNote: "Low loader, unloading by the seller.",
    status: "completed",
    monthsAgo: 3,
    dayOfMonth: 15,
  },
  {
    key: "contract:farmer:drip-kit",
    buyer: "farmer",
    lines: [line("Drip irrigation kit, 1 ha", 1)],
    deliveryTerms: "seller_delivery",
    deliveryPriceUzs: 380_000,
    deliveryDays: 5,
    deliveryNote: "Filter station included.",
    status: "completed",
    monthsAgo: 2,
    dayOfMonth: 7,
  },
  {
    key: "contract:farmer:drip-tape",
    buyer: "farmer",
    lines: [line("Drip tape 16 mm, 0.3 m spacing, 1000 m", 6)],
    deliveryTerms: "pickup",
    deliveryPriceUzs: 0,
    deliveryDays: null,
    deliveryNote: null,
    status: "completed",
    monthsAgo: 2,
    dayOfMonth: 22,
  },
  {
    key: "contract:farmer:seed-drill",
    buyer: "farmer",
    lines: [line("Pneumatic seed drill, 12 rows", 1)],
    deliveryTerms: "seller_delivery",
    deliveryPriceUzs: 1_100_000,
    deliveryDays: 10,
    deliveryNote: "Assembled on delivery.",
    status: "completed",
    monthsAgo: 1,
    dayOfMonth: 11,
  },
  {
    key: "contract:farmer:ammonium-nitrate",
    buyer: "farmer",
    lines: [line("Ammonium nitrate 34.4% N", 5)],
    deliveryTerms: "pickup",
    deliveryPriceUzs: 0,
    deliveryDays: null,
    deliveryNote: null,
    status: "completed",
    monthsAgo: 0,
    dayOfMonth: 4,
  },
];

/**
 * The day a fixture lands on, clamped so a row dated inside the current month
 * never claims a date that has not happened yet. Re-seeding therefore moves the
 * history forward with the calendar instead of leaving the chart to drift out of
 * the six-month window a month after the fixture was written.
 */
const contractDate = (now: Date, monthsAgo: number, dayOfMonth: number): Date => {
  const day = monthsAgo === 0 ? Math.min(dayOfMonth, now.getUTCDate()) : dayOfMonth;
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - monthsAgo, day, 10, 0, 0));
};

export function demoMarketplaceContracts(now: Date): readonly DemoContractFixture[] {
  return [...contractSeeds, ...farmerContractSeeds].map((seed) => {
    const { partnerId, slug } = sellerForLines(seed.lines);
    const settledAt = contractDate(now, seed.monthsAgo, seed.dayOfMonth);
    // Real contracts are drafted, signed by both parties and only then settled,
    // so the fixture backdates the draft rather than stamping one instant on
    // every column; `ck__marketplace_contracts__party_consent` also rejects an
    // active contract that is missing either signature.
    const createdAt = new Date(settledAt.getTime() - 6 * 24 * 60 * 60 * 1000);
    const buyerSignedAt = new Date(settledAt.getTime() - 4 * 24 * 60 * 60 * 1000);
    const sellerSignedAt = new Date(settledAt.getTime() - 3 * 24 * 60 * 60 * 1000);
    const bothSigned = seed.status === "active" || seed.status === "completed";
    return {
      id: marketplaceFixtureUuid(seed.key),
      buyer: buyerParties[seed.buyer ?? "trader"],
      seller: {
        ownerEmail: sellerEmail,
        partnerId,
        legalName: supplierNameBySlug.get(slug) ?? slug,
        region: supplierRegionBySlug.get(slug) ?? "Toshkent",
      },
      subject: seed.lines
        .map((entry) => entry.name)
        .join(", ")
        .slice(0, 300),
      amountUzs: seed.lines.reduce((sum, entry) => sum + entry.lineTotalUzs, 0),
      lines: seed.lines,
      deliveryTerms: seed.deliveryTerms,
      deliveryPriceUzs: seed.deliveryPriceUzs,
      deliveryDays: seed.deliveryDays,
      deliveryNote: seed.deliveryNote,
      status: seed.status,
      buyerSignedAt: bothSigned || seed.status === "signed" ? buyerSignedAt : null,
      sellerSignedAt: bothSigned ? sellerSignedAt : null,
      signedAt: bothSigned ? sellerSignedAt : null,
      createdAt,
      updatedAt: settledAt,
    };
  });
}

/** The party snapshot the resolved-parties check validates against the row. */
export const demoContractPartySnapshot = (
  party: DemoContractPartyFixture,
  tenantId: string,
  userId: string,
): Record<string, string> => ({
  tenantId,
  userId,
  partnerId: party.partnerId,
  legalName: party.legalName,
  region: party.region,
});
