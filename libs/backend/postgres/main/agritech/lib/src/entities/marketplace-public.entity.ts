// @requirements REQ-AGRITECH-PUBLIC-018
import { randomUUID } from 'node:crypto';
import { EntitySchema } from '@mikro-orm/core';
import type {
  MarketplaceListingSection,
  MarketplaceListingSourceKind,
  MarketplaceModerationStatus,
  MarketplacePublicationStatus,
} from '@app/backend-feature-agritech-shared';
import { BuyerRequestEntity } from './marketplace.entity';
import { AgriTechPartnerEntity, ProduceListingEntity } from './operations.entity';
import { ProductEntity } from './product.entity';

export class MarketplacePublicSellerEntity {
  id: string = randomUUID();
  tenantId!: string;
  partnerId!: string;
  partnerKind = 'supplier' as const;
  ownerUserId!: string;
  contentRevision = 1;
  status: Extract<MarketplacePublicationStatus, 'published' | 'paused'> = 'published';
  createdAt: Date = new Date();
  updatedAt: Date = new Date();
}

export const MarketplacePublicSellerEntitySchema = new EntitySchema<MarketplacePublicSellerEntity>({
  class: MarketplacePublicSellerEntity,
  tableName: 'marketplace_public_sellers',
  properties: {
    id: { type: 'uuid', primary: true },
    tenantId: { type: 'varchar', length: 100, fieldName: 'tenant_id' },
    partnerId: { type: 'uuid', fieldName: 'partner_id' },
    partnerKind: { type: 'varchar', length: 20, default: 'supplier', fieldName: 'partner_kind' },
    ownerUserId: { type: 'varchar', length: 100, fieldName: 'owner_user_id' },
    contentRevision: { type: 'int', default: 1, fieldName: 'content_revision' },
    status: { type: 'varchar', length: 20, default: 'published' },
    createdAt: { type: 'timestamptz', fieldName: 'created_at', defaultRaw: 'now()', onCreate: () => new Date() },
    updatedAt: {
      type: 'timestamptz',
      fieldName: 'updated_at',
      defaultRaw: 'now()',
      onCreate: () => new Date(),
      onUpdate: () => new Date(),
    },
  },
  uniques: [
    { name: 'uq__marketplace_public_sellers__partner_id', properties: ['partnerId'] },
    { name: 'uq__marketplace_public_sellers__id_tenant_id', properties: ['id', 'tenantId'] },
  ],
  indexes: [
    { name: 'ix__marketplace_public_sellers__tenant_id_owner_user_id', properties: ['tenantId', 'ownerUserId'] },
    { name: 'ix__marketplace_public_sellers__status', properties: ['status'] },
  ],
  checks: [
    { name: 'ck__marketplace_public_sellers__status', expression: `"status" in ('published', 'paused')` },
    {
      name: 'ck__marketplace_public_sellers__partner_kind',
      expression: `"partner_kind" in ('supplier')`,
    },
    { name: 'ck__marketplace_public_sellers__content_revision', expression: `"content_revision" >= 1` },
  ],
});

MarketplacePublicSellerEntitySchema.addManyToOne<MarketplacePublicSellerEntity>(
  'partnerId',
  AgriTechPartnerEntity.name,
  {
    deleteRule: 'restrict',
    fieldName: 'partner_id',
    foreignKeyName: 'fk__marketplace_public_sellers__partner_id',
    mapToPk: true,
  },
);

export class MarketplacePublicSellerRevisionEntity {
  id: string = randomUUID();
  sellerPublicId!: string;
  tenantId!: string;
  contentRevision!: number;
  contentFingerprint!: string;
  displayName!: string;
  description: string | null = null;
  region!: string;
  moderationStatus: MarketplaceModerationStatus = 'pending';
  moderatedBy: string | null = null;
  moderatedAt: Date | null = null;
  createdAt: Date = new Date();
  updatedAt: Date = new Date();
}

export const MarketplacePublicSellerRevisionEntitySchema = new EntitySchema<MarketplacePublicSellerRevisionEntity>({
  class: MarketplacePublicSellerRevisionEntity,
  tableName: 'marketplace_public_seller_revisions',
  properties: {
    id: { type: 'uuid', primary: true },
    sellerPublicId: { type: 'uuid', fieldName: 'seller_public_id' },
    tenantId: { type: 'varchar', length: 100, fieldName: 'tenant_id' },
    contentRevision: { type: 'int', fieldName: 'content_revision' },
    contentFingerprint: { type: 'varchar', length: 64, fieldName: 'content_fingerprint' },
    displayName: { type: 'varchar', length: 200, fieldName: 'display_name' },
    description: { type: 'varchar', length: 2000, nullable: true },
    region: { type: 'varchar', length: 100 },
    moderationStatus: { type: 'varchar', length: 20, default: 'pending', fieldName: 'moderation_status' },
    moderatedBy: { type: 'varchar', length: 100, nullable: true, fieldName: 'moderated_by' },
    moderatedAt: { type: 'timestamptz', nullable: true, fieldName: 'moderated_at' },
    createdAt: { type: 'timestamptz', fieldName: 'created_at', defaultRaw: 'now()' },
    updatedAt: { type: 'timestamptz', fieldName: 'updated_at', defaultRaw: 'now()' },
  },
  uniques: [
    {
      name: 'uq__marketplace_public_seller_revisions__seller_revision',
      properties: ['sellerPublicId', 'contentRevision'],
    },
    {
      name: 'uq__marketplace_public_seller_revisions__seller_fingerprint',
      properties: ['sellerPublicId', 'contentFingerprint'],
    },
  ],
  indexes: [
    {
      name: 'ix__marketplace_public_seller_revisions__tenant_id_mod_44b6dbde',
      properties: ['tenantId', 'moderationStatus', 'createdAt'],
    },
  ],
  checks: [
    { name: 'ck__marketplace_public_seller_revisions__content', expression: `btrim("display_name") <> ''` },
    {
      name: 'ck__marketplace_public_seller_revisions__revision',
      expression: `"content_revision" >= 1`,
    },
    {
      name: 'ck__marketplace_public_seller_revisions__moderation',
      expression: `
          (("moderation_status")::text = 'pending'::text
            and "moderated_by" is null and "moderated_at" is null)
          or (("moderation_status")::text = any (
            (array['approved'::character varying, 'rejected'::character varying])::text[]
          ) and "moderated_by" is not null and "moderated_at" is not null)
        `,
    },
  ],
});

MarketplacePublicSellerRevisionEntitySchema.addManyToOne<MarketplacePublicSellerRevisionEntity>(
  'sellerPublicId',
  MarketplacePublicSellerEntity.name,
  {
    deleteRule: 'cascade',
    fieldName: 'seller_public_id',
    foreignKeyName: 'fk__marketplace_public_seller_revisions__seller_public_id',
    mapToPk: true,
  },
);

export class MarketplaceListingPublicationEntity {
  id: string = randomUUID();
  tenantId!: string;
  ownerUserId!: string;
  sellerPublicId!: string;
  sellerRevisionId!: string;
  sellerContentRevision!: number;
  productId: string | null = null;
  produceListingId: string | null = null;
  sourceKind!: MarketplaceListingSourceKind;
  section!: MarketplaceListingSection;
  publicTitle!: string;
  publicTitleRu: string | null = null;
  publicTitleUz: string | null = null;
  publicTitleUzCyrl: string | null = null;
  publicDescription: string | null = null;
  publicCategory: ProductEntity['category'] | null = null;
  publicCrop: string | null = null;
  publicGrade: ProduceListingEntity['grade'] | null = null;
  publicUnit!: string;
  publicRegion!: string;
  publicImages: string[] = [];
  contentFingerprint!: string;
  contentRevision = 1;
  status: MarketplacePublicationStatus = 'published';
  moderationStatus: MarketplaceModerationStatus = 'pending';
  moderatedBy: string | null = null;
  moderatedAt: Date | null = null;
  idempotencyKey!: string;
  requestFingerprint!: string;
  revision = 0;
  publishedAt: Date | null = new Date();
  createdAt: Date = new Date();
  updatedAt: Date = new Date();
}

export const MarketplaceListingPublicationEntitySchema = new EntitySchema<MarketplaceListingPublicationEntity>({
  class: MarketplaceListingPublicationEntity,
  tableName: 'marketplace_listing_publications',
  properties: {
    id: { type: 'uuid', primary: true },
    tenantId: { type: 'varchar', length: 100, fieldName: 'tenant_id' },
    ownerUserId: { type: 'varchar', length: 100, fieldName: 'owner_user_id' },
    sellerPublicId: { type: 'uuid', fieldName: 'seller_public_id' },
    sellerRevisionId: { type: 'uuid', fieldName: 'seller_revision_id' },
    sellerContentRevision: { type: 'int', fieldName: 'seller_content_revision' },
    productId: { type: 'uuid', nullable: true, fieldName: 'product_id' },
    produceListingId: { type: 'uuid', nullable: true, fieldName: 'produce_listing_id' },
    sourceKind: { type: 'varchar', length: 20, fieldName: 'source_kind' },
    section: { type: 'varchar', length: 20 },
    publicTitle: { type: 'varchar', length: 200, fieldName: 'public_title' },
    publicTitleRu: { type: 'varchar', length: 200, nullable: true, fieldName: 'public_title_ru' },
    publicTitleUz: { type: 'varchar', length: 200, nullable: true, fieldName: 'public_title_uz' },
    publicTitleUzCyrl: { type: 'varchar', length: 200, nullable: true, fieldName: 'public_title_uz_cyrl' },
    publicDescription: { type: 'text', nullable: true, fieldName: 'public_description' },
    publicCategory: { type: 'varchar', length: 30, nullable: true, fieldName: 'public_category' },
    publicCrop: { type: 'varchar', length: 50, nullable: true, fieldName: 'public_crop' },
    publicGrade: { type: 'varchar', length: 1, nullable: true, fieldName: 'public_grade' },
    publicUnit: { type: 'varchar', length: 50, fieldName: 'public_unit' },
    publicRegion: { type: 'varchar', length: 100, fieldName: 'public_region' },
    publicImages: { type: 'jsonb', defaultRaw: "'[]'::jsonb", fieldName: 'public_images' },
    contentFingerprint: { type: 'varchar', length: 64, fieldName: 'content_fingerprint' },
    contentRevision: { type: 'int', default: 1, fieldName: 'content_revision' },
    status: { type: 'varchar', length: 20, default: 'published' },
    moderationStatus: { type: 'varchar', length: 20, default: 'pending', fieldName: 'moderation_status' },
    moderatedBy: { type: 'varchar', length: 100, nullable: true, fieldName: 'moderated_by' },
    moderatedAt: { type: 'timestamptz', nullable: true, fieldName: 'moderated_at' },
    idempotencyKey: { type: 'varchar', length: 100, fieldName: 'idempotency_key' },
    requestFingerprint: { type: 'varchar', length: 64, fieldName: 'request_fingerprint' },
    revision: { type: 'int', default: 0 },
    publishedAt: { type: 'timestamptz', nullable: true, fieldName: 'published_at', defaultRaw: 'now()' },
    createdAt: { type: 'timestamptz', fieldName: 'created_at', defaultRaw: 'now()', onCreate: () => new Date() },
    updatedAt: {
      type: 'timestamptz',
      fieldName: 'updated_at',
      defaultRaw: 'now()',
      onCreate: () => new Date(),
      onUpdate: () => new Date(),
    },
  },
  uniques: [
    { name: 'uq__marketplace_listing_publications__product_id', properties: ['productId'] },
    { name: 'uq__marketplace_listing_publications__produce_listing_id', properties: ['produceListingId'] },
    {
      name: 'uq__marketplace_listing_publications__tenant_id_owner_65e6b9c7',
      properties: ['tenantId', 'ownerUserId', 'idempotencyKey'],
    },
  ],
  indexes: [
    {
      name: 'ix__marketplace_listing_publications__status_section_p_5b33d9c2',
      properties: ['status', 'section', 'publishedAt'],
    },
    { name: 'ix__marketplace_listing_publications__seller_public_id_status', properties: ['sellerPublicId', 'status'] },
    { name: 'ix__marketplace_listing_publications__tenant_id_owner_user_id', properties: ['tenantId', 'ownerUserId'] },
  ],
  checks: [
    {
      name: 'ck__marketplace_listing_publications__source_kind',
      expression: `"source_kind" in ('product', 'produce')`,
    },
    {
      name: 'ck__marketplace_listing_publications__section',
      expression: `"section" in ('equipment', 'seeds', 'produce')`,
    },
    {
      name: 'ck__marketplace_listing_publications__status',
      expression: `"status" in ('published', 'paused', 'rejected')`,
    },
    { name: 'ck__marketplace_listing_publications__revision', expression: `"revision" >= 0` },
    {
      name: 'ck__marketplace_listing_publications__content',
      expression: `btrim("public_title") <> '' and btrim("public_unit") <> '' and btrim("public_region") <> ''
        and "content_revision" >= 1 and "seller_content_revision" >= 1 and jsonb_typeof("public_images") = 'array'
        and jsonb_array_length("public_images") <= 5`,
    },
    {
      name: 'ck__marketplace_listing_publications__moderation',
      expression: `
        (("moderation_status")::text = 'pending'::text
          and "moderated_by" is null and "moderated_at" is null)
        or (("moderation_status")::text = any (
          (array['approved'::character varying, 'rejected'::character varying])::text[]
        ) and "moderated_by" is not null and "moderated_at" is not null)
      `,
    },
    {
      name: 'ck__marketplace_listing_publications__source_pair',
      expression: `
        ("source_kind" = 'product' and "product_id" is not null and "produce_listing_id" is null
          and "section" <> 'produce' and "public_category" is not null
          and "public_crop" is null and "public_grade" is null)
        or ("source_kind" = 'produce' and "product_id" is null and "produce_listing_id" is not null
          and "section" = 'produce' and "public_category" is null
          and "public_crop" is not null and "public_grade" is not null)
      `,
    },
  ],
});

MarketplaceListingPublicationEntitySchema.addManyToOne<MarketplaceListingPublicationEntity>(
  'sellerPublicId',
  MarketplacePublicSellerEntity.name,
  {
    deleteRule: 'restrict',
    fieldName: 'seller_public_id',
    foreignKeyName: 'fk__marketplace_listing_publications__seller_public_id',
    mapToPk: true,
  },
);
MarketplaceListingPublicationEntitySchema.addManyToOne<MarketplaceListingPublicationEntity>(
  'sellerRevisionId',
  MarketplacePublicSellerRevisionEntity.name,
  {
    deleteRule: 'restrict',
    fieldName: 'seller_revision_id',
    foreignKeyName: 'fk__marketplace_listing_publications__seller_revision_id',
    mapToPk: true,
  },
);
MarketplaceListingPublicationEntitySchema.addManyToOne<MarketplaceListingPublicationEntity>(
  'productId',
  ProductEntity.name,
  {
    deleteRule: 'restrict',
    fieldName: 'product_id',
    foreignKeyName: 'fk__marketplace_listing_publications__product_id',
    mapToPk: true,
    nullable: true,
  },
);
MarketplaceListingPublicationEntitySchema.addManyToOne<MarketplaceListingPublicationEntity>(
  'produceListingId',
  ProduceListingEntity.name,
  {
    deleteRule: 'restrict',
    fieldName: 'produce_listing_id',
    foreignKeyName: 'fk__marketplace_listing_publications__produce_listing_id',
    mapToPk: true,
    nullable: true,
  },
);

export class MarketplaceRequestPublicationEntity {
  id: string = randomUUID();
  tenantId!: string;
  buyerUserId!: string;
  buyerPartnerId!: string;
  requestId!: string;
  buyerDisplayName!: string;
  publicTitle!: string;
  publicProduct: string | null = null;
  publicVolume: string | null = null;
  publicRegion!: string;
  publicDeadline: string | null = null;
  publicBudgetUzs: number | null = null;
  publicRequirements: string | null = null;
  contentFingerprint!: string;
  contentRevision = 1;
  status: MarketplacePublicationStatus = 'published';
  moderationStatus: MarketplaceModerationStatus = 'pending';
  moderatedBy: string | null = null;
  moderatedAt: Date | null = null;
  idempotencyKey!: string;
  requestFingerprint!: string;
  revision = 0;
  publishedAt: Date | null = new Date();
  createdAt: Date = new Date();
  updatedAt: Date = new Date();
}

export const MarketplaceRequestPublicationEntitySchema = new EntitySchema<MarketplaceRequestPublicationEntity>({
  class: MarketplaceRequestPublicationEntity,
  tableName: 'marketplace_request_publications',
  properties: {
    id: { type: 'uuid', primary: true },
    tenantId: { type: 'varchar', length: 100, fieldName: 'tenant_id' },
    buyerUserId: { type: 'varchar', length: 100, fieldName: 'buyer_user_id' },
    buyerPartnerId: { type: 'uuid', fieldName: 'buyer_partner_id' },
    requestId: { type: 'uuid', fieldName: 'request_id' },
    buyerDisplayName: { type: 'varchar', length: 200, fieldName: 'buyer_display_name' },
    publicTitle: { type: 'varchar', length: 200, fieldName: 'public_title' },
    publicProduct: { type: 'varchar', length: 200, nullable: true, fieldName: 'public_product' },
    publicVolume: { type: 'varchar', length: 100, nullable: true, fieldName: 'public_volume' },
    publicRegion: { type: 'varchar', length: 100, fieldName: 'public_region' },
    publicDeadline: { type: 'date', nullable: true, fieldName: 'public_deadline' },
    publicBudgetUzs: {
      type: 'numeric',
      precision: 15,
      scale: 0,
      nullable: true,
      fieldName: 'public_budget_uzs',
    },
    publicRequirements: { type: 'varchar', length: 5000, nullable: true, fieldName: 'public_requirements' },
    contentFingerprint: { type: 'varchar', length: 64, fieldName: 'content_fingerprint' },
    contentRevision: { type: 'int', default: 1, fieldName: 'content_revision' },
    status: { type: 'varchar', length: 20, default: 'published' },
    moderationStatus: { type: 'varchar', length: 20, default: 'pending', fieldName: 'moderation_status' },
    moderatedBy: { type: 'varchar', length: 100, nullable: true, fieldName: 'moderated_by' },
    moderatedAt: { type: 'timestamptz', nullable: true, fieldName: 'moderated_at' },
    idempotencyKey: { type: 'varchar', length: 100, fieldName: 'idempotency_key' },
    requestFingerprint: { type: 'varchar', length: 64, fieldName: 'request_fingerprint' },
    revision: { type: 'int', default: 0 },
    publishedAt: { type: 'timestamptz', nullable: true, fieldName: 'published_at', defaultRaw: 'now()' },
    createdAt: { type: 'timestamptz', fieldName: 'created_at', defaultRaw: 'now()', onCreate: () => new Date() },
    updatedAt: {
      type: 'timestamptz',
      fieldName: 'updated_at',
      defaultRaw: 'now()',
      onCreate: () => new Date(),
      onUpdate: () => new Date(),
    },
  },
  uniques: [
    { name: 'uq__marketplace_request_publications__request_id', properties: ['requestId'] },
    {
      name: 'uq__marketplace_request_publications__tenant_id_buyer_84329ad6',
      properties: ['tenantId', 'buyerUserId', 'idempotencyKey'],
    },
  ],
  indexes: [
    { name: 'ix__marketplace_request_publications__status_published_at', properties: ['status', 'publishedAt'] },
    { name: 'ix__marketplace_request_publications__tenant_id_buyer_user_id', properties: ['tenantId', 'buyerUserId'] },
  ],
  checks: [
    {
      name: 'ck__marketplace_request_publications__status',
      expression: `"status" in ('published', 'paused', 'rejected')`,
    },
    { name: 'ck__marketplace_request_publications__revision', expression: `"revision" >= 0` },
    {
      name: 'ck__marketplace_request_publications__buyer_display_name',
      expression: `btrim("buyer_display_name") <> ''`,
    },
    {
      name: 'ck__marketplace_request_publications__public_text',
      expression: `btrim("public_title") <> '' and btrim("public_region") <> ''`,
    },
    {
      name: 'ck__marketplace_request_publications__public_budget',
      expression: `"public_budget_uzs" is null or (
        "public_budget_uzs" >= (1)::numeric
        and "public_budget_uzs" <= ('9999999999999'::bigint)::numeric
      )`,
    },
    {
      name: 'ck__marketplace_request_publications__content_revision',
      expression: `"content_revision" >= 1`,
    },
    {
      name: 'ck__marketplace_request_publications__moderation',
      expression: `
        (("moderation_status")::text = 'pending'::text
          and "moderated_by" is null and "moderated_at" is null)
        or (("moderation_status")::text = any (
          (array['approved'::character varying, 'rejected'::character varying])::text[]
        ) and "moderated_by" is not null and "moderated_at" is not null)
      `,
    },
  ],
});

MarketplaceRequestPublicationEntitySchema.addManyToOne<MarketplaceRequestPublicationEntity>(
  'buyerPartnerId',
  AgriTechPartnerEntity.name,
  {
    deleteRule: 'restrict',
    fieldName: 'buyer_partner_id',
    foreignKeyName: 'fk__marketplace_request_publications__buyer_partner_id',
    mapToPk: true,
  },
);

export class MarketplacePublicationModerationOperationEntity {
  id: string = randomUUID();
  tenantId!: string;
  reviewerUserId!: string;
  publicationKind!: 'listing' | 'request' | 'seller_profile';
  publicationId!: string;
  idempotencyKey!: string;
  requestFingerprint!: string;
  resultSnapshot!: Record<string, unknown>;
  createdAt: Date = new Date();
}

export const MarketplacePublicationModerationOperationEntitySchema =
  new EntitySchema<MarketplacePublicationModerationOperationEntity>({
    class: MarketplacePublicationModerationOperationEntity,
    tableName: 'marketplace_publication_moderation_operations',
    properties: {
      id: { type: 'uuid', primary: true },
      tenantId: { type: 'varchar', length: 100, fieldName: 'tenant_id' },
      reviewerUserId: { type: 'varchar', length: 100, fieldName: 'reviewer_user_id' },
      publicationKind: { type: 'varchar', length: 20, fieldName: 'publication_kind' },
      publicationId: { type: 'uuid', fieldName: 'publication_id' },
      idempotencyKey: { type: 'varchar', length: 100, fieldName: 'idempotency_key' },
      requestFingerprint: { type: 'varchar', length: 64, fieldName: 'request_fingerprint' },
      resultSnapshot: { type: 'jsonb', fieldName: 'result_snapshot' },
      createdAt: { type: 'timestamptz', fieldName: 'created_at', defaultRaw: 'now()' },
    },
    uniques: [
      {
        name: 'uq__marketplace_publication_moderation_ops__tenant_reviewer_key',
        properties: ['tenantId', 'reviewerUserId', 'idempotencyKey'],
      },
    ],
    indexes: [
      {
        name: 'ix__marketplace_publication_moderation_operations__ten_f5d17cba',
        properties: ['tenantId', 'publicationKind', 'publicationId'],
      },
    ],
    checks: [
      {
        name: 'ck__marketplace_publication_moderation_ops__kind',
        expression: `"publication_kind" in ('listing', 'request', 'seller_profile')`,
      },
      {
        name: 'ck__marketplace_publication_moderation_ops__snapshot',
        expression: `jsonb_typeof("result_snapshot") = 'object'`,
      },
    ],
  });
MarketplaceRequestPublicationEntitySchema.addManyToOne<MarketplaceRequestPublicationEntity>(
  'requestId',
  BuyerRequestEntity.name,
  {
    deleteRule: 'restrict',
    fieldName: 'request_id',
    foreignKeyName: 'fk__marketplace_request_publications__request_id',
    mapToPk: true,
  },
);
