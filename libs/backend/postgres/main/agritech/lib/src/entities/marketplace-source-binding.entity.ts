// @requirements REQ-AGRITECH-PUBLIC-018
import { EntitySchema } from '@mikro-orm/core';
import { BuyerRequestEntity } from './marketplace.entity';
import { AgriTechPartnerEntity, ProduceListingEntity } from './operations.entity';

export class MarketplaceProduceOrganizationBindingEntity {
  produceListingId!: string;
  tenantId!: string;
  farmerId!: string;
  ownerUserId!: string;
  supplierPartnerId!: string;
  createdAt: Date = new Date();
}

export const MarketplaceProduceOrganizationBindingEntitySchema =
  new EntitySchema<MarketplaceProduceOrganizationBindingEntity>({
    class: MarketplaceProduceOrganizationBindingEntity,
    tableName: 'marketplace_produce_organization_bindings',
    properties: {
      produceListingId: { type: 'uuid', primary: true, fieldName: 'produce_listing_id' },
      tenantId: { type: 'varchar', length: 100, fieldName: 'tenant_id' },
      farmerId: { type: 'uuid', fieldName: 'farmer_id' },
      ownerUserId: { type: 'varchar', length: 100, fieldName: 'owner_user_id' },
      supplierPartnerId: { type: 'uuid', fieldName: 'supplier_partner_id' },
      createdAt: { type: 'timestamptz', fieldName: 'created_at', defaultRaw: 'now()' },
    },
    indexes: [
      {
        name: 'ix__marketplace_produce_organization_bindings__tenant_f6c7985c',
        properties: ['tenantId', 'ownerUserId', 'supplierPartnerId'],
      },
    ],
  });

MarketplaceProduceOrganizationBindingEntitySchema.addManyToOne<MarketplaceProduceOrganizationBindingEntity>(
  'produceListingId',
  ProduceListingEntity.name,
  {
    deleteRule: 'cascade',
    fieldName: 'produce_listing_id',
    foreignKeyName: 'fk__marketplace_produce_org_bindings__produce_listing_id',
    mapToPk: true,
    primary: true,
  },
);
MarketplaceProduceOrganizationBindingEntitySchema.addManyToOne<MarketplaceProduceOrganizationBindingEntity>(
  'supplierPartnerId',
  AgriTechPartnerEntity.name,
  {
    deleteRule: 'restrict',
    fieldName: 'supplier_partner_id',
    foreignKeyName: 'fk__marketplace_produce_org_bindings__supplier_partner_id',
    mapToPk: true,
  },
);

export class MarketplaceRequestOrganizationBindingEntity {
  requestId!: string;
  tenantId!: string;
  buyerUserId!: string;
  buyerPartnerId!: string;
  createdAt: Date = new Date();
}

export const MarketplaceRequestOrganizationBindingEntitySchema =
  new EntitySchema<MarketplaceRequestOrganizationBindingEntity>({
    class: MarketplaceRequestOrganizationBindingEntity,
    tableName: 'marketplace_request_organization_bindings',
    properties: {
      requestId: { type: 'uuid', primary: true, fieldName: 'request_id' },
      tenantId: { type: 'varchar', length: 100, fieldName: 'tenant_id' },
      buyerUserId: { type: 'varchar', length: 100, fieldName: 'buyer_user_id' },
      buyerPartnerId: { type: 'uuid', fieldName: 'buyer_partner_id' },
      createdAt: { type: 'timestamptz', fieldName: 'created_at', defaultRaw: 'now()' },
    },
    indexes: [
      {
        name: 'ix__marketplace_request_organization_bindings__tenant_6d3c71e4',
        properties: ['tenantId', 'buyerUserId', 'buyerPartnerId'],
      },
    ],
  });

MarketplaceRequestOrganizationBindingEntitySchema.addManyToOne<MarketplaceRequestOrganizationBindingEntity>(
  'requestId',
  BuyerRequestEntity.name,
  {
    deleteRule: 'cascade',
    fieldName: 'request_id',
    foreignKeyName: 'fk__marketplace_request_org_bindings__request_id',
    mapToPk: true,
    primary: true,
  },
);
MarketplaceRequestOrganizationBindingEntitySchema.addManyToOne<MarketplaceRequestOrganizationBindingEntity>(
  'buyerPartnerId',
  AgriTechPartnerEntity.name,
  {
    deleteRule: 'restrict',
    fieldName: 'buyer_partner_id',
    foreignKeyName: 'fk__marketplace_request_org_bindings__buyer_partner_id',
    mapToPk: true,
  },
);
