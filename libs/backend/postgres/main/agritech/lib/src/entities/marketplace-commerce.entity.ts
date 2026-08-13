// @requirements REQ-AGRITECH-MARKETPLACE-016 REQ-AGRITECH-STAGE2-017
import { randomUUID } from 'node:crypto';
import { EntitySchema } from '@mikro-orm/core';
import { AgriTechPartnerEntity } from './operations.entity';

export type MarketplaceMembershipCapability = 'buyer' | 'seller';
export type MarketplaceMembershipStatus = 'active' | 'revoked';

export class MarketplacePartnerMembershipEntity {
  id: string = randomUUID();
  tenantId!: string;
  partnerId!: string;
  userId!: string;
  role: 'owner' | 'member' = 'member';
  capability!: MarketplaceMembershipCapability;
  status: MarketplaceMembershipStatus = 'active';
  revision = 0;
  revokedAt: Date | null = null;
  createdAt: Date = new Date();
  updatedAt: Date = new Date();
}

export const MarketplacePartnerMembershipEntitySchema = new EntitySchema<MarketplacePartnerMembershipEntity>({
  class: MarketplacePartnerMembershipEntity,
  tableName: 'marketplace_partner_memberships',
  properties: {
    id: { type: 'uuid', primary: true },
    tenantId: { type: 'varchar', length: 100, fieldName: 'tenant_id' },
    partnerId: { type: 'uuid', fieldName: 'partner_id' },
    userId: { type: 'varchar', length: 100, fieldName: 'user_id' },
    role: { type: 'varchar', length: 20, default: 'member' },
    capability: { type: 'varchar', length: 20 },
    status: { type: 'varchar', length: 20, default: 'active' },
    revision: { type: 'int', default: 0 },
    revokedAt: { type: 'timestamptz', nullable: true, fieldName: 'revoked_at' },
    createdAt: { type: 'timestamptz', fieldName: 'created_at', defaultRaw: 'now()' },
    updatedAt: { type: 'timestamptz', fieldName: 'updated_at', defaultRaw: 'now()' },
  },
  uniques: [
    {
      name: 'uq__marketplace_partner_memberships__partner_user_capability',
      properties: ['partnerId', 'userId', 'capability'],
    },
  ],
  indexes: [
    {
      name: 'ix__marketplace_partner_memberships__tenant_id_user_id_88dbe2b0',
      properties: ['tenantId', 'userId', 'capability', 'status'],
    },
  ],
  checks: [
    { name: 'ck__marketplace_partner_memberships__role', expression: `"role" in ('owner', 'member')` },
    {
      name: 'ck__marketplace_partner_memberships__capability',
      expression: `"capability" in ('buyer', 'seller')`,
    },
    { name: 'ck__marketplace_partner_memberships__status', expression: `"status" in ('active', 'revoked')` },
    { name: 'ck__marketplace_partner_memberships__revision', expression: `"revision" >= 0` },
    {
      name: 'ck__marketplace_partner_memberships__revocation',
      expression: `("status" = 'active' and "revoked_at" is null) or ("status" = 'revoked' and "revoked_at" is not null)`,
    },
  ],
});

MarketplacePartnerMembershipEntitySchema.addManyToOne<MarketplacePartnerMembershipEntity>(
  'partnerId',
  AgriTechPartnerEntity.name,
  {
    deleteRule: 'restrict',
    fieldName: 'partner_id',
    foreignKeyName: 'fk__marketplace_partner_memberships__partner_id',
    mapToPk: true,
  },
);

export type MarketplaceCommerceOperationKind =
  | 'cart_add'
  | 'cart_update'
  | 'cart_remove'
  | 'cart_checkout'
  | 'request_create'
  | 'offer_create'
  | 'offer_choose'
  | 'verification_create'
  | 'verification_submit'
  | 'verification_review'
  | 'contract_delivery_quote';

export class MarketplaceCommerceOperationEntity {
  id: string = randomUUID();
  actorTenantId!: string;
  actorUserId!: string;
  operation!: MarketplaceCommerceOperationKind;
  resourceKey!: string;
  idempotencyKey!: string;
  requestFingerprint!: string;
  resultSnapshot!: Record<string, unknown>;
  createdAt: Date = new Date();
}

export const MarketplaceCommerceOperationEntitySchema = new EntitySchema<MarketplaceCommerceOperationEntity>({
  class: MarketplaceCommerceOperationEntity,
  tableName: 'marketplace_commerce_operations',
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
      name: 'uq__marketplace_commerce_operations__actor_operation_key',
      properties: ['actorTenantId', 'actorUserId', 'operation', 'resourceKey', 'idempotencyKey'],
    },
  ],
  indexes: [
    {
      name: 'ix__marketplace_commerce_operations__actor_tenant_id_a_2645d230',
      properties: ['actorTenantId', 'actorUserId', 'createdAt'],
    },
  ],
  checks: [
    {
      name: 'ck__marketplace_commerce_operations__operation',
      expression: `"operation" in ('cart_add', 'cart_update', 'cart_remove', 'cart_checkout', 'request_create', 'offer_create', 'offer_choose', 'verification_create', 'verification_submit', 'verification_review', 'contract_delivery_quote')`,
    },
    {
      name: 'ck__marketplace_commerce_operations__request_fingerprint',
      expression: `"request_fingerprint" ~ '^[0-9a-f]{64}$'`,
    },
    {
      name: 'ck__marketplace_commerce_operations__result_snapshot',
      expression: `jsonb_typeof("result_snapshot") = 'object' and pg_column_size("result_snapshot") <= 65536`,
    },
  ],
});
