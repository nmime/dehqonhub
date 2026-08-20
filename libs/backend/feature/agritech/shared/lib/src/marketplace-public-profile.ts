// @requirements REQ-AGRITECH-PUBLIC-018 REQ-AGRITECH-ENGAGEMENT-019
import { createHash } from 'node:crypto';
import type { MarketplaceListingSection } from './marketplace-public';

export const MarketplacePublicProfileRepositoryInjectToken = Symbol('MarketplacePublicProfileRepositoryInjectToken');

/**
 * The one namespace behind every public profile address.
 *
 * A public profile is a page about a marketplace *organization*, and the only
 * durable key the marketplace holds for one is its private `agritech_partners`
 * row id. Publishing that id would put a private identifier in a shareable URL,
 * and REQ-AGRITECH-PUBLIC-018 forbids exactly that, so the address is a
 * namespaced SHA-256 digest of the partner id instead: stable for the life of
 * the organization, identical in every response that mentions it, and not
 * invertible back to the partner row - recovering the input would mean guessing
 * a random 128-bit UUID.
 *
 * The namespace is versioned because rotating it is the only way to retire an
 * address that has been shared, and a rotation must be a deliberate, visible
 * edit rather than an accident of refactoring.
 */
export const marketplacePublicProfileIdNamespace = 'dehqonhub:marketplace-public-profile:v1';

/**
 * A UUID-shaped hex grouping of the digest. It is deliberately *not* an RFC 4122
 * UUID: no version or variant nibble is forced, because forcing one would make
 * the value unreproducible from a plain `sha256` + `substring` in SQL, and the
 * persistence layer has to derive the same address to resolve it. Callers must
 * therefore validate it with `marketplacePublicProfileIdPattern` rather than a
 * UUID pipe.
 */
export const marketplacePublicProfileIdPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;

/** The public address of the organization behind `partnerId`. */
export const marketplacePublicProfileId = (partnerId: string): string => {
  const digest = createHash('sha256').update(`${marketplacePublicProfileIdNamespace}:${partnerId}`).digest('hex');
  return [
    digest.slice(0, 8),
    digest.slice(8, 12),
    digest.slice(12, 16),
    digest.slice(16, 20),
    digest.slice(20, 32),
  ].join('-');
};

export type MarketplacePublicProfileRole = 'seller' | 'buyer';

/**
 * The party a public review points at, named the way the marketplace already
 * names parties in public: a moderated display name plus the profile address.
 * No partner, user, tenant or organization identifier travels with it.
 */
export interface MarketplacePublicProfileParty {
  profileId: string;
  displayName: string;
}

/**
 * Reputation as counts, not as a ledger.
 *
 * A public profile answers "has this organization actually traded, and how did
 * that go" without answering "with whom, for how much, and on what terms". So
 * the deal history here is a completed-deal count split by the side the party
 * took, the window those deals span, and the marketplace sections they happened
 * in. Counterparty identity, contract identity, amounts, delivery terms and
 * every non-completed contract stay out: they belong to the two parties and
 * their administrator, and the profile has no legitimate use for them.
 */
export interface MarketplacePublicProfileReputation {
  completedDeals: number;
  completedDealsAsSeller: number;
  completedDealsAsBuyer: number;
  firstDealAt: Date | null;
  lastDealAt: Date | null;
  sections: MarketplaceListingSection[];
  reviewsReceived: { count: number; averageRating: number | null };
  reviewsWritten: { count: number };
}

/**
 * One deal-verified review on a public profile.
 *
 * `subject` is present only on the reviews the profile's own organization
 * *wrote*, where it names the seller they reviewed - the profile is already the
 * author, so nothing new is disclosed by saying who the review was about. A
 * review the profile *received* carries no author at all, exactly as the public
 * listing projection carries none: attribution of a received review would
 * disclose a purchase relationship the buyer never published.
 */
export interface MarketplacePublicProfileReview {
  id: string;
  rating: number;
  comment?: string;
  verifiedDeal: true;
  listingId: string;
  listingTitle: string;
  section: MarketplaceListingSection;
  reply?: { comment: string; createdAt: Date };
  subject?: MarketplacePublicProfileParty;
  createdAt: Date;
}

/**
 * Everything a guest may learn about another marketplace organization.
 *
 * Every field here is either already guest-visible somewhere else (a moderated
 * display name, a region, a public listing title, a visible review) or a count
 * derived from records the party itself made public by trading. Nothing is
 * private-source data filtered down in the browser: the projection is built on
 * the server and the private columns are never selected.
 */
export interface MarketplacePublicProfile {
  id: string;
  displayName: string;
  region: string;
  description?: string;
  roles: MarketplacePublicProfileRole[];
  verified: boolean;
  publicSince: Date;
  /** Set when the party publishes a catalog, so the client can link to it. */
  sellerId?: string;
  reputation: MarketplacePublicProfileReputation;
  /** Bounded and newest first. Recent reviews, never a claim of full history. */
  reviewsReceived: MarketplacePublicProfileReview[];
  reviewsWritten: MarketplacePublicProfileReview[];
}

export interface MarketplacePublicProfileRepository {
  findPublicProfile(profileId: string, reviewLimit: number): Promise<MarketplacePublicProfile | undefined>;
  /**
   * The same projection reached through the public seller address the catalog
   * already prints on every listing, so a client holding a seller id does not
   * have to be told a second identifier before it can open a profile.
   */
  findPublicProfileBySellerId(
    sellerPublicId: string,
    reviewLimit: number,
  ): Promise<MarketplacePublicProfile | undefined>;
}
