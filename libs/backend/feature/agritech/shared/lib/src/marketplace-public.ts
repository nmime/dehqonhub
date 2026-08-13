// @requirements REQ-AGRITECH-MARKETPLACE-016 REQ-AGRITECH-STAGE2-017 REQ-AGRITECH-PUBLIC-018 REQ-AGRITECH-ENGAGEMENT-019
import type { AgriTechOwner, OperationResult } from './agritech.types';

export const MarketplacePublicRepositoryInjectToken = Symbol('MarketplacePublicRepositoryInjectToken');

export type MarketplaceListingSection = 'equipment' | 'seeds' | 'produce';
export type MarketplaceListingSourceKind = 'product' | 'produce';
export type MarketplaceCatalogSort = 'newest' | 'price_asc' | 'price_desc';
export type MarketplacePublicationStatus = 'published' | 'paused' | 'rejected';
export type MarketplaceModerationStatus = 'pending' | 'approved' | 'rejected';
export type MarketplaceModerationDecision = Extract<MarketplaceModerationStatus, 'approved' | 'rejected'>;

export interface MarketplaceListingModerationItem {
  publication: MarketplaceListingPublication;
  seller: {
    id: string;
    displayName: string;
    description?: string;
    region: string;
    contentRevision: number;
    contentFingerprint: string;
    moderationStatus: MarketplaceModerationStatus;
  };
  content: {
    title: string;
    titleRu?: string;
    titleUz?: string;
    titleUzCyrl?: string;
    description?: string;
    category?: MarketplacePublicProductListing['category'];
    crop?: string;
    grade?: MarketplacePublicProduceListing['grade'];
    unit: string;
    region: string;
    images: string[];
  };
}

export interface MarketplaceSellerProfileModerationItem {
  sellerPublicId: string;
  displayName: string;
  description?: string;
  region: string;
  contentRevision: number;
  contentFingerprint: string;
  moderationStatus: MarketplaceModerationStatus;
  submittedAt: Date;
}

export interface MarketplaceRequestModerationItem {
  publication: MarketplaceRequestPublication;
  content: Omit<MarketplacePublicRequest, 'id' | 'createdAt' | 'updatedAt'>;
}

export interface MarketplacePublicModerationQueue {
  sellerProfiles: MarketplaceSellerProfileModerationItem[];
  listings: MarketplaceListingModerationItem[];
  requests: MarketplaceRequestModerationItem[];
}

export interface ReviewMarketplaceSellerProfileInput {
  decision: MarketplaceModerationDecision;
  expectedContentFingerprint: string;
  expectedContentRevision: number;
  idempotencyKey: string;
}

export interface ReviewMarketplaceListingPublicationInput {
  decision: MarketplaceModerationDecision;
  expectedRevision: number;
  expectedSellerContentFingerprint: string;
  expectedSellerContentRevision: number;
  idempotencyKey: string;
}

export interface ReviewMarketplaceRequestPublicationInput {
  decision: MarketplaceModerationDecision;
  expectedRevision: number;
  idempotencyKey: string;
}

export type MarketplacePublicProvenance = 'live' | 'demo';

export interface MarketplacePublicSeller {
  id: string;
  displayName: string;
  region: string;
  verified: boolean;
  provenance: MarketplacePublicProvenance;
}

interface MarketplacePublicListingBase {
  id: string;
  section: MarketplaceListingSection;
  title: string;
  titleRu?: string;
  titleUz?: string;
  titleUzCyrl?: string;
  description?: string;
  priceUzs: number;
  unit: string;
  availableQuantity: number;
  sampleAvailable: boolean;
  region: string;
  images: string[];
  promoted: boolean;
  provenance: MarketplacePublicProvenance;
  transactional: boolean;
  seller: MarketplacePublicSeller;
  publishedAt: Date;
  updatedAt: Date;
}

export interface MarketplacePublicProductListing extends MarketplacePublicListingBase {
  kind: 'product';
  category: 'fertilizer' | 'seed' | 'pesticide' | 'equipment' | 'irrigation' | 'other';
}

export interface MarketplacePublicProduceListing extends MarketplacePublicListingBase {
  kind: 'produce';
  crop: string;
  grade: 'A' | 'B' | 'C';
}

export type MarketplacePublicListing = MarketplacePublicProductListing | MarketplacePublicProduceListing;

export interface MarketplacePublicRequest {
  id: string;
  title: string;
  product?: string;
  volume?: string;
  region: string;
  deadline?: string;
  budgetUzs?: number;
  requirements?: string;
  buyerDisplayName: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface MarketplacePublicSuggestion {
  id: string;
  kind: 'listing' | 'seller' | 'request';
  label: string;
  section?: MarketplaceListingSection;
}

export interface MarketplacePublicCatalogQuery {
  limit: number;
  cursor?: MarketplacePublicCatalogCursor;
  query?: string;
  region?: string;
  section?: MarketplaceListingSection;
  category?: MarketplacePublicProductListing['category'];
  crop?: string;
  minPriceUzs?: number;
  maxPriceUzs?: number;
  minAvailableQuantity?: number;
  sampleAvailable?: boolean;
  sort: MarketplaceCatalogSort;
}

export interface MarketplacePublicRequestQuery {
  limit: number;
  cursor?: MarketplacePublicRequestCursor;
  query?: string;
  region?: string;
}

export interface MarketplacePublicCatalogCursor {
  kind: 'catalog';
  id: string;
  sort: MarketplaceCatalogSort;
  priceUzs?: number;
  promoted?: boolean;
  publishedAt?: string;
}

export interface MarketplacePublicRequestCursor {
  kind: 'request';
  id: string;
  publishedAt: string;
}

export interface MarketplacePublicPage<T> {
  items: T[];
  nextCursor?: string;
}

export interface MarketplacePublicRepositoryPage<T, Cursor> {
  items: T[];
  nextCursor?: Cursor;
}

export interface MarketplaceListingPublication {
  id: string;
  sourceKind: MarketplaceListingSourceKind;
  sourceId: string;
  section: MarketplaceListingSection;
  status: MarketplacePublicationStatus;
  moderationStatus: MarketplaceModerationStatus;
  sellerPublicId: string;
  revision: number;
  publishedAt?: Date;
  updatedAt: Date;
}

export interface MarketplaceRequestPublication {
  id: string;
  requestId: string;
  status: MarketplacePublicationStatus;
  moderationStatus: MarketplaceModerationStatus;
  revision: number;
  publishedAt?: Date;
  updatedAt: Date;
}

export interface MarketplaceOwnedListingPublication {
  kind: 'listing';
  id: string;
  sourceKind: MarketplaceListingSourceKind;
  section: MarketplaceListingSection;
  title: string;
  titleRu?: string;
  titleUz?: string;
  titleUzCyrl?: string;
  status: MarketplacePublicationStatus;
  moderationStatus: MarketplaceModerationStatus;
  sellerPublicId: string;
  revision: number;
  publishedAt?: Date;
  updatedAt: Date;
}

export interface MarketplaceOwnedRequestPublication {
  kind: 'request';
  id: string;
  title: string;
  buyerDisplayName: string;
  status: MarketplacePublicationStatus;
  moderationStatus: MarketplaceModerationStatus;
  revision: number;
  publishedAt?: Date;
  updatedAt: Date;
}

export interface MarketplaceOwnedPublications {
  listings: MarketplaceOwnedListingPublication[];
  requests: MarketplaceOwnedRequestPublication[];
}

export interface PublishMarketplaceListingInput {
  sellerPartnerId: string;
  sourceKind: MarketplaceListingSourceKind;
  sourceId: string;
  section: MarketplaceListingSection;
}

export interface PublishMarketplaceRequestInput {
  buyerPartnerId: string;
  requestId: string;
}

/** Persistence-owned anonymous listing projection. */
export interface MarketplacePublishedListingRecord {
  publicId: string;
  sourceKind: MarketplaceListingSourceKind;
  section: MarketplaceListingSection;
  title: string;
  titleRu?: string;
  titleUz?: string;
  titleUzCyrl?: string;
  description?: string;
  priceUzs: number;
  unit: string;
  availableQuantity: number;
  sampleAvailable: boolean;
  region: string;
  images: string[];
  promoted: boolean;
  productCategory?: MarketplacePublicProductListing['category'];
  produceCrop?: string;
  produceGrade?: MarketplacePublicProduceListing['grade'];
  publishedAt: Date;
  updatedAt: Date;
  sellerPublicId: string;
  sellerDisplayName: string;
  sellerRegion: string;
}

export interface MarketplacePublishedSellerRecord {
  publicId: string;
  displayName: string;
  description?: string;
  region: string;
  verified: true;
}

export interface MarketplacePublishedRequestRecord {
  publicId: string;
  title: string;
  product?: string;
  volume?: string;
  region: string;
  deadline?: string;
  budgetUzs?: number;
  requirements?: string;
  buyerDisplayName: string;
  createdAt: Date;
  updatedAt: Date;
}

export type MarketplacePublishedSuggestionRecord = MarketplacePublicSuggestion;

export interface MarketplacePublicRepository {
  isDemoCatalogEnabled(): Promise<boolean>;
  findPublishedListing(publicId: string): Promise<MarketplacePublishedListingRecord | undefined>;
  findPublishedSeller(publicId: string): Promise<MarketplacePublishedSellerRecord | undefined>;
  listPublishedListings(
    input: MarketplacePublicCatalogQuery,
  ): Promise<MarketplacePublicRepositoryPage<MarketplacePublishedListingRecord, MarketplacePublicCatalogCursor>>;
  listPublishedRequests(
    input: MarketplacePublicRequestQuery,
  ): Promise<MarketplacePublicRepositoryPage<MarketplacePublishedRequestRecord, MarketplacePublicRequestCursor>>;
  listPublishedSellerListings(
    sellerPublicId: string,
    input: MarketplacePublicCatalogQuery,
  ): Promise<MarketplacePublicRepositoryPage<MarketplacePublishedListingRecord, MarketplacePublicCatalogCursor>>;
  listPublishedSuggestions(query: string, limit: number): Promise<MarketplacePublishedSuggestionRecord[]>;
  listPendingModeration(tenantId: string): Promise<MarketplacePublicModerationQueue>;
  listOwnedPublications(owner: AgriTechOwner, limit: number): Promise<MarketplaceOwnedPublications>;
  publishListing(
    owner: AgriTechOwner,
    idempotencyKey: string,
    input: PublishMarketplaceListingInput,
  ): Promise<OperationResult<MarketplaceListingPublication>>;
  publishRequest(
    owner: AgriTechOwner,
    idempotencyKey: string,
    input: PublishMarketplaceRequestInput,
  ): Promise<OperationResult<MarketplaceRequestPublication>>;
  reviewListingPublication(
    tenantId: string,
    publicationId: string,
    reviewerUserId: string,
    input: ReviewMarketplaceListingPublicationInput,
  ): Promise<OperationResult<MarketplaceListingPublication>>;
  reviewSellerProfile(
    tenantId: string,
    sellerPublicId: string,
    reviewerUserId: string,
    input: ReviewMarketplaceSellerProfileInput,
  ): Promise<OperationResult<MarketplaceSellerProfileModerationItem>>;
  reviewRequestPublication(
    tenantId: string,
    publicationId: string,
    reviewerUserId: string,
    input: ReviewMarketplaceRequestPublicationInput,
  ): Promise<OperationResult<MarketplaceRequestPublication>>;
}
