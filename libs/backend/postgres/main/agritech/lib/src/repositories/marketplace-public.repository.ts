// @requirements REQ-AGRITECH-MARKETPLACE-016 REQ-AGRITECH-STAGE2-017 REQ-AGRITECH-PUBLIC-018 REQ-AGRITECH-ENGAGEMENT-019
import { createHash } from 'node:crypto';
import { EntityManager, LockMode } from '@mikro-orm/core';
import { Inject, Injectable } from '@nestjs/common';
import { DefaultFeatureFlagTenantId } from '@app/common-feature-flags';
import { marketplaceReviewAverageRating } from '@app/backend-feature-agritech-shared';
import type {
  AgriTechOwner,
  MarketplaceCatalogSort,
  MarketplacePublicCatalogCursor,
  MarketplaceListingPublication,
  MarketplaceListingSection,
  MarketplaceOwnedPublications,
  MarketplaceModerationStatus,
  MarketplacePublicCatalogQuery,
  MarketplacePublicRepository,
  MarketplacePublicModerationQueue,
  MarketplacePublicRepositoryPage,
  MarketplacePublicRequestQuery,
  MarketplacePublicRequestCursor,
  MarketplaceSellerProfileModerationItem,
  MarketplacePublishedListingRecord,
  MarketplacePublishedRequestRecord,
  MarketplacePublishedSellerRecord,
  MarketplacePublishedSuggestionRecord,
  MarketplaceRequestPublication,
  OperationResult,
  PublishMarketplaceListingInput,
  PublishMarketplaceRequestInput,
  ReviewMarketplaceListingPublicationInput,
  ReviewMarketplaceRequestPublicationInput,
  ReviewMarketplaceSellerProfileInput,
} from '@app/backend-feature-agritech-shared';
import { marketplaceBuyerRolesSql, marketplaceSellerRolesSql } from './marketplace-role-predicates';
import { FarmerEntity } from '../entities/farmer.entity';
import { BuyerRequestEntity, VerificationEntity } from '../entities/marketplace.entity';
import {
  MarketplaceListingPublicationEntity,
  MarketplacePublicationModerationOperationEntity,
  MarketplacePublicSellerEntity,
  MarketplacePublicSellerRevisionEntity,
  MarketplaceRequestPublicationEntity,
} from '../entities/marketplace-public.entity';
import {
  MarketplaceProduceOrganizationBindingEntity,
  MarketplaceRequestOrganizationBindingEntity,
} from '../entities/marketplace-source-binding.entity';
import { AgriTechPartnerEntity, ProduceListingEntity } from '../entities/operations.entity';
import { ProductEntity, type ProductCategory } from '../entities/product.entity';

interface PublishedListingRow {
  public_id: string;
  source_kind: 'product' | 'produce';
  section: MarketplaceListingSection;
  title: string;
  title_ru: string | null;
  title_uz: string | null;
  title_uz_cyrl: string | null;
  description: string | null;
  price_uzs: string | number;
  unit: string;
  available_quantity: number;
  sample_available: boolean;
  region: string;
  images: unknown;
  promoted: boolean;
  product_category: ProductCategory | null;
  produce_crop: string | null;
  produce_grade: 'A' | 'B' | 'C' | null;
  review_count: number;
  rating_sum: number;
  published_at: RawTimestamp;
  updated_at: RawTimestamp;
  seller_public_id: string;
  seller_display_name: string;
  seller_region: string;
}

interface PublishedSellerRow {
  public_id: string;
  display_name: string;
  description: string | null;
  region: string;
}

interface PublishedRequestRow {
  public_id: string;
  title: string;
  product: string | null;
  volume: string | null;
  region: string;
  deadline: string | null;
  budget_uzs: string | number | null;
  requirements: string | null;
  buyer_display_name: string;
  published_at: RawTimestamp;
  created_at: RawTimestamp;
  updated_at: RawTimestamp;
}

const imagesFrom = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];

/** Mirrors `ck__marketplace_listing_publications__content`, which caps public assets at five. */
const maxPublicImages = 5;

/**
 * What a timestamp column actually is on the raw-SQL path. MikroORM's PostgreSQL
 * dialect installs `pg` type parsers that hand `timestamptz` back as the wire
 * string so the ORM owns the conversion, and `getConnection().execute()` skips
 * that conversion — only entity hydration performs it. So every timestamp read
 * through `executeRows` arrives as a string here, and typing these fields as
 * `Date` silently promised a method the value does not have.
 */
type RawTimestamp = Date | string | number;

/** A real `Date` from a raw row, failing loudly instead of producing `Invalid Date`. */
const timestampFromRow = (value: RawTimestamp): Date => {
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.valueOf())) {
    throw new Error(`Marketplace public read received an unparseable timestamp: ${String(value)}`);
  }
  return parsed;
};

/** ISO 8601 form of a raw-row timestamp, which is what a keyset cursor carries. */
const isoTimestamp = (value: RawTimestamp): string => timestampFromRow(value).toISOString();

const listingFromRow = (row: PublishedListingRow): MarketplacePublishedListingRecord => ({
  availableQuantity: row.available_quantity,
  ...(row.description ? { description: row.description } : {}),
  images: imagesFrom(row.images),
  priceUzs: Number(row.price_uzs),
  sampleAvailable: row.sample_available,
  ...(row.product_category ? { productCategory: row.product_category } : {}),
  promoted: row.promoted,
  ...(row.produce_crop ? { produceCrop: row.produce_crop } : {}),
  ...(row.produce_grade ? { produceGrade: row.produce_grade } : {}),
  publicId: row.public_id,
  rating: {
    average: marketplaceReviewAverageRating(Number(row.rating_sum), Number(row.review_count)),
    count: Number(row.review_count),
  },
  publishedAt: timestampFromRow(row.published_at),
  region: row.region,
  section: row.section,
  sellerDisplayName: row.seller_display_name,
  sellerPublicId: row.seller_public_id,
  sellerRegion: row.seller_region,
  sourceKind: row.source_kind,
  title: row.title,
  ...(row.title_ru ? { titleRu: row.title_ru } : {}),
  ...(row.title_uz ? { titleUz: row.title_uz } : {}),
  ...(row.title_uz_cyrl ? { titleUzCyrl: row.title_uz_cyrl } : {}),
  unit: row.unit,
  updatedAt: timestampFromRow(row.updated_at),
});

const sellerFromRow = (row: PublishedSellerRow): MarketplacePublishedSellerRecord => ({
  ...(row.description ? { description: row.description } : {}),
  displayName: row.display_name,
  publicId: row.public_id,
  region: row.region,
  verified: true,
});

const requestFromRow = (row: PublishedRequestRow): MarketplacePublishedRequestRecord => ({
  ...(row.budget_uzs === null ? {} : { budgetUzs: Number(row.budget_uzs) }),
  buyerDisplayName: row.buyer_display_name,
  createdAt: timestampFromRow(row.created_at),
  ...(row.deadline ? { deadline: row.deadline } : {}),
  ...(row.product ? { product: row.product } : {}),
  publicId: row.public_id,
  region: row.region,
  ...(row.requirements ? { requirements: row.requirements } : {}),
  title: row.title,
  updatedAt: timestampFromRow(row.updated_at),
  ...(row.volume ? { volume: row.volume } : {}),
});

const listingPublication = (entity: MarketplaceListingPublicationEntity): MarketplaceListingPublication => ({
  id: entity.id,
  ...(entity.publishedAt ? { publishedAt: entity.publishedAt } : {}),
  moderationStatus: entity.moderationStatus,
  revision: entity.revision,
  section: entity.section,
  sellerPublicId: entity.sellerPublicId,
  sourceId: entity.productId ?? entity.produceListingId ?? '',
  sourceKind: entity.sourceKind,
  status: entity.status,
  updatedAt: entity.updatedAt,
});

const requestPublication = (entity: MarketplaceRequestPublicationEntity): MarketplaceRequestPublication => ({
  id: entity.id,
  ...(entity.publishedAt ? { publishedAt: entity.publishedAt } : {}),
  moderationStatus: entity.moderationStatus,
  requestId: entity.requestId,
  revision: entity.revision,
  status: entity.status,
  updatedAt: entity.updatedAt,
});

const ownedListingPublication = (
  entity: MarketplaceListingPublicationEntity,
): MarketplaceOwnedPublications['listings'][number] => ({
  id: entity.id,
  kind: 'listing',
  moderationStatus: entity.moderationStatus,
  ...(entity.publishedAt ? { publishedAt: entity.publishedAt } : {}),
  revision: entity.revision,
  section: entity.section,
  sellerPublicId: entity.sellerPublicId,
  sourceKind: entity.sourceKind,
  status: entity.status,
  title: entity.publicTitle,
  ...(entity.publicTitleRu ? { titleRu: entity.publicTitleRu } : {}),
  ...(entity.publicTitleUz ? { titleUz: entity.publicTitleUz } : {}),
  ...(entity.publicTitleUzCyrl ? { titleUzCyrl: entity.publicTitleUzCyrl } : {}),
  updatedAt: entity.updatedAt,
});

const ownedRequestPublication = (
  entity: MarketplaceRequestPublicationEntity,
): MarketplaceOwnedPublications['requests'][number] => ({
  buyerDisplayName: entity.buyerDisplayName,
  id: entity.id,
  kind: 'request',
  moderationStatus: entity.moderationStatus,
  ...(entity.publishedAt ? { publishedAt: entity.publishedAt } : {}),
  revision: entity.revision,
  status: entity.status,
  title: entity.publicTitle,
  updatedAt: entity.updatedAt,
});

const publicationSnapshot = (
  value: MarketplaceListingPublication | MarketplaceRequestPublication,
): Record<string, unknown> => ({
  ...value,
  ...(value.publishedAt ? { publishedAt: value.publishedAt.toISOString() } : {}),
  updatedAt: value.updatedAt.toISOString(),
});

const dateFromSnapshot = (value: unknown): Date => new Date(typeof value === 'string' ? value : Number.NaN);

const listingPublicationFromSnapshot = (snapshot: Record<string, unknown>): MarketplaceListingPublication => ({
  id: String(snapshot['id']),
  moderationStatus: snapshot['moderationStatus'] as MarketplaceListingPublication['moderationStatus'],
  ...(snapshot['publishedAt'] ? { publishedAt: dateFromSnapshot(snapshot['publishedAt']) } : {}),
  revision: Number(snapshot['revision']),
  section: snapshot['section'] as MarketplaceListingPublication['section'],
  sellerPublicId: String(snapshot['sellerPublicId']),
  sourceId: String(snapshot['sourceId']),
  sourceKind: snapshot['sourceKind'] as MarketplaceListingPublication['sourceKind'],
  status: snapshot['status'] as MarketplaceListingPublication['status'],
  updatedAt: dateFromSnapshot(snapshot['updatedAt']),
});

const requestPublicationFromSnapshot = (snapshot: Record<string, unknown>): MarketplaceRequestPublication => ({
  id: String(snapshot['id']),
  moderationStatus: snapshot['moderationStatus'] as MarketplaceRequestPublication['moderationStatus'],
  ...(snapshot['publishedAt'] ? { publishedAt: dateFromSnapshot(snapshot['publishedAt']) } : {}),
  requestId: String(snapshot['requestId']),
  revision: Number(snapshot['revision']),
  status: snapshot['status'] as MarketplaceRequestPublication['status'],
  updatedAt: dateFromSnapshot(snapshot['updatedAt']),
});

const sellerProfileItem = (entity: MarketplacePublicSellerRevisionEntity): MarketplaceSellerProfileModerationItem => ({
  contentFingerprint: entity.contentFingerprint,
  contentRevision: entity.contentRevision,
  ...(entity.description ? { description: entity.description } : {}),
  displayName: entity.displayName,
  moderationStatus: entity.moderationStatus,
  region: entity.region,
  sellerPublicId: entity.sellerPublicId,
  submittedAt: entity.createdAt,
});

const sellerProfileSnapshot = (value: MarketplaceSellerProfileModerationItem): Record<string, unknown> => ({
  ...value,
  submittedAt: value.submittedAt.toISOString(),
});

const sellerProfileFromSnapshot = (snapshot: Record<string, unknown>): MarketplaceSellerProfileModerationItem => {
  const description = snapshot['description'];
  return {
    contentFingerprint: String(snapshot['contentFingerprint']),
    contentRevision: Number(snapshot['contentRevision']),
    ...(typeof description === 'string' && description ? { description } : {}),
    displayName: String(snapshot['displayName']),
    moderationStatus: snapshot['moderationStatus'] as MarketplaceModerationStatus,
    region: String(snapshot['region']),
    sellerPublicId: String(snapshot['sellerPublicId']),
    submittedAt: dateFromSnapshot(snapshot['submittedAt']),
  };
};

const canonicalFingerprint = (value: Record<string, unknown>): string =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');

const normalizeText = (value: string): string => value.normalize('NFC').trim();
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

const containsPublicContact = (value: string | null | undefined): boolean => {
  if (!value) {
    return false;
  }
  const normalized = value.normalize('NFKC').toLocaleLowerCase('en');
  if (
    normalized.includes('http://') ||
    normalized.includes('https://') ||
    normalized.includes('www.') ||
    normalized.includes('@')
  ) {
    return true;
  }
  return [...normalized].filter((character) => character >= '0' && character <= '9').length >= 9;
};

const requestContainsPrivateContact = (request: BuyerRequestEntity): boolean =>
  [request.title, request.product, request.volume, request.region, request.requirements].some(containsPublicContact);

const sectionForProduct = (category: ProductCategory, requested: MarketplaceListingSection): boolean => {
  if (category === 'equipment' || category === 'irrigation') {
    return requested === 'equipment';
  }
  if (category === 'seed' || category === 'fertilizer' || category === 'pesticide') {
    return requested === 'seeds';
  }
  return requested === 'equipment' || requested === 'seeds';
};

const listingOrder = (sort: MarketplaceCatalogSort): string => {
  if (sort === 'price_asc') {
    return 'price_uzs asc, publication.id asc';
  }
  if (sort === 'price_desc') {
    return 'price_uzs desc, publication.id asc';
  }
  return 'promoted desc, publication.published_at desc, publication.id asc';
};

const listingPriceExpression = 'coalesce(product.price_uzs, produce.price_per_kg_uzs)';
const listingQuantityExpression = 'coalesce(product.stock_quantity, produce.available_quantity_kg)';
const listingPromotionExpression = `exists (
  select 1
    from marketplace_listing_promotions promotion
   where promotion.listing_publication_id = publication.id
     and promotion.tenant_id = publication.tenant_id
     and promotion.seller_public_id = publication.seller_public_id
     and promotion.seller_partner_id = seller.partner_id
     and promotion.status in ('scheduled', 'active')
     and promotion.starts_at <= now()
     and promotion.ends_at > now()
)`;

const escapeLike = (value: string): string =>
  value.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_');

const listingCursorFromRow = (
  row: PublishedListingRow,
  sort: MarketplaceCatalogSort,
): MarketplacePublicCatalogCursor => {
  if (sort === 'newest') {
    return {
      id: row.public_id,
      kind: 'catalog',
      promoted: row.promoted,
      publishedAt: isoTimestamp(row.published_at),
      sort,
    };
  }
  return {
    id: row.public_id,
    kind: 'catalog',
    priceUzs: Number(row.price_uzs),
    sort,
  };
};

@Injectable()
export class PostgresMarketplacePublicRepository implements MarketplacePublicRepository {
  constructor(@Inject(EntityManager) private readonly em: EntityManager) {}

  async isDemoCatalogEnabled(): Promise<boolean> {
    const rows = await this.executeRows<{ enabled: boolean; value: unknown }>(
      `select enabled, value from feature_flags where tenant_id = ? and key = 'marketplace.demo' limit 1`,
      [DefaultFeatureFlagTenantId],
    );
    return rows[0]?.enabled === true && rows[0].value === true;
  }

  async findPublishedListing(publicId: string): Promise<MarketplacePublishedListingRecord | undefined> {
    const rows = await this.readListings({ limit: 1, sort: 'newest' }, undefined, publicId);
    return rows[0] ? listingFromRow(rows[0]) : undefined;
  }

  async findPublishedSeller(publicId: string): Promise<MarketplacePublishedSellerRecord | undefined> {
    const rows = await this.executeRows<PublishedSellerRow>(
      `
        select seller.id as public_id, revision.display_name, revision.description, revision.region
          from marketplace_public_sellers seller
          join lateral (
            select candidate.display_name, candidate.description, candidate.region
              from marketplace_public_seller_revisions candidate
             where candidate.seller_public_id = seller.id
               and candidate.tenant_id = seller.tenant_id
               and candidate.moderation_status = 'approved'
             order by candidate.content_revision desc
             limit 1
          ) revision on true
          join agritech_partners partner
            on partner.id = seller.partner_id
           and partner.tenant_id = seller.tenant_id
           and partner.owner_user_id = seller.owner_user_id
          join marketplace_verifications verification
            on verification.tenant_id = seller.tenant_id
           and verification.user_id = seller.owner_user_id
           and verification.status = 'verified'
           and verification.role in (${marketplaceSellerRolesSql})
         where seller.id = ? and seller.status = 'published'
           and partner.status = 'approved' and partner.kind = 'supplier'
         limit 1
      `,
      [publicId],
    );
    return rows[0] ? sellerFromRow(rows[0]) : undefined;
  }

  async listPublishedListings(
    input: MarketplacePublicCatalogQuery,
  ): Promise<MarketplacePublicRepositoryPage<MarketplacePublishedListingRecord, MarketplacePublicCatalogCursor>> {
    return this.listingPage(await this.readListings(input), input);
  }

  async listPublishedSellerListings(
    sellerPublicId: string,
    input: MarketplacePublicCatalogQuery,
  ): Promise<MarketplacePublicRepositoryPage<MarketplacePublishedListingRecord, MarketplacePublicCatalogCursor>> {
    return this.listingPage(await this.readListings(input, sellerPublicId), input);
  }

  async listPublishedRequests(
    input: MarketplacePublicRequestQuery,
  ): Promise<MarketplacePublicRepositoryPage<MarketplacePublishedRequestRecord, MarketplacePublicRequestCursor>> {
    const where = [
      `publication.status = 'published'`,
      `publication.moderation_status = 'approved'`,
      `request.status in ('open', 'offering')`,
      `partner.status = 'approved'`,
      `(publication.public_deadline is null or publication.public_deadline >= current_date)`,
    ];
    const parameters: unknown[] = [];
    if (input.query) {
      const pattern = `%${escapeLike(input.query)}%`;
      where.push(
        `(publication.public_title ilike ? escape '\\' or coalesce(publication.public_product, '') ilike ? escape '\\'
          or publication.buyer_display_name ilike ? escape '\\')`,
      );
      parameters.push(pattern, pattern, pattern);
    }
    if (input.region) {
      where.push(`publication.public_region = ?`);
      parameters.push(input.region);
    }
    if (input.cursor) {
      where.push(`(publication.published_at < ? or (publication.published_at = ? and publication.id > ?))`);
      parameters.push(input.cursor.publishedAt, input.cursor.publishedAt, input.cursor.id);
    }
    parameters.push(input.limit + 1);
    const rows = await this.executeRows<PublishedRequestRow>(
      `
        select publication.id as public_id, publication.public_title as title,
               publication.public_product as product, publication.public_volume as volume,
               publication.public_region as region, publication.public_deadline as deadline,
               publication.public_budget_uzs as budget_uzs,
               publication.public_requirements as requirements,
               publication.buyer_display_name, publication.published_at,
               publication.created_at, publication.updated_at
          from marketplace_request_publications publication
          join marketplace_requests request
            on request.id = publication.request_id
           and request.tenant_id = publication.tenant_id
           and request.buyer_user_id = publication.buyer_user_id
          join agritech_partners partner
            on partner.id = publication.buyer_partner_id
           and partner.tenant_id = publication.tenant_id
           and partner.owner_user_id = publication.buyer_user_id
           and partner.kind = 'buyer'
          join marketplace_request_organization_bindings binding
            on binding.request_id = request.id
           and binding.tenant_id = request.tenant_id
           and binding.buyer_user_id = request.buyer_user_id
           and binding.buyer_partner_id = publication.buyer_partner_id
          join marketplace_verifications verification
            on verification.tenant_id = request.tenant_id
           and verification.user_id = request.buyer_user_id
           and verification.status = 'verified'
           and verification.role in (${marketplaceBuyerRolesSql})
         where ${where.join(' and ')}
         order by publication.published_at desc, publication.id asc
         limit ?
      `,
      parameters,
    );
    const hasNext = rows.length > input.limit;
    const items = rows.slice(0, input.limit);
    const last = items.at(-1);
    return {
      items: items.map(requestFromRow),
      ...(hasNext && last
        ? {
            nextCursor: {
              id: last.public_id,
              kind: 'request',
              publishedAt: isoTimestamp(last.published_at),
            },
          }
        : {}),
    };
  }

  async listPublishedSuggestions(query: string, limit: number): Promise<MarketplacePublishedSuggestionRecord[]> {
    const [listings, sellers, requests] = await Promise.all([
      this.listPublishedListings({ limit, query, sort: 'newest' }),
      this.executeRows<PublishedSellerRow>(
        `
          select seller.id as public_id, revision.display_name, revision.description, revision.region
            from marketplace_public_sellers seller
            join lateral (
              select candidate.display_name, candidate.description, candidate.region
                from marketplace_public_seller_revisions candidate
               where candidate.seller_public_id = seller.id
                 and candidate.tenant_id = seller.tenant_id
                 and candidate.moderation_status = 'approved'
               order by candidate.content_revision desc
               limit 1
            ) revision on true
            join agritech_partners partner
              on partner.id = seller.partner_id
             and partner.tenant_id = seller.tenant_id
             and partner.owner_user_id = seller.owner_user_id
            join marketplace_verifications verification
              on verification.tenant_id = seller.tenant_id
             and verification.user_id = seller.owner_user_id
             and verification.status = 'verified'
             and verification.role in (${marketplaceSellerRolesSql})
           where seller.status = 'published' and partner.status = 'approved' and partner.kind = 'supplier'
             and revision.display_name ilike ? escape '\\'
           order by revision.display_name asc, seller.id asc
           limit ?
        `,
        [`%${escapeLike(query)}%`, limit],
      ),
      this.listPublishedRequests({ limit, query }),
    ]);
    return [
      ...listings.items.map((item) => ({
        id: item.publicId,
        kind: 'listing' as const,
        label: item.title,
        section: item.section,
      })),
      ...sellers.map((item) => ({
        id: item.public_id,
        kind: 'seller' as const,
        label: item.display_name,
      })),
      ...requests.items.map((item) => ({
        id: item.publicId,
        kind: 'request' as const,
        label: item.title,
      })),
    ].slice(0, limit);
  }

  async listPendingModeration(tenantId: string): Promise<MarketplacePublicModerationQueue> {
    const [listings, requests, sellerProfiles] = await Promise.all([
      this.em.find(
        MarketplaceListingPublicationEntity,
        { moderationStatus: 'pending', tenantId },
        { orderBy: { createdAt: 'ASC' } },
      ),
      this.em.find(
        MarketplaceRequestPublicationEntity,
        { moderationStatus: 'pending', tenantId },
        { orderBy: { createdAt: 'ASC' } },
      ),
      this.em.find(
        MarketplacePublicSellerRevisionEntity,
        { moderationStatus: 'pending', tenantId },
        { orderBy: { createdAt: 'ASC' } },
      ),
    ]);
    const listingSellerProfiles = await this.em.find(MarketplacePublicSellerRevisionEntity, {
      id: { $in: listings.map((publication) => publication.sellerRevisionId) },
      tenantId,
    });
    const sellerByRevisionId = new Map(listingSellerProfiles.map((profile) => [profile.id, profile]));
    return {
      sellerProfiles: sellerProfiles.map(sellerProfileItem),
      listings: listings.flatMap((publication) => {
        const sellerProfile = sellerByRevisionId.get(publication.sellerRevisionId);
        if (!sellerProfile) {
          return [];
        }
        return [
          {
            content: {
              ...(publication.publicCategory ? { category: publication.publicCategory } : {}),
              ...(publication.publicCrop ? { crop: publication.publicCrop } : {}),
              ...(publication.publicDescription ? { description: publication.publicDescription } : {}),
              ...(publication.publicGrade ? { grade: publication.publicGrade } : {}),
              images: [...publication.publicImages],
              region: publication.publicRegion,
              title: publication.publicTitle,
              ...(publication.publicTitleRu ? { titleRu: publication.publicTitleRu } : {}),
              ...(publication.publicTitleUz ? { titleUz: publication.publicTitleUz } : {}),
              ...(publication.publicTitleUzCyrl ? { titleUzCyrl: publication.publicTitleUzCyrl } : {}),
              unit: publication.publicUnit,
            },
            publication: listingPublication(publication),
            seller: {
              contentFingerprint: sellerProfile.contentFingerprint,
              contentRevision: sellerProfile.contentRevision,
              ...(sellerProfile.description ? { description: sellerProfile.description } : {}),
              displayName: sellerProfile.displayName,
              id: sellerProfile.sellerPublicId,
              moderationStatus: sellerProfile.moderationStatus,
              region: sellerProfile.region,
            },
          },
        ];
      }),
      requests: requests.map((publication) => ({
        content: {
          ...(publication.publicBudgetUzs === null ? {} : { budgetUzs: Number(publication.publicBudgetUzs) }),
          buyerDisplayName: publication.buyerDisplayName,
          ...(publication.publicDeadline ? { deadline: publication.publicDeadline } : {}),
          ...(publication.publicProduct ? { product: publication.publicProduct } : {}),
          region: publication.publicRegion,
          ...(publication.publicRequirements ? { requirements: publication.publicRequirements } : {}),
          title: publication.publicTitle,
          ...(publication.publicVolume ? { volume: publication.publicVolume } : {}),
        },
        publication: requestPublication(publication),
      })),
    };
  }

  reviewSellerProfile(
    tenantId: string,
    sellerPublicId: string,
    reviewerUserId: string,
    input: ReviewMarketplaceSellerProfileInput,
  ): Promise<OperationResult<MarketplaceSellerProfileModerationItem>> {
    return this.em.transactional(async (em) => {
      await this.lockModerationCommand(em, tenantId, reviewerUserId, input.idempotencyKey);
      const requestFingerprint = canonicalFingerprint({
        decision: input.decision,
        expectedContentFingerprint: input.expectedContentFingerprint,
        expectedContentRevision: input.expectedContentRevision,
        publicationKind: 'seller_profile',
        sellerPublicId,
      });
      const replay = await em.findOne(MarketplacePublicationModerationOperationEntity, {
        idempotencyKey: input.idempotencyKey,
        reviewerUserId,
        tenantId,
      });
      if (replay) {
        return replay.requestFingerprint === requestFingerprint
          ? { status: 'ok', value: sellerProfileFromSnapshot(replay.resultSnapshot) }
          : { status: 'conflict', field: 'idempotencyKey' };
      }
      const profile = await em.findOne(
        MarketplacePublicSellerRevisionEntity,
        {
          contentFingerprint: input.expectedContentFingerprint,
          contentRevision: input.expectedContentRevision,
          moderationStatus: 'pending',
          sellerPublicId,
          tenantId,
        },
        { lockMode: LockMode.PESSIMISTIC_WRITE },
      );
      if (!profile) {
        return { status: 'conflict', field: 'contentRevision' };
      }
      const moderatedAt = new Date();
      profile.moderationStatus = input.decision;
      profile.moderatedAt = moderatedAt;
      profile.moderatedBy = reviewerUserId;
      profile.updatedAt = moderatedAt;
      if (input.decision === 'rejected') {
        const pendingListings = await em.find(
          MarketplaceListingPublicationEntity,
          { moderationStatus: 'pending', sellerRevisionId: profile.id, tenantId },
          { lockMode: LockMode.PESSIMISTIC_WRITE },
        );
        for (const publication of pendingListings) {
          publication.moderationStatus = 'rejected';
          publication.moderatedAt = moderatedAt;
          publication.moderatedBy = reviewerUserId;
          publication.revision += 1;
          publication.status = 'rejected';
          publication.updatedAt = moderatedAt;
        }
      }
      const value = sellerProfileItem(profile);
      const operation = new MarketplacePublicationModerationOperationEntity();
      Object.assign(operation, {
        idempotencyKey: input.idempotencyKey,
        publicationId: profile.id,
        publicationKind: 'seller_profile' as const,
        requestFingerprint,
        resultSnapshot: sellerProfileSnapshot(value),
        reviewerUserId,
        tenantId,
      });
      em.persist(operation);
      await em.flush();
      return { status: 'ok', value };
    });
  }

  async listOwnedPublications(owner: AgriTechOwner, limit: number): Promise<MarketplaceOwnedPublications> {
    const [listings, requests] = await Promise.all([
      this.em.find(
        MarketplaceListingPublicationEntity,
        { ownerUserId: owner.userId, tenantId: owner.tenantId },
        { limit, orderBy: { updatedAt: 'DESC', id: 'DESC' } },
      ),
      this.em.find(
        MarketplaceRequestPublicationEntity,
        { buyerUserId: owner.userId, tenantId: owner.tenantId },
        { limit, orderBy: { updatedAt: 'DESC', id: 'DESC' } },
      ),
    ]);
    return {
      listings: listings.map(ownedListingPublication),
      requests: requests.map(ownedRequestPublication),
    };
  }

  reviewListingPublication(
    tenantId: string,
    publicationId: string,
    reviewerUserId: string,
    input: ReviewMarketplaceListingPublicationInput,
  ): Promise<OperationResult<MarketplaceListingPublication>> {
    return this.em.transactional(async (em) => {
      await this.lockModerationCommand(em, tenantId, reviewerUserId, input.idempotencyKey);
      const requestFingerprint = canonicalFingerprint({
        decision: input.decision,
        expectedRevision: input.expectedRevision,
        expectedSellerContentFingerprint: input.expectedSellerContentFingerprint,
        expectedSellerContentRevision: input.expectedSellerContentRevision,
        publicationId,
        publicationKind: 'listing',
      });
      const replay = await em.findOne(MarketplacePublicationModerationOperationEntity, {
        idempotencyKey: input.idempotencyKey,
        reviewerUserId,
        tenantId,
      });
      if (replay) {
        return replay.requestFingerprint === requestFingerprint
          ? { status: 'ok', value: listingPublicationFromSnapshot(replay.resultSnapshot) }
          : { status: 'conflict', field: 'idempotencyKey' };
      }
      const publication = await em.findOne(
        MarketplaceListingPublicationEntity,
        { id: publicationId, tenantId },
        { lockMode: LockMode.PESSIMISTIC_WRITE },
      );
      if (!publication) {
        return { status: 'not_found' };
      }
      if (publication.moderationStatus !== 'pending' || publication.revision !== input.expectedRevision) {
        return { status: 'conflict', field: 'revision' };
      }
      const sellerProfile = await em.findOne(
        MarketplacePublicSellerRevisionEntity,
        { id: publication.sellerRevisionId, sellerPublicId: publication.sellerPublicId, tenantId },
        { lockMode: LockMode.PESSIMISTIC_READ },
      );
      if (
        !sellerProfile ||
        sellerProfile.contentFingerprint !== input.expectedSellerContentFingerprint ||
        sellerProfile.contentRevision !== input.expectedSellerContentRevision ||
        publication.sellerContentRevision !== input.expectedSellerContentRevision
      ) {
        return { status: 'conflict', field: 'sellerProfile' };
      }
      if (input.decision === 'approved' && sellerProfile.moderationStatus !== 'approved') {
        return { status: 'conflict', field: 'sellerProfile' };
      }
      const moderatedAt = new Date();
      publication.moderationStatus = input.decision;
      publication.moderatedAt = moderatedAt;
      publication.moderatedBy = reviewerUserId;
      publication.revision += 1;
      publication.updatedAt = moderatedAt;
      if (input.decision === 'rejected') {
        publication.status = 'rejected';
      }
      const value = listingPublication(publication);
      const operation = new MarketplacePublicationModerationOperationEntity();
      Object.assign(operation, {
        idempotencyKey: input.idempotencyKey,
        publicationId,
        publicationKind: 'listing' as const,
        requestFingerprint,
        resultSnapshot: publicationSnapshot(value),
        reviewerUserId,
        tenantId,
      });
      em.persist(operation);
      await em.flush();
      return { status: 'ok', value };
    });
  }

  reviewRequestPublication(
    tenantId: string,
    publicationId: string,
    reviewerUserId: string,
    input: ReviewMarketplaceRequestPublicationInput,
  ): Promise<OperationResult<MarketplaceRequestPublication>> {
    return this.em.transactional(async (em) => {
      await this.lockModerationCommand(em, tenantId, reviewerUserId, input.idempotencyKey);
      const requestFingerprint = canonicalFingerprint({
        decision: input.decision,
        expectedRevision: input.expectedRevision,
        publicationId,
        publicationKind: 'request',
      });
      const replay = await em.findOne(MarketplacePublicationModerationOperationEntity, {
        idempotencyKey: input.idempotencyKey,
        reviewerUserId,
        tenantId,
      });
      if (replay) {
        return replay.requestFingerprint === requestFingerprint
          ? { status: 'ok', value: requestPublicationFromSnapshot(replay.resultSnapshot) }
          : { status: 'conflict', field: 'idempotencyKey' };
      }
      const publication = await em.findOne(
        MarketplaceRequestPublicationEntity,
        { id: publicationId, tenantId },
        { lockMode: LockMode.PESSIMISTIC_WRITE },
      );
      if (!publication) {
        return { status: 'not_found' };
      }
      if (publication.moderationStatus !== 'pending' || publication.revision !== input.expectedRevision) {
        return { status: 'conflict', field: 'revision' };
      }
      const moderatedAt = new Date();
      publication.moderationStatus = input.decision;
      publication.moderatedAt = moderatedAt;
      publication.moderatedBy = reviewerUserId;
      publication.revision += 1;
      publication.updatedAt = moderatedAt;
      if (input.decision === 'rejected') {
        publication.status = 'rejected';
      }
      const value = requestPublication(publication);
      const operation = new MarketplacePublicationModerationOperationEntity();
      Object.assign(operation, {
        idempotencyKey: input.idempotencyKey,
        publicationId,
        publicationKind: 'request' as const,
        requestFingerprint,
        resultSnapshot: publicationSnapshot(value),
        reviewerUserId,
        tenantId,
      });
      em.persist(operation);
      await em.flush();
      return { status: 'ok', value };
    });
  }

  publishListing(
    owner: AgriTechOwner,
    idempotencyKey: string,
    input: PublishMarketplaceListingInput,
  ): Promise<OperationResult<MarketplaceListingPublication>> {
    const normalizedInput = {
      section: input.section,
      sellerPartnerId: input.sellerPartnerId,
      sourceId: input.sourceId,
      sourceKind: input.sourceKind,
    };
    const fingerprint = canonicalFingerprint(normalizedInput);
    return this.em.transactional(async (em) => {
      await this.lockCommand(em, owner, idempotencyKey);
      const replay = await em.findOne(MarketplaceListingPublicationEntity, {
        idempotencyKey,
        ownerUserId: owner.userId,
        tenantId: owner.tenantId,
      });
      if (replay) {
        return replay.requestFingerprint === fingerprint
          ? { status: 'ok', value: listingPublication(replay) }
          : { status: 'conflict', field: 'idempotencyKey' };
      }
      await this.lockSource(em, input.sourceKind, input.sourceId);
      const source = await this.findPublishingSource(em, owner, input);
      if (source.status !== 'ok') {
        return source;
      }
      const { partner, produce, product } = source.value;
      const content = {
        category: product?.category ?? undefined,
        crop: produce?.crop ?? undefined,
        description: product?.description ?? undefined,
        grade: produce?.grade ?? undefined,
        // The snapshot inherits the locked source's own photographs. A produce
        // listing carries none, so a harvest publishes assetless and the client
        // renders its category illustration instead.
        images: imagesFrom(product?.images).slice(0, maxPublicImages),
        region: product?.region ?? produce?.region ?? '',
        section: input.section,
        sourceKind: input.sourceKind,
        title: product?.name ?? produce?.crop ?? '',
        titleRu: product?.nameRu ?? undefined,
        titleUz: product?.nameUz ?? undefined,
        titleUzCyrl: product?.nameUzCyrl ?? undefined,
        unit: product?.unit ?? 'kg',
      };

      const existingSource = await em.findOne(MarketplaceListingPublicationEntity, {
        ...(product ? { productId: product.id } : { produceListingId: produce?.id }),
      });
      if (existingSource) {
        return { status: 'conflict', field: 'sourceId' };
      }

      const sellerProfile = await this.ensurePublicSeller(em, owner, partner);
      if (!sellerProfile) {
        return { status: 'invalid_state', field: 'sellerProfile' };
      }
      const { revision: sellerRevision, seller } = sellerProfile;

      const publication = new MarketplaceListingPublicationEntity();
      Object.assign(publication, {
        idempotencyKey,
        ownerUserId: owner.userId,
        productId: product?.id ?? null,
        produceListingId: produce?.id ?? null,
        contentFingerprint: canonicalFingerprint({
          ...content,
          sellerContentFingerprint: sellerRevision.contentFingerprint,
          sellerContentRevision: sellerRevision.contentRevision,
        }),
        publicDescription: content.description ?? null,
        publicCategory: content.category ?? null,
        publicCrop: content.crop ?? null,
        publicGrade: content.grade ?? null,
        publicImages: content.images,
        publicRegion: content.region,
        publicTitle: content.title,
        publicTitleRu: content.titleRu ?? null,
        publicTitleUz: content.titleUz ?? null,
        publicTitleUzCyrl: content.titleUzCyrl ?? null,
        publicUnit: content.unit,
        requestFingerprint: fingerprint,
        section: input.section,
        sellerContentRevision: sellerRevision.contentRevision,
        sellerPublicId: seller.id,
        sellerRevisionId: sellerRevision.id,
        sourceKind: input.sourceKind,
        tenantId: owner.tenantId,
      });
      em.persist(publication);
      await em.flush();
      return { status: 'ok', value: listingPublication(publication) };
    });
  }

  publishRequest(
    owner: AgriTechOwner,
    idempotencyKey: string,
    input: PublishMarketplaceRequestInput,
  ): Promise<OperationResult<MarketplaceRequestPublication>> {
    const normalizedInput = {
      buyerPartnerId: input.buyerPartnerId,
      requestId: input.requestId,
    };
    const fingerprint = canonicalFingerprint(normalizedInput);
    return this.em.transactional(async (em) => {
      await this.lockCommand(em, owner, idempotencyKey);
      const replay = await em.findOne(MarketplaceRequestPublicationEntity, {
        buyerUserId: owner.userId,
        idempotencyKey,
        tenantId: owner.tenantId,
      });
      if (replay) {
        return replay.requestFingerprint === fingerprint
          ? { status: 'ok', value: requestPublication(replay) }
          : { status: 'conflict', field: 'idempotencyKey' };
      }
      if (!(await this.findVerifiedActor(em, owner, ['buyer', 'farmer']))) {
        return { status: 'forbidden' };
      }
      await this.lockSource(em, 'request', input.requestId);
      const request = await em.findOne(
        BuyerRequestEntity,
        {
          buyerUserId: owner.userId,
          id: input.requestId,
          status: { $in: ['open', 'offering'] },
          tenantId: owner.tenantId,
        },
        { lockMode: LockMode.PESSIMISTIC_READ },
      );
      if (!request) {
        return { status: 'not_found' };
      }
      const binding = await em.findOne(
        MarketplaceRequestOrganizationBindingEntity,
        {
          buyerPartnerId: input.buyerPartnerId,
          buyerUserId: owner.userId,
          requestId: request.id,
          tenantId: owner.tenantId,
        },
        { lockMode: LockMode.PESSIMISTIC_READ },
      );
      if (!binding) {
        return { status: 'not_found' };
      }
      const partner = await this.findExactApprovedPartner(em, owner, input.buyerPartnerId, 'buyer');
      if (!partner) {
        return { status: 'partner_unapproved' };
      }
      if (requestContainsPrivateContact(request)) {
        return { status: 'invalid_state', field: 'publicContent' };
      }
      if (await em.findOne(MarketplaceRequestPublicationEntity, { requestId: request.id })) {
        return { status: 'conflict', field: 'requestId' };
      }
      const publication = new MarketplaceRequestPublicationEntity();
      const content = {
        budgetUzs: request.budgetUzs ?? undefined,
        deadline: request.deadline ?? undefined,
        product: request.product ?? undefined,
        region: request.region,
        requirements: request.requirements ?? undefined,
        title: request.title,
        volume: request.volume ?? undefined,
      };
      Object.assign(publication, {
        buyerDisplayName: normalizeText(partner.legalName),
        buyerPartnerId: partner.id,
        buyerUserId: owner.userId,
        contentFingerprint: canonicalFingerprint(content),
        idempotencyKey,
        requestFingerprint: fingerprint,
        requestId: request.id,
        publicBudgetUzs: request.budgetUzs,
        publicDeadline: request.deadline,
        publicProduct: request.product,
        publicRegion: request.region,
        publicRequirements: request.requirements,
        publicTitle: request.title,
        publicVolume: request.volume,
        tenantId: owner.tenantId,
      });
      em.persist(publication);
      await em.flush();
      return { status: 'ok', value: requestPublication(publication) };
    });
  }

  private async readListings(
    input: MarketplacePublicCatalogQuery,
    sellerPublicId?: string,
    publicId?: string,
  ): Promise<PublishedListingRow[]> {
    const where = [
      `publication.status = 'published'`,
      `publication.moderation_status = 'approved'`,
      `seller.status = 'published'`,
      `seller_revision.moderation_status = 'approved'`,
      `partner.status = 'approved'`,
      `partner.kind = 'supplier'`,
      `((publication.product_id is not null and product.status = 'active' and product.stock_quantity > 0)
        or (publication.produce_listing_id is not null and produce_binding.produce_listing_id is not null
          and produce.status = 'active' and farmer.status = 'active'
          and produce.available_quantity_kg > 0 and produce.available_from <= now() and produce.available_until >= now()))`,
    ];
    const parameters: unknown[] = [];
    if (sellerPublicId) {
      where.push(`seller.id = ?`);
      parameters.push(sellerPublicId);
    }
    if (publicId) {
      where.push(`publication.id = ?`);
      parameters.push(publicId);
    }
    if (input.section) {
      where.push(`publication.section = ?`);
      parameters.push(input.section);
    }
    if (input.region) {
      where.push(`publication.public_region = ?`);
      parameters.push(input.region);
    }
    if (input.category) {
      where.push(`publication.public_category = ?`);
      parameters.push(input.category);
    }
    if (input.crop) {
      where.push(`publication.public_crop = ?`);
      parameters.push(input.crop);
    }
    if (input.minPriceUzs !== undefined) {
      where.push(`${listingPriceExpression} >= ?`);
      parameters.push(input.minPriceUzs);
    }
    if (input.maxPriceUzs !== undefined) {
      where.push(`${listingPriceExpression} <= ?`);
      parameters.push(input.maxPriceUzs);
    }
    if (input.minAvailableQuantity !== undefined) {
      where.push(`${listingQuantityExpression} >= ?`);
      parameters.push(input.minAvailableQuantity);
    }
    if (input.sampleAvailable !== undefined) {
      where.push(`coalesce(product.sample_available, produce.sample_available) = ?`);
      parameters.push(input.sampleAvailable);
    }
    if (input.query) {
      const pattern = `%${escapeLike(input.query)}%`;
      where.push(
        `(publication.public_title ilike ? escape '\\' or coalesce(publication.public_title_ru, '') ilike ? escape '\\'
          or coalesce(publication.public_title_uz, '') ilike ? escape '\\'
          or coalesce(publication.public_title_uz_cyrl, '') ilike ? escape '\\'
          or seller_revision.display_name ilike ? escape '\\')`,
      );
      parameters.push(pattern, pattern, pattern, pattern, pattern);
    }
    if (input.cursor?.sort === 'newest') {
      where.push(
        `((? = true and ${listingPromotionExpression} = false)
          or (${listingPromotionExpression} = ? and (publication.published_at < ?
            or (publication.published_at = ? and publication.id > ?))))`,
      );
      parameters.push(
        input.cursor.promoted,
        input.cursor.promoted,
        input.cursor.publishedAt,
        input.cursor.publishedAt,
        input.cursor.id,
      );
    }
    if (input.cursor?.sort === 'price_asc') {
      where.push(`(${listingPriceExpression} > ? or (${listingPriceExpression} = ? and publication.id > ?))`);
      parameters.push(input.cursor.priceUzs, input.cursor.priceUzs, input.cursor.id);
    }
    if (input.cursor?.sort === 'price_desc') {
      where.push(`(${listingPriceExpression} < ? or (${listingPriceExpression} = ? and publication.id > ?))`);
      parameters.push(input.cursor.priceUzs, input.cursor.priceUzs, input.cursor.id);
    }
    parameters.push(input.limit + 1);
    return this.executeRows<PublishedListingRow>(
      `
        select publication.id as public_id, publication.source_kind, publication.section,
               publication.public_title as title, publication.public_title_ru as title_ru,
               publication.public_title_uz as title_uz,
               publication.public_title_uz_cyrl as title_uz_cyrl,
               publication.public_description as description,
               coalesce(product.price_uzs, produce.price_per_kg_uzs) as price_uzs,
               publication.public_unit as unit,
               coalesce(product.stock_quantity, produce.available_quantity_kg) as available_quantity,
               coalesce(product.sample_available, produce.sample_available) as sample_available,
               publication.public_region as region,
               publication.public_images as images,
               ${listingPromotionExpression} as promoted,
               publication.public_category as product_category,
               publication.public_crop as produce_crop, publication.public_grade as produce_grade,
               coalesce(rating.review_count, 0) as review_count,
               coalesce(rating.rating_sum, 0) as rating_sum,
               publication.published_at, publication.updated_at,
               seller.id as seller_public_id, seller_revision.display_name as seller_display_name,
               seller_revision.region as seller_region
          from marketplace_listing_publications publication
          join marketplace_public_sellers seller
            on seller.id = publication.seller_public_id
           and seller.tenant_id = publication.tenant_id
           and seller.owner_user_id = publication.owner_user_id
          join marketplace_public_seller_revisions seller_revision
            on seller_revision.id = publication.seller_revision_id
           and seller_revision.seller_public_id = seller.id
           and seller_revision.tenant_id = seller.tenant_id
           and seller_revision.content_revision = publication.seller_content_revision
          join agritech_partners partner
            on partner.id = seller.partner_id
           and partner.tenant_id = seller.tenant_id
           and partner.owner_user_id = seller.owner_user_id
          join marketplace_verifications verification
            on verification.tenant_id = seller.tenant_id
           and verification.user_id = seller.owner_user_id
           and verification.status = 'verified'
           and verification.role in (${marketplaceSellerRolesSql})
          left join products product
            on product.id = publication.product_id
           and product.tenant_id = publication.tenant_id
           and product.supplier_id = seller.partner_id::text
          left join produce_listings produce
            on produce.id = publication.produce_listing_id
           and produce.tenant_id = publication.tenant_id
          left join marketplace_produce_organization_bindings produce_binding
            on produce_binding.produce_listing_id = produce.id
           and produce_binding.tenant_id = publication.tenant_id
           and produce_binding.owner_user_id = publication.owner_user_id
           and produce_binding.supplier_partner_id = seller.partner_id
          left join farmers farmer
            on farmer.id = produce.farmer_id
           and farmer.tenant_id = publication.tenant_id
           and farmer.user_id = seller.owner_user_id
          left join marketplace_review_aggregates rating
            on rating.listing_publication_id = publication.id
         where ${where.join(' and ')}
         order by ${listingOrder(input.sort)}
         limit ?
      `,
      parameters,
    );
  }

  private listingPage(
    rows: PublishedListingRow[],
    input: MarketplacePublicCatalogQuery,
  ): MarketplacePublicRepositoryPage<MarketplacePublishedListingRecord, MarketplacePublicCatalogCursor> {
    const hasNext = rows.length > input.limit;
    const items = rows.slice(0, input.limit);
    const last = items.at(-1);
    return {
      items: items.map(listingFromRow),
      ...(hasNext && last ? { nextCursor: listingCursorFromRow(last, input.sort) } : {}),
    };
  }

  private executeRows<T>(sql: string, parameters: unknown[]): Promise<T[]> {
    return this.em
      .getConnection()
      .execute(sql, parameters)
      .then((rows) => rows as unknown as T[]);
  }

  private async findVerifiedActor(
    em: EntityManager,
    owner: AgriTechOwner,
    roles: Array<'buyer' | 'farmer' | 'seller'>,
  ): Promise<boolean> {
    const verification = await em.findOne(
      VerificationEntity,
      {
        role: { $in: roles },
        status: 'verified',
        tenantId: owner.tenantId,
        userId: owner.userId,
      },
      { lockMode: LockMode.PESSIMISTIC_READ },
    );
    return Boolean(verification);
  }

  private findExactApprovedPartner(
    em: EntityManager,
    owner: AgriTechOwner,
    partnerId: string,
    kind: 'buyer' | 'supplier',
  ): Promise<AgriTechPartnerEntity | null> {
    return em.findOne(
      AgriTechPartnerEntity,
      {
        id: partnerId,
        kind,
        ownerUserId: owner.userId,
        status: 'approved',
        tenantId: owner.tenantId,
      },
      { lockMode: LockMode.PESSIMISTIC_WRITE },
    );
  }

  private async findPublishingSource(
    em: EntityManager,
    owner: AgriTechOwner,
    input: PublishMarketplaceListingInput,
  ): Promise<
    OperationResult<{ partner: AgriTechPartnerEntity; product?: ProductEntity; produce?: ProduceListingEntity }>
  > {
    if (!(await this.findVerifiedActor(em, owner, ['farmer', 'seller']))) {
      return { status: 'partner_unapproved' };
    }
    if (input.sourceKind === 'product') {
      const product = await em.findOne(
        ProductEntity,
        { id: input.sourceId, status: 'active', tenantId: owner.tenantId },
        { lockMode: LockMode.PESSIMISTIC_READ },
      );
      if (!product) {
        return { status: 'not_found' };
      }
      if (!sectionForProduct(product.category, input.section)) {
        return { status: 'invalid_state', field: 'section' };
      }
      if (!uuidPattern.test(product.supplierId) || product.supplierId !== input.sellerPartnerId) {
        return { status: 'not_found' };
      }
      const partner = await this.findExactApprovedPartner(em, owner, product.supplierId, 'supplier');
      return partner ? { status: 'ok', value: { partner, product } } : { status: 'not_found' };
    }
    if (input.section !== 'produce') {
      return { status: 'invalid_state', field: 'section' };
    }
    const farmer = await em.findOne(
      FarmerEntity,
      {
        status: 'active',
        tenantId: owner.tenantId,
        userId: owner.userId,
      },
      { lockMode: LockMode.PESSIMISTIC_READ },
    );
    if (!farmer) {
      return { status: 'forbidden' };
    }
    const produce = await em.findOne(
      ProduceListingEntity,
      { farmerId: farmer.id, id: input.sourceId, status: 'active', tenantId: owner.tenantId },
      { lockMode: LockMode.PESSIMISTIC_READ },
    );
    if (!produce) {
      return { status: 'not_found' };
    }
    const binding = await em.findOne(
      MarketplaceProduceOrganizationBindingEntity,
      {
        farmerId: farmer.id,
        ownerUserId: owner.userId,
        produceListingId: produce.id,
        supplierPartnerId: input.sellerPartnerId,
        tenantId: owner.tenantId,
      },
      { lockMode: LockMode.PESSIMISTIC_READ },
    );
    if (!binding) {
      return { status: 'not_found' };
    }
    const partner = await this.findExactApprovedPartner(em, owner, input.sellerPartnerId, 'supplier');
    return partner ? { status: 'ok', value: { partner, produce } } : { status: 'not_found' };
  }

  private async ensurePublicSeller(
    em: EntityManager,
    owner: AgriTechOwner,
    partner: AgriTechPartnerEntity,
  ): Promise<{ seller: MarketplacePublicSellerEntity; revision: MarketplacePublicSellerRevisionEntity } | undefined> {
    const content = {
      description: undefined,
      displayName: normalizeText(partner.legalName),
      region: partner.region,
    };
    const contentFingerprint = canonicalFingerprint(content);
    let seller = await em.findOne(
      MarketplacePublicSellerEntity,
      { partnerId: partner.id },
      { lockMode: LockMode.PESSIMISTIC_WRITE },
    );
    if (!seller) {
      seller = new MarketplacePublicSellerEntity();
      Object.assign(seller, {
        contentRevision: 1,
        ownerUserId: owner.userId,
        partnerKind: 'supplier' as const,
        partnerId: partner.id,
        tenantId: owner.tenantId,
      });
      em.persist(seller);
      seller.status = 'published';
    } else if (seller.status !== 'published') {
      return undefined;
    }
    const existingRevision = await em.findOne(MarketplacePublicSellerRevisionEntity, {
      contentFingerprint,
      sellerPublicId: seller.id,
      tenantId: owner.tenantId,
    });
    if (existingRevision) {
      return { revision: existingRevision, seller };
    }
    if (await em.findOne(MarketplacePublicSellerRevisionEntity, { sellerPublicId: seller.id })) {
      seller.contentRevision += 1;
    }
    const revision = new MarketplacePublicSellerRevisionEntity();
    Object.assign(revision, {
      contentFingerprint,
      contentRevision: seller.contentRevision,
      description: null,
      displayName: content.displayName,
      region: content.region,
      sellerPublicId: seller.id,
      tenantId: owner.tenantId,
    });
    em.persist(revision);
    return { revision, seller };
  }

  private lockCommand(em: EntityManager, owner: AgriTechOwner, idempotencyKey: string): Promise<unknown> {
    return em
      .getConnection()
      .execute('select pg_advisory_xact_lock(hashtext(?))', [
        `marketplace-public:${owner.tenantId}:${owner.userId}:${idempotencyKey}`,
      ]);
  }

  private lockSource(em: EntityManager, kind: string, sourceId: string): Promise<unknown> {
    return em
      .getConnection()
      .execute('select pg_advisory_xact_lock(hashtext(?))', [`marketplace-public-source:${kind}:${sourceId}`]);
  }

  private lockModerationCommand(
    em: EntityManager,
    tenantId: string,
    reviewerUserId: string,
    idempotencyKey: string,
  ): Promise<unknown> {
    return em
      .getConnection()
      .execute('select pg_advisory_xact_lock(hashtext(?))', [
        `marketplace-public-moderation:${tenantId}:${reviewerUserId}:${idempotencyKey}`,
      ]);
  }
}
