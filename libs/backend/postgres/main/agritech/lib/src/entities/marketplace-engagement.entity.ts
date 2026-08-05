// @requirements REQ-AGRITECH-ENGAGEMENT-019
import { randomUUID } from 'node:crypto';
import { EntitySchema } from '@mikro-orm/core';
import type {
  MarketplaceEngagementLocale,
  MarketplaceEngagementSourceKind,
  MarketplaceReviewModerationDecision,
  MarketplaceReviewReportReason,
  MarketplaceSampleDeliveryMethod,
  MarketplaceSampleStatus,
} from '@app/backend-feature-agritech-shared';
import { MarketplaceContractReviewEligibilityEntity } from './marketplace-contract-lifecycle.entity';
import { MarketplaceListingPublicationEntity } from './marketplace-public.entity';
import { ProduceListingEntity } from './operations.entity';
import { ProductEntity } from './product.entity';

export type MarketplaceEngagementOperationKind =
  | 'favorite_add'
  | 'favorite_remove'
  | 'sample_request'
  | 'sample_transition'
  | 'sample_feedback'
  | 'sample_policy_activate'
  | 'review_submit'
  | 'review_reply'
  | 'review_report'
  | 'review_moderate';

export class MarketplaceSamplePolicyEntity {
  id: string = randomUUID();
  tenantId!: string;
  version = 1;
  monthlyLimit = 5;
  active = true;
  activatedByUserId!: string;
  activeFrom: Date = new Date();
  retiredAt: Date | null = null;
  createdAt: Date = new Date();
}

export const MarketplaceSamplePolicyEntitySchema = new EntitySchema<MarketplaceSamplePolicyEntity>({
  class: MarketplaceSamplePolicyEntity,
  tableName: 'marketplace_sample_policies',
  properties: {
    id: { type: 'uuid', primary: true },
    tenantId: { type: 'varchar', length: 100, fieldName: 'tenant_id' },
    version: { type: 'int', default: 1 },
    monthlyLimit: { type: 'int', default: 5, fieldName: 'monthly_limit' },
    active: { type: 'boolean', default: true },
    activatedByUserId: { type: 'varchar', length: 100, fieldName: 'activated_by_user_id' },
    activeFrom: { type: 'timestamptz', fieldName: 'active_from', defaultRaw: 'now()' },
    retiredAt: { type: 'timestamptz', nullable: true, fieldName: 'retired_at' },
    createdAt: { type: 'timestamptz', fieldName: 'created_at', defaultRaw: 'now()' },
  },
  uniques: [
    { name: 'uq__marketplace_sample_policies__tenant_version', properties: ['tenantId', 'version'] },
    {
      name: 'uq__marketplace_sample_policies__tenant_id_active',
      properties: ['tenantId', 'active'],
      where: `"active" = true`,
    },
  ],
  indexes: [{ name: 'ix__marketplace_sample_policies__tenant_id_active', properties: ['tenantId', 'active'] }],
  checks: [
    {
      name: 'ck__marketplace_sample_policies__limit',
      expression: `"version" >= 1 and "monthly_limit" between 1 and 100`,
    },
    {
      name: 'ck__marketplace_sample_policies__lifecycle',
      expression: `("active" = true and "retired_at" is null) or ("active" = false and "retired_at" is not null)`,
    },
  ],
});

export class MarketplaceSampleMonthlyUsageEntity {
  requesterTenantId!: string;
  requesterUserId!: string;
  monthKey!: string;
  usedCount = 0;
  updatedAt: Date = new Date();
}

export const MarketplaceSampleMonthlyUsageEntitySchema = new EntitySchema<MarketplaceSampleMonthlyUsageEntity>({
  class: MarketplaceSampleMonthlyUsageEntity,
  tableName: 'marketplace_sample_monthly_usage',
  properties: {
    requesterTenantId: { type: 'varchar', length: 100, primary: true, fieldName: 'requester_tenant_id' },
    requesterUserId: { type: 'varchar', length: 100, primary: true, fieldName: 'requester_user_id' },
    monthKey: { type: 'varchar', length: 7, primary: true, fieldName: 'month_key' },
    usedCount: { type: 'int', default: 0, fieldName: 'used_count' },
    updatedAt: { type: 'timestamptz', fieldName: 'updated_at', defaultRaw: 'now()' },
  },
  checks: [
    {
      name: 'ck__marketplace_sample_monthly_usage__period',
      expression: `"month_key" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'`,
    },
    {
      name: 'ck__marketplace_sample_monthly_usage__count',
      expression: `"used_count" between 0 and 100`,
    },
  ],
});

export class MarketplaceListingFavoriteEntity {
  id: string = randomUUID();
  actorTenantId!: string;
  actorUserId!: string;
  listingPublicationId!: string;
  createdAt: Date = new Date();
}

export const MarketplaceListingFavoriteEntitySchema = new EntitySchema<MarketplaceListingFavoriteEntity>({
  class: MarketplaceListingFavoriteEntity,
  tableName: 'marketplace_listing_favorites',
  properties: {
    id: { type: 'uuid', primary: true },
    actorTenantId: { type: 'varchar', length: 100, fieldName: 'actor_tenant_id' },
    actorUserId: { type: 'varchar', length: 100, fieldName: 'actor_user_id' },
    listingPublicationId: { type: 'uuid', fieldName: 'listing_publication_id' },
    createdAt: { type: 'timestamptz', fieldName: 'created_at', defaultRaw: 'now()' },
  },
  uniques: [
    {
      name: 'uq__marketplace_listing_favorites__actor_listing',
      properties: ['actorTenantId', 'actorUserId', 'listingPublicationId'],
    },
  ],
  indexes: [
    {
      name: 'ix__marketplace_listing_favorites__actor_tenant_id_act_bff3e4bb',
      properties: ['actorTenantId', 'actorUserId', 'createdAt'],
    },
  ],
});
MarketplaceListingFavoriteEntitySchema.addManyToOne<MarketplaceListingFavoriteEntity>(
  'listingPublicationId',
  MarketplaceListingPublicationEntity.name,
  {
    deleteRule: 'restrict',
    fieldName: 'listing_publication_id',
    foreignKeyName: 'fk__marketplace_listing_favorites__listing_id',
    mapToPk: true,
  },
);

export class MarketplaceListingSampleEntity {
  id: string = randomUUID();
  listingPublicationId!: string;
  sourceKind!: MarketplaceEngagementSourceKind;
  productId: string | null = null;
  produceListingId: string | null = null;
  requesterTenantId!: string;
  requesterUserId!: string;
  requesterPartnerId!: string;
  sellerTenantId!: string;
  sellerUserId!: string;
  sellerPartnerId!: string;
  seasonKey!: string;
  monthKey!: string;
  policyId!: string;
  policyVersion!: number;
  monthlyLimit!: number;
  deliveryMethod!: MarketplaceSampleDeliveryMethod;
  deliveryQuoteUzs: number | null = null;
  itemPriceUzs = 0;
  status: MarketplaceSampleStatus = 'requested';
  feedbackRating: number | null = null;
  feedbackComment: string | null = null;
  feedbackAt: Date | null = null;
  revision = 0;
  createdAt: Date = new Date();
  updatedAt: Date = new Date();
}

export const MarketplaceListingSampleEntitySchema = new EntitySchema<MarketplaceListingSampleEntity>({
  class: MarketplaceListingSampleEntity,
  tableName: 'marketplace_listing_samples',
  properties: {
    id: { type: 'uuid', primary: true },
    listingPublicationId: { type: 'uuid', fieldName: 'listing_publication_id' },
    sourceKind: { type: 'varchar', length: 20, fieldName: 'source_kind' },
    productId: { type: 'uuid', nullable: true, fieldName: 'product_id' },
    produceListingId: { type: 'uuid', nullable: true, fieldName: 'produce_listing_id' },
    requesterTenantId: { type: 'varchar', length: 100, fieldName: 'requester_tenant_id' },
    requesterUserId: { type: 'varchar', length: 100, fieldName: 'requester_user_id' },
    requesterPartnerId: { type: 'uuid', fieldName: 'requester_partner_id' },
    sellerTenantId: { type: 'varchar', length: 100, fieldName: 'seller_tenant_id' },
    sellerUserId: { type: 'varchar', length: 100, fieldName: 'seller_user_id' },
    sellerPartnerId: { type: 'uuid', fieldName: 'seller_partner_id' },
    seasonKey: { type: 'varchar', length: 10, fieldName: 'season_key' },
    monthKey: { type: 'varchar', length: 7, fieldName: 'month_key' },
    policyId: { type: 'uuid', fieldName: 'policy_id' },
    policyVersion: { type: 'int', fieldName: 'policy_version' },
    monthlyLimit: { type: 'int', fieldName: 'monthly_limit' },
    deliveryMethod: { type: 'varchar', length: 20, fieldName: 'delivery_method' },
    deliveryQuoteUzs: {
      type: 'numeric',
      precision: 15,
      scale: 0,
      nullable: true,
      fieldName: 'delivery_quote_uzs',
    },
    itemPriceUzs: { type: 'int', default: 0, fieldName: 'item_price_uzs' },
    status: { type: 'varchar', length: 20, default: 'requested' },
    feedbackRating: { type: 'int', nullable: true, fieldName: 'feedback_rating' },
    feedbackComment: { type: 'varchar', length: 1_000, nullable: true, fieldName: 'feedback_comment' },
    feedbackAt: { type: 'timestamptz', nullable: true, fieldName: 'feedback_at' },
    revision: { type: 'int', default: 0 },
    createdAt: { type: 'timestamptz', fieldName: 'created_at', defaultRaw: 'now()' },
    updatedAt: { type: 'timestamptz', fieldName: 'updated_at', defaultRaw: 'now()' },
  },
  uniques: [
    {
      name: 'uq__marketplace_listing_samples__requester_tenant_id_r_63a04c4b',
      properties: ['requesterTenantId', 'requesterUserId', 'productId', 'seasonKey'],
      where: `"source_kind" = 'product'`,
    },
    {
      name: 'uq__marketplace_listing_samples__requester_tenant_id_r_3eba0d03',
      properties: ['requesterTenantId', 'requesterUserId', 'produceListingId', 'seasonKey'],
      where: `"source_kind" = 'produce'`,
    },
  ],
  indexes: [
    {
      name: 'ix__marketplace_listing_samples__requester_tenant_id_r_4700d0a5',
      properties: ['requesterTenantId', 'requesterUserId', 'monthKey', 'createdAt'],
    },
    {
      name: 'ix__marketplace_listing_samples__seller_tenant_id_sell_ecc53350',
      properties: ['sellerTenantId', 'sellerPartnerId', 'status', 'createdAt'],
    },
  ],
  checks: [
    { name: 'ck__marketplace_listing_samples__source_kind', expression: `"source_kind" in ('product', 'produce')` },
    {
      name: 'ck__marketplace_listing_samples__source_pair',
      expression: `("source_kind" = 'product' and "product_id" is not null and "produce_listing_id" is null)
        or ("source_kind" = 'produce' and "product_id" is null and "produce_listing_id" is not null)`,
    },
    {
      name: 'ck__marketplace_listing_samples__period',
      expression: `"season_key" ~ '^[0-9]{4}-Q[1-4]$' and "month_key" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'`,
    },
    {
      name: 'ck__marketplace_listing_samples__policy',
      expression: `"policy_version" >= 1 and "monthly_limit" between 1 and 100`,
    },
    {
      name: 'ck__marketplace_listing_samples__delivery',
      expression: `"item_price_uzs" = 0 and "delivery_method" in ('pickup', 'seller_delivery')
        and ("delivery_quote_uzs" is null or ("delivery_quote_uzs" between 0 and 9999999999999
          and "delivery_quote_uzs" = trunc("delivery_quote_uzs")))
        and ("delivery_method" <> 'pickup' or "delivery_quote_uzs" is null or "delivery_quote_uzs" = 0)
        and ("status" = 'requested' or "delivery_method" <> 'seller_delivery' or "delivery_quote_uzs" is not null)`,
    },
    {
      name: 'ck__marketplace_listing_samples__status',
      expression: `"status" in ('requested', 'approved', 'declined', 'cancelled', 'shipped', 'received')`,
    },
    {
      name: 'ck__marketplace_listing_samples__feedback',
      expression: `("feedback_rating" is null and "feedback_comment" is null and "feedback_at" is null)
        or ("status" = 'received' and "feedback_rating" between 1 and 5 and "feedback_at" is not null)`,
    },
    { name: 'ck__marketplace_listing_samples__revision', expression: `"revision" >= 0` },
    {
      name: 'ck__marketplace_listing_samples__different_parties',
      expression: `"requester_partner_id" <> "seller_partner_id"`,
    },
  ],
});
MarketplaceListingSampleEntitySchema.addManyToOne<MarketplaceListingSampleEntity>(
  'listingPublicationId',
  MarketplaceListingPublicationEntity.name,
  {
    deleteRule: 'restrict',
    fieldName: 'listing_publication_id',
    foreignKeyName: 'fk__marketplace_listing_samples__listing_id',
    mapToPk: true,
  },
);
MarketplaceListingSampleEntitySchema.addManyToOne<MarketplaceListingSampleEntity>(
  'policyId',
  MarketplaceSamplePolicyEntity.name,
  {
    deleteRule: 'restrict',
    fieldName: 'policy_id',
    foreignKeyName: 'fk__marketplace_listing_samples__policy_id',
    mapToPk: true,
  },
);
MarketplaceListingSampleEntitySchema.addManyToOne<MarketplaceListingSampleEntity>('productId', ProductEntity.name, {
  deleteRule: 'restrict',
  fieldName: 'product_id',
  foreignKeyName: 'fk__marketplace_listing_samples__product_id',
  mapToPk: true,
  nullable: true,
});
MarketplaceListingSampleEntitySchema.addManyToOne<MarketplaceListingSampleEntity>(
  'produceListingId',
  ProduceListingEntity.name,
  {
    deleteRule: 'restrict',
    fieldName: 'produce_listing_id',
    foreignKeyName: 'fk__marketplace_listing_samples__produce_id',
    mapToPk: true,
    nullable: true,
  },
);

export class MarketplaceListingReviewEntity {
  id: string = randomUUID();
  listingPublicationId!: string;
  sourceKind!: MarketplaceEngagementSourceKind;
  productId: string | null = null;
  produceListingId: string | null = null;
  reviewEligibilityId!: string;
  buyerTenantId!: string;
  buyerUserId!: string;
  buyerPartnerId!: string;
  sellerTenantId!: string;
  sellerPartnerId!: string;
  rating!: number;
  comment: string | null = null;
  assetReferences: string[] = [];
  verifiedDeal = true;
  visibility: 'visible' | 'hidden' = 'visible';
  revision = 0;
  createdAt: Date = new Date();
  updatedAt: Date = new Date();
}

export const MarketplaceListingReviewEntitySchema = new EntitySchema<MarketplaceListingReviewEntity>({
  class: MarketplaceListingReviewEntity,
  tableName: 'marketplace_listing_reviews',
  properties: {
    id: { type: 'uuid', primary: true },
    listingPublicationId: { type: 'uuid', fieldName: 'listing_publication_id' },
    sourceKind: { type: 'varchar', length: 20, fieldName: 'source_kind' },
    productId: { type: 'uuid', nullable: true, fieldName: 'product_id' },
    produceListingId: { type: 'uuid', nullable: true, fieldName: 'produce_listing_id' },
    reviewEligibilityId: { type: 'uuid', fieldName: 'review_eligibility_id' },
    buyerTenantId: { type: 'varchar', length: 100, fieldName: 'buyer_tenant_id' },
    buyerUserId: { type: 'varchar', length: 100, fieldName: 'buyer_user_id' },
    buyerPartnerId: { type: 'uuid', fieldName: 'buyer_partner_id' },
    sellerTenantId: { type: 'varchar', length: 100, fieldName: 'seller_tenant_id' },
    sellerPartnerId: { type: 'uuid', fieldName: 'seller_partner_id' },
    rating: { type: 'int' },
    comment: { type: 'varchar', length: 2_000, nullable: true },
    assetReferences: { type: 'jsonb', defaultRaw: "'[]'::jsonb", fieldName: 'asset_references' },
    verifiedDeal: { type: 'boolean', default: true, fieldName: 'verified_deal' },
    visibility: { type: 'varchar', length: 20, default: 'visible' },
    revision: { type: 'int', default: 0 },
    createdAt: { type: 'timestamptz', fieldName: 'created_at', defaultRaw: 'now()' },
    updatedAt: { type: 'timestamptz', fieldName: 'updated_at', defaultRaw: 'now()' },
  },
  uniques: [
    { name: 'uq__marketplace_listing_reviews__eligibility', properties: ['reviewEligibilityId'] },
    {
      name: 'uq__marketplace_listing_reviews__buyer_tenant_id_buyer_87d1c30f',
      properties: ['buyerTenantId', 'buyerUserId', 'productId'],
      where: `"source_kind" = 'product'`,
    },
    {
      name: 'uq__marketplace_listing_reviews__buyer_tenant_id_buyer_d7b1cf3c',
      properties: ['buyerTenantId', 'buyerUserId', 'produceListingId'],
      where: `"source_kind" = 'produce'`,
    },
  ],
  indexes: [
    {
      name: 'ix__marketplace_listing_reviews__listing_publication_i_ac417fa8',
      properties: ['listingPublicationId', 'visibility', 'createdAt'],
    },
    {
      name: 'ix__marketplace_listing_reviews__seller_tenant_id_sell_8ec4a7a7',
      properties: ['sellerTenantId', 'sellerPartnerId', 'visibility'],
    },
  ],
  checks: [
    { name: 'ck__marketplace_listing_reviews__source_kind', expression: `"source_kind" in ('product', 'produce')` },
    {
      name: 'ck__marketplace_listing_reviews__source_pair',
      expression: `("source_kind" = 'product' and "product_id" is not null and "produce_listing_id" is null)
        or ("source_kind" = 'produce' and "product_id" is null and "produce_listing_id" is not null)`,
    },
    { name: 'ck__marketplace_listing_reviews__rating', expression: `"rating" between 1 and 5` },
    {
      name: 'ck__marketplace_listing_reviews__assets',
      expression: `jsonb_typeof("asset_references") = 'array' and jsonb_array_length("asset_references") <= 3
        and pg_column_size("asset_references") <= 1024`,
    },
    {
      name: 'ck__marketplace_listing_reviews__visibility',
      expression: `"verified_deal" = true and "visibility" in ('visible', 'hidden') and "revision" >= 0`,
    },
    {
      name: 'ck__marketplace_listing_reviews__different_parties',
      expression: `"buyer_partner_id" <> "seller_partner_id"`,
    },
  ],
});
MarketplaceListingReviewEntitySchema.addManyToOne<MarketplaceListingReviewEntity>(
  'listingPublicationId',
  MarketplaceListingPublicationEntity.name,
  {
    deleteRule: 'restrict',
    fieldName: 'listing_publication_id',
    foreignKeyName: 'fk__marketplace_listing_reviews__listing_id',
    mapToPk: true,
  },
);
MarketplaceListingReviewEntitySchema.addManyToOne<MarketplaceListingReviewEntity>(
  'reviewEligibilityId',
  MarketplaceContractReviewEligibilityEntity.name,
  {
    deleteRule: 'restrict',
    fieldName: 'review_eligibility_id',
    foreignKeyName: 'fk__marketplace_listing_reviews__eligibility_id',
    mapToPk: true,
  },
);
MarketplaceListingReviewEntitySchema.addManyToOne<MarketplaceListingReviewEntity>('productId', ProductEntity.name, {
  deleteRule: 'restrict',
  fieldName: 'product_id',
  foreignKeyName: 'fk__marketplace_listing_reviews__product_id',
  mapToPk: true,
  nullable: true,
});
MarketplaceListingReviewEntitySchema.addManyToOne<MarketplaceListingReviewEntity>(
  'produceListingId',
  ProduceListingEntity.name,
  {
    deleteRule: 'restrict',
    fieldName: 'produce_listing_id',
    foreignKeyName: 'fk__marketplace_listing_reviews__produce_id',
    mapToPk: true,
    nullable: true,
  },
);

export class MarketplaceReviewReplyEntity {
  id: string = randomUUID();
  reviewId!: string;
  sellerTenantId!: string;
  sellerUserId!: string;
  sellerPartnerId!: string;
  comment!: string;
  revision = 0;
  createdAt: Date = new Date();
  updatedAt: Date = new Date();
}

export const MarketplaceReviewReplyEntitySchema = new EntitySchema<MarketplaceReviewReplyEntity>({
  class: MarketplaceReviewReplyEntity,
  tableName: 'marketplace_review_replies',
  properties: {
    id: { type: 'uuid', primary: true },
    reviewId: { type: 'uuid', fieldName: 'review_id' },
    sellerTenantId: { type: 'varchar', length: 100, fieldName: 'seller_tenant_id' },
    sellerUserId: { type: 'varchar', length: 100, fieldName: 'seller_user_id' },
    sellerPartnerId: { type: 'uuid', fieldName: 'seller_partner_id' },
    comment: { type: 'varchar', length: 1_000 },
    revision: { type: 'int', default: 0 },
    createdAt: { type: 'timestamptz', fieldName: 'created_at', defaultRaw: 'now()' },
    updatedAt: { type: 'timestamptz', fieldName: 'updated_at', defaultRaw: 'now()' },
  },
  uniques: [{ name: 'uq__marketplace_review_replies__review_id', properties: ['reviewId'] }],
  checks: [
    { name: 'ck__marketplace_review_replies__comment', expression: `btrim("comment") <> ''` },
    { name: 'ck__marketplace_review_replies__revision', expression: `"revision" >= 0` },
  ],
});
MarketplaceReviewReplyEntitySchema.addManyToOne<MarketplaceReviewReplyEntity>(
  'reviewId',
  MarketplaceListingReviewEntity.name,
  {
    deleteRule: 'restrict',
    fieldName: 'review_id',
    foreignKeyName: 'fk__marketplace_review_replies__review_id',
    mapToPk: true,
  },
);

export class MarketplaceReviewAggregateEntity {
  listingPublicationId!: string;
  reviewCount = 0;
  ratingSum = 0;
  revision = 0;
  updatedAt: Date = new Date();
}

export const MarketplaceReviewAggregateEntitySchema = new EntitySchema<MarketplaceReviewAggregateEntity>({
  class: MarketplaceReviewAggregateEntity,
  tableName: 'marketplace_review_aggregates',
  properties: {
    listingPublicationId: { type: 'uuid', primary: true, fieldName: 'listing_publication_id' },
    reviewCount: { type: 'int', default: 0, fieldName: 'review_count' },
    ratingSum: { type: 'int', default: 0, fieldName: 'rating_sum' },
    revision: { type: 'int', default: 0 },
    updatedAt: { type: 'timestamptz', fieldName: 'updated_at', defaultRaw: 'now()' },
  },
  checks: [
    {
      name: 'ck__marketplace_review_aggregates__values',
      expression: `"review_count" >= 0 and "rating_sum" >= 0 and "rating_sum" <= "review_count" * 5
        and "revision" >= 0`,
    },
  ],
});
MarketplaceReviewAggregateEntitySchema.addManyToOne<MarketplaceReviewAggregateEntity>(
  'listingPublicationId',
  MarketplaceListingPublicationEntity.name,
  {
    deleteRule: 'restrict',
    fieldName: 'listing_publication_id',
    foreignKeyName: 'fk__marketplace_review_aggregates__listing_id',
    mapToPk: true,
    primary: true,
  },
);

export class MarketplaceReviewReportEntity {
  id: string = randomUUID();
  reviewId!: string;
  moderationTenantId!: string;
  reporterTenantId!: string;
  reporterUserId!: string;
  reason!: MarketplaceReviewReportReason;
  comment: string | null = null;
  status: 'pending' | MarketplaceReviewModerationDecision = 'pending';
  reviewSnapshot!: Record<string, unknown>;
  decidedByUserId: string | null = null;
  decidedAt: Date | null = null;
  revision = 0;
  createdAt: Date = new Date();
  updatedAt: Date = new Date();
}

export const MarketplaceReviewReportEntitySchema = new EntitySchema<MarketplaceReviewReportEntity>({
  class: MarketplaceReviewReportEntity,
  tableName: 'marketplace_review_reports',
  properties: {
    id: { type: 'uuid', primary: true },
    reviewId: { type: 'uuid', fieldName: 'review_id' },
    moderationTenantId: { type: 'varchar', length: 100, fieldName: 'moderation_tenant_id' },
    reporterTenantId: { type: 'varchar', length: 100, fieldName: 'reporter_tenant_id' },
    reporterUserId: { type: 'varchar', length: 100, fieldName: 'reporter_user_id' },
    reason: { type: 'varchar', length: 20 },
    comment: { type: 'varchar', length: 500, nullable: true },
    status: { type: 'varchar', length: 20, default: 'pending' },
    reviewSnapshot: { type: 'jsonb', fieldName: 'review_snapshot' },
    decidedByUserId: { type: 'varchar', length: 100, nullable: true, fieldName: 'decided_by_user_id' },
    decidedAt: { type: 'timestamptz', nullable: true, fieldName: 'decided_at' },
    revision: { type: 'int', default: 0 },
    createdAt: { type: 'timestamptz', fieldName: 'created_at', defaultRaw: 'now()' },
    updatedAt: { type: 'timestamptz', fieldName: 'updated_at', defaultRaw: 'now()' },
  },
  uniques: [
    {
      name: 'uq__marketplace_review_reports__reporter_reason',
      properties: ['reviewId', 'reporterTenantId', 'reporterUserId', 'reason'],
    },
  ],
  indexes: [
    {
      name: 'ix__marketplace_review_reports__moderation_tenant_id_s_7a2c2259',
      properties: ['moderationTenantId', 'status', 'createdAt'],
    },
  ],
  checks: [
    {
      name: 'ck__marketplace_review_reports__reason',
      expression: `"reason" in ('spam', 'abuse', 'privacy', 'off_topic')`,
    },
    {
      name: 'ck__marketplace_review_reports__status',
      expression: `("status" = 'pending' and "decided_by_user_id" is null and "decided_at" is null and "revision" = 0)
        or ("status" in ('dismissed', 'hidden') and btrim("decided_by_user_id") <> ''
          and "decided_at" is not null and "revision" = 1)`,
    },
    {
      name: 'ck__marketplace_review_reports__snapshot',
      expression: `jsonb_typeof("review_snapshot") = 'object' and pg_column_size("review_snapshot") <= 16384`,
    },
  ],
});
MarketplaceReviewReportEntitySchema.addManyToOne<MarketplaceReviewReportEntity>(
  'reviewId',
  MarketplaceListingReviewEntity.name,
  {
    deleteRule: 'restrict',
    fieldName: 'review_id',
    foreignKeyName: 'fk__marketplace_review_reports__review_id',
    mapToPk: true,
  },
);

export class MarketplaceEngagementEventEntity {
  id: string = randomUUID();
  aggregateType!: 'sample' | 'review' | 'review_report' | 'sample_policy';
  aggregateId!: string;
  sequence!: number;
  eventType!: string;
  actorTenantId!: string;
  actorUserId!: string;
  metadata: Record<string, unknown> = {};
  createdAt: Date = new Date();
}

export const MarketplaceEngagementEventEntitySchema = new EntitySchema<MarketplaceEngagementEventEntity>({
  class: MarketplaceEngagementEventEntity,
  tableName: 'marketplace_engagement_events',
  properties: {
    id: { type: 'uuid', primary: true },
    aggregateType: { type: 'varchar', length: 20, fieldName: 'aggregate_type' },
    aggregateId: { type: 'uuid', fieldName: 'aggregate_id' },
    sequence: { type: 'int' },
    eventType: { type: 'varchar', length: 50, fieldName: 'event_type' },
    actorTenantId: { type: 'varchar', length: 100, fieldName: 'actor_tenant_id' },
    actorUserId: { type: 'varchar', length: 100, fieldName: 'actor_user_id' },
    metadata: { type: 'jsonb', defaultRaw: "'{}'::jsonb" },
    createdAt: { type: 'timestamptz', fieldName: 'created_at', defaultRaw: 'now()' },
  },
  uniques: [
    {
      name: 'uq__marketplace_engagement_events__aggregate_sequence',
      properties: ['aggregateType', 'aggregateId', 'sequence'],
    },
  ],
  indexes: [
    {
      name: 'ix__marketplace_engagement_events__aggregate_type_aggr_0aec3d52',
      properties: ['aggregateType', 'aggregateId', 'createdAt'],
    },
  ],
  checks: [
    {
      name: 'ck__marketplace_engagement_events__aggregate_type',
      expression: `"aggregate_type" in ('sample', 'review', 'review_report', 'sample_policy')`,
    },
    {
      name: 'ck__marketplace_engagement_events__metadata',
      expression: `"sequence" >= 1 and jsonb_typeof("metadata") = 'object' and pg_column_size("metadata") <= 4096`,
    },
  ],
});

export class MarketplaceEngagementNotificationIntentEntity {
  id: string = randomUUID();
  eventId!: string;
  recipientTenantId!: string;
  recipientUserId!: string;
  recipientLocale: MarketplaceEngagementLocale = 'en';
  templateKey!: string;
  payload: Record<string, unknown> = {};
  status = 'pending' as const;
  createdAt: Date = new Date();
}

export const MarketplaceEngagementNotificationIntentEntitySchema =
  new EntitySchema<MarketplaceEngagementNotificationIntentEntity>({
    class: MarketplaceEngagementNotificationIntentEntity,
    tableName: 'marketplace_engagement_notification_intents',
    properties: {
      id: { type: 'uuid', primary: true },
      eventId: { type: 'uuid', fieldName: 'event_id' },
      recipientTenantId: { type: 'varchar', length: 100, fieldName: 'recipient_tenant_id' },
      recipientUserId: { type: 'varchar', length: 100, fieldName: 'recipient_user_id' },
      recipientLocale: { type: 'varchar', length: 16, default: 'en', fieldName: 'recipient_locale' },
      templateKey: { type: 'varchar', length: 80, fieldName: 'template_key' },
      payload: { type: 'jsonb', defaultRaw: "'{}'::jsonb" },
      status: { type: 'varchar', length: 20, default: 'pending' },
      createdAt: { type: 'timestamptz', fieldName: 'created_at', defaultRaw: 'now()' },
    },
    uniques: [
      {
        name: 'uq__marketplace_engagement_notification__event_recipient',
        properties: ['eventId', 'recipientTenantId', 'recipientUserId'],
      },
    ],
    indexes: [
      {
        name: 'ix__marketplace_engagement_notification_intents__recip_c0281b60',
        properties: ['recipientTenantId', 'recipientUserId', 'createdAt'],
      },
    ],
    checks: [
      {
        name: 'ck__marketplace_engagement_notification__locale',
        expression: `"recipient_locale" in ('en', 'ru', 'uz', 'uz-cyrl')`,
      },
      { name: 'ck__marketplace_engagement_notification__status', expression: `"status" = 'pending'` },
      {
        name: 'ck__marketplace_engagement_notification__payload',
        expression: `jsonb_typeof("payload") = 'object' and pg_column_size("payload") <= 2048`,
      },
    ],
  });
MarketplaceEngagementNotificationIntentEntitySchema.addManyToOne<MarketplaceEngagementNotificationIntentEntity>(
  'eventId',
  MarketplaceEngagementEventEntity.name,
  {
    deleteRule: 'restrict',
    fieldName: 'event_id',
    foreignKeyName: 'fk__marketplace_engagement_notification__event_id',
    mapToPk: true,
  },
);

export class MarketplaceEngagementOperationEntity {
  id: string = randomUUID();
  actorTenantId!: string;
  actorUserId!: string;
  operation!: MarketplaceEngagementOperationKind;
  resourceKey!: string;
  idempotencyKey!: string;
  requestFingerprint!: string;
  resultSnapshot!: Record<string, unknown>;
  createdAt: Date = new Date();
}

export const MarketplaceEngagementOperationEntitySchema = new EntitySchema<MarketplaceEngagementOperationEntity>({
  class: MarketplaceEngagementOperationEntity,
  tableName: 'marketplace_engagement_operations',
  properties: {
    id: { type: 'uuid', primary: true },
    actorTenantId: { type: 'varchar', length: 100, fieldName: 'actor_tenant_id' },
    actorUserId: { type: 'varchar', length: 100, fieldName: 'actor_user_id' },
    operation: { type: 'varchar', length: 30 },
    resourceKey: { type: 'varchar', length: 100, fieldName: 'resource_key' },
    idempotencyKey: { type: 'varchar', length: 100, fieldName: 'idempotency_key' },
    requestFingerprint: { type: 'varchar', length: 64, fieldName: 'request_fingerprint' },
    resultSnapshot: { type: 'jsonb', fieldName: 'result_snapshot' },
    createdAt: { type: 'timestamptz', fieldName: 'created_at', defaultRaw: 'now()' },
  },
  uniques: [
    {
      name: 'uq__marketplace_engagement_operations__actor_operation_key',
      properties: ['actorTenantId', 'actorUserId', 'operation', 'idempotencyKey'],
    },
  ],
  indexes: [
    {
      name: 'ix__marketplace_engagement_operations__actor_tenant_id_72b5ee1a',
      properties: ['actorTenantId', 'actorUserId', 'createdAt'],
    },
  ],
  checks: [
    {
      name: 'ck__marketplace_engagement_operations__operation',
      expression: `"operation" in ('favorite_add', 'favorite_remove', 'sample_request', 'sample_transition',
        'sample_feedback', 'sample_policy_activate', 'review_submit', 'review_reply', 'review_report', 'review_moderate')`,
    },
    {
      name: 'ck__marketplace_engagement_operations__fingerprint',
      expression: `"request_fingerprint" ~ '^[0-9a-f]{64}$'`,
    },
    {
      name: 'ck__marketplace_engagement_operations__snapshot',
      expression: `jsonb_typeof("result_snapshot") = 'object' and pg_column_size("result_snapshot") <= 65536`,
    },
  ],
});
