import { buyerEmail, farmerEmail, marketplaceBuyerOrganization, marketplaceFixtureUuid } from "./marketplace-seed-roster.ts";
import {
  demoMarketplaceListingPublications,
  demoMarketplaceProduceListings,
  demoMarketplaceProducePublications,
  demoMarketplacePublicSellers,
  type DemoListingPublicationFixture,
} from "./marketplace-seed-publications.ts";
import { DemoProducts } from "../../../../../libs/backend/feature/product/shared/lib/src/domain/demo-catalog.ts";

/**
 * Trading history between the roster's buying and selling parties.
 *
 * The cabinet's month chart and its buyer/seller totals are computed by
 * `PostgresMarketplaceDashboardAiRepository` from `marketplace_contracts` rows
 * whose `status` is `completed`, bucketed by the month of `updated_at` over the
 * six months ending now. Before this fixture the database held a single draft
 * contract, so every reviewer saw a one-point chart and two zeroes — a shape
 * that says nothing about whether the aggregation works at all. Now every
 * trading login in `marketplace-seed-roster` has its own history, so the chart is
 * populated whichever of them a reviewer signs in as.
 *
 * Three constraints shaped how these rows are built, all of them enforced by the
 * database rather than by application code:
 *
 * - `ct__contracts__party_coherence` resolves a party only against an active
 *   membership on an approved partner whose owner holds a verified marketplace
 *   role the policy admits for that side. Since
 *   `Migration20260811110000AlignMarketplaceBuyerPartyRole` that is
 *   `('buyer', 'farmer')` for the buying side and `('seller', 'farmer')` for the
 *   selling one, so a farmer login is both a buyer this fixture can trade as and
 *   a seller it can buy a harvest from.
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
  sourceKind: "product" | "produce";
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

const produceListingByCrop = new Map(
  demoMarketplaceProduceListings.map((listing) => [listing.crop, listing] as const),
);

const producePublicationByListingId = new Map(
  demoMarketplaceProducePublications
    .filter((publication) => publication.produceListingId !== null)
    .map((publication) => [publication.produceListingId as string, publication] as const),
);

/** An input or implement bought off the catalog, quoted at the listed price. */
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
 * A harvest bought off a co-operative, priced per kilogram as `produce_listings`
 * prices it. Produce is what a co-operative actually sells, and
 * `ck__marketplace_contracts__resolved_parties` accepts `produce` as a source
 * kind — so a farmer's sales history can be its harvest rather than a catalog row
 * invented to stand in for one.
 */
const harvestLine = (crop: string, kilograms: number): DemoContractLineFixture => {
  const listing = produceListingByCrop.get(crop);
  if (!listing) {
    throw new Error(`Demo contract fixture references an unknown harvest: ${crop}.`);
  }
  const publication = producePublicationByListingId.get(listing.id);
  if (!publication) {
    throw new Error(`Demo contract fixture references ${crop}, which the seed never publishes as a listing.`);
  }
  return {
    sourcePublicationId: publication.id,
    sourceKind: "produce",
    sourceId: listing.id,
    sourceRevision: 1,
    name: listing.crop,
    unit: "kg",
    unitPriceUzs: listing.pricePerKgUzs,
    quantity: kilograms,
    lineTotalUzs: listing.pricePerKgUzs * kilograms,
  };
};

const publicationById = new Map(
  [...demoMarketplaceListingPublications, ...demoMarketplaceProducePublications].map(
    (publication) => [publication.id, publication] as const,
  ),
);

const sellerByPublicId = new Map(demoMarketplacePublicSellers.map((seller) => [seller.id, seller] as const));

/**
 * The seller behind a set of lines, read off the publications they quote rather
 * than named beside them. A contract has exactly one seller, and the publication
 * already records which organization — and therefore which login — offers each
 * listing, so deriving it removes the chance of a fixture naming a party that
 * does not stock the goods and cannot be resolved.
 */
const sellerForLines = (lines: readonly DemoContractLineFixture[]): DemoContractPartyFixture => {
  const publications = lines.map((entry) => {
    const publication = publicationById.get(entry.sourcePublicationId);
    if (!publication) {
      throw new Error(`Demo contract line ${entry.name} quotes a publication the seed never wrote.`);
    }
    return publication as DemoListingPublicationFixture;
  });
  const sellerPublicIds = new Set(publications.map((publication) => publication.sellerPublicId));
  if (sellerPublicIds.size !== 1) {
    throw new Error(`Demo contract lines span ${sellerPublicIds.size} sellers; a contract has exactly one.`);
  }
  const seller = sellerByPublicId.get([...sellerPublicIds][0] as string);
  if (!seller) {
    throw new Error(`Demo contract lines name a seller profile the seed never wrote.`);
  }
  return {
    ownerEmail: seller.ownerEmail,
    partnerId: seller.partnerId,
    legalName: seller.displayName,
    region: seller.region,
  };
};

/** The buying party a login signs as, which is the organization it buys through. */
const buyerPartyFor = (email: string): DemoContractPartyFixture => {
  const organization = marketplaceBuyerOrganization(email);
  return {
    ownerEmail: email,
    partnerId: marketplaceFixtureUuid(organization.partnerKey),
    legalName: organization.legalName,
    region: organization.region,
  };
};

interface ContractSeed {
  key: string;
  /** The login that signs it as buyer; it must hold a buying organization. */
  buyer: string;
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
 * The two original demo buyers' deals, across the six months the dashboard
 * aggregates, varied in size, delivery terms and outcome so the chart has a shape
 * rather than a plateau and the status badges all appear at least once.
 *
 * A marketplace with one buyer can never show a listing more than one review:
 * `uq__marketplace_listing_reviews__buyer_tenant_id_buyer_87d1c30f` allows a
 * buyer exactly one review per product, so an average would always equal the
 * single rating behind it. The demo farmer trading as a farm alongside the
 * trading house gives the overlapping listings a genuine second opinion, and the
 * rounding of a real average something to round.
 *
 * Amounts follow the seeded catalog prices exactly, because a line total that
 * disagreed with the listing it quotes would be a number no screen could source.
 */
const demoBuyerContractSeeds: readonly ContractSeed[] = [
  {
    key: "contract:cotton-seed",
    buyer: buyerEmail,
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
    buyer: buyerEmail,
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
    buyer: buyerEmail,
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
    buyer: buyerEmail,
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
    buyer: buyerEmail,
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
    buyer: buyerEmail,
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
    buyer: buyerEmail,
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
    buyer: buyerEmail,
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
    buyer: buyerEmail,
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
    buyer: buyerEmail,
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
    buyer: buyerEmail,
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
    buyer: buyerEmail,
    lines: [line("Tipping trailer 2PTS-4, used", 1)],
    deliveryTerms: "by_agreement",
    deliveryPriceUzs: null,
    deliveryDays: null,
    deliveryNote: null,
    status: "signed",
    monthsAgo: 0,
    dayOfMonth: 12,
  },
  {
    key: "contract:farmer:urea",
    buyer: farmerEmail,
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
    buyer: farmerEmail,
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
    buyer: farmerEmail,
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
    buyer: farmerEmail,
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
    buyer: farmerEmail,
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
    buyer: farmerEmail,
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
    buyer: farmerEmail,
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
    buyer: farmerEmail,
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
    buyer: farmerEmail,
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
 * What the sixteen further logins traded.
 *
 * Each of the five farmers buys its inputs and sells its harvest, each of the
 * five wholesale buyers buys both inputs and produce, and each of the six input
 * and machinery sellers appears on the selling side of at least two deals — so no
 * profile in the roster opens on an empty history, and the six-month window is
 * populated for far more than one account. Every buying party also leaves one
 * completed purchase unrated, which is what keeps the review entry reachable in
 * the running demo rather than a state only a test can see.
 */
const rosterContractSeeds: readonly ContractSeed[] = [
  {
    key: "contract:nodira:potassium-sulphate",
    buyer: "nodira@demo.dehqonhub.uz",
    lines: [line("Potassium sulphate 50% K2O", 6)],
    deliveryTerms: "seller_delivery",
    deliveryPriceUzs: 1_400_000,
    deliveryDays: 5,
    deliveryNote: "Delivered to the vineyard store.",
    status: "completed",
    monthsAgo: 5,
    dayOfMonth: 8,
  },
  {
    key: "contract:nodira:sprinkler",
    buyer: "nodira@demo.dehqonhub.uz",
    lines: [line("Sprinkler irrigation set, 2 ha", 1)],
    deliveryTerms: "seller_delivery",
    deliveryPriceUzs: 900_000,
    deliveryDays: 7,
    deliveryNote: "Commissioning on the first plot included.",
    status: "completed",
    monthsAgo: 3,
    dayOfMonth: 14,
  },
  {
    key: "contract:bekzod:fungicide",
    buyer: "bekzod@demo.dehqonhub.uz",
    lines: [line("Systemic fungicide for orchards, 5 L", 24)],
    deliveryTerms: "pickup",
    deliveryPriceUzs: 0,
    deliveryDays: null,
    deliveryNote: "Collected from the Buxoro store.",
    status: "completed",
    monthsAgo: 4,
    dayOfMonth: 5,
  },
  {
    key: "contract:bekzod:cotton-seed",
    buyer: "bekzod@demo.dehqonhub.uz",
    lines: [line("Cotton seed “Omad” F1", 22)],
    deliveryTerms: "seller_delivery",
    deliveryPriceUzs: 700_000,
    deliveryDays: 4,
    deliveryNote: "Delivered before the sowing window.",
    status: "completed",
    monthsAgo: 5,
    dayOfMonth: 19,
  },
  {
    key: "contract:gulnora:ammonium-sulphate",
    buyer: "gulnora@demo.dehqonhub.uz",
    lines: [line("Ammonium sulphate 21% N", 10)],
    deliveryTerms: "seller_delivery",
    deliveryPriceUzs: 2_600_000,
    deliveryDays: 6,
    deliveryNote: "Ten tonnes in two runs.",
    status: "completed",
    monthsAgo: 4,
    dayOfMonth: 22,
  },
  {
    key: "contract:gulnora:manure",
    buyer: "gulnora@demo.dehqonhub.uz",
    lines: [line("Composted sheep manure, screened", 30)],
    deliveryTerms: "pickup",
    deliveryPriceUzs: 0,
    deliveryDays: null,
    deliveryNote: null,
    status: "completed",
    monthsAgo: 2,
    dayOfMonth: 4,
  },
  {
    key: "contract:gulnora:drip-tape",
    buyer: "gulnora@demo.dehqonhub.uz",
    lines: [line("Drip tape 22 mm, 0.2 m spacing, 1000 m", 12)],
    deliveryTerms: "seller_delivery",
    deliveryPriceUzs: 1_100_000,
    deliveryDays: 9,
    deliveryNote: "Twelve rolls, one drop.",
    status: "active",
    monthsAgo: 1,
    dayOfMonth: 9,
  },
  {
    key: "contract:sardor:lucerne-seed",
    buyer: "sardor@demo.dehqonhub.uz",
    lines: [line("Lucerne seed “Toshkent-3721”", 16)],
    deliveryTerms: "seller_delivery",
    deliveryPriceUzs: 800_000,
    deliveryDays: 5,
    deliveryNote: "Certificates travel with the shipment.",
    status: "completed",
    monthsAgo: 3,
    dayOfMonth: 3,
  },
  {
    key: "contract:sardor:ammonium-sulphate",
    buyer: "sardor@demo.dehqonhub.uz",
    lines: [line("Ammonium sulphate 21% N", 8)],
    deliveryTerms: "pickup",
    deliveryPriceUzs: 0,
    deliveryDays: null,
    deliveryNote: "Collected from the Jizzax plant.",
    status: "completed",
    monthsAgo: 1,
    dayOfMonth: 5,
  },
  {
    key: "contract:sardor:baler",
    buyer: "sardor@demo.dehqonhub.uz",
    lines: [line("Round baler, 1.2 m", 1)],
    deliveryTerms: "by_agreement",
    deliveryPriceUzs: null,
    deliveryDays: null,
    deliveryNote: null,
    status: "signed",
    monthsAgo: 0,
    dayOfMonth: 8,
  },
  {
    key: "contract:dilnoza:mulch-film",
    buyer: "dilnoza@demo.dehqonhub.uz",
    lines: [line("Mulch film, black, 1.2 m × 1000 m", 8)],
    deliveryTerms: "seller_delivery",
    deliveryPriceUzs: 600_000,
    deliveryDays: 6,
    deliveryNote: "Eight rolls on one pallet.",
    status: "completed",
    monthsAgo: 2,
    dayOfMonth: 17,
  },
  {
    key: "contract:dilnoza:borehole-pump",
    buyer: "dilnoza@demo.dehqonhub.uz",
    lines: [line("Submersible borehole pump, 5.5 kW", 1)],
    deliveryTerms: "seller_delivery",
    deliveryPriceUzs: 450_000,
    deliveryDays: 8,
    deliveryNote: "Control panel and cable included.",
    status: "completed",
    monthsAgo: 2,
    dayOfMonth: 27,
  },
  {
    key: "contract:kamola:seed-potato",
    buyer: "kamola@demo.dehqonhub.uz",
    lines: [line("Seed potato “Riviera”, first reproduction", 5)],
    deliveryTerms: "seller_delivery",
    deliveryPriceUzs: 1_200_000,
    deliveryDays: 6,
    deliveryNote: "Five tonnes, refrigerated transport.",
    status: "completed",
    monthsAgo: 5,
    dayOfMonth: 13,
  },
  {
    key: "contract:kamola:milling-wheat",
    buyer: "kamola@demo.dehqonhub.uz",
    lines: [harvestLine("Milling wheat, class 3", 20_000)],
    deliveryTerms: "seller_delivery",
    deliveryPriceUzs: 9_600_000,
    deliveryDays: 7,
    deliveryNote: "Twenty tonnes to the Toshkent mill.",
    status: "completed",
    monthsAgo: 4,
    dayOfMonth: 11,
  },
  {
    key: "contract:kamola:manure",
    buyer: "kamola@demo.dehqonhub.uz",
    lines: [line("Composted sheep manure, screened", 20)],
    deliveryTerms: "seller_delivery",
    deliveryPriceUzs: 3_100_000,
    deliveryDays: 10,
    deliveryNote: "Bulk delivery to the greenhouse yard.",
    status: "completed",
    monthsAgo: 3,
    dayOfMonth: 26,
  },
  {
    key: "contract:kamola:muskmelon",
    buyer: "kamola@demo.dehqonhub.uz",
    lines: [harvestLine("Muskmelon, Ichkizil", 8_000)],
    deliveryTerms: "pickup",
    deliveryPriceUzs: 0,
    deliveryDays: null,
    deliveryNote: "Collected from the co-operative's shed.",
    status: "completed",
    monthsAgo: 1,
    dayOfMonth: 16,
  },
  {
    key: "contract:farrux:tiller",
    buyer: "farrux@demo.dehqonhub.uz",
    lines: [line("Rotary tiller, 1.8 m", 1)],
    deliveryTerms: "seller_delivery",
    deliveryPriceUzs: 1_800_000,
    deliveryDays: 12,
    deliveryNote: "Delivered with the drive shaft fitted.",
    status: "completed",
    monthsAgo: 4,
    dayOfMonth: 3,
  },
  {
    key: "contract:farrux:sweet-cherry",
    buyer: "farrux@demo.dehqonhub.uz",
    lines: [harvestLine("Sweet cherry, calibre 24+", 2_000)],
    deliveryTerms: "seller_delivery",
    deliveryPriceUzs: 4_200_000,
    deliveryDays: 2,
    deliveryNote: "Refrigerated truck, crates returned after unloading.",
    status: "completed",
    monthsAgo: 5,
    dayOfMonth: 24,
  },
  {
    key: "contract:farrux:kishmish",
    buyer: "farrux@demo.dehqonhub.uz",
    lines: [harvestLine("Table grapes, Kishmish Kherson", 6_000)],
    deliveryTerms: "seller_delivery",
    deliveryPriceUzs: 5_100_000,
    deliveryDays: 3,
    deliveryNote: "Six tonnes in ventilated crates.",
    status: "completed",
    monthsAgo: 3,
    dayOfMonth: 19,
  },
  {
    key: "contract:farrux:crates",
    buyer: "farrux@demo.dehqonhub.uz",
    lines: [line("Fruit crates, 20 kg, 200 pcs", 4)],
    deliveryTerms: "pickup",
    deliveryPriceUzs: 0,
    deliveryDays: null,
    deliveryNote: null,
    status: "completed",
    monthsAgo: 2,
    dayOfMonth: 6,
  },
  {
    key: "contract:saida:sunflower-seed",
    buyer: "saida@demo.dehqonhub.uz",
    lines: [line("Sunflower seed “Zarafshon”, hybrid", 30)],
    deliveryTerms: "seller_delivery",
    deliveryPriceUzs: 1_500_000,
    deliveryDays: 6,
    deliveryNote: "Thirty bags to the Sirdaryo store.",
    status: "completed",
    monthsAgo: 5,
    dayOfMonth: 9,
  },
  {
    key: "contract:saida:feed-barley",
    buyer: "saida@demo.dehqonhub.uz",
    lines: [harvestLine("Feed barley, bulk", 40_000)],
    deliveryTerms: "pickup",
    deliveryPriceUzs: 0,
    deliveryDays: null,
    deliveryNote: "Loaded from the co-operative's floor.",
    status: "completed",
    monthsAgo: 4,
    dayOfMonth: 28,
  },
  {
    key: "contract:saida:alfalfa-hay",
    buyer: "saida@demo.dehqonhub.uz",
    lines: [harvestLine("Alfalfa hay, third cut", 25_000)],
    deliveryTerms: "seller_delivery",
    deliveryPriceUzs: 6_400_000,
    deliveryDays: 5,
    deliveryNote: "Round bales, two lorries.",
    status: "completed",
    monthsAgo: 2,
    dayOfMonth: 13,
  },
  {
    key: "contract:saida:grain-trailer",
    buyer: "saida@demo.dehqonhub.uz",
    lines: [line("Grain trailer 2PTS-6, 2021", 1)],
    deliveryTerms: "by_agreement",
    deliveryPriceUzs: null,
    deliveryDays: null,
    deliveryNote: null,
    status: "active",
    monthsAgo: 0,
    dayOfMonth: 5,
  },
  {
    key: "contract:alisher:hdpe-pipe",
    buyer: "alisher@demo.dehqonhub.uz",
    lines: [line("HDPE pipe 63 mm, PN10, 100 m", 6)],
    deliveryTerms: "by_agreement",
    deliveryPriceUzs: null,
    deliveryDays: null,
    deliveryNote: null,
    status: "cancelled",
    monthsAgo: 4,
    dayOfMonth: 17,
  },
  {
    key: "contract:alisher:walnut",
    buyer: "alisher@demo.dehqonhub.uz",
    lines: [harvestLine("Walnut, in shell, calibre 32+", 4_000)],
    deliveryTerms: "seller_delivery",
    deliveryPriceUzs: 7_800_000,
    deliveryDays: 6,
    deliveryNote: "Four tonnes in 30 kg sacks.",
    status: "completed",
    monthsAgo: 3,
    dayOfMonth: 8,
  },
  {
    key: "contract:alisher:crates",
    buyer: "alisher@demo.dehqonhub.uz",
    lines: [line("Fruit crates, 20 kg, 200 pcs", 6)],
    deliveryTerms: "pickup",
    deliveryPriceUzs: 0,
    deliveryDays: null,
    deliveryNote: null,
    status: "completed",
    monthsAgo: 1,
    dayOfMonth: 3,
  },
  {
    key: "contract:alisher:apple",
    buyer: "alisher@demo.dehqonhub.uz",
    lines: [harvestLine("Apple, Golden Delicious, calibre 70+", 15_000)],
    deliveryTerms: "seller_delivery",
    deliveryPriceUzs: 8_900_000,
    deliveryDays: 4,
    deliveryNote: "Refrigerated transport to Termiz.",
    status: "completed",
    monthsAgo: 1,
    dayOfMonth: 21,
  },
  {
    key: "contract:nigora:seed-cotton",
    buyer: "nigora@demo.dehqonhub.uz",
    lines: [harvestLine("Seed cotton, hand picked", 50_000)],
    deliveryTerms: "seller_delivery",
    deliveryPriceUzs: 12_500_000,
    deliveryDays: 9,
    deliveryNote: "Fifty tonnes to the ginning yard.",
    status: "completed",
    monthsAgo: 5,
    dayOfMonth: 7,
  },
  {
    key: "contract:nigora:sugar-beet",
    buyer: "nigora@demo.dehqonhub.uz",
    lines: [harvestLine("Sugar beet, factory grade", 80_000)],
    deliveryTerms: "pickup",
    deliveryPriceUzs: 0,
    deliveryDays: null,
    deliveryNote: "Collected from the field edge.",
    status: "completed",
    monthsAgo: 2,
    dayOfMonth: 25,
  },
  {
    key: "contract:kamola:yellow-onion",
    buyer: "kamola@demo.dehqonhub.uz",
    lines: [harvestLine("Yellow onion, 60+ mm", 12_000)],
    deliveryTerms: "seller_delivery",
    deliveryPriceUzs: 5_800_000,
    deliveryDays: 4,
    deliveryNote: "Twelve tonnes in 25 kg mesh bags.",
    status: "completed",
    monthsAgo: 3,
    dayOfMonth: 12,
  },
  {
    key: "contract:farrux:raisins",
    buyer: "farrux@demo.dehqonhub.uz",
    lines: [harvestLine("Dark raisins, sun-dried", 3_000)],
    deliveryTerms: "pickup",
    deliveryPriceUzs: 0,
    deliveryDays: null,
    deliveryNote: null,
    status: "completed",
    monthsAgo: 1,
    dayOfMonth: 11,
  },
  {
    key: "contract:nigora:milled-rice",
    buyer: "nigora@demo.dehqonhub.uz",
    lines: [harvestLine("Rice, long grain milled", 20_000)],
    deliveryTerms: "seller_delivery",
    deliveryPriceUzs: 11_400_000,
    deliveryDays: 6,
    deliveryNote: "Twenty tonnes in 50 kg sacks.",
    status: "completed",
    monthsAgo: 3,
    dayOfMonth: 5,
  },
  {
    key: "contract:nigora:calcium-nitrate",
    buyer: "nigora@demo.dehqonhub.uz",
    lines: [line("Calcium nitrate, water soluble", 4)],
    deliveryTerms: "seller_delivery",
    deliveryPriceUzs: 2_200_000,
    deliveryDays: 5,
    deliveryNote: "Four tonnes, palletised.",
    status: "completed",
    monthsAgo: 0,
    dayOfMonth: 2,
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
  return [...demoBuyerContractSeeds, ...rosterContractSeeds].map((seed) => {
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
      buyer: buyerPartyFor(seed.buyer),
      seller: sellerForLines(seed.lines),
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
