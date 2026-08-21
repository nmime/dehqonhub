import { buyerEmail, farmerEmail, marketplaceBuyerOrganization, marketplaceFixtureUuid } from "./marketplace-seed-roster.ts";
import {
  demoMarketplaceListingPublications,
  demoMarketplaceOffers,
  demoMarketplaceProduceListings,
  demoMarketplaceProducePublications,
  demoMarketplacePublicSellers,
  demoMarketplaceRequests,
  demoMarketplaceSellerCreatedPublications,
  type DemoListingPublicationFixture,
  type DemoOfferFixture,
} from "./marketplace-seed-publications.ts";
import { demoMarketplaceSellerCreatedProducts } from "./marketplace-seed-data.ts";
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
  /**
   * What the line quotes. `marketplace_contract_lines_are_frozen` admits
   * `request` beside the two catalogue kinds: an offer prices a whole purchase
   * request rather than a listing, so a deal drawn from an awarded offer quotes
   * the request and its published volume.
   */
  sourceKind: "product" | "produce" | "request";
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
  status: "draft" | "signed" | "active" | "completed" | "cancelled";
  /**
   * Where the deal came from, when the fixture can name it.
   *
   * The rows written before carts and offers were seeded leave both null, and
   * they have to stay null: `source_type` and `source_id` are inside the tuple
   * `tr__marketplace_contracts__frozen_authority` refuses to see change, so
   * attributing an existing contract to a cart afterwards would abort the seed on
   * any database that already holds it. New deals carry the cart or the offer they
   * were drawn from, which the two source uniqueness rules then hold to one
   * contract each.
   */
  sourceType: "cart_checkout" | "offer_selection" | null;
  sourceId: string | null;
  buyerSignedAt: Date | null;
  sellerSignedAt: Date | null;
  signedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const productByName = new Map(
  [...DemoProducts, ...demoMarketplaceSellerCreatedProducts].map((product) => [product.name, product] as const),
);

/**
 * The publication a line quotes, addressed by the same fixture key
 * `marketplace-seed-publications` writes it under. Looking it up rather than
 * recomputing the key keeps a line from pointing at a publication the seed
 * never wrote — a produce-shaped catalog row, for instance, publishes as a
 * produce listing and has no `listing-publication:` row at all.
 */
const publicationByProductId = new Map(
  [...demoMarketplaceListingPublications, ...demoMarketplaceSellerCreatedPublications]
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
  [
    ...demoMarketplaceListingPublications,
    ...demoMarketplaceSellerCreatedPublications,
    ...demoMarketplaceProducePublications,
  ].map(
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
 * The deals the enlarged rating corpus is built on.
 *
 * A review is not content this fixture may simply write more of. Every row in
 * `marketplace_listing_reviews` consumes an eligibility, an eligibility exists
 * only for a line of a completed contract, and
 * `uq__marketplace_listing_reviews__buyer_tenant_id_buyer_87d1c30f` allows one
 * review per buyer and product — so "more reviews" is arithmetically the same
 * request as "more completed lines between distinct buyer/product pairs". These
 * are those lines.
 *
 * Three properties are deliberate rather than incidental:
 *
 * - **Multi-line deals.** A farm ordering fertiliser and seed from one supplier
 *   in one delivery is a single contract with several lines, and the lifecycle
 *   stamps one eligibility per line. Modelling it that way gives the corpus its
 *   volume without inflating the contract ledger with one-item orders nobody
 *   places. `sellerForLines` still requires every line of a contract to be
 *   offered by the same organization, which is what a real order is.
 * - **Spread.** Every one of the twelve buying logins appears, every selling
 *   organization in the roster appears on the far side of at least one deal, and
 *   the months run across the same rolling six-month window the dashboard
 *   aggregates — so no pair carries the corpus and two profiles opened side by
 *   side do not read as copies of each other.
 * - **Not everything completes.** Three of these rows are `cancelled`, `signed`
 *   and `active`, and produce no eligibility at all. A ledger in which every
 *   negotiation settles is the one shape a real trading history never has.
 *
 * Quantities stay inside each produce listing's published availability and each
 * catalog row's listed price, because a line total the catalog cannot reproduce
 * is a number no screen could source.
 */
const expandedTradeContractSeeds: readonly ContractSeed[] = [
  // Xaridor Demo Savdo — a trading house buying inputs and implements.
  {
    key: "contract:xaridor:autumn-inputs",
    buyer: buyerEmail,
    lines: [
      line("DAP 18:46", 6),
      line("Contact insecticide for cotton bollworm, 5 L", 20),
      line("Systemic fungicide, 5 L", 15),
    ],
    deliveryTerms: "seller_delivery",
    deliveryPriceUzs: 2_800_000,
    deliveryDays: 6,
    deliveryNote: "One lorry to the Andijon depot, chemistry on separate pallets.",
    status: "completed",
    monthsAgo: 5,
    dayOfMonth: 14,
  },
  {
    key: "contract:xaridor:grain-seed",
    buyer: buyerEmail,
    lines: [line("Winter wheat “Bunyodkor”", 40), line("Maize seed, silage hybrid", 25)],
    deliveryTerms: "pickup",
    deliveryPriceUzs: 0,
    deliveryDays: null,
    deliveryNote: "Collected from the Sirdaryo terminal.",
    status: "completed",
    monthsAgo: 4,
    dayOfMonth: 12,
  },
  {
    key: "contract:xaridor:cultivator",
    buyer: buyerEmail,
    lines: [line("Mounted stubble cultivator, 2.6 m", 1), line("Trailed field sprayer, 600 L", 1)],
    deliveryTerms: "seller_delivery",
    deliveryPriceUzs: 2_400_000,
    deliveryDays: 12,
    deliveryNote: "Low loader, both implements in one run.",
    status: "completed",
    monthsAgo: 2,
    dayOfMonth: 15,
  },
  {
    key: "contract:xaridor:onion-seed",
    buyer: buyerEmail,
    lines: [line("Onion seed, yellow storage type", 30)],
    deliveryTerms: "pickup",
    deliveryPriceUzs: 0,
    deliveryDays: null,
    deliveryNote: null,
    status: "completed",
    monthsAgo: 0,
    dayOfMonth: 8,
  },
  {
    // The machine Rasulova's farm walked away from, taken on by the trading
    // house a quarter later and still awaiting the seller's signature.
    key: "contract:xaridor:centre-pivot",
    buyer: buyerEmail,
    lines: [line("Centre pivot irrigation machine, 240 m, used", 1)],
    deliveryTerms: "by_agreement",
    deliveryPriceUzs: null,
    deliveryDays: null,
    deliveryNote: null,
    status: "signed",
    monthsAgo: 0,
    dayOfMonth: 14,
  },
  // Dehqon Demo Xo'jaligi — a farm that buys its inputs and sells its harvest.
  {
    key: "contract:farmer:orchard-chemistry",
    buyer: farmerEmail,
    lines: [line("Systemic fungicide for orchards, 5 L", 10), line("Calcium nitrate, water soluble", 2)],
    deliveryTerms: "seller_delivery",
    deliveryPriceUzs: 900_000,
    deliveryDays: 5,
    deliveryNote: "Delivered to the Zangiota store.",
    status: "completed",
    monthsAgo: 5,
    dayOfMonth: 18,
  },
  {
    key: "contract:farmer:plastic",
    buyer: farmerEmail,
    lines: [line("Mulch film, black, 1.2 m × 1000 m", 10), line("Greenhouse film, 200 micron, 12 m wide", 3)],
    deliveryTerms: "seller_delivery",
    deliveryPriceUzs: 700_000,
    deliveryDays: 6,
    deliveryNote: "Thirteen rolls on two pallets.",
    status: "completed",
    monthsAgo: 3,
    dayOfMonth: 21,
  },
  {
    key: "contract:farmer:tiller",
    buyer: farmerEmail,
    lines: [line("Rotary tiller, 1.8 m", 1)],
    deliveryTerms: "seller_delivery",
    deliveryPriceUzs: 1_600_000,
    deliveryDays: 11,
    deliveryNote: "Drive shaft fitted before dispatch.",
    status: "completed",
    monthsAgo: 1,
    dayOfMonth: 14,
  },
  {
    key: "contract:farmer:melon-seed",
    buyer: farmerEmail,
    lines: [line("Watermelon seed, open field", 20), line("Carrot seed, storage type", 12)],
    deliveryTerms: "pickup",
    deliveryPriceUzs: 0,
    deliveryDays: null,
    deliveryNote: null,
    status: "completed",
    monthsAgo: 0,
    dayOfMonth: 6,
  },
  // Qodirova Fermer Xo'jaligi — Samarqand, wheat and stone fruit.
  {
    key: "contract:nodira:seed-and-feed",
    buyer: "nodira@demo.dehqonhub.uz",
    lines: [line("Sunflower seed “Zarafshon”, hybrid", 12), line("Lucerne seed “Toshkent-3721”", 10)],
    deliveryTerms: "seller_delivery",
    deliveryPriceUzs: 1_000_000,
    deliveryDays: 5,
    deliveryNote: "Certificates travel with the shipment.",
    status: "completed",
    monthsAgo: 5,
    dayOfMonth: 16,
  },
  {
    key: "contract:nodira:cereal-herbicide",
    buyer: "nodira@demo.dehqonhub.uz",
    lines: [line("Selective herbicide for cereals, 10 L", 14), line("Ammonium nitrate 34.4% N", 5)],
    deliveryTerms: "pickup",
    deliveryPriceUzs: 0,
    deliveryDays: null,
    deliveryNote: "Collected from the Buxoro warehouse.",
    status: "completed",
    monthsAgo: 4,
    dayOfMonth: 7,
  },
  {
    key: "contract:nodira:drip-tape",
    buyer: "nodira@demo.dehqonhub.uz",
    lines: [line("Drip tape 22 mm, 0.2 m spacing, 1000 m", 15)],
    deliveryTerms: "seller_delivery",
    deliveryPriceUzs: 800_000,
    deliveryDays: 8,
    deliveryNote: "Fifteen rolls, one drop at the vineyard.",
    status: "completed",
    monthsAgo: 2,
    dayOfMonth: 19,
  },
  {
    key: "contract:nodira:baler",
    buyer: "nodira@demo.dehqonhub.uz",
    lines: [line("Round baler, 1.2 m", 1)],
    deliveryTerms: "by_agreement",
    deliveryPriceUzs: null,
    deliveryDays: null,
    deliveryNote: null,
    status: "completed",
    monthsAgo: 1,
    dayOfMonth: 24,
  },
  {
    key: "contract:nodira:crates",
    buyer: "nodira@demo.dehqonhub.uz",
    lines: [line("Fruit crates, 20 kg, 200 pcs", 8)],
    deliveryTerms: "pickup",
    deliveryPriceUzs: 0,
    deliveryDays: null,
    deliveryNote: null,
    status: "completed",
    monthsAgo: 0,
    dayOfMonth: 10,
  },
  // Ergashev Fermer Xo'jaligi — Andijon, cotton and apples.
  {
    key: "contract:bekzod:cotton-chemistry",
    buyer: "bekzod@demo.dehqonhub.uz",
    lines: [line("Contact insecticide for cotton bollworm, 5 L", 18), line("Urea 46% N", 6)],
    deliveryTerms: "seller_delivery",
    deliveryPriceUzs: 1_100_000,
    deliveryDays: 5,
    deliveryNote: "Delivered to the farm gate before the second treatment.",
    status: "completed",
    monthsAgo: 5,
    dayOfMonth: 11,
  },
  {
    key: "contract:bekzod:orchard-machinery",
    buyer: "bekzod@demo.dehqonhub.uz",
    lines: [line("Disc harrow, 2.4 m", 1), line("Knapsack sprayer, 16 L", 6)],
    deliveryTerms: "seller_delivery",
    deliveryPriceUzs: 1_900_000,
    deliveryDays: 10,
    deliveryNote: "Harrow on a low loader, sprayers in the same run.",
    status: "completed",
    monthsAgo: 3,
    dayOfMonth: 9,
  },
  {
    key: "contract:bekzod:pump",
    buyer: "bekzod@demo.dehqonhub.uz",
    lines: [line("Submersible borehole pump, 5.5 kW", 1), line("HDPE pipe 63 mm, PN10, 100 m", 4)],
    deliveryTerms: "seller_delivery",
    deliveryPriceUzs: 500_000,
    deliveryDays: 7,
    deliveryNote: "Control panel, cable and pipe in one delivery.",
    status: "completed",
    monthsAgo: 2,
    dayOfMonth: 20,
  },
  {
    key: "contract:bekzod:sulphur",
    buyer: "bekzod@demo.dehqonhub.uz",
    lines: [line("Wettable sulphur for powdery mildew, 25 kg", 24)],
    deliveryTerms: "pickup",
    deliveryPriceUzs: 0,
    deliveryDays: null,
    deliveryNote: null,
    status: "completed",
    monthsAgo: 0,
    dayOfMonth: 5,
  },
  {
    key: "contract:bekzod:cotton-harvester",
    buyer: "bekzod@demo.dehqonhub.uz",
    lines: [line("Cotton harvester, self-propelled, used", 1)],
    deliveryTerms: "seller_delivery",
    deliveryPriceUzs: 8_000_000,
    deliveryDays: 20,
    deliveryNote: "Handover and commissioning at the farm.",
    status: "active",
    monthsAgo: 0,
    dayOfMonth: 12,
  },
  // Yo'ldosheva Fermer Xo'jaligi — Xorazm, beet and melons.
  {
    key: "contract:gulnora:melon-seed",
    buyer: "gulnora@demo.dehqonhub.uz",
    lines: [line("Watermelon seed, open field", 40), line("Tomato “Nurafshon”", 20)],
    deliveryTerms: "seller_delivery",
    deliveryPriceUzs: 400_000,
    deliveryDays: 6,
    deliveryNote: "Delivered before the sowing window.",
    status: "completed",
    monthsAgo: 5,
    dayOfMonth: 22,
  },
  {
    key: "contract:gulnora:beet-inputs",
    buyer: "gulnora@demo.dehqonhub.uz",
    lines: [line("Selective herbicide for cereals, 10 L", 8), line("Cotton seed “Bukhoro-102”", 12)],
    deliveryTerms: "pickup",
    deliveryPriceUzs: 0,
    deliveryDays: null,
    deliveryNote: "Collected from the Buxoro warehouse.",
    status: "completed",
    monthsAgo: 4,
    dayOfMonth: 3,
  },
  {
    key: "contract:gulnora:pivot-parts",
    buyer: "gulnora@demo.dehqonhub.uz",
    lines: [line("HDPE main pipe 110 mm, PN10, 6 m", 80), line("Disc filter station 2”, 1 ha", 3)],
    deliveryTerms: "seller_delivery",
    deliveryPriceUzs: 1_300_000,
    deliveryDays: 9,
    deliveryNote: "Eighty pipes and three filter stations, two lorries.",
    status: "completed",
    monthsAgo: 3,
    dayOfMonth: 28,
  },
  {
    key: "contract:gulnora:combine",
    buyer: "gulnora@demo.dehqonhub.uz",
    lines: [line("Grain combine harvester, 2019", 1)],
    deliveryTerms: "by_agreement",
    deliveryPriceUzs: null,
    deliveryDays: null,
    deliveryNote: null,
    status: "completed",
    monthsAgo: 0,
    dayOfMonth: 7,
  },
  // Toshmatov Fermer Xo'jaligi — Qashqadaryo, barley, lucerne and wheat.
  {
    key: "contract:sardor:fodder-seed",
    buyer: "sardor@demo.dehqonhub.uz",
    lines: [line("Fodder maize seed “Jizzax-4”", 14), line("Composted sheep manure, screened", 25)],
    deliveryTerms: "seller_delivery",
    deliveryPriceUzs: 900_000,
    deliveryDays: 6,
    deliveryNote: "Manure in bulk, seed on a pallet.",
    status: "completed",
    monthsAgo: 5,
    dayOfMonth: 5,
  },
  {
    key: "contract:sardor:barley-inputs",
    buyer: "sardor@demo.dehqonhub.uz",
    lines: [line("Winter wheat “Bunyodkor”", 30), line("Rice seed, first reproduction", 10)],
    deliveryTerms: "pickup",
    deliveryPriceUzs: 0,
    deliveryDays: null,
    deliveryNote: "Collected from the Sirdaryo terminal.",
    status: "completed",
    monthsAgo: 4,
    dayOfMonth: 19,
  },
  {
    key: "contract:sardor:hay-machinery",
    buyer: "sardor@demo.dehqonhub.uz",
    lines: [line("Round hay baler, trailed", 1), line("Tipping trailer 2PTS-4, used", 1)],
    deliveryTerms: "seller_delivery",
    deliveryPriceUzs: 2_300_000,
    deliveryDays: 14,
    deliveryNote: "Baler and trailer on one low loader.",
    status: "completed",
    monthsAgo: 3,
    dayOfMonth: 24,
  },
  {
    key: "contract:sardor:sprayer",
    buyer: "sardor@demo.dehqonhub.uz",
    lines: [line("Trailed field sprayer, 600 L", 1)],
    deliveryTerms: "seller_delivery",
    deliveryPriceUzs: 1_200_000,
    deliveryDays: 10,
    deliveryNote: "Assembled and tested on delivery.",
    status: "completed",
    monthsAgo: 1,
    dayOfMonth: 27,
  },
  // Rasulova Fermer Xo'jaligi — Namangan, grapes, walnuts and a greenhouse.
  {
    key: "contract:dilnoza:orchard-chemistry",
    buyer: "dilnoza@demo.dehqonhub.uz",
    lines: [line("Systemic fungicide for orchards, 5 L", 8), line("Potassium sulphate 50% K2O", 3)],
    deliveryTerms: "pickup",
    deliveryPriceUzs: 0,
    deliveryDays: null,
    deliveryNote: "Collected from the Buxoro store.",
    status: "completed",
    monthsAgo: 5,
    dayOfMonth: 20,
  },
  {
    key: "contract:dilnoza:greenhouse",
    buyer: "dilnoza@demo.dehqonhub.uz",
    lines: [
      line("Greenhouse film, 150 micron, 8 m wide", 6),
      line("Seedling trays, 105 cells, 100 pcs", 10),
      line("Sweet pepper seed, greenhouse", 5),
    ],
    deliveryTerms: "seller_delivery",
    deliveryPriceUzs: 600_000,
    deliveryDays: 5,
    deliveryNote: "One drop before the greenhouse was re-skinned.",
    status: "completed",
    monthsAgo: 4,
    dayOfMonth: 15,
  },
  {
    key: "contract:dilnoza:power-tiller",
    buyer: "dilnoza@demo.dehqonhub.uz",
    lines: [line("Walk-behind power tiller, 7 hp petrol", 1)],
    deliveryTerms: "seller_delivery",
    deliveryPriceUzs: 700_000,
    deliveryDays: 8,
    deliveryNote: null,
    status: "completed",
    monthsAgo: 3,
    dayOfMonth: 11,
  },
  {
    // Walked away from before either party signed; the same machine is taken on
    // by the trading house in `contract:xaridor:centre-pivot`.
    key: "contract:dilnoza:centre-pivot",
    buyer: "dilnoza@demo.dehqonhub.uz",
    lines: [line("Centre pivot irrigation machine, 240 m, used", 1)],
    deliveryTerms: "by_agreement",
    deliveryPriceUzs: null,
    deliveryDays: null,
    deliveryNote: null,
    status: "cancelled",
    monthsAgo: 2,
    dayOfMonth: 5,
  },
  {
    key: "contract:dilnoza:crates",
    buyer: "dilnoza@demo.dehqonhub.uz",
    lines: [line("Fruit crates, 20 kg, 200 pcs", 5)],
    deliveryTerms: "pickup",
    deliveryPriceUzs: 0,
    deliveryDays: null,
    deliveryNote: null,
    status: "completed",
    monthsAgo: 1,
    dayOfMonth: 19,
  },
  // Toshkent Oziq-ovqat Savdo — a food wholesaler buying harvests.
  {
    key: "contract:kamola:apricot",
    buyer: "kamola@demo.dehqonhub.uz",
    lines: [harvestLine("Fresh apricot, table grade", 6_000), harvestLine("Persimmon, chocolate type", 4_000)],
    deliveryTerms: "seller_delivery",
    deliveryPriceUzs: 3_600_000,
    deliveryDays: 3,
    deliveryNote: "Refrigerated truck, crates returned on the next run.",
    status: "completed",
    monthsAgo: 5,
    dayOfMonth: 17,
  },
  {
    key: "contract:kamola:greenhouse-tomato",
    buyer: "kamola@demo.dehqonhub.uz",
    lines: [harvestLine("Greenhouse tomato, table grade", 3_000), harvestLine("Garlic, dry, calibre 50+", 2_000)],
    deliveryTerms: "seller_delivery",
    deliveryPriceUzs: 2_800_000,
    deliveryDays: 2,
    deliveryNote: "Two pallets, delivered overnight.",
    status: "completed",
    monthsAgo: 3,
    dayOfMonth: 9,
  },
  {
    key: "contract:kamola:table-grapes",
    buyer: "kamola@demo.dehqonhub.uz",
    lines: [
      harvestLine("Table grapes, Husayni grade 1", 4_000),
      harvestLine("Pomegranate, calibre 250+", 3_000),
      harvestLine("Carrot, storage grade", 10_000),
    ],
    deliveryTerms: "pickup",
    deliveryPriceUzs: 0,
    deliveryDays: null,
    deliveryNote: "Collected from the co-operative's shed over two days.",
    status: "completed",
    monthsAgo: 2,
    dayOfMonth: 21,
  },
  {
    key: "contract:kamola:cherry",
    buyer: "kamola@demo.dehqonhub.uz",
    lines: [harvestLine("Sweet cherry, calibre 24+", 1_000)],
    deliveryTerms: "seller_delivery",
    deliveryPriceUzs: 2_100_000,
    deliveryDays: 2,
    deliveryNote: "Refrigerated transport to the Toshkent depot.",
    status: "completed",
    monthsAgo: 0,
    dayOfMonth: 9,
  },
  // Samarqand Ulgurji Savdo — a wholesaler buying fruit, dried fruit and crates.
  {
    key: "contract:farrux:dried-fruit",
    buyer: "farrux@demo.dehqonhub.uz",
    lines: [harvestLine("Dried apricot, export grade", 2_500), harvestLine("Mung bean, food grade", 1_500)],
    deliveryTerms: "seller_delivery",
    deliveryPriceUzs: 4_800_000,
    deliveryDays: 4,
    deliveryNote: "Sacks palletised and shrink-wrapped.",
    status: "completed",
    monthsAgo: 5,
    dayOfMonth: 12,
  },
  {
    key: "contract:farrux:melon",
    buyer: "farrux@demo.dehqonhub.uz",
    lines: [harvestLine("Melon, Gurvak", 9_000), harvestLine("Ware potato, Riviera", 12_000)],
    deliveryTerms: "pickup",
    deliveryPriceUzs: 0,
    deliveryDays: null,
    deliveryNote: "Loaded from the field edge.",
    status: "completed",
    monthsAgo: 4,
    dayOfMonth: 21,
  },
  {
    key: "contract:farrux:watermelon",
    buyer: "farrux@demo.dehqonhub.uz",
    lines: [harvestLine("Watermelon, field grade", 20_000)],
    deliveryTerms: "seller_delivery",
    deliveryPriceUzs: 3_200_000,
    deliveryDays: 3,
    deliveryNote: "Twenty tonnes in two lorries.",
    status: "completed",
    monthsAgo: 2,
    dayOfMonth: 10,
  },
  {
    key: "contract:farrux:apple",
    buyer: "farrux@demo.dehqonhub.uz",
    lines: [harvestLine("Apple, Golden Delicious, calibre 70+", 10_000)],
    deliveryTerms: "seller_delivery",
    deliveryPriceUzs: 2_600_000,
    deliveryDays: 3,
    deliveryNote: "Refrigerated transport, crates returned.",
    status: "completed",
    monthsAgo: 1,
    dayOfMonth: 5,
  },
  {
    key: "contract:farrux:walnut",
    buyer: "farrux@demo.dehqonhub.uz",
    lines: [harvestLine("Walnut, in shell, calibre 32+", 1_200)],
    deliveryTerms: "pickup",
    deliveryPriceUzs: 0,
    deliveryDays: null,
    deliveryNote: null,
    status: "completed",
    monthsAgo: 0,
    dayOfMonth: 4,
  },
  // Sirdaryo Don Xarid — a grain and feed buyer.
  {
    key: "contract:saida:maize-grain",
    buyer: "saida@demo.dehqonhub.uz",
    lines: [harvestLine("Maize grain, feed quality", 35_000), harvestLine("Alfalfa hay, second cut", 20_000)],
    deliveryTerms: "seller_delivery",
    deliveryPriceUzs: 5_200_000,
    deliveryDays: 5,
    deliveryNote: "Grain in bulk, hay in round bales.",
    status: "completed",
    monthsAgo: 5,
    dayOfMonth: 20,
  },
  {
    key: "contract:saida:milled-rice",
    buyer: "saida@demo.dehqonhub.uz",
    lines: [harvestLine("Rice, long grain milled", 15_000)],
    deliveryTerms: "pickup",
    deliveryPriceUzs: 0,
    deliveryDays: null,
    deliveryNote: "Loaded from the co-operative's floor.",
    status: "completed",
    monthsAgo: 3,
    dayOfMonth: 7,
  },
  {
    key: "contract:saida:cottonseed-cake",
    buyer: "saida@demo.dehqonhub.uz",
    lines: [harvestLine("Cottonseed cake, 38% protein", 30_000)],
    deliveryTerms: "seller_delivery",
    deliveryPriceUzs: 4_100_000,
    deliveryDays: 6,
    deliveryNote: "Thirty tonnes in 50 kg sacks.",
    status: "completed",
    monthsAgo: 2,
    dayOfMonth: 26,
  },
  {
    key: "contract:saida:milling-wheat",
    buyer: "saida@demo.dehqonhub.uz",
    lines: [harvestLine("Milling wheat, class 3", 30_000)],
    deliveryTerms: "seller_delivery",
    deliveryPriceUzs: 6_800_000,
    deliveryDays: 7,
    deliveryNote: "Thirty tonnes to the Sirdaryo elevator.",
    status: "completed",
    monthsAgo: 1,
    dayOfMonth: 13,
  },
  {
    key: "contract:saida:feed-mix",
    buyer: "saida@demo.dehqonhub.uz",
    lines: [line("Fodder maize seed “Jizzax-4”", 10), line("Ammonium sulphate 21% N", 4)],
    deliveryTerms: "pickup",
    deliveryPriceUzs: 0,
    deliveryDays: null,
    deliveryNote: "Collected from the Jizzax plant.",
    status: "completed",
    monthsAgo: 0,
    dayOfMonth: 6,
  },
  // Surxon Eksport Savdo — an exporter buying fruit and dried fruit.
  {
    key: "contract:alisher:pomegranate",
    buyer: "alisher@demo.dehqonhub.uz",
    lines: [harvestLine("Pomegranate, calibre 250+", 8_000), harvestLine("Dried apricot, export grade", 1_800)],
    deliveryTerms: "seller_delivery",
    deliveryPriceUzs: 5_600_000,
    deliveryDays: 5,
    deliveryNote: "Export packing, phytosanitary papers with the load.",
    status: "completed",
    monthsAgo: 5,
    dayOfMonth: 26,
  },
  {
    key: "contract:alisher:persimmon",
    buyer: "alisher@demo.dehqonhub.uz",
    lines: [harvestLine("Persimmon, chocolate type", 4_500), harvestLine("Garlic, dry, calibre 50+", 3_000)],
    deliveryTerms: "seller_delivery",
    deliveryPriceUzs: 3_400_000,
    deliveryDays: 4,
    deliveryNote: "Refrigerated transport to Termiz.",
    status: "completed",
    monthsAgo: 4,
    dayOfMonth: 13,
  },
  {
    key: "contract:alisher:kishmish",
    buyer: "alisher@demo.dehqonhub.uz",
    lines: [harvestLine("Table grapes, Kishmish Kherson", 5_000)],
    deliveryTerms: "pickup",
    deliveryPriceUzs: 0,
    deliveryDays: null,
    deliveryNote: "Collected in ventilated crates.",
    status: "completed",
    monthsAgo: 2,
    dayOfMonth: 8,
  },
  {
    key: "contract:alisher:cherry",
    buyer: "alisher@demo.dehqonhub.uz",
    lines: [harvestLine("Sweet cherry, calibre 24+", 1_800)],
    deliveryTerms: "seller_delivery",
    deliveryPriceUzs: 3_900_000,
    deliveryDays: 2,
    deliveryNote: "Air-freight packing, delivered to the Samarqand terminal.",
    status: "completed",
    monthsAgo: 1,
    dayOfMonth: 7,
  },
  {
    key: "contract:alisher:melon",
    buyer: "alisher@demo.dehqonhub.uz",
    lines: [harvestLine("Melon, Gurvak", 15_000)],
    deliveryTerms: "pickup",
    deliveryPriceUzs: 0,
    deliveryDays: null,
    deliveryNote: null,
    status: "completed",
    monthsAgo: 0,
    dayOfMonth: 3,
  },
  // Farg'ona Qayta Ishlash — a processor buying raw crops and chemistry.
  {
    key: "contract:nigora:barley",
    buyer: "nigora@demo.dehqonhub.uz",
    lines: [harvestLine("Feed barley, bulk", 45_000), harvestLine("Alfalfa hay, third cut", 15_000)],
    deliveryTerms: "seller_delivery",
    deliveryPriceUzs: 4_500_000,
    deliveryDays: 6,
    deliveryNote: "Barley in bulk, hay in round bales.",
    status: "completed",
    monthsAgo: 5,
    dayOfMonth: 15,
  },
  {
    key: "contract:nigora:muskmelon",
    buyer: "nigora@demo.dehqonhub.uz",
    lines: [harvestLine("Muskmelon, Ichkizil", 6_000)],
    deliveryTerms: "pickup",
    deliveryPriceUzs: 0,
    deliveryDays: null,
    deliveryNote: "Collected from the field edge.",
    status: "completed",
    monthsAgo: 4,
    dayOfMonth: 26,
  },
  {
    key: "contract:nigora:carrot",
    buyer: "nigora@demo.dehqonhub.uz",
    lines: [harvestLine("Carrot, storage grade", 18_000), harvestLine("Mung bean, food grade", 2_000)],
    deliveryTerms: "seller_delivery",
    deliveryPriceUzs: 2_900_000,
    deliveryDays: 4,
    deliveryNote: "Mesh bags on pallets.",
    status: "completed",
    monthsAgo: 3,
    dayOfMonth: 12,
  },
  {
    key: "contract:nigora:apple",
    buyer: "nigora@demo.dehqonhub.uz",
    lines: [harvestLine("Apple, Golden Delicious, calibre 70+", 12_000)],
    deliveryTerms: "seller_delivery",
    deliveryPriceUzs: 6_200_000,
    deliveryDays: 8,
    deliveryNote: "Twelve tonnes for the juice line.",
    status: "completed",
    monthsAgo: 2,
    dayOfMonth: 17,
  },
  {
    key: "contract:nigora:chemistry",
    buyer: "nigora@demo.dehqonhub.uz",
    lines: [line("Potassium sulphate 50% K2O", 4), line("Systemic fungicide for orchards, 5 L", 6)],
    deliveryTerms: "seller_delivery",
    deliveryPriceUzs: 1_500_000,
    deliveryDays: 5,
    deliveryNote: "Palletised, delivered to the Farg'ona plant.",
    status: "completed",
    monthsAgo: 1,
    dayOfMonth: 9,
  },
  {
    key: "contract:nigora:tomato",
    buyer: "nigora@demo.dehqonhub.uz",
    lines: [harvestLine("Greenhouse tomato, table grade", 2_500)],
    deliveryTerms: "pickup",
    deliveryPriceUzs: 0,
    deliveryDays: null,
    deliveryNote: null,
    status: "completed",
    monthsAgo: 0,
    dayOfMonth: 11,
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

interface ContractSource {
  sourceType: DemoContractFixture["sourceType"];
  sourceId: DemoContractFixture["sourceId"];
  /** Overrides the seller derived from the lines, for a request-priced deal. */
  seller?: DemoContractPartyFixture;
}

function toContract(seed: ContractSeed, now: Date, source: ContractSource): DemoContractFixture {
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
      seller: source.seller ?? sellerForLines(seed.lines),
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
      sourceType: source.sourceType,
      sourceId: source.sourceId,
    };
}

/**
 * Every contract the seed writes.
 *
 * The three original groups carry no provenance and never will; the cart and
 * offer groups do, which is what lets a reviewer open a deal and reach the cart
 * or the tender it came out of.
 */
export function demoMarketplaceContracts(now: Date): readonly DemoContractFixture[] {
  const carts = new Map(demoMarketplaceCarts(now).map((cart) => [cart.id, cart] as const));
  return [
    ...[...demoBuyerContractSeeds, ...rosterContractSeeds, ...expandedTradeContractSeeds].map((seed) =>
      toContract(seed, now, { sourceId: null, sourceType: null }),
    ),
    ...cartCheckoutSeeds.map((seed) => {
      const cartId = marketplaceFixtureUuid(seed.cartKey);
      if (!carts.has(cartId)) {
        throw new Error(`Demo contract ${seed.key} names the cart ${seed.cartKey}, which the seed never writes.`);
      }
      return toContract(seed, now, { sourceId: cartId, sourceType: "cart_checkout" });
    }),
    ...offerSelectionSeeds.map((seed) => {
      const offer = offerByKey(seed.offerKey);
      const lines = [offerLine(offer)];
      return toContract(
        {
          buyer: offer.buyerEmail,
          dayOfMonth: seed.dayOfMonth,
          deliveryDays: offer.deliveryDays,
          deliveryNote: offer.deliveryNote || null,
          deliveryPriceUzs: offer.deliveryPriceUzs,
          deliveryTerms: offer.deliveryTerms,
          key: seed.key,
          lines,
          monthsAgo: seed.monthsAgo,
          status: seed.status,
        },
        now,
        { seller: offerSeller(offer), sourceId: offer.id, sourceType: "offer_selection" },
      );
    }),
  ];
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

/* ------------------------------------------------------------------------- *
 * Carts, and the deals that came out of them
 * ------------------------------------------------------------------------- */

/**
 * The carts a reviewer finds waiting, and the provenance of the deals below.
 *
 * A cart is not a scratch pad in this marketplace: it is keyed by the buyer, the
 * buying organization and the selling organization, so a buyer shopping from
 * three sellers holds three separate carts and switches between them. Nothing in
 * the fixture demonstrated that. A fresh install had no cart at all, which meant
 * the one feature the switcher exists for could not be seen without a reviewer
 * building two carts by hand first — and the checkout that turns a cart into a
 * contract had nothing to act on.
 *
 * So the fixture now carries both halves. Three carts are `open`, two of them
 * for the same buying account from two different sellers, which is exactly the
 * shape the switcher is for; they hold published, in-stock listings and no
 * contract points at them, so a reviewer can carry either one through checkout
 * into a real contract. Nine more are `ordered`: those are the carts the
 * cart-checkout contracts below were drawn from, which is why those contracts can
 * name a `cart_checkout` provenance the database will corroborate instead of
 * carrying a null source.
 *
 * `uq__marketplace_carts__tenant_id_user_id_buyer_partner...` allows one open
 * cart per buyer and seller pair, so the open three name three different sellers
 * between them; an `ordered` cart is outside that index, which is what lets a
 * buyer shop from the same seller again after checking out.
 */
export interface DemoCartFixture {
  id: string;
  buyer: DemoContractPartyFixture;
  seller: DemoContractPartyFixture;
  status: "open" | "ordered";
  /**
   * The quote the cart holds. It is the contract line shape on purpose: a
   * checkout freezes the cart's own numbers into the contract, so a fixture that
   * stated them twice could state them differently, and
   * `ck__marketplace_contracts__resolved_parties` would reject the result with a
   * bare constraint name.
   */
  lines: readonly DemoContractLineFixture[];
  createdAt: Date;
}

interface CartSeed {
  key: string;
  buyer: string;
  lines: readonly DemoContractLineFixture[];
}

/**
 * Carts nobody has checked out. Each names a seller no other open cart of the
 * same buyer names, and the first two belong to one account so the cart switcher
 * has two carts to switch between on arrival.
 */
const openCartSeeds: readonly CartSeed[] = [
  {
    key: "cart:open:buyer:mist-blower",
    buyer: buyerEmail,
    lines: [line("Self-propelled greenhouse mist blower, 200 L", 1)],
  },
  {
    key: "cart:open:buyer:urea",
    buyer: buyerEmail,
    lines: [line("Urea 46% N", 2)],
  },
  {
    key: "cart:open:farmer:sprayers",
    buyer: farmerEmail,
    lines: [line("Knapsack sprayer, 16 L", 3)],
  },
];

/**
 * A deal and the cart it was checked out from, declared once.
 *
 * `source_type`/`source_id` on a contract is the claim "this came from that
 * cart", and `uq__marketplace_contracts__source_type_source_id` holds the cart
 * to one contract. Deriving both rows from one seed is what keeps the claim
 * true: the cart's quote and the contract's frozen lines cannot drift, and no
 * contract can point at a cart the seed never wrote.
 */
interface CartCheckoutSeed extends ContractSeed {
  cartKey: string;
}

const cartCheckoutSeeds: readonly CartCheckoutSeed[] = [
  {
    key: "contract:cart:trailer",
    cartKey: "cart:ordered:buyer:trailer",
    buyer: buyerEmail,
    lines: [line("Tipping trailer 2PTS-4, used", 1)],
    deliveryTerms: "pickup",
    deliveryPriceUzs: 0,
    deliveryDays: null,
    deliveryNote: "Collected from the Jizzax yard.",
    status: "draft",
    monthsAgo: 0,
    dayOfMonth: 2,
  },
  {
    key: "contract:cart:ammophos-three",
    cartKey: "cart:ordered:buyer:ammophos",
    buyer: buyerEmail,
    lines: [line("Ammophos 12:52", 3)],
    deliveryTerms: "pickup",
    deliveryPriceUzs: 0,
    deliveryDays: null,
    deliveryNote: null,
    status: "draft",
    monthsAgo: 0,
    dayOfMonth: 3,
  },
  {
    key: "contract:cart:pump-and-drip",
    cartKey: "cart:ordered:buyer:pump-and-drip",
    buyer: buyerEmail,
    lines: [line("Diesel water pump 4”", 1), line("Drip irrigation kit, 1 ha", 2)],
    deliveryTerms: "by_agreement",
    deliveryPriceUzs: null,
    deliveryDays: null,
    deliveryNote: null,
    status: "draft",
    monthsAgo: 0,
    dayOfMonth: 4,
  },
  {
    key: "contract:cart:seed-potato",
    cartKey: "cart:ordered:buyer:seed-potato",
    buyer: buyerEmail,
    lines: [line("Seed potato “Riviera”, first reproduction", 2)],
    deliveryTerms: "pickup",
    deliveryPriceUzs: 0,
    deliveryDays: null,
    deliveryNote: null,
    status: "draft",
    monthsAgo: 0,
    dayOfMonth: 5,
  },
  {
    key: "contract:cart:rice-seed",
    cartKey: "cart:ordered:buyer:rice-seed",
    buyer: buyerEmail,
    lines: [line("Rice seed, first reproduction", 3)],
    deliveryTerms: "seller_delivery",
    deliveryPriceUzs: 180_000,
    deliveryDays: 4,
    deliveryNote: "Three bags with the next scheduled run.",
    status: "draft",
    monthsAgo: 0,
    dayOfMonth: 6,
  },
  {
    key: "contract:cart:ammophos-two",
    cartKey: "cart:ordered:farmer:ammophos",
    buyer: farmerEmail,
    lines: [line("Ammophos 12:52", 2)],
    deliveryTerms: "pickup",
    deliveryPriceUzs: 0,
    deliveryDays: null,
    deliveryNote: "Collected by the farm's own truck.",
    status: "draft",
    monthsAgo: 0,
    dayOfMonth: 7,
  },
  // Both parties have signed these two, so they are live deals rather than
  // drafts, and the settlement and fulfilment rows in
  // `marketplace-seed-lifecycle` hang off them.
  {
    key: "contract:cart:greenhouse-film",
    cartKey: "cart:ordered:farmer:greenhouse-film",
    buyer: farmerEmail,
    lines: [line("Greenhouse film, 150 micron, 8 m wide", 4)],
    deliveryTerms: "pickup",
    deliveryPriceUzs: 0,
    deliveryDays: null,
    deliveryNote: "Collected from the Namangan store.",
    status: "active",
    monthsAgo: 0,
    dayOfMonth: 8,
  },
  {
    key: "contract:cart:sprinkler",
    cartKey: "cart:ordered:farmer:sprinkler",
    buyer: farmerEmail,
    lines: [line("Sprinkler irrigation set, 2 ha", 1)],
    deliveryTerms: "by_agreement",
    deliveryPriceUzs: null,
    deliveryDays: null,
    deliveryNote: null,
    status: "active",
    monthsAgo: 0,
    dayOfMonth: 9,
  },
  {
    // Closed and deliberately unrated: the review entry has to be reachable as
    // this login too, and `marketplace-seed-reviews` asserts that every buying
    // account keeps one unconsumed eligibility.
    key: "contract:cart:mulch-film",
    cartKey: "cart:ordered:buyer:mulch-film",
    buyer: buyerEmail,
    lines: [line("Mulch film, black, 1.2 m × 1000 m", 5)],
    deliveryTerms: "seller_delivery",
    deliveryPriceUzs: 260_000,
    deliveryDays: 5,
    deliveryNote: "Five rolls on one pallet.",
    status: "completed",
    monthsAgo: 0,
    dayOfMonth: 14,
  },
  // Carried the whole way on the development stand: agreement, both signatures,
  // buyer payment, seller receipt, delivery and completion. It is also the deal
  // behind the review that carries photographs.
  {
    key: "contract:cart:raisins",
    cartKey: "cart:ordered:buyer:raisins",
    buyer: buyerEmail,
    lines: [harvestLine("Dark raisins, sun-dried", 10)],
    deliveryTerms: "seller_delivery",
    deliveryPriceUzs: 150_000,
    deliveryDays: 3,
    deliveryNote: "Ten kilograms with the weekly Samarqand run.",
    status: "completed",
    monthsAgo: 0,
    dayOfMonth: 10,
  },
];

/**
 * A deal drawn from an offer the buyer awarded.
 *
 * `assert_marketplace_single_offer_selection_contract` allows one contract that
 * is not cancelled per awarded request, so each request here contributes exactly
 * one live draft plus however many cancelled attempts preceded it. That is not a
 * fixture convenience: it is what the sequence "award, cancel, award again"
 * leaves in the table, and the three cancelled grape contracts are the record of
 * a buyer changing supplier twice before settling.
 *
 * The line is `request`-kind, which `marketplace_contract_lines_are_frozen`
 * admits alongside `product` and `produce`: an offer prices the whole request
 * rather than a catalogue row, so the quote names the request and its published
 * volume instead of inventing a per-unit price no listing carries.
 */
interface OfferSelectionSeed {
  key: string;
  /** The offer this contract was drawn from, awarded or since declined. */
  offerKey: string;
  status: DemoContractFixture["status"];
  monthsAgo: number;
  dayOfMonth: number;
}

const offerSelectionSeeds: readonly OfferSelectionSeed[] = [
  { key: "contract:offer:grapes", offerKey: "offer:grapes:orchard", status: "draft", monthsAgo: 0, dayOfMonth: 11 },
  {
    key: "contract:offer:wheat-seed",
    offerKey: "offer:wheat-seed:andijon",
    status: "draft",
    monthsAgo: 0,
    dayOfMonth: 12,
  },
  { key: "contract:offer:onion", offerKey: "offer:onion:xorazm-poliz", status: "draft", monthsAgo: 0, dayOfMonth: 13 },
  {
    key: "contract:offer:grapes:surxon",
    offerKey: "offer:grapes:surxon",
    status: "cancelled",
    monthsAgo: 0,
    dayOfMonth: 1,
  },
  {
    key: "contract:offer:grapes:namangan",
    offerKey: "offer:grapes:namangan",
    status: "cancelled",
    monthsAgo: 0,
    dayOfMonth: 1,
  },
  {
    key: "contract:offer:grapes:andijon-bog",
    offerKey: "offer:grapes:andijon-bog",
    status: "cancelled",
    monthsAgo: 0,
    dayOfMonth: 1,
  },
];

const offerById = new Map(demoMarketplaceOffers.map((offer) => [offer.id, offer] as const));

const offerByKey = (key: string): DemoOfferFixture => {
  const offer = offerById.get(marketplaceFixtureUuid(key));
  if (!offer) {
    throw new Error(`Demo contract fixture is drawn from the offer ${key}, which the seed never writes.`);
  }
  return offer;
};

const requestById = new Map(demoMarketplaceRequests.map((request) => [request.id, request] as const));

/**
 * The frozen quote an awarded offer becomes: the request as published, priced at
 * the offer the buyer chose.
 */
const offerLine = (offer: DemoOfferFixture): DemoContractLineFixture => {
  const request = requestById.get(offer.requestId);
  if (!request) {
    throw new Error(`Demo offer ${offer.id} answers a request the seed never writes.`);
  }
  return {
    lineTotalUzs: offer.priceUzs,
    name: request.title,
    quantity: 1,
    sourceId: request.id,
    sourceKind: "request",
    sourcePublicationId: request.publicationId,
    sourceRevision: 1,
    unit: request.volume,
    unitPriceUzs: offer.priceUzs,
  };
};

/** The selling party behind an offer, which is the organization it was made through. */
const offerSeller = (offer: DemoOfferFixture): DemoContractPartyFixture => {
  const seller = demoMarketplacePublicSellers.find(
    (candidate) => candidate.partnerId === marketplaceFixtureUuid(`partner:supplier:${offer.sellerSupplierSlug}`),
  );
  if (!seller) {
    throw new Error(`Demo offer ${offer.id} is made through an organization with no seller profile.`);
  }
  return {
    legalName: seller.displayName,
    ownerEmail: seller.ownerEmail,
    partnerId: seller.partnerId,
    region: seller.region,
  };
};

/**
 * Every cart the seed writes: the three nobody has checked out, and the nine each
 * cart-checkout deal was drawn from.
 */
export function demoMarketplaceCarts(now: Date): readonly DemoCartFixture[] {
  return [
    ...openCartSeeds.map((seed) => ({
      buyer: buyerPartyFor(seed.buyer),
      createdAt: contractDate(now, 0, 1),
      id: marketplaceFixtureUuid(seed.key),
      lines: seed.lines,
      seller: sellerForLines(seed.lines),
      status: "open" as const,
    })),
    ...cartCheckoutSeeds.map((seed) => ({
      buyer: buyerPartyFor(seed.buyer),
      // A cart precedes the contract it produced, and the contract's own draft
      // date is six days before it settled.
      createdAt: new Date(contractDate(now, seed.monthsAgo, seed.dayOfMonth).getTime() - 7 * 24 * 60 * 60 * 1000),
      id: marketplaceFixtureUuid(seed.cartKey),
      lines: seed.lines,
      seller: sellerForLines(seed.lines),
      status: "ordered" as const,
    })),
  ];
}
