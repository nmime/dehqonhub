import { demoMarketplaceProducts } from "./marketplace-seed-data.ts";
import { demoMarketplaceContracts } from "./marketplace-seed-contracts.ts";
import {
  demoMarketplaceListingPublications,
  demoMarketplaceProduceListings,
  demoMarketplaceSellerCreatedPublications,
  type DemoListingPublicationFixture,
} from "./marketplace-seed-publications.ts";
import { demoMarketplaceReviews } from "./marketplace-seed-reviews.ts";
import { buyerEmail, farmerEmail, marketplaceBuyerOrganization, marketplaceFixtureUuid } from "./marketplace-seed-roster.ts";

/**
 * The three surfaces around a deal that a contract does not fill: sample
 * requests, reported reviews, and the older AgriTech order book.
 *
 * Each was empty on a fresh install and each has a real reader. A seller's
 * sample queue and a buyer's monthly quota are read by
 * `/marketplace/samples`; a reported review is what the moderation queue works
 * through; and the admin app's AgriTech page lists `orders` beside partners and
 * farmers (`apps/frontend/admin/src/pages/agritech/agritech-page.tsx:35`), so
 * with no orders one of its four panels was blank on every install.
 *
 * ## Why samples are product samples
 *
 * `assert_marketplace_listing_sample_coherence` admits a produce sample only
 * while the harvest's `available_from`/`available_until` window covers *now*.
 * A fixture harvest's window is a fixed pair of dates, so a produce sample would
 * seed today and abort the whole seed transaction next spring. A catalogue row
 * has stock and a sample flag and no window, so it is the shape that keeps
 * seeding.
 *
 * ## Why the sample policy travels even though it is created on demand
 *
 * `resolveActiveSamplePolicy` inserts a default policy the first time anybody
 * requests a sample, so a fresh install does not need one. A seeded sample does:
 * the coherence trigger joins the sample to an active policy of the same version
 * and monthly limit. Seeding it under a fixture id also means the seed does not
 * race that lazy insert.
 */

/** The default the repository would have written, mirrored so the join matches. */
export const demoSamplePolicy = {
  id: marketplaceFixtureUuid("sample-policy:default"),
  monthlyLimit: 5,
  version: 1,
} as const;

export interface DemoSampleRequestFixture {
  id: string;
  listingPublicationId: string;
  productId: string;
  requesterEmail: string;
  requesterPartnerId: string;
  sellerOwnerEmail: string;
  sellerPartnerId: string;
  deliveryMethod: "pickup" | "seller_delivery";
  policyId: string;
  policyVersion: number;
  monthlyLimit: number;
  createdAt: Date;
}

export interface DemoReviewReportFixture {
  id: string;
  reviewId: string;
  reporterEmail: string;
  reason: "spam" | "abuse" | "privacy" | "off_topic";
  comment: string;
  reviewSnapshot: Record<string, unknown>;
  createdAt: Date;
}

export interface DemoOrderFixture {
  id: string;
  buyerEmail: string;
  buyerPartnerId: string;
  farmerId: string;
  produceListingId: string;
  status: "pending" | "confirmed" | "shipped" | "delivered" | "cancelled";
  crop: string;
  quantityKg: number;
  unitPriceUzs: number;
  totalAmountUzs: number;
  deliveryAddress: string;
  region: string;
  notes: string;
  createdAt: Date;
}

const publications = [...demoMarketplaceListingPublications, ...demoMarketplaceSellerCreatedPublications];
const productsById = new Map(demoMarketplaceProducts.map((product) => [product.id, product] as const));

const buyerPartnerIdFor = (email: string): string =>
  marketplaceFixtureUuid(marketplaceBuyerOrganization(email).partnerKey);

/**
 * A published catalogue row that answers "yes" on samples and has stock, sold
 * through an organization the requester does not own.
 *
 * Chosen by walking the publications rather than named, so a sample never points
 * at a listing a later edit stopped publishing or emptied of stock — the
 * coherence trigger checks all three and would take the seed down with it.
 */
const sampleablePublication = (requesterEmail: string, skip: number): DemoListingPublicationFixture => {
  const requesterPartnerId = buyerPartnerIdFor(requesterEmail);
  const candidates = publications.filter((publication) => {
    if (publication.sourceKind !== "product" || !publication.productId) {
      return false;
    }
    const product = productsById.get(publication.productId);
    return Boolean(
      product?.sampleAvailable && product.stockQuantity > 0 && product.supplierId !== requesterPartnerId,
    );
  });
  const chosen = candidates[skip % Math.max(candidates.length, 1)];
  if (!chosen) {
    throw new Error("The demo catalogue publishes no in-stock listing that offers a sample.");
  }
  return chosen;
};

/**
 * Two sample requests waiting on a seller, from two different buying accounts.
 *
 * Both rest at `requested`, which is the only state the coherence trigger accepts
 * on insert; the later states are reached by the seller acting on the running
 * instance. The monthly-usage row is not seeded either — the same trigger writes
 * it, and writing our own would double-count the quota.
 */
export function demoMarketplaceSampleRequests(now: Date): readonly DemoSampleRequestFixture[] {
  return [
    { key: "sample:buyer", requesterEmail: buyerEmail, skip: 0, deliveryMethod: "pickup" as const },
    { key: "sample:farmer", requesterEmail: farmerEmail, skip: 1, deliveryMethod: "seller_delivery" as const },
  ].map((seed) => {
    const publication = sampleablePublication(seed.requesterEmail, seed.skip);
    const product = productsById.get(publication.productId as string);
    if (!product) {
      throw new Error(`Demo sample fixture points at a publication with no catalogue row.`);
    }
    return {
      createdAt: new Date(Math.min(now.getTime() - 2 * 24 * 60 * 60 * 1000, now.getTime())),
      deliveryMethod: seed.deliveryMethod,
      id: marketplaceFixtureUuid(seed.key),
      listingPublicationId: publication.id,
      monthlyLimit: demoSamplePolicy.monthlyLimit,
      policyId: demoSamplePolicy.id,
      policyVersion: demoSamplePolicy.version,
      productId: product.id,
      requesterEmail: seed.requesterEmail,
      requesterPartnerId: buyerPartnerIdFor(seed.requesterEmail),
      sellerOwnerEmail: publication.ownerEmail,
      sellerPartnerId: product.supplierId,
    };
  });
}

/**
 * One reported review, so the moderation queue is not an empty screen.
 *
 * The report carries the snapshot of the review as it stood when it was
 * reported, because that is what a moderator judges and the review may be edited
 * afterwards. It stays `pending`: a decided report is a decision this instance's
 * moderator never made.
 *
 * The reported review is deliberately a five-star one with a reply. Nothing about
 * a report says the review was wrong — a report is a claim, and leaving the
 * claim undecided is the honest state for a fixture.
 */
export function demoMarketplaceReviewReports(now: Date): readonly DemoReviewReportFixture[] {
  const reviews = demoMarketplaceReviews(now);
  // A reporter must not be the review's own author, so the report is filed by a
  // buying account that did not write it.
  const target = reviews.find((review) => review.buyerOwnerEmail !== buyerEmail && review.reply !== null);
  if (!target) {
    return [];
  }
  return [
    {
      comment: "",
      createdAt: new Date(Math.min(target.createdAt.getTime() + 3 * 24 * 60 * 60 * 1000, now.getTime())),
      id: marketplaceFixtureUuid(`review-report:${target.id}`),
      reason: "off_topic",
      reporterEmail: buyerEmail,
      reviewId: target.id,
      reviewSnapshot: {
        assetReferences: [],
        comment: target.comment,
        createdAt: target.createdAt.toISOString(),
        id: target.id,
        listingPublicationId: target.listingPublicationId,
        rating: target.rating,
        revision: 0,
        updatedAt: target.createdAt.toISOString(),
        verifiedDeal: true,
      },
    },
  ];
}

const produceById = new Map(demoMarketplaceProduceListings.map((listing) => [listing.id, listing] as const));

/**
 * The older AgriTech order book: a direct produce order, placed against a
 * harvest rather than drawn up as a contract.
 *
 * It is a separate surface from `marketplace_contracts` and it has its own
 * reader, so an empty table read as a broken panel rather than as a marketplace
 * that had moved on to contracts. Four orders across four statuses give the
 * status column something to show.
 *
 * They are derived from settled produce deals so the harvest, the farm and the
 * buying organization all exist and agree, which is what the three foreign keys
 * require.
 */
export function demoMarketplaceOrders(now: Date): readonly DemoOrderFixture[] {
  const statuses = ["confirmed", "shipped", "delivered", "cancelled"] as const;
  const settled = demoMarketplaceContracts(now).filter(
    (contract) => contract.status === "completed" && contract.lines.some((line) => line.sourceKind === "produce"),
  );
  const orders: DemoOrderFixture[] = [];
  for (const [index, status] of statuses.entries()) {
    const contract = settled[index * 3];
    const produceLine = contract?.lines.find((line) => line.sourceKind === "produce");
    const listing = produceLine ? produceById.get(produceLine.sourceId) : undefined;
    if (!contract || !produceLine || !listing) {
      continue;
    }
    // A direct order is a smaller, simpler purchase than a contract, so it takes
    // a tenth of the tonnage rather than restating the deal.
    const quantityKg = Math.max(Math.round(produceLine.quantity / 10), 10);
    const key = `order:${contract.id}`;
    orders.push({
      buyerEmail: contract.buyer.ownerEmail,
      buyerPartnerId: contract.buyer.partnerId,
      createdAt: new Date(Math.min(contract.updatedAt.getTime() + (index + 1) * 24 * 60 * 60 * 1000, now.getTime())),
      crop: listing.crop,
      deliveryAddress: `${contract.buyer.region}, ${contract.buyer.legalName}`,
      farmerId: listing.farmerId,
      id: marketplaceFixtureUuid(key),
      notes: "",
      produceListingId: listing.id,
      quantityKg,
      region: listing.region,
      status,
      totalAmountUzs: quantityKg * listing.pricePerKgUzs,
      unitPriceUzs: listing.pricePerKgUzs,
    });
  }
  return orders;
}

