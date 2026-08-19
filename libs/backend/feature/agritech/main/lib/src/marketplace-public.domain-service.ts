// @requirements REQ-AGRITECH-MARKETPLACE-016 REQ-AGRITECH-STAGE2-017 REQ-AGRITECH-PUBLIC-018 REQ-AGRITECH-ENGAGEMENT-019 REQ-AGRITECH-DEMO-024
import type {
  AgriTechOwner,
  MarketplaceCatalogSort,
  MarketplaceListingPublication,
  MarketplaceListingSection,
  MarketplaceOwnedPublications,
  MarketplacePublicCatalogQuery,
  MarketplacePublicCatalogCursor,
  MarketplacePublicListing,
  MarketplacePublicPage,
  MarketplacePublicModerationQueue,
  MarketplacePublicRepository,
  MarketplacePublicRequest,
  MarketplacePublicRequestCursor,
  MarketplacePublicRequestQuery,
  MarketplacePublicSeller,
  MarketplaceSellerProfileModerationItem,
  MarketplacePublicSuggestion,
  MarketplacePublishedListingRecord,
  MarketplacePublishedRequestRecord,
  MarketplacePublishedSellerRecord,
  MarketplacePublicProductListing,
  MarketplaceRequestPublication,
  OperationResult,
  PublishMarketplaceListingInput,
  PublishMarketplaceRequestInput,
  ReviewMarketplaceListingPublicationInput,
  ReviewMarketplaceRequestPublicationInput,
  ReviewMarketplaceSellerProfileInput,
} from '@app/backend-feature-agritech-shared';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  ResourceNotFoundException,
} from '@app/backend-common-exception';
import {
  findMarketplaceDemoListing,
  findMarketplaceDemoSeller,
  listMarketplaceDemoListings,
  listMarketplaceDemoSellerListings,
  listMarketplaceDemoSuggestions,
} from './marketplace-demo-catalog';

export interface MarketplacePublicCatalogInput {
  cursor?: string;
  limit?: number;
  query?: string;
  region?: string;
  section?: MarketplaceListingSection;
  category?: MarketplacePublicProductListing['category'];
  crop?: string;
  minPriceUzs?: number;
  maxPriceUzs?: number;
  minAvailableQuantity?: number;
  sampleAvailable?: boolean;
  sort?: MarketplaceCatalogSort;
}

export interface MarketplacePublicRequestsInput {
  cursor?: string;
  limit?: number;
  query?: string;
  region?: string;
}

export interface MarketplacePublicSellerView extends MarketplacePublicSeller {
  description?: string;
}

const defaultPageSize = 20;
const maximumPageSize = 50;
const maximumCursorLength = 512;
const maximumSearchLength = 200;
const maximumUzsAmount = 9_999_999_999_999;
const maximumQuantity = 2_147_483_647;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

const unwrapPublication = <T>(result: OperationResult<T>, resourceType: string): T => {
  if (result.status === 'ok') {
    return result.value;
  }
  if (result.status === 'not_found') {
    throw new ResourceNotFoundException(resourceType);
  }
  if (result.status === 'forbidden' || result.status === 'partner_unapproved') {
    throw new ForbiddenException(resourceType);
  }
  if (result.status === 'conflict') {
    throw new ConflictException(resourceType);
  }
  throw new BadRequestException({ meta: { field: result.field, resourceType } });
};

const normalizeOptionalText = (value: string | undefined, maximumLength: number): string | undefined => {
  const normalized = value?.trim();
  return normalized ? normalized.slice(0, maximumLength) : undefined;
};

const decodeCursorPayload = (cursor: string | undefined): Record<string, unknown> | undefined => {
  if (cursor === undefined) {
    return undefined;
  }
  if (
    cursor.length === 0 ||
    cursor.length > maximumCursorLength ||
    cursor !== cursor.trim() ||
    !/^[A-Za-z0-9_-]+$/u.test(cursor)
  ) {
    throw new BadRequestException({ meta: { field: 'cursor' } });
  }
  try {
    const decodedBuffer = Buffer.from(cursor, 'base64url');
    if (decodedBuffer.toString('base64url') !== cursor) {
      throw new BadRequestException({ meta: { field: 'cursor' } });
    }
    const decoded = decodedBuffer.toString('utf8');
    const value: unknown = JSON.parse(decoded);
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new BadRequestException({ meta: { field: 'cursor' } });
    }
    return value as Record<string, unknown>;
  } catch {
    throw new BadRequestException({ meta: { field: 'cursor' } });
  }
};

const hasExactKeys = (value: Record<string, unknown>, expected: string[]): boolean => {
  const actual = Object.keys(value);
  return actual.length === expected.length && expected.every((key) => Object.hasOwn(value, key));
};

const isCanonicalDate = (value: unknown): value is string => {
  if (typeof value !== 'string') {
    return false;
  }
  const parsed = new Date(value);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString() === value;
};

const decodeCatalogCursor = (
  cursor: string | undefined,
  sort: MarketplaceCatalogSort,
): MarketplacePublicCatalogCursor | undefined => {
  const value = decodeCursorPayload(cursor);
  if (!value) {
    return undefined;
  }
  if (value['kind'] !== 'catalog' || value['sort'] !== sort || !uuidPattern.test(String(value['id']))) {
    throw new BadRequestException({ meta: { field: 'cursor' } });
  }
  if (sort === 'newest') {
    if (
      !hasExactKeys(value, ['id', 'kind', 'promoted', 'publishedAt', 'sort']) ||
      typeof value['promoted'] !== 'boolean' ||
      !isCanonicalDate(value['publishedAt'])
    ) {
      throw new BadRequestException({ meta: { field: 'cursor' } });
    }
    return {
      id: String(value['id']),
      kind: 'catalog',
      promoted: value['promoted'],
      publishedAt: value['publishedAt'],
      sort,
    };
  }
  const priceUzs = value['priceUzs'];
  if (
    !hasExactKeys(value, ['id', 'kind', 'priceUzs', 'sort']) ||
    !Number.isSafeInteger(priceUzs) ||
    Number(priceUzs) < 0 ||
    Number(priceUzs) > maximumUzsAmount
  ) {
    throw new BadRequestException({ meta: { field: 'cursor' } });
  }
  return { id: String(value['id']), kind: 'catalog', priceUzs: Number(priceUzs), sort };
};

const decodeRequestCursor = (cursor: string | undefined): MarketplacePublicRequestCursor | undefined => {
  const value = decodeCursorPayload(cursor);
  if (
    !value ||
    !hasExactKeys(value, ['id', 'kind', 'publishedAt']) ||
    value['kind'] !== 'request' ||
    !uuidPattern.test(String(value['id'])) ||
    !isCanonicalDate(value['publishedAt'])
  ) {
    if (value) {
      throw new BadRequestException({ meta: { field: 'cursor' } });
    }
    return undefined;
  }
  return { id: String(value['id']), kind: 'request', publishedAt: value['publishedAt'] };
};

const encodeCursor = (cursor: unknown): string | undefined =>
  cursor === undefined ? undefined : Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');

const optionalBoundedInteger = (
  value: number | undefined,
  minimum: number,
  maximum: number,
  field: string,
): number | undefined => {
  if (value === undefined) {
    return undefined;
  }
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new BadRequestException({ meta: { field } });
  }
  return value;
};

const normalizeLimit = (value: number | undefined): number => {
  if (value === undefined || !Number.isInteger(value)) {
    return defaultPageSize;
  }
  return Math.max(1, Math.min(maximumPageSize, value));
};

const sellerView = (record: MarketplacePublishedListingRecord): MarketplacePublicSeller => ({
  displayName: record.sellerDisplayName,
  id: record.sellerPublicId,
  region: record.sellerRegion,
  provenance: 'live',
  verified: true,
});

export const toMarketplacePublicListing = (record: MarketplacePublishedListingRecord): MarketplacePublicListing => {
  const base = {
    availableQuantity: record.availableQuantity,
    ...(record.description ? { description: record.description } : {}),
    id: record.publicId,
    images: [...record.images],
    priceUzs: record.priceUzs,
    promoted: record.promoted,
    provenance: 'live' as const,
    rating: { average: record.rating.average, count: record.rating.count },
    transactional: true,
    sampleAvailable: record.sampleAvailable,
    publishedAt: record.publishedAt,
    region: record.region,
    section: record.section,
    seller: sellerView(record),
    title: record.title,
    ...(record.titleRu ? { titleRu: record.titleRu } : {}),
    ...(record.titleUz ? { titleUz: record.titleUz } : {}),
    ...(record.titleUzCyrl ? { titleUzCyrl: record.titleUzCyrl } : {}),
    unit: record.unit,
    updatedAt: record.updatedAt,
  };
  if (record.sourceKind === 'produce') {
    if (!record.produceCrop || !record.produceGrade || record.section !== 'produce') {
      throw new Error('Invalid published produce projection.');
    }
    return {
      ...base,
      crop: record.produceCrop,
      grade: record.produceGrade,
      kind: 'produce',
    };
  }
  if (!record.productCategory || record.section === 'produce') {
    throw new Error('Invalid published product projection.');
  }
  return {
    ...base,
    category: record.productCategory,
    kind: 'product',
  };
};

const toMarketplacePublicRequest = (record: MarketplacePublishedRequestRecord): MarketplacePublicRequest => ({
  ...(record.budgetUzs !== undefined ? { budgetUzs: record.budgetUzs } : {}),
  buyerDisplayName: record.buyerDisplayName,
  createdAt: record.createdAt,
  ...(record.deadline ? { deadline: record.deadline } : {}),
  id: record.publicId,
  ...(record.product ? { product: record.product } : {}),
  region: record.region,
  ...(record.requirements ? { requirements: record.requirements } : {}),
  title: record.title,
  updatedAt: record.updatedAt,
  ...(record.volume ? { volume: record.volume } : {}),
});

const toMarketplacePublicSeller = (record: MarketplacePublishedSellerRecord): MarketplacePublicSellerView => ({
  ...(record.description ? { description: record.description } : {}),
  displayName: record.displayName,
  id: record.publicId,
  region: record.region,
  provenance: 'live',
  verified: true,
});

const validatePriceRange = (minPriceUzs: number | undefined, maxPriceUzs: number | undefined): void => {
  if (minPriceUzs !== undefined && maxPriceUzs !== undefined && minPriceUzs > maxPriceUzs) {
    throw new BadRequestException({ meta: { field: 'priceRange' } });
  }
};

const validateCatalogTaxonomy = (input: MarketplacePublicCatalogInput, crop: string | undefined): void => {
  if (
    (input.category && crop) ||
    (input.section === 'produce' && input.category) ||
    (crop && input.section !== 'produce')
  ) {
    throw new BadRequestException({ meta: { field: input.category ? 'category' : 'crop' } });
  }
};

const catalogQuery = (input: MarketplacePublicCatalogInput): MarketplacePublicCatalogQuery => {
  const sort = input.sort ?? 'newest';
  const query = normalizeOptionalText(input.query, maximumSearchLength);
  const region = normalizeOptionalText(input.region, maximumSearchLength);
  const crop = normalizeOptionalText(input.crop, maximumSearchLength);
  const minPriceUzs = optionalBoundedInteger(input.minPriceUzs, 0, maximumUzsAmount, 'minPriceUzs');
  const maxPriceUzs = optionalBoundedInteger(input.maxPriceUzs, 0, maximumUzsAmount, 'maxPriceUzs');
  const minAvailableQuantity = optionalBoundedInteger(
    input.minAvailableQuantity,
    1,
    maximumQuantity,
    'minAvailableQuantity',
  );
  validatePriceRange(minPriceUzs, maxPriceUzs);
  validateCatalogTaxonomy(input, crop);
  const cursor = decodeCatalogCursor(input.cursor, sort);
  const result: MarketplacePublicCatalogQuery = { limit: normalizeLimit(input.limit), sort };
  if (cursor) {
    result.cursor = cursor;
  }
  if (query) {
    result.query = query;
  }
  if (region) {
    result.region = region;
  }
  if (input.section) {
    result.section = input.section;
  }
  if (input.category) {
    result.category = input.category;
  }
  if (crop) {
    result.crop = crop;
  }
  if (minPriceUzs !== undefined) {
    result.minPriceUzs = minPriceUzs;
  }
  if (maxPriceUzs !== undefined) {
    result.maxPriceUzs = maxPriceUzs;
  }
  if (minAvailableQuantity !== undefined) {
    result.minAvailableQuantity = minAvailableQuantity;
  }
  if (input.sampleAvailable !== undefined) {
    result.sampleAvailable = input.sampleAvailable;
  }
  return result;
};

const requestQuery = (input: MarketplacePublicRequestsInput): MarketplacePublicRequestQuery => {
  const query = normalizeOptionalText(input.query, maximumSearchLength);
  const region = normalizeOptionalText(input.region, maximumSearchLength);
  const cursor = decodeRequestCursor(input.cursor);
  return {
    limit: normalizeLimit(input.limit),
    ...(cursor ? { cursor } : {}),
    ...(query ? { query } : {}),
    ...(region ? { region } : {}),
  };
};

/** Framework-independent anonymous projection boundary. */
export class MarketplacePublicDomainService {
  constructor(private readonly repository: MarketplacePublicRepository) {}

  async listCatalog(
    input: MarketplacePublicCatalogInput = {},
  ): Promise<MarketplacePublicPage<MarketplacePublicListing>> {
    const query = catalogQuery(input);
    const page = await this.repository.listPublishedListings(query);
    const items = page.items.map(toMarketplacePublicListing);
    if (!query.cursor && !page.nextCursor && items.length < query.limit && (await this.demoCatalogEnabled())) {
      const existingIds = new Set(items.map((item) => item.id));
      for (const demo of listMarketplaceDemoListings(query)) {
        if (!existingIds.has(demo.id) && items.length < query.limit) {
          items.push(demo);
        }
      }
    }
    return {
      items,
      ...(encodeCursor(page.nextCursor) ? { nextCursor: encodeCursor(page.nextCursor) } : {}),
    };
  }

  async getListing(publicId: string): Promise<MarketplacePublicListing | undefined> {
    const record = await this.repository.findPublishedListing(publicId);
    if (record) {
      return toMarketplacePublicListing(record);
    }
    return (await this.demoCatalogEnabled()) ? findMarketplaceDemoListing(publicId) : undefined;
  }

  async getSeller(publicId: string): Promise<MarketplacePublicSellerView | undefined> {
    const record = await this.repository.findPublishedSeller(publicId);
    if (record) {
      return toMarketplacePublicSeller(record);
    }
    return (await this.demoCatalogEnabled()) ? findMarketplaceDemoSeller(publicId) : undefined;
  }

  async listSellerCatalog(
    sellerPublicId: string,
    input: MarketplacePublicCatalogInput = {},
  ): Promise<MarketplacePublicPage<MarketplacePublicListing>> {
    const query = catalogQuery(input);
    const page = await this.repository.listPublishedSellerListings(sellerPublicId, query);
    const items = page.items.map(toMarketplacePublicListing);
    if (!query.cursor && !page.nextCursor && items.length < query.limit && (await this.demoCatalogEnabled())) {
      items.push(...listMarketplaceDemoSellerListings(sellerPublicId, query).slice(0, query.limit - items.length));
    }
    return {
      items,
      ...(encodeCursor(page.nextCursor) ? { nextCursor: encodeCursor(page.nextCursor) } : {}),
    };
  }

  async listRequests(
    input: MarketplacePublicRequestsInput = {},
  ): Promise<MarketplacePublicPage<MarketplacePublicRequest>> {
    const page = await this.repository.listPublishedRequests(requestQuery(input));
    return {
      items: page.items.map(toMarketplacePublicRequest),
      ...(encodeCursor(page.nextCursor) ? { nextCursor: encodeCursor(page.nextCursor) } : {}),
    };
  }

  async listSuggestions(query: string, limit = 8): Promise<MarketplacePublicSuggestion[]> {
    const normalized = normalizeOptionalText(query, maximumSearchLength);
    if (!normalized) {
      return [];
    }
    const resolvedLimit = Math.max(1, Math.min(10, limit));
    const records = await this.repository.listPublishedSuggestions(normalized, resolvedLimit);
    const suggestions = records.map((record) => ({
      id: record.id,
      kind: record.kind,
      label: record.label,
      ...(record.section ? { section: record.section } : {}),
    }));
    if (suggestions.length < resolvedLimit && (await this.demoCatalogEnabled())) {
      const ids = new Set(suggestions.map((item) => item.id));
      for (const demo of listMarketplaceDemoSuggestions(normalized, resolvedLimit)) {
        if (!ids.has(demo.id) && suggestions.length < resolvedLimit) {
          suggestions.push(demo);
        }
      }
    }
    return suggestions;
  }

  private async demoCatalogEnabled(): Promise<boolean> {
    try {
      return await this.repository.isDemoCatalogEnabled();
    } catch {
      // Demo content is optional presentation data. A missing or unreadable
      // governance row must never break authoritative public marketplace reads.
      return false;
    }
  }

  async publishListing(
    owner: AgriTechOwner,
    idempotencyKey: string,
    input: PublishMarketplaceListingInput,
  ): Promise<MarketplaceListingPublication> {
    return unwrapPublication(await this.repository.publishListing(owner, idempotencyKey, input), 'publication');
  }

  listOwnedPublications(owner: AgriTechOwner, limit = defaultPageSize): Promise<MarketplaceOwnedPublications> {
    return this.repository.listOwnedPublications(owner, Math.max(1, Math.min(maximumPageSize, limit)));
  }

  async publishRequest(
    owner: AgriTechOwner,
    idempotencyKey: string,
    input: PublishMarketplaceRequestInput,
  ): Promise<MarketplaceRequestPublication> {
    return unwrapPublication(await this.repository.publishRequest(owner, idempotencyKey, input), 'request-publication');
  }

  listPendingModeration(tenantId: string): Promise<MarketplacePublicModerationQueue> {
    return this.repository.listPendingModeration(tenantId);
  }

  async reviewListingPublication(
    tenantId: string,
    publicationId: string,
    reviewerUserId: string,
    input: ReviewMarketplaceListingPublicationInput,
  ): Promise<MarketplaceListingPublication> {
    return unwrapPublication(
      await this.repository.reviewListingPublication(tenantId, publicationId, reviewerUserId, input),
      'listing-publication',
    );
  }

  async reviewSellerProfile(
    tenantId: string,
    sellerPublicId: string,
    reviewerUserId: string,
    input: ReviewMarketplaceSellerProfileInput,
  ): Promise<MarketplaceSellerProfileModerationItem> {
    return unwrapPublication(
      await this.repository.reviewSellerProfile(tenantId, sellerPublicId, reviewerUserId, input),
      'seller-profile',
    );
  }

  async reviewRequestPublication(
    tenantId: string,
    publicationId: string,
    reviewerUserId: string,
    input: ReviewMarketplaceRequestPublicationInput,
  ): Promise<MarketplaceRequestPublication> {
    return unwrapPublication(
      await this.repository.reviewRequestPublication(tenantId, publicationId, reviewerUserId, input),
      'request-publication',
    );
  }
}
