// @requirements REQ-AGRITECH-STAGE2-017
import { randomUUID } from 'node:crypto';
import { EntitySchema } from '@mikro-orm/core';
import type { MarketplacePromotionPlanCode, MarketplacePromotionStatus } from '@app/backend-feature-agritech-shared';
import { MarketplaceListingPublicationEntity } from './marketplace-public.entity';
import { MarketplacePublicSellerEntity } from './marketplace-public.entity';
import { AgriTechPartnerEntity } from './operations.entity';

export class MarketplaceListingPromotionEntity {
  id: string = randomUUID();
  tenantId!: string;
  actorUserId!: string;
  sellerPartnerId!: string;
  sellerPublicId!: string;
  listingPublicationId!: string;
  planCode!: MarketplacePromotionPlanCode;
  status: MarketplacePromotionStatus = 'active';
  startsAt!: Date;
  endsAt!: Date;
  priceUzs!: number;
  currency = 'UZS' as const;
  idempotencyKey!: string;
  requestFingerprint!: string;
  activationReference!: string;
  activatedAt!: Date;
  revision = 0;
  createdAt: Date = new Date();
  updatedAt: Date = new Date();
}

export const MarketplaceListingPromotionEntitySchema = new EntitySchema<MarketplaceListingPromotionEntity>({
  class: MarketplaceListingPromotionEntity,
  tableName: 'marketplace_listing_promotions',
  properties: {
    id: { type: 'uuid', primary: true },
    tenantId: { type: 'varchar', length: 100, fieldName: 'tenant_id' },
    actorUserId: { type: 'varchar', length: 100, fieldName: 'actor_user_id' },
    sellerPartnerId: { type: 'uuid', fieldName: 'seller_partner_id' },
    sellerPublicId: { type: 'uuid', fieldName: 'seller_public_id' },
    listingPublicationId: { type: 'uuid', fieldName: 'listing_publication_id' },
    planCode: { type: 'varchar', length: 30, fieldName: 'plan_code' },
    status: { type: 'varchar', length: 20, default: 'active' },
    startsAt: { type: 'timestamptz', fieldName: 'starts_at' },
    endsAt: { type: 'timestamptz', fieldName: 'ends_at' },
    priceUzs: { type: 'decimal', precision: 15, scale: 0, fieldName: 'price_uzs' },
    currency: { type: 'varchar', length: 3, default: 'UZS' },
    idempotencyKey: { type: 'varchar', length: 100, fieldName: 'idempotency_key' },
    requestFingerprint: { type: 'varchar', length: 64, fieldName: 'request_fingerprint' },
    activationReference: { type: 'varchar', length: 80, fieldName: 'activation_reference' },
    activatedAt: { type: 'timestamptz', fieldName: 'activated_at' },
    revision: { type: 'int', default: 0 },
    createdAt: { type: 'timestamptz', fieldName: 'created_at', defaultRaw: 'now()' },
    updatedAt: { type: 'timestamptz', fieldName: 'updated_at', defaultRaw: 'now()' },
  },
  uniques: [
    {
      name: 'uq__listing_promotions__actor_command_key',
      properties: ['tenantId', 'actorUserId', 'idempotencyKey'],
    },
    {
      name: 'uq__marketplace_listing_promotions__listing_publication_id',
      properties: ['listingPublicationId'],
      where: `"status" in ('scheduled', 'active')`,
    },
    {
      name: 'uq__listing_promotions__activation_reference',
      properties: ['activationReference'],
    },
  ],
  indexes: [
    {
      name: 'ix__marketplace_listing_promotions__tenant_id_actor_us_ea6e9706',
      properties: ['tenantId', 'actorUserId', 'createdAt'],
    },
    {
      name: 'ix__marketplace_listing_promotions__listing_publicatio_00ec40d4',
      properties: ['listingPublicationId', 'startsAt', 'endsAt'],
    },
  ],
  checks: [
    {
      name: 'ck__listing_promotions__plan',
      expression: `
        ("plan_code" = 'catalog_7d' and "price_uzs" = 150000 and "ends_at" = "starts_at" + interval '7 days')
        or ("plan_code" = 'catalog_14d' and "price_uzs" = 270000 and "ends_at" = "starts_at" + interval '14 days')
        or ("plan_code" = 'catalog_30d' and "price_uzs" = 500000 and "ends_at" = "starts_at" + interval '30 days')
      `,
    },
    {
      name: 'ck__listing_promotions__status',
      expression: `"status" in ('scheduled', 'active', 'expired')`,
    },
    {
      name: 'ck__listing_promotions__currency',
      expression: `"currency" = 'UZS'`,
    },
    {
      name: 'ck__listing_promotions__activation_reference',
      expression: `"activation_reference" ~ '^promotion:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'`,
    },
    {
      name: 'ck__listing_promotions__activation_time',
      expression: `"activated_at" <= "starts_at"`,
    },
    {
      name: 'ck__listing_promotions__fingerprint',
      expression: `"request_fingerprint" ~ '^[a-f0-9]{64}$'`,
    },
    {
      name: 'ck__listing_promotions__revision',
      expression: `"revision" >= 0`,
    },
  ],
});

MarketplaceListingPromotionEntitySchema.addManyToOne<MarketplaceListingPromotionEntity>(
  'sellerPartnerId',
  AgriTechPartnerEntity.name,
  {
    deleteRule: 'restrict',
    fieldName: 'seller_partner_id',
    foreignKeyName: 'fk__listing_promotions__seller_partner_id',
    mapToPk: true,
  },
);

MarketplaceListingPromotionEntitySchema.addManyToOne<MarketplaceListingPromotionEntity>(
  'sellerPublicId',
  MarketplacePublicSellerEntity.name,
  {
    deleteRule: 'restrict',
    fieldName: 'seller_public_id',
    foreignKeyName: 'fk__listing_promotions__seller_public_id',
    mapToPk: true,
  },
);

MarketplaceListingPromotionEntitySchema.addManyToOne<MarketplaceListingPromotionEntity>(
  'listingPublicationId',
  MarketplaceListingPublicationEntity.name,
  {
    deleteRule: 'restrict',
    fieldName: 'listing_publication_id',
    foreignKeyName: 'fk__listing_promotions__listing_publication_id',
    mapToPk: true,
  },
);
