import { randomUUID } from 'node:crypto';
import { EntitySchema } from '@mikro-orm/core';
import type {
  DeliveryHistoryEntry,
  DeliveryStatus,
  IntegrationStatus,
  PartnerKind,
  PartnerStatus,
  PilotStatus,
  ProduceGrade,
  ProduceStatus,
} from '@app/backend-feature-agritech-shared';

export class AgriTechPartnerEntity {
  id: string = randomUUID();
  tenantId!: string;
  ownerUserId!: string;
  kind!: PartnerKind;
  legalName!: string;
  taxId!: string;
  phone!: string;
  region!: string;
  status: PartnerStatus = 'pending';
  reviewedBy: string | null = null;
  reviewedAt: Date | null = null;
  createdAt: Date = new Date();
  updatedAt: Date = new Date();
}

export const AgriTechPartnerEntitySchema = new EntitySchema<AgriTechPartnerEntity>({
  class: AgriTechPartnerEntity,
  tableName: 'agritech_partners',
  properties: {
    id: { type: 'uuid', primary: true },
    tenantId: { type: 'varchar', length: 100, fieldName: 'tenant_id' },
    ownerUserId: { type: 'varchar', length: 100, fieldName: 'owner_user_id' },
    kind: { type: 'varchar', length: 20 },
    legalName: { type: 'varchar', length: 200, fieldName: 'legal_name' },
    taxId: { type: 'varchar', length: 30, fieldName: 'tax_id' },
    phone: { type: 'varchar', length: 20 },
    region: { type: 'varchar', length: 100 },
    status: { type: 'varchar', length: 20, default: 'pending' },
    reviewedBy: { type: 'varchar', length: 100, nullable: true, fieldName: 'reviewed_by' },
    reviewedAt: { type: 'timestamptz', nullable: true, fieldName: 'reviewed_at' },
    createdAt: { type: 'timestamptz', fieldName: 'created_at', onCreate: () => new Date() },
    updatedAt: { type: 'timestamptz', fieldName: 'updated_at', onCreate: () => new Date(), onUpdate: () => new Date() },
  },
  uniques: [{ name: 'ux__agritech_partners__tenant_kind_tax', properties: ['tenantId', 'kind', 'taxId'] }],
  indexes: [
    { name: 'ix__agritech_partners__tenant_id_owner_user_id', properties: ['tenantId', 'ownerUserId'] },
    { name: 'ix__agritech_partners__tenant_id_status', properties: ['tenantId', 'status'] },
  ],
});

export class ProduceListingEntity {
  id: string = randomUUID();
  tenantId!: string;
  farmerId!: string;
  crop!: string;
  grade!: ProduceGrade;
  quantityKg!: number;
  availableQuantityKg!: number;
  sampleAvailable = false;
  pricePerKgUzs!: number;
  region!: string;
  availableFrom!: Date;
  availableUntil!: Date;
  status: ProduceStatus = 'active';
  createdAt: Date = new Date();
  updatedAt: Date = new Date();
}

export const ProduceListingEntitySchema = new EntitySchema<ProduceListingEntity>({
  class: ProduceListingEntity,
  tableName: 'produce_listings',
  properties: {
    id: { type: 'uuid', primary: true },
    tenantId: { type: 'varchar', length: 100, fieldName: 'tenant_id' },
    farmerId: { type: 'uuid', fieldName: 'farmer_id' },
    crop: { type: 'varchar', length: 50 },
    grade: { type: 'varchar', length: 1 },
    quantityKg: { type: 'int', fieldName: 'quantity_kg' },
    availableQuantityKg: { type: 'int', fieldName: 'available_quantity_kg' },
    sampleAvailable: { type: 'boolean', fieldName: 'sample_available', default: false },
    pricePerKgUzs: { type: 'decimal', precision: 15, scale: 2, fieldName: 'price_per_kg_uzs' },
    region: { type: 'varchar', length: 100 },
    availableFrom: { type: 'timestamptz', fieldName: 'available_from' },
    availableUntil: { type: 'timestamptz', fieldName: 'available_until' },
    status: { type: 'varchar', length: 20, default: 'active' },
    createdAt: { type: 'timestamptz', fieldName: 'created_at', onCreate: () => new Date() },
    updatedAt: { type: 'timestamptz', fieldName: 'updated_at', onCreate: () => new Date(), onUpdate: () => new Date() },
  },
  indexes: [
    {
      name: 'ix__produce_listings__tenant_id_status_crop_region_grade',
      properties: ['tenantId', 'status', 'crop', 'region', 'grade'],
    },
    { name: 'ix__produce_listings__farmer_id', properties: ['farmerId'] },
  ],
  checks: [
    {
      name: 'ck__produce_listings__price_per_kg_uzs_integer',
      expression: `"price_per_kg_uzs" between 1 and 9999999999999 and "price_per_kg_uzs" = trunc("price_per_kg_uzs")`,
    },
  ],
});

export class DeliveryEntity {
  id: string = randomUUID();
  tenantId!: string;
  orderId!: string;
  agentUserId: string | null = null;
  status: DeliveryStatus = 'scheduled';
  scheduledAt!: Date;
  proofReference: string | null = null;
  history: DeliveryHistoryEntry[] = [];
  createdAt: Date = new Date();
  updatedAt: Date = new Date();
}

export const DeliveryEntitySchema = new EntitySchema<DeliveryEntity>({
  class: DeliveryEntity,
  tableName: 'agritech_deliveries',
  properties: {
    id: { type: 'uuid', primary: true },
    tenantId: { type: 'varchar', length: 100, fieldName: 'tenant_id' },
    orderId: { type: 'uuid', fieldName: 'order_id' },
    agentUserId: { type: 'varchar', length: 100, nullable: true, fieldName: 'agent_user_id' },
    status: { type: 'varchar', length: 20, default: 'scheduled' },
    scheduledAt: { type: 'timestamptz', fieldName: 'scheduled_at' },
    proofReference: { type: 'varchar', length: 500, nullable: true, fieldName: 'proof_reference' },
    history: { type: 'json', defaultRaw: "'[]'::jsonb" },
    createdAt: { type: 'timestamptz', fieldName: 'created_at', onCreate: () => new Date() },
    updatedAt: { type: 'timestamptz', fieldName: 'updated_at', onCreate: () => new Date(), onUpdate: () => new Date() },
  },
  uniques: [{ name: 'ux__agritech_deliveries__tenant_order', properties: ['tenantId', 'orderId'] }],
  indexes: [
    {
      name: 'ix__agritech_deliveries__tenant_id_agent_user_id_status',
      properties: ['tenantId', 'agentUserId', 'status'],
    },
  ],
});

export class FieldVisitEntity {
  id: string = randomUUID();
  tenantId!: string;
  farmerId!: string;
  agentUserId!: string;
  notes!: string;
  observedGrade: ProduceGrade | null = null;
  observedAt!: Date;
  createdAt: Date = new Date();
}

export const FieldVisitEntitySchema = new EntitySchema<FieldVisitEntity>({
  class: FieldVisitEntity,
  tableName: 'agritech_field_visits',
  properties: {
    id: { type: 'uuid', primary: true },
    tenantId: { type: 'varchar', length: 100, fieldName: 'tenant_id' },
    farmerId: { type: 'uuid', fieldName: 'farmer_id' },
    agentUserId: { type: 'varchar', length: 100, fieldName: 'agent_user_id' },
    notes: { type: 'text' },
    observedGrade: { type: 'varchar', length: 1, nullable: true, fieldName: 'observed_grade' },
    observedAt: { type: 'timestamptz', fieldName: 'observed_at' },
    createdAt: { type: 'timestamptz', fieldName: 'created_at', onCreate: () => new Date() },
  },
  indexes: [
    {
      name: 'ix__agritech_field_visits__tenant_id_farmer_id_observed_at',
      properties: ['tenantId', 'farmerId', 'observedAt'],
    },
  ],
});

export class AdvisoryEntity {
  id: string = randomUUID();
  tenantId!: string;
  farmerId!: string;
  kind!: 'weather' | 'agronomy';
  source!: string;
  summary!: string;
  observedAt!: Date;
  expiresAt!: Date;
  createdAt: Date = new Date();
}

export const AdvisoryEntitySchema = new EntitySchema<AdvisoryEntity>({
  class: AdvisoryEntity,
  tableName: 'agritech_advisories',
  properties: {
    id: { type: 'uuid', primary: true },
    tenantId: { type: 'varchar', length: 100, fieldName: 'tenant_id' },
    farmerId: { type: 'uuid', fieldName: 'farmer_id' },
    kind: { type: 'varchar', length: 20 },
    source: { type: 'varchar', length: 100 },
    summary: { type: 'text' },
    observedAt: { type: 'timestamptz', fieldName: 'observed_at' },
    expiresAt: { type: 'timestamptz', fieldName: 'expires_at' },
    createdAt: { type: 'timestamptz', fieldName: 'created_at', onCreate: () => new Date() },
  },
  indexes: [
    {
      name: 'ix__agritech_advisories__tenant_id_farmer_id_expires_at',
      properties: ['tenantId', 'farmerId', 'expiresAt'],
    },
  ],
});

export class PilotCohortEntity {
  id: string = randomUUID();
  tenantId!: string;
  name!: string;
  status: PilotStatus = 'planned';
  targetFarmers!: number;
  targetSuppliers!: number;
  startsAt!: Date;
  endsAt!: Date;
  createdAt: Date = new Date();
  updatedAt: Date = new Date();
}

export const PilotCohortEntitySchema = new EntitySchema<PilotCohortEntity>({
  class: PilotCohortEntity,
  tableName: 'agritech_pilot_cohorts',
  properties: {
    id: { type: 'uuid', primary: true },
    tenantId: { type: 'varchar', length: 100, fieldName: 'tenant_id' },
    name: { type: 'varchar', length: 200 },
    status: { type: 'varchar', length: 20, default: 'planned' },
    targetFarmers: { type: 'int', fieldName: 'target_farmers' },
    targetSuppliers: { type: 'int', fieldName: 'target_suppliers' },
    startsAt: { type: 'timestamptz', fieldName: 'starts_at' },
    endsAt: { type: 'timestamptz', fieldName: 'ends_at' },
    createdAt: { type: 'timestamptz', fieldName: 'created_at', onCreate: () => new Date() },
    updatedAt: { type: 'timestamptz', fieldName: 'updated_at', onCreate: () => new Date(), onUpdate: () => new Date() },
  },
  uniques: [{ name: 'ux__agritech_pilot_cohorts__tenant_name', properties: ['tenantId', 'name'] }],
});

export class IntegrationStateEntity {
  id: string = randomUUID();
  tenantId!: string;
  provider!: string;
  status: IntegrationStatus = 'disabled';
  lastSuccessfulAt: Date | null = null;
  lastErrorCode: string | null = null;
  cursor: string | null = null;
  updatedAt: Date = new Date();
}

export const IntegrationStateEntitySchema = new EntitySchema<IntegrationStateEntity>({
  class: IntegrationStateEntity,
  tableName: 'agritech_integration_state',
  properties: {
    id: { type: 'uuid', primary: true },
    tenantId: { type: 'varchar', length: 100, fieldName: 'tenant_id' },
    provider: { type: 'varchar', length: 50 },
    status: { type: 'varchar', length: 20, default: 'disabled' },
    lastSuccessfulAt: { type: 'timestamptz', nullable: true, fieldName: 'last_successful_at' },
    lastErrorCode: { type: 'varchar', length: 100, nullable: true, fieldName: 'last_error_code' },
    cursor: { type: 'varchar', length: 500, nullable: true },
    updatedAt: { type: 'timestamptz', fieldName: 'updated_at', onCreate: () => new Date(), onUpdate: () => new Date() },
  },
  uniques: [{ name: 'ux__agritech_integration_state__tenant_provider', properties: ['tenantId', 'provider'] }],
});

export type PaymentProvider = 'click' | 'payme' | 'bnpl';
export type PaymentState = 'created' | 'pending' | 'paid' | 'cancelled' | 'failed' | 'refunded';

export class PaymentTransactionEntity {
  id: string = randomUUID();
  tenantId!: string;
  orderId!: string;
  userId!: string;
  provider!: PaymentProvider;
  idempotencyKey!: string;
  amountUzs!: number;
  state: PaymentState = 'created';
  providerTransactionId: string | null = null;
  providerCreatedAt: Date | null = null;
  reason: number | null = null;
  createdAt: Date = new Date();
  updatedAt: Date = new Date();
}

export const PaymentTransactionEntitySchema = new EntitySchema<PaymentTransactionEntity>({
  class: PaymentTransactionEntity,
  tableName: 'agritech_payment_transactions',
  properties: {
    id: { type: 'uuid', primary: true },
    tenantId: { type: 'varchar', length: 100, fieldName: 'tenant_id' },
    orderId: { type: 'uuid', fieldName: 'order_id' },
    userId: { type: 'varchar', length: 100, fieldName: 'user_id' },
    provider: { type: 'varchar', length: 20 },
    idempotencyKey: { type: 'varchar', length: 100, fieldName: 'idempotency_key' },
    amountUzs: { type: 'decimal', precision: 15, scale: 2, fieldName: 'amount_uzs' },
    state: { type: 'varchar', length: 20, default: 'created' },
    providerTransactionId: { type: 'varchar', length: 100, nullable: true, fieldName: 'provider_transaction_id' },
    providerCreatedAt: { type: 'timestamptz', nullable: true, fieldName: 'provider_created_at' },
    reason: { type: 'int', nullable: true },
    createdAt: { type: 'timestamptz', fieldName: 'created_at', onCreate: () => new Date() },
    updatedAt: { type: 'timestamptz', fieldName: 'updated_at', onCreate: () => new Date(), onUpdate: () => new Date() },
  },
  uniques: [
    {
      name: 'ux__agritech_payment_transactions__tenant_provider_key',
      properties: ['tenantId', 'provider', 'idempotencyKey'],
    },
    {
      name: 'ux__agritech_payment_transactions__tenant_provider_tx',
      properties: ['tenantId', 'provider', 'providerTransactionId'],
    },
  ],
  indexes: [
    { name: 'ix__agritech_payment_transactions__tenant_id_order_id', properties: ['tenantId', 'orderId'] },
    { name: 'ix__agritech_payment_transactions__tenant_id_state', properties: ['tenantId', 'state'] },
  ],
});
