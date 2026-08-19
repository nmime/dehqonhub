// @requirements REQ-AGRITECH-ENGAGEMENT-019
import { LockMode } from '@mikro-orm/core';
import { EntityManager } from '@mikro-orm/postgresql';
import { Inject, Injectable } from '@nestjs/common';
import {
  marketplaceEngagementFingerprint,
  marketplaceReviewAverageRating,
  marketplaceSampleDefaultMonthlyLimit,
  marketplaceSampleTransitionTarget,
  marketplaceUtcMonthKey,
  marketplaceUtcSeasonKey,
  type ActivateMarketplaceSamplePolicyInput,
  type AgriTechOwner,
  type MarketplaceEngagementListingSummary,
  type MarketplaceEngagementLocale,
  type MarketplaceEngagementRepository,
  type MarketplaceFavoriteMutationResult,
  type MarketplaceFavoriteView,
  type MarketplaceReviewAggregateView,
  type MarketplaceReviewModerationItem,
  type MarketplaceReviewModerationResult,
  type MarketplaceReviewPage,
  type MarketplaceReviewReportReceipt,
  type MarketplaceReviewSelfState,
  type MarketplaceReviewView,
  type MarketplaceSamplePolicyView,
  type MarketplaceSampleUsageView,
  type MarketplaceSampleView,
  type ModerateMarketplaceReviewReportInput,
  type OperationResult,
  type ReplyMarketplaceReviewInput,
  type ReportMarketplaceReviewInput,
  type RequestMarketplaceSampleInput,
  type SubmitMarketplaceReviewInput,
  type SubmitMarketplaceSampleFeedbackInput,
  type TransitionMarketplaceSampleInput,
} from '@app/backend-feature-agritech-shared';
import { marketplaceCapabilityRoleFilter, marketplaceSellerRoleFilter } from './marketplace-role-predicates';
import { FarmerEntity } from '../entities/farmer.entity';
import { MarketplacePartnerMembershipEntity } from '../entities/marketplace-commerce.entity';
import { MarketplaceContractReviewEligibilityEntity } from '../entities/marketplace-contract-lifecycle.entity';
import {
  MarketplaceEngagementEventEntity,
  MarketplaceEngagementNotificationIntentEntity,
  MarketplaceEngagementOperationEntity,
  type MarketplaceEngagementOperationKind,
  MarketplaceListingFavoriteEntity,
  MarketplaceListingReviewEntity,
  MarketplaceListingSampleEntity,
  MarketplaceReviewAggregateEntity,
  MarketplaceReviewReplyEntity,
  MarketplaceReviewReportEntity,
  MarketplaceSamplePolicyEntity,
} from '../entities/marketplace-engagement.entity';
import { VerificationEntity } from '../entities/marketplace.entity';
import {
  MarketplaceListingPublicationEntity,
  MarketplacePublicSellerEntity,
  MarketplacePublicSellerRevisionEntity,
} from '../entities/marketplace-public.entity';
import { MarketplaceProduceOrganizationBindingEntity } from '../entities/marketplace-source-binding.entity';
import { AgriTechPartnerEntity, ProduceListingEntity } from '../entities/operations.entity';
import { ProductEntity } from '../entities/product.entity';

interface AuthorizedParty {
  membership: MarketplacePartnerMembershipEntity;
  partner: AgriTechPartnerEntity;
  verification: VerificationEntity;
}

interface ResolvedEngagementListing {
  publication: MarketplaceListingPublicationEntity;
  seller: MarketplacePublicSellerEntity;
  sellerRevision: MarketplacePublicSellerRevisionEntity;
  sellerPartner: AgriTechPartnerEntity;
  source: ProductEntity | ProduceListingEntity;
  sampleAvailable: boolean;
}

type EngagementAggregateType = MarketplaceEngagementEventEntity['aggregateType'];
type EngagementTemplateKey =
  | 'marketplace.engagement.sample.requested'
  | 'marketplace.engagement.sample.approved'
  | 'marketplace.engagement.sample.declined'
  | 'marketplace.engagement.sample.cancelled'
  | 'marketplace.engagement.sample.shipped'
  | 'marketplace.engagement.sample.received'
  | 'marketplace.engagement.sample.feedback'
  | 'marketplace.engagement.review.submitted'
  | 'marketplace.engagement.review.replied'
  | 'marketplace.engagement.review.moderated';

const idempotencyKeyPattern = /^[A-Za-z0-9:_-]{8,100}$/u;
const supportedLocales = new Set<MarketplaceEngagementLocale>(['en', 'ru', 'uz', 'uz-cyrl']);
const maximumPrivateListSize = 100;

const ok = <T>(value: T): OperationResult<T> => ({ status: 'ok', value });

const canonicalValue = (value: unknown): unknown => {
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (Array.isArray(value)) {
    return value.map(canonicalValue);
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, canonicalValue(nested)]),
    );
  }
  return value;
};

const reviveValue = (value: unknown, key?: string): unknown => {
  if (Array.isArray(value)) {
    return value.map((nested) => reviveValue(nested));
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([nestedKey, nested]) => [
        nestedKey,
        reviveValue(nested, nestedKey),
      ]),
    );
  }
  if (typeof value === 'string' && key?.endsWith('At') && /^\d{4}-\d{2}-\d{2}T/u.test(value)) {
    return new Date(value);
  }
  return value;
};

interface StoredEngagementOperation {
  requestFingerprint: string;
  resultSnapshot: Record<string, unknown>;
}

const firstResultRow = (result: unknown): unknown => (Array.isArray(result) ? (result as unknown[])[0] : undefined);

const firstStringProperty = (result: unknown, property: string): string | undefined => {
  const first = firstResultRow(result);
  if (!first || typeof first !== 'object') {
    return undefined;
  }
  const value = (first as Record<string, unknown>)[property];
  return typeof value === 'string' ? value : undefined;
};

async function findStoredOperation(
  em: EntityManager,
  owner: AgriTechOwner,
  operation: MarketplaceEngagementOperationKind,
  idempotencyKey: string,
): Promise<StoredEngagementOperation | undefined> {
  const result: unknown = await em.execute(
    `select "request_fingerprint" as "requestFingerprint", "result_snapshot" as "resultSnapshot"
       from "marketplace_engagement_operations"
      where "actor_tenant_id" = ? and "actor_user_id" = ? and "operation" = ? and "idempotency_key" = ?
      limit 1`,
    [owner.tenantId, owner.userId, operation, idempotencyKey],
  );
  const first = firstResultRow(result);
  if (!first || typeof first !== 'object') {
    return undefined;
  }
  const row = first as Partial<StoredEngagementOperation>;
  return typeof row.requestFingerprint === 'string' && row.resultSnapshot && typeof row.resultSnapshot === 'object'
    ? { requestFingerprint: row.requestFingerprint, resultSnapshot: row.resultSnapshot }
    : undefined;
}

const executeOperation = async <T>(
  em: EntityManager,
  owner: AgriTechOwner,
  operation: MarketplaceEngagementOperationKind,
  resourceKey: string,
  idempotencyKey: string,
  input: unknown,
  mutate: () => Promise<OperationResult<T>>,
): Promise<OperationResult<T>> => {
  if (!idempotencyKeyPattern.test(idempotencyKey) || resourceKey.length === 0 || resourceKey.length > 100) {
    return { status: 'invalid_state', field: 'idempotencyKey' };
  }
  await em.execute('select pg_advisory_xact_lock(hashtextextended(cast(? as text), 0))', [
    `marketplace-engagement:${owner.tenantId}:${owner.userId}:${operation}:${idempotencyKey}`,
  ]);
  const fingerprint = marketplaceEngagementFingerprint({ input, resourceKey });
  // The lock waiter must bypass MikroORM's identity map so it observes a
  // competing receipt committed immediately before it acquired the lock.
  const existing = await findStoredOperation(em, owner, operation, idempotencyKey);
  if (existing) {
    if (existing.requestFingerprint !== fingerprint) {
      return { status: 'conflict', field: 'idempotencyKey' };
    }
    return ok(reviveValue(existing.resultSnapshot['value']) as T);
  }
  const result = await mutate();
  if (result.status !== 'ok') {
    return result;
  }
  const receipt = new MarketplaceEngagementOperationEntity();
  Object.assign(receipt, {
    actorTenantId: owner.tenantId,
    actorUserId: owner.userId,
    idempotencyKey,
    operation,
    requestFingerprint: fingerprint,
    resourceKey,
    resultSnapshot: { value: canonicalValue(result.value) },
  });
  em.persist(receipt);
  await em.flush();
  return result;
};

const policyView = (entity: MarketplaceSamplePolicyEntity): MarketplaceSamplePolicyView => ({
  activeFrom: entity.activeFrom,
  monthlyLimit: entity.monthlyLimit,
  version: entity.version,
});

const listingSummary = (listing: ResolvedEngagementListing): MarketplaceEngagementListingSummary => ({
  id: listing.publication.id,
  kind: listing.publication.sourceKind,
  sampleAvailable: listing.sampleAvailable,
  seller: {
    displayName: listing.sellerRevision.displayName,
    id: listing.seller.id,
  },
  title: listing.publication.publicTitle,
  ...(listing.publication.publicTitleRu ? { titleRu: listing.publication.publicTitleRu } : {}),
  ...(listing.publication.publicTitleUz ? { titleUz: listing.publication.publicTitleUz } : {}),
  ...(listing.publication.publicTitleUzCyrl ? { titleUzCyrl: listing.publication.publicTitleUzCyrl } : {}),
});

const replyView = (entity: MarketplaceReviewReplyEntity) => ({
  comment: entity.comment,
  createdAt: entity.createdAt,
  id: entity.id,
  revision: entity.revision,
  updatedAt: entity.updatedAt,
});

const reviewView = (
  entity: MarketplaceListingReviewEntity,
  reply?: MarketplaceReviewReplyEntity,
): MarketplaceReviewView => ({
  assetReferences: [...entity.assetReferences],
  ...(entity.comment ? { comment: entity.comment } : {}),
  createdAt: entity.createdAt,
  id: entity.id,
  listingPublicationId: entity.listingPublicationId,
  rating: entity.rating,
  ...(reply ? { reply: replyView(reply) } : {}),
  revision: entity.revision,
  updatedAt: entity.updatedAt,
  verifiedDeal: true,
});

/**
 * The published rating block for one publication. The average comes from the
 * shared one-decimal rule rather than the raw quotient: `rating_sum` over
 * `review_count` is exact but publishes values like 4.666666666666667, and the
 * count travels with it so the rounding can be checked against the rows.
 */
const aggregateView = (
  listingPublicationId: string,
  entity?: MarketplaceReviewAggregateEntity,
): MarketplaceReviewAggregateView => ({
  averageRating: entity ? marketplaceReviewAverageRating(entity.ratingSum, entity.reviewCount) : null,
  listingPublicationId,
  reviewCount: entity?.reviewCount ?? 0,
  revision: entity?.revision ?? 0,
});

const sampleView = (
  entity: MarketplaceListingSampleEntity,
  summary: MarketplaceEngagementListingSummary,
  owner: AgriTechOwner,
): MarketplaceSampleView => ({
  actorRole:
    entity.requesterTenantId === owner.tenantId && entity.requesterUserId === owner.userId ? 'requester' : 'seller',
  createdAt: entity.createdAt,
  delivery: {
    itemPriceUzs: 0,
    method: entity.deliveryMethod,
    ...(entity.deliveryQuoteUzs === null ? {} : { quoteUzs: Number(entity.deliveryQuoteUzs) }),
    requesterPays: true,
  },
  ...(entity.feedbackAt && entity.feedbackRating
    ? {
        feedback: {
          ...(entity.feedbackComment ? { comment: entity.feedbackComment } : {}),
          createdAt: entity.feedbackAt,
          rating: entity.feedbackRating,
        },
      }
    : {}),
  id: entity.id,
  listing: summary,
  policyVersion: entity.policyVersion,
  revision: entity.revision,
  seasonKey: entity.seasonKey,
  status: entity.status,
  updatedAt: entity.updatedAt,
});

async function resolveRecipientLocale(
  em: EntityManager,
  tenantId: string,
  userId: string,
): Promise<MarketplaceEngagementLocale> {
  const queryResult: unknown = await em.execute(
    `select "locale" from "auth_users"
      where "id"::text = ? and "tenant_id"::text = ? and "status" = 'active' limit 1`,
    [userId, tenantId],
  );
  const first = Array.isArray(queryResult) ? (queryResult[0] as unknown) : undefined;
  const locale =
    first && typeof first === 'object' && 'locale' in first && typeof first.locale === 'string'
      ? first.locale
      : undefined;
  return locale && supportedLocales.has(locale as MarketplaceEngagementLocale)
    ? (locale as MarketplaceEngagementLocale)
    : 'en';
}

async function appendEvent(
  em: EntityManager,
  owner: AgriTechOwner,
  aggregateType: EngagementAggregateType,
  aggregateId: string,
  eventType: string,
  metadata: Record<string, unknown>,
  recipients: Array<{
    tenantId: string;
    userId: string;
    templateKey: EngagementTemplateKey;
    payload: Record<string, unknown>;
  }> = [],
): Promise<void> {
  await em.execute('select pg_advisory_xact_lock(hashtext(?))', [
    `marketplace-engagement-event:${aggregateType}:${aggregateId}`,
  ]);
  const latest = await em.findOne(
    MarketplaceEngagementEventEntity,
    { aggregateId, aggregateType },
    { orderBy: { sequence: 'DESC' } },
  );
  const event = new MarketplaceEngagementEventEntity();
  Object.assign(event, {
    actorTenantId: owner.tenantId,
    actorUserId: owner.userId,
    aggregateId,
    aggregateType,
    eventType,
    metadata,
    sequence: (latest?.sequence ?? 0) + 1,
  });
  em.persist(event);
  const resolvedRecipients = await Promise.all(
    recipients.map(async (recipient) => ({
      ...recipient,
      recipientLocale: await resolveRecipientLocale(em, recipient.tenantId, recipient.userId),
    })),
  );
  const seen = new Set<string>();
  for (const recipient of resolvedRecipients) {
    const recipientKey = `${recipient.tenantId}:${recipient.userId}`;
    if (seen.has(recipientKey)) {
      continue;
    }
    seen.add(recipientKey);
    const intent = new MarketplaceEngagementNotificationIntentEntity();
    Object.assign(intent, {
      eventId: event.id,
      payload: recipient.payload,
      recipientLocale: recipient.recipientLocale,
      recipientTenantId: recipient.tenantId,
      recipientUserId: recipient.userId,
      templateKey: recipient.templateKey,
    });
    em.persist(intent);
  }
  await em.flush();
}

async function findAuthorizedParty(
  em: EntityManager,
  owner: AgriTechOwner,
  partnerId: string,
  capability: 'buyer' | 'seller',
): Promise<AuthorizedParty | undefined> {
  const membership = await em.findOne(
    MarketplacePartnerMembershipEntity,
    { capability, partnerId, status: 'active', tenantId: owner.tenantId, userId: owner.userId },
    { lockMode: LockMode.PESSIMISTIC_READ },
  );
  if (!membership) {
    return undefined;
  }
  const [partner, verification] = await Promise.all([
    em.findOne(
      AgriTechPartnerEntity,
      {
        id: partnerId,
        kind: capability === 'buyer' ? 'buyer' : 'supplier',
        status: 'approved',
        tenantId: owner.tenantId,
      },
      { lockMode: LockMode.PESSIMISTIC_READ },
    ),
    em.findOne(
      VerificationEntity,
      {
        role: marketplaceCapabilityRoleFilter(capability),
        status: 'verified',
        tenantId: owner.tenantId,
        userId: owner.userId,
      },
      { lockMode: LockMode.PESSIMISTIC_READ },
    ),
  ]);
  return partner && verification ? { membership, partner, verification } : undefined;
}

async function deriveBuyerParty(em: EntityManager, owner: AgriTechOwner): Promise<OperationResult<AuthorizedParty>> {
  const memberships = await em.find(
    MarketplacePartnerMembershipEntity,
    { capability: 'buyer', status: 'active', tenantId: owner.tenantId, userId: owner.userId },
    { limit: 2, lockMode: LockMode.PESSIMISTIC_READ, orderBy: { createdAt: 'ASC', id: 'ASC' } },
  );
  if (memberships.length === 0) {
    return { status: 'forbidden', field: 'buyerMembership' };
  }
  if (memberships.length > 1) {
    return { status: 'conflict', field: 'buyerMembership' };
  }
  const membership = memberships[0];
  if (!membership) {
    return { status: 'forbidden', field: 'buyerMembership' };
  }
  const party = await findAuthorizedParty(em, owner, membership.partnerId, 'buyer');
  return party ? ok(party) : { status: 'forbidden', field: 'buyerMembership' };
}

const isSellerSampleAction = (action: TransitionMarketplaceSampleInput['action']): boolean =>
  action === 'approve' || action === 'decline' || action === 'ship';

async function authorizeSampleAction(
  em: EntityManager,
  owner: AgriTechOwner,
  sample: MarketplaceListingSampleEntity,
  sellerAction: boolean,
): Promise<AuthorizedParty | undefined> {
  if (sellerAction) {
    return owner.tenantId === sample.sellerTenantId
      ? findAuthorizedParty(em, owner, sample.sellerPartnerId, 'seller')
      : undefined;
  }
  if (owner.tenantId !== sample.requesterTenantId || owner.userId !== sample.requesterUserId) {
    return undefined;
  }
  return findAuthorizedParty(em, owner, sample.requesterPartnerId, 'buyer');
}

const hasInvalidSampleQuote = (
  sample: MarketplaceListingSampleEntity,
  input: TransitionMarketplaceSampleInput,
): boolean =>
  input.action === 'approve' &&
  ((sample.deliveryMethod === 'seller_delivery' && input.deliveryQuoteUzs === undefined) ||
    (sample.deliveryMethod === 'pickup' && input.deliveryQuoteUzs !== undefined && input.deliveryQuoteUzs !== 0));

async function resolveEligibleListing(
  em: EntityManager,
  listingPublicationId: string,
  requireSample: boolean,
): Promise<ResolvedEngagementListing | undefined> {
  const publication = await em.findOne(
    MarketplaceListingPublicationEntity,
    { id: listingPublicationId, moderationStatus: 'approved', status: 'published' },
    { lockMode: LockMode.PESSIMISTIC_READ },
  );
  if (!publication) {
    return undefined;
  }
  const [seller, sellerRevision] = await Promise.all([
    em.findOne(
      MarketplacePublicSellerEntity,
      {
        id: publication.sellerPublicId,
        ownerUserId: publication.ownerUserId,
        status: 'published',
        tenantId: publication.tenantId,
      },
      { lockMode: LockMode.PESSIMISTIC_READ },
    ),
    em.findOne(
      MarketplacePublicSellerRevisionEntity,
      {
        contentRevision: publication.sellerContentRevision,
        id: publication.sellerRevisionId,
        moderationStatus: 'approved',
        sellerPublicId: publication.sellerPublicId,
        tenantId: publication.tenantId,
      },
      { lockMode: LockMode.PESSIMISTIC_READ },
    ),
  ]);
  if (!seller || !sellerRevision) {
    return undefined;
  }
  const [sellerPartner, sellerVerification] = await Promise.all([
    em.findOne(
      AgriTechPartnerEntity,
      { id: seller.partnerId, kind: 'supplier', status: 'approved', tenantId: seller.tenantId },
      { lockMode: LockMode.PESSIMISTIC_READ },
    ),
    em.findOne(
      VerificationEntity,
      {
        role: marketplaceSellerRoleFilter(),
        status: 'verified',
        tenantId: seller.tenantId,
        userId: seller.ownerUserId,
      },
      { lockMode: LockMode.PESSIMISTIC_READ },
    ),
  ]);
  if (!sellerPartner || !sellerVerification) {
    return undefined;
  }
  if (publication.sourceKind === 'product' && publication.productId) {
    const product = await em.findOne(
      ProductEntity,
      {
        id: publication.productId,
        status: 'active',
        stockQuantity: { $gt: 0 },
        supplierId: seller.partnerId,
        tenantId: publication.tenantId,
      },
      { lockMode: LockMode.PESSIMISTIC_READ },
    );
    if (!product || (requireSample && !product.sampleAvailable)) {
      return undefined;
    }
    return {
      publication,
      sampleAvailable: product.sampleAvailable,
      seller,
      sellerPartner,
      sellerRevision,
      source: product,
    };
  }
  if (publication.sourceKind === 'produce' && publication.produceListingId) {
    const produce = await em.findOne(
      ProduceListingEntity,
      {
        availableFrom: { $lte: new Date() },
        availableQuantityKg: { $gt: 0 },
        availableUntil: { $gte: new Date() },
        id: publication.produceListingId,
        status: 'active',
        tenantId: publication.tenantId,
      },
      { lockMode: LockMode.PESSIMISTIC_READ },
    );
    if (!produce || (requireSample && !produce.sampleAvailable)) {
      return undefined;
    }
    const [binding, farmer] = await Promise.all([
      em.findOne(
        MarketplaceProduceOrganizationBindingEntity,
        {
          ownerUserId: publication.ownerUserId,
          produceListingId: produce.id,
          supplierPartnerId: seller.partnerId,
          tenantId: publication.tenantId,
        },
        { lockMode: LockMode.PESSIMISTIC_READ },
      ),
      em.findOne(
        FarmerEntity,
        { id: produce.farmerId, status: 'active', tenantId: publication.tenantId, userId: publication.ownerUserId },
        { lockMode: LockMode.PESSIMISTIC_READ },
      ),
    ]);
    if (!binding || !farmer) {
      return undefined;
    }
    return {
      publication,
      sampleAvailable: produce.sampleAvailable,
      seller,
      sellerPartner,
      sellerRevision,
      source: produce,
    };
  }
  return undefined;
}

async function resolveStoredListing(
  em: EntityManager,
  listingPublicationId: string,
): Promise<ResolvedEngagementListing | undefined> {
  const publication = await em.findOne(MarketplaceListingPublicationEntity, { id: listingPublicationId });
  if (!publication) {
    return undefined;
  }
  const [seller, sellerRevision] = await Promise.all([
    em.findOne(MarketplacePublicSellerEntity, { id: publication.sellerPublicId, tenantId: publication.tenantId }),
    em.findOne(MarketplacePublicSellerRevisionEntity, {
      id: publication.sellerRevisionId,
      sellerPublicId: publication.sellerPublicId,
      tenantId: publication.tenantId,
    }),
  ]);
  if (!seller || !sellerRevision) {
    return undefined;
  }
  const sellerPartner = await em.findOne(AgriTechPartnerEntity, { id: seller.partnerId, tenantId: seller.tenantId });
  if (!sellerPartner) {
    return undefined;
  }
  let source: ProductEntity | ProduceListingEntity | undefined;
  if (publication.productId) {
    source =
      (await em.findOne(ProductEntity, { id: publication.productId, tenantId: publication.tenantId })) ?? undefined;
  } else if (publication.produceListingId) {
    source =
      (await em.findOne(ProduceListingEntity, {
        id: publication.produceListingId,
        tenantId: publication.tenantId,
      })) ?? undefined;
  }
  if (!source) {
    return undefined;
  }
  return {
    publication,
    sampleAvailable: source.sampleAvailable,
    seller,
    sellerPartner,
    sellerRevision,
    source,
  };
}

async function activePolicy(
  em: EntityManager,
  tenantId: string,
  actorUserId = 'system:default',
): Promise<MarketplaceSamplePolicyEntity> {
  await em.execute('select pg_advisory_xact_lock(hashtextextended(cast(? as text), 0))', [
    `marketplace-sample-policy:${tenantId}`,
  ]);
  const currentRows: unknown = await em.execute(
    `select "id" from "marketplace_sample_policies"
      where "tenant_id" = ? and "active" = true limit 1 for update`,
    [tenantId],
  );
  const currentId = firstStringProperty(currentRows, 'id');
  if (currentId) {
    return em.findOneOrFail(
      MarketplaceSamplePolicyEntity,
      { id: currentId },
      { lockMode: LockMode.PESSIMISTIC_WRITE, refresh: true },
    );
  }
  const policy = new MarketplaceSamplePolicyEntity();
  Object.assign(policy, {
    activatedByUserId: actorUserId,
    monthlyLimit: marketplaceSampleDefaultMonthlyLimit,
    tenantId,
    version: 1,
  });
  await em.execute(
    `insert into "marketplace_sample_policies"
      ("id", "tenant_id", "version", "monthly_limit", "active", "activated_by_user_id",
       "active_from", "created_at")
     values (?, ?, 1, ?, true, ?, now(), now())
     on conflict do nothing`,
    [policy.id, tenantId, marketplaceSampleDefaultMonthlyLimit, actorUserId],
  );
  const selectedRows: unknown = await em.execute(
    `select "id" from "marketplace_sample_policies"
      where "tenant_id" = ? and "active" = true limit 1 for update`,
    [tenantId],
  );
  const selectedId = firstStringProperty(selectedRows, 'id');
  if (!selectedId) {
    throw new Error('Active marketplace sample policy could not be initialized.');
  }
  return em.findOneOrFail(MarketplaceSamplePolicyEntity, { id: selectedId }, { refresh: true });
}

@Injectable()
export class PostgresMarketplaceEngagementRepository implements MarketplaceEngagementRepository {
  constructor(@Inject(EntityManager) private readonly em: EntityManager) {}

  async addFavorite(
    owner: AgriTechOwner,
    listingPublicationId: string,
    idempotencyKey: string,
  ): Promise<OperationResult<MarketplaceFavoriteMutationResult>> {
    return this.em.transactional((em) =>
      executeOperation(em, owner, 'favorite_add', listingPublicationId, idempotencyKey, {}, async () => {
        await em.execute('select pg_advisory_xact_lock(hashtext(?))', [
          `marketplace-favorite:${owner.tenantId}:${owner.userId}:${listingPublicationId}`,
        ]);
        const listing = await resolveEligibleListing(em, listingPublicationId, false);
        if (!listing) {
          return { status: 'not_found' };
        }
        const existing = await em.findOne(MarketplaceListingFavoriteEntity, {
          actorTenantId: owner.tenantId,
          actorUserId: owner.userId,
          listingPublicationId,
        });
        if (!existing) {
          const favorite = new MarketplaceListingFavoriteEntity();
          Object.assign(favorite, {
            actorTenantId: owner.tenantId,
            actorUserId: owner.userId,
            listingPublicationId,
          });
          em.persist(favorite);
          await em.flush();
        }
        return ok({ favorited: true, listingPublicationId });
      }),
    );
  }

  async removeFavorite(
    owner: AgriTechOwner,
    listingPublicationId: string,
    idempotencyKey: string,
  ): Promise<OperationResult<MarketplaceFavoriteMutationResult>> {
    return this.em.transactional((em) =>
      executeOperation(em, owner, 'favorite_remove', listingPublicationId, idempotencyKey, {}, async () => {
        await em.execute('select pg_advisory_xact_lock(hashtext(?))', [
          `marketplace-favorite:${owner.tenantId}:${owner.userId}:${listingPublicationId}`,
        ]);
        await em.nativeDelete(MarketplaceListingFavoriteEntity, {
          actorTenantId: owner.tenantId,
          actorUserId: owner.userId,
          listingPublicationId,
        });
        return ok({ favorited: false, listingPublicationId });
      }),
    );
  }

  async listFavorites(owner: AgriTechOwner): Promise<MarketplaceFavoriteView[]> {
    return this.em.transactional(async (em) => {
      const favorites = await em.find(
        MarketplaceListingFavoriteEntity,
        { actorTenantId: owner.tenantId, actorUserId: owner.userId },
        { limit: maximumPrivateListSize, orderBy: { createdAt: 'DESC', id: 'ASC' } },
      );
      const result: MarketplaceFavoriteView[] = [];
      for (const favorite of favorites) {
        // Eligibility is deliberately re-evaluated; hidden favorites disappear without private fallback.
        // eslint-disable-next-line no-await-in-loop
        const listing = await resolveEligibleListing(em, favorite.listingPublicationId, false);
        if (listing) {
          result.push({ createdAt: favorite.createdAt, listing: listingSummary(listing) });
        }
      }
      return result;
    });
  }

  async getSamplePolicy(tenantId: string): Promise<MarketplaceSamplePolicyView> {
    return this.em.transactional(async (em) => policyView(await activePolicy(em, tenantId)));
  }

  async activateSamplePolicy(
    owner: AgriTechOwner,
    input: ActivateMarketplaceSamplePolicyInput,
    idempotencyKey: string,
  ): Promise<OperationResult<MarketplaceSamplePolicyView>> {
    return this.em.transactional((em) =>
      executeOperation(em, owner, 'sample_policy_activate', owner.tenantId, idempotencyKey, input, async () => {
        const current = await activePolicy(em, owner.tenantId, owner.userId);
        if (current.version !== input.expectedVersion) {
          return { status: 'conflict', field: 'expectedVersion' };
        }
        current.active = false;
        current.retiredAt = new Date();
        const next = new MarketplaceSamplePolicyEntity();
        Object.assign(next, {
          activatedByUserId: owner.userId,
          monthlyLimit: input.monthlyLimit,
          tenantId: owner.tenantId,
          version: current.version + 1,
        });
        em.persist(next);
        await em.flush();
        await appendEvent(em, owner, 'sample_policy', next.id, 'sample_policy.activated', {
          monthlyLimit: next.monthlyLimit,
          version: next.version,
        });
        return ok(policyView(next));
      }),
    );
  }

  async requestSample(
    owner: AgriTechOwner,
    input: RequestMarketplaceSampleInput,
    idempotencyKey: string,
  ): Promise<OperationResult<MarketplaceSampleView>> {
    return this.em.transactional((em) =>
      executeOperation(em, owner, 'sample_request', input.listingPublicationId, idempotencyKey, input, async () => {
        const buyerResult = await deriveBuyerParty(em, owner);
        if (buyerResult.status !== 'ok') {
          return buyerResult;
        }
        const listing = await resolveEligibleListing(em, input.listingPublicationId, true);
        if (!listing) {
          return { status: 'not_found' };
        }
        if (buyerResult.value.partner.id === listing.sellerPartner.id) {
          return { status: 'forbidden', field: 'selfAuthoredListing' };
        }
        const now = new Date();
        const monthKey = marketplaceUtcMonthKey(now);
        const seasonKey = marketplaceUtcSeasonKey(now);
        await em.execute('select pg_advisory_xact_lock(hashtext(?))', [
          `marketplace-sample-quota:${owner.tenantId}:${owner.userId}:${monthKey}`,
        ]);
        const sourceId = listing.publication.productId ?? listing.publication.produceListingId;
        if (!sourceId) {
          return { status: 'not_found' };
        }
        await em.execute('select pg_advisory_xact_lock(hashtext(?))', [
          `marketplace-sample-season:${owner.tenantId}:${owner.userId}:${listing.publication.sourceKind}:${sourceId}:${seasonKey}`,
        ]);
        const policy = await activePolicy(em, owner.tenantId, owner.userId);
        const used = await em.count(MarketplaceListingSampleEntity, {
          monthKey,
          requesterTenantId: owner.tenantId,
          requesterUserId: owner.userId,
        });
        if (used >= policy.monthlyLimit) {
          return { status: 'conflict', field: 'monthlyQuota' };
        }
        const duplicate = await em.findOne(MarketplaceListingSampleEntity, {
          ...(listing.publication.sourceKind === 'product'
            ? { productId: sourceId, sourceKind: 'product' as const }
            : { produceListingId: sourceId, sourceKind: 'produce' as const }),
          requesterTenantId: owner.tenantId,
          requesterUserId: owner.userId,
          seasonKey,
        });
        if (duplicate) {
          return { status: 'conflict', field: 'sourceSeason' };
        }
        const sample = new MarketplaceListingSampleEntity();
        Object.assign(sample, {
          deliveryMethod: input.deliveryMethod,
          listingPublicationId: listing.publication.id,
          monthKey,
          monthlyLimit: policy.monthlyLimit,
          policyId: policy.id,
          policyVersion: policy.version,
          ...(listing.publication.sourceKind === 'product' ? { productId: sourceId } : { produceListingId: sourceId }),
          requesterPartnerId: buyerResult.value.partner.id,
          requesterTenantId: owner.tenantId,
          requesterUserId: owner.userId,
          seasonKey,
          sellerPartnerId: listing.sellerPartner.id,
          sellerTenantId: listing.seller.tenantId,
          sellerUserId: listing.seller.ownerUserId,
          sourceKind: listing.publication.sourceKind,
        });
        em.persist(sample);
        await em.flush();
        await appendEvent(
          em,
          owner,
          'sample',
          sample.id,
          'sample.requested',
          { listingPublicationId: listing.publication.id, revision: sample.revision, status: sample.status },
          [
            {
              payload: { listingId: listing.publication.id, sampleId: sample.id, status: sample.status },
              templateKey: 'marketplace.engagement.sample.requested',
              tenantId: sample.sellerTenantId,
              userId: sample.sellerUserId,
            },
          ],
        );
        return ok(sampleView(sample, listingSummary(listing), owner));
      }),
    );
  }

  async transitionSample(
    owner: AgriTechOwner,
    sampleId: string,
    input: TransitionMarketplaceSampleInput,
    idempotencyKey: string,
  ): Promise<OperationResult<MarketplaceSampleView>> {
    return this.em.transactional((em) =>
      executeOperation(em, owner, 'sample_transition', sampleId, idempotencyKey, input, async () => {
        const sample = await em.findOne(
          MarketplaceListingSampleEntity,
          { id: sampleId },
          { lockMode: LockMode.PESSIMISTIC_WRITE },
        );
        if (!sample) {
          return { status: 'not_found' };
        }
        const sellerAction = isSellerSampleAction(input.action);
        const authorized = await authorizeSampleAction(em, owner, sample, sellerAction);
        if (!authorized) {
          return { status: 'not_found' };
        }
        if (sample.revision !== input.expectedRevision) {
          return { status: 'conflict', field: 'expectedRevision' };
        }
        const target = marketplaceSampleTransitionTarget(sample.status, input.action);
        if (!target) {
          return { status: 'conflict', field: 'status' };
        }
        if (hasInvalidSampleQuote(sample, input)) {
          return { status: 'invalid_state', field: 'deliveryQuoteUzs' };
        }
        if (input.action === 'approve') {
          sample.deliveryQuoteUzs = input.deliveryQuoteUzs ?? null;
        }
        sample.status = target;
        sample.revision += 1;
        sample.updatedAt = new Date();
        await em.flush();
        const listing = await resolveStoredListing(em, sample.listingPublicationId);
        if (!listing) {
          return { status: 'not_found' };
        }
        const recipient = sellerAction
          ? { tenantId: sample.requesterTenantId, userId: sample.requesterUserId }
          : { tenantId: sample.sellerTenantId, userId: sample.sellerUserId };
        const templateKey = `marketplace.engagement.sample.${target}` as EngagementTemplateKey;
        await appendEvent(
          em,
          owner,
          'sample',
          sample.id,
          `sample.${target}`,
          { listingPublicationId: sample.listingPublicationId, revision: sample.revision, status: target },
          [
            {
              payload: { listingId: sample.listingPublicationId, sampleId: sample.id, status: target },
              templateKey,
              ...recipient,
            },
          ],
        );
        return ok(sampleView(sample, listingSummary(listing), owner));
      }),
    );
  }

  async submitSampleFeedback(
    owner: AgriTechOwner,
    sampleId: string,
    input: SubmitMarketplaceSampleFeedbackInput,
    idempotencyKey: string,
  ): Promise<OperationResult<MarketplaceSampleView>> {
    return this.em.transactional((em) =>
      executeOperation(em, owner, 'sample_feedback', sampleId, idempotencyKey, input, async () => {
        const sample = await em.findOne(
          MarketplaceListingSampleEntity,
          { id: sampleId },
          { lockMode: LockMode.PESSIMISTIC_WRITE },
        );
        if (
          !sample ||
          owner.tenantId !== sample.requesterTenantId ||
          owner.userId !== sample.requesterUserId ||
          !(await findAuthorizedParty(em, owner, sample.requesterPartnerId, 'buyer'))
        ) {
          return { status: 'not_found' };
        }
        if (sample.revision !== input.expectedRevision) {
          return { status: 'conflict', field: 'expectedRevision' };
        }
        if (sample.status !== 'received' || sample.feedbackAt) {
          return { status: 'conflict', field: 'feedback' };
        }
        sample.feedbackAt = new Date();
        sample.feedbackComment = input.comment ?? null;
        sample.feedbackRating = input.rating;
        sample.revision += 1;
        sample.updatedAt = new Date();
        await em.flush();
        const listing = await resolveStoredListing(em, sample.listingPublicationId);
        if (!listing) {
          return { status: 'not_found' };
        }
        await appendEvent(
          em,
          owner,
          'sample',
          sample.id,
          'sample.feedback_submitted',
          { listingPublicationId: sample.listingPublicationId, revision: sample.revision },
          [
            {
              payload: { listingId: sample.listingPublicationId, sampleId: sample.id },
              templateKey: 'marketplace.engagement.sample.feedback',
              tenantId: sample.sellerTenantId,
              userId: sample.sellerUserId,
            },
          ],
        );
        return ok(sampleView(sample, listingSummary(listing), owner));
      }),
    );
  }

  async listSamples(owner: AgriTechOwner): Promise<MarketplaceSampleView[]> {
    return this.em.transactional(async (em) => {
      const verification = await em.findOne(VerificationEntity, {
        status: 'verified',
        tenantId: owner.tenantId,
        userId: owner.userId,
      });
      if (!verification) {
        return [];
      }
      const memberships = await em.find(MarketplacePartnerMembershipEntity, {
        status: 'active',
        tenantId: owner.tenantId,
        userId: owner.userId,
      });
      const buyerPartnerIds = memberships
        .filter((membership) => membership.capability === 'buyer')
        .map((membership) => membership.partnerId);
      const sellerPartnerIds = memberships
        .filter((membership) => membership.capability === 'seller')
        .map((membership) => membership.partnerId);
      if (buyerPartnerIds.length === 0 && sellerPartnerIds.length === 0) {
        return [];
      }
      const samples = await em.find(
        MarketplaceListingSampleEntity,
        {
          $or: [
            ...(buyerPartnerIds.length > 0
              ? [
                  {
                    requesterPartnerId: { $in: buyerPartnerIds },
                    requesterTenantId: owner.tenantId,
                    requesterUserId: owner.userId,
                  },
                ]
              : []),
            ...(sellerPartnerIds.length > 0
              ? [{ sellerPartnerId: { $in: sellerPartnerIds }, sellerTenantId: owner.tenantId }]
              : []),
          ],
        },
        { limit: maximumPrivateListSize, orderBy: { createdAt: 'DESC', id: 'ASC' } },
      );
      const result: MarketplaceSampleView[] = [];
      for (const sample of samples) {
        // eslint-disable-next-line no-await-in-loop
        const listing = await resolveStoredListing(em, sample.listingPublicationId);
        if (listing) {
          result.push(sampleView(sample, listingSummary(listing), owner));
        }
      }
      return result;
    });
  }

  async getSampleUsage(owner: AgriTechOwner): Promise<OperationResult<MarketplaceSampleUsageView>> {
    return this.em.transactional(async (em) => {
      const buyer = await deriveBuyerParty(em, owner);
      if (buyer.status !== 'ok') {
        return buyer;
      }
      const period = marketplaceUtcMonthKey(new Date());
      const policy = await activePolicy(em, owner.tenantId, owner.userId);
      const used = await em.count(MarketplaceListingSampleEntity, {
        monthKey: period,
        requesterTenantId: owner.tenantId,
        requesterUserId: owner.userId,
      });
      return ok({
        limit: policy.monthlyLimit,
        period,
        policyVersion: policy.version,
        remaining: Math.max(0, policy.monthlyLimit - used),
        used,
      });
    });
  }

  async submitReview(
    owner: AgriTechOwner,
    input: SubmitMarketplaceReviewInput,
    idempotencyKey: string,
  ): Promise<OperationResult<MarketplaceReviewView>> {
    return this.em.transactional((em) =>
      executeOperation(em, owner, 'review_submit', input.listingPublicationId, idempotencyKey, input, async () => {
        const buyer = await deriveBuyerParty(em, owner);
        if (buyer.status !== 'ok') {
          return buyer;
        }
        const listing = await resolveEligibleListing(em, input.listingPublicationId, false);
        if (!listing) {
          return { status: 'not_found' };
        }
        const sourceId = listing.publication.productId ?? listing.publication.produceListingId;
        if (!sourceId || buyer.value.partner.id === listing.sellerPartner.id) {
          return { status: 'forbidden' };
        }
        await em.execute('select pg_advisory_xact_lock(hashtext(?))', [
          `marketplace-review-source:${owner.tenantId}:${owner.userId}:${listing.publication.sourceKind}:${sourceId}`,
        ]);
        const alreadyReviewed = await em.findOne(MarketplaceListingReviewEntity, {
          buyerTenantId: owner.tenantId,
          buyerUserId: owner.userId,
          ...(listing.publication.sourceKind === 'product'
            ? { productId: sourceId, sourceKind: 'product' as const }
            : { produceListingId: sourceId, sourceKind: 'produce' as const }),
        });
        if (alreadyReviewed) {
          return { status: 'conflict', field: 'reviewEligibility' };
        }
        const eligibilities = await em.find(
          MarketplaceContractReviewEligibilityEntity,
          {
            buyerPartnerId: buyer.value.partner.id,
            buyerTenantId: owner.tenantId,
            buyerUserId: owner.userId,
            sellerPartnerId: listing.sellerPartner.id,
            sellerTenantId: listing.seller.tenantId,
            sourceId,
            sourceKind: listing.publication.sourceKind,
            sourcePublicationId: listing.publication.id,
          },
          { limit: 10, lockMode: LockMode.PESSIMISTIC_WRITE, orderBy: { createdAt: 'ASC', id: 'ASC' } },
        );
        let eligibility: MarketplaceContractReviewEligibilityEntity | undefined;
        for (const candidate of eligibilities) {
          // eslint-disable-next-line no-await-in-loop
          const consumed = await em.findOne(MarketplaceListingReviewEntity, { reviewEligibilityId: candidate.id });
          if (!consumed) {
            eligibility = candidate;
            break;
          }
        }
        if (!eligibility) {
          return { status: 'conflict', field: 'reviewEligibility' };
        }
        const review = new MarketplaceListingReviewEntity();
        Object.assign(review, {
          assetReferences: [...input.assetReferences],
          buyerPartnerId: buyer.value.partner.id,
          buyerTenantId: owner.tenantId,
          buyerUserId: owner.userId,
          comment: input.comment ?? null,
          listingPublicationId: listing.publication.id,
          ...(listing.publication.sourceKind === 'product' ? { productId: sourceId } : { produceListingId: sourceId }),
          rating: input.rating,
          reviewEligibilityId: eligibility.id,
          sellerPartnerId: listing.sellerPartner.id,
          sellerTenantId: listing.seller.tenantId,
          sourceKind: listing.publication.sourceKind,
        });
        em.persist(review);
        await em.flush();
        await appendEvent(
          em,
          owner,
          'review',
          review.id,
          'review.submitted',
          { listingPublicationId: listing.publication.id, revision: review.revision },
          [
            {
              payload: { listingId: listing.publication.id, reviewId: review.id },
              templateKey: 'marketplace.engagement.review.submitted',
              tenantId: listing.seller.tenantId,
              userId: listing.seller.ownerUserId,
            },
          ],
        );
        return ok(reviewView(review));
      }),
    );
  }

  async listPublicReviews(listingPublicationId: string): Promise<OperationResult<MarketplaceReviewPage>> {
    return this.em.transactional(async (em) => {
      if (!(await resolveEligibleListing(em, listingPublicationId, false))) {
        return { status: 'not_found' };
      }
      const reviews = await em.find(
        MarketplaceListingReviewEntity,
        { listingPublicationId, verifiedDeal: true, visibility: 'visible' },
        { limit: maximumPrivateListSize, orderBy: { createdAt: 'DESC', id: 'ASC' } },
      );
      const replies =
        reviews.length === 0
          ? []
          : await em.find(MarketplaceReviewReplyEntity, { reviewId: { $in: reviews.map((review) => review.id) } });
      const replyByReview = new Map(replies.map((reply) => [reply.reviewId, reply]));
      const aggregate = await em.findOne(MarketplaceReviewAggregateEntity, { listingPublicationId });
      return ok({
        aggregate: aggregateView(listingPublicationId, aggregate ?? undefined),
        items: reviews.map((review) => reviewView(review, replyByReview.get(review.id))),
      });
    });
  }

  /**
   * Whether this caller may still rate the listing, and the review they already
   * left on it.
   *
   * It reads exactly the state `submitReview` writes against - one unconsumed
   * completed-contract eligibility for this buyer and governed source - so the
   * form the browser renders and the gate the server enforces cannot disagree.
   * A caller with no active buyer membership is not an error here: they simply
   * cannot review, and the ratings block still has to render for them.
   */
  async getReviewSelfState(
    owner: AgriTechOwner,
    listingPublicationId: string,
  ): Promise<OperationResult<MarketplaceReviewSelfState>> {
    return this.em.transactional(async (em) => {
      const listing = await resolveEligibleListing(em, listingPublicationId, false);
      if (!listing) {
        return { status: 'not_found' as const };
      }
      const sourceId = listing.publication.productId ?? listing.publication.produceListingId;
      const buyer = await deriveBuyerParty(em, owner);
      if (!sourceId || buyer.status !== 'ok' || buyer.value.partner.id === listing.sellerPartner.id) {
        return ok({ canReview: false, listingPublicationId });
      }
      const sourceFilter =
        listing.publication.sourceKind === 'product'
          ? { productId: sourceId, sourceKind: 'product' as const }
          : { produceListingId: sourceId, sourceKind: 'produce' as const };
      const own = await em.findOne(MarketplaceListingReviewEntity, {
        buyerTenantId: owner.tenantId,
        buyerUserId: owner.userId,
        ...sourceFilter,
      });
      if (own) {
        const reply = await em.findOne(MarketplaceReviewReplyEntity, { reviewId: own.id });
        return ok({
          canReview: false,
          listingPublicationId,
          review: reviewView(own, reply ?? undefined),
        });
      }
      const eligibilities = await em.find(
        MarketplaceContractReviewEligibilityEntity,
        {
          buyerPartnerId: buyer.value.partner.id,
          buyerTenantId: owner.tenantId,
          buyerUserId: owner.userId,
          sellerPartnerId: listing.sellerPartner.id,
          sellerTenantId: listing.seller.tenantId,
          sourceId,
          sourceKind: listing.publication.sourceKind,
          sourcePublicationId: listing.publication.id,
        },
        { limit: 10, orderBy: { createdAt: 'ASC', id: 'ASC' } },
      );
      if (eligibilities.length === 0) {
        return ok({ canReview: false, listingPublicationId });
      }
      const consumed = await em.find(MarketplaceListingReviewEntity, {
        reviewEligibilityId: { $in: eligibilities.map((eligibility) => eligibility.id) },
      });
      const consumedIds = new Set(consumed.map((review) => review.reviewEligibilityId));
      return ok({
        canReview: eligibilities.some((eligibility) => !consumedIds.has(eligibility.id)),
        listingPublicationId,
      });
    });
  }

  async replyToReview(
    owner: AgriTechOwner,
    reviewId: string,
    input: ReplyMarketplaceReviewInput,
    idempotencyKey: string,
  ): Promise<OperationResult<MarketplaceReviewView>> {
    return this.em.transactional((em) =>
      executeOperation(em, owner, 'review_reply', reviewId, idempotencyKey, input, async () => {
        const review = await em.findOne(
          MarketplaceListingReviewEntity,
          { id: reviewId, visibility: 'visible' },
          { lockMode: LockMode.PESSIMISTIC_WRITE },
        );
        if (
          !review ||
          review.sellerTenantId !== owner.tenantId ||
          !(await findAuthorizedParty(em, owner, review.sellerPartnerId, 'seller'))
        ) {
          return { status: 'not_found' };
        }
        if (review.revision !== input.expectedRevision) {
          return { status: 'conflict', field: 'expectedRevision' };
        }
        if (await em.findOne(MarketplaceReviewReplyEntity, { reviewId })) {
          return { status: 'conflict', field: 'reply' };
        }
        const reply = new MarketplaceReviewReplyEntity();
        Object.assign(reply, {
          comment: input.comment,
          reviewId,
          sellerPartnerId: review.sellerPartnerId,
          sellerTenantId: owner.tenantId,
          sellerUserId: owner.userId,
        });
        em.persist(reply);
        await em.flush();
        await appendEvent(
          em,
          owner,
          'review',
          review.id,
          'review.replied',
          { listingPublicationId: review.listingPublicationId, replyId: reply.id },
          [
            {
              payload: { listingId: review.listingPublicationId, reviewId: review.id },
              templateKey: 'marketplace.engagement.review.replied',
              tenantId: review.buyerTenantId,
              userId: review.buyerUserId,
            },
          ],
        );
        return ok(reviewView(review, reply));
      }),
    );
  }

  async reportReview(
    owner: AgriTechOwner,
    reviewId: string,
    input: ReportMarketplaceReviewInput,
    idempotencyKey: string,
  ): Promise<OperationResult<MarketplaceReviewReportReceipt>> {
    return this.em.transactional((em) =>
      executeOperation(em, owner, 'review_report', reviewId, idempotencyKey, input, async () => {
        await em.execute('select pg_advisory_xact_lock(hashtext(?))', [
          `marketplace-review-report:${reviewId}:${owner.tenantId}:${owner.userId}:${input.reason}`,
        ]);
        const review = await em.findOne(
          MarketplaceListingReviewEntity,
          { id: reviewId, visibility: 'visible' },
          { lockMode: LockMode.PESSIMISTIC_READ },
        );
        if (!review || !(await resolveEligibleListing(em, review.listingPublicationId, false))) {
          return { status: 'not_found' };
        }
        const existing = await em.findOne(MarketplaceReviewReportEntity, {
          reason: input.reason,
          reporterTenantId: owner.tenantId,
          reporterUserId: owner.userId,
          reviewId,
        });
        if (existing) {
          return ok({ createdAt: existing.createdAt, id: existing.id, revision: existing.revision, status: 'pending' });
        }
        const reply = await em.findOne(MarketplaceReviewReplyEntity, { reviewId });
        const report = new MarketplaceReviewReportEntity();
        Object.assign(report, {
          comment: input.comment ?? null,
          moderationTenantId: review.sellerTenantId,
          reason: input.reason,
          reporterTenantId: owner.tenantId,
          reporterUserId: owner.userId,
          reviewId,
          reviewSnapshot: canonicalValue(reviewView(review, reply ?? undefined)),
        });
        em.persist(report);
        await em.flush();
        await appendEvent(em, owner, 'review_report', report.id, 'review_report.submitted', {
          reason: report.reason,
          reviewId,
        });
        return ok({ createdAt: report.createdAt, id: report.id, revision: report.revision, status: 'pending' });
      }),
    );
  }

  async listReviewModerationQueue(tenantId: string): Promise<MarketplaceReviewModerationItem[]> {
    const reports = await this.em.find(
      MarketplaceReviewReportEntity,
      { moderationTenantId: tenantId, status: 'pending' },
      { limit: maximumPrivateListSize, orderBy: { createdAt: 'ASC', id: 'ASC' } },
    );
    return reports.map((report) => ({
      expectedRevision: report.revision,
      reason: report.reason,
      ...(report.comment ? { reportComment: report.comment } : {}),
      reportId: report.id,
      review: reviveValue(report.reviewSnapshot) as MarketplaceReviewView,
      submittedAt: report.createdAt,
    }));
  }

  async moderateReviewReport(
    owner: AgriTechOwner,
    reportId: string,
    input: ModerateMarketplaceReviewReportInput,
    idempotencyKey: string,
  ): Promise<OperationResult<MarketplaceReviewModerationResult>> {
    return this.em.transactional((em) =>
      executeOperation(em, owner, 'review_moderate', reportId, idempotencyKey, input, async () => {
        const report = await em.findOne(
          MarketplaceReviewReportEntity,
          { id: reportId, moderationTenantId: owner.tenantId },
          { lockMode: LockMode.PESSIMISTIC_WRITE },
        );
        if (!report) {
          return { status: 'not_found' };
        }
        if (report.status !== 'pending' || report.revision !== input.expectedRevision) {
          return { status: 'conflict', field: 'expectedRevision' };
        }
        const review = await em.findOne(
          MarketplaceListingReviewEntity,
          { id: report.reviewId, sellerTenantId: owner.tenantId },
          { lockMode: LockMode.PESSIMISTIC_WRITE },
        );
        if (!review) {
          return { status: 'not_found' };
        }
        if (input.decision === 'hidden') {
          if (review.visibility !== 'visible') {
            return { status: 'conflict', field: 'reviewVisibility' };
          }
          review.visibility = 'hidden';
          review.revision += 1;
          review.updatedAt = new Date();
        }
        report.decidedAt = new Date();
        report.decidedByUserId = owner.userId;
        report.revision += 1;
        report.status = input.decision;
        report.updatedAt = report.decidedAt;
        await em.flush();
        const aggregate = await em.findOne(
          MarketplaceReviewAggregateEntity,
          { listingPublicationId: review.listingPublicationId },
          { refresh: true },
        );
        const result: MarketplaceReviewModerationResult = {
          aggregate: aggregateView(review.listingPublicationId, aggregate ?? undefined),
          decidedAt: report.decidedAt,
          decision: input.decision,
          reportId: report.id,
          revision: report.revision,
          reviewVisible: review.visibility === 'visible',
        };
        await appendEvent(
          em,
          owner,
          'review_report',
          report.id,
          `review_report.${input.decision}`,
          { reviewId: review.id, revision: report.revision },
          [
            {
              payload: { listingId: review.listingPublicationId, reviewId: review.id },
              templateKey: 'marketplace.engagement.review.moderated',
              tenantId: review.buyerTenantId,
              userId: review.buyerUserId,
            },
          ],
        );
        return ok(result);
      }),
    );
  }
}
