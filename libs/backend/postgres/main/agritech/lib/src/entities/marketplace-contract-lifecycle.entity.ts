// @requirements REQ-AGRITECH-INTEGRATION-013 REQ-AGRITECH-STAGE2-017 REQ-AGRITECH-NOTIFICATION-022
import { randomUUID } from 'node:crypto';
import { EntitySchema } from '@mikro-orm/core';
import {
  marketplaceContractNotificationDefaultLocale,
  marketplaceNotificationUnclaimedClaimId,
} from '@app/backend-feature-agritech-shared';
import type {
  MarketplaceContractNotificationLocale,
  MarketplaceContractNotificationStatus,
  MarketplaceCommissionRateSnapshot,
  MarketplaceContractDisputeReason,
  MarketplaceDisputeEvidenceMediaType,
  MarketplaceContractFulfillmentStatus,
  MarketplaceContractParty,
  MarketplaceContractSettlementKind,
  MarketplaceContractSettlementProviderMode,
  MarketplaceContractSettlementStatus,
  MarketplaceContractTimelineActor,
  MarketplaceProviderSafeReceipt,
  MarketplaceReconciliationState,
} from '@app/backend-feature-agritech-shared';
import { ContractEntity, MarketplaceProviderOperationEntity } from './marketplace.entity';

export class MarketplaceContractArtifactEntity {
  id: string = randomUUID();
  contractId!: string;
  providerOperationId!: string;
  snapshotRevision = 1;
  templateVersion!: string;
  snapshotFingerprint!: string;
  checksumSha256!: string;
  mediaType!: string;
  byteSize!: number;
  storageReference!: string;
  providerMode!: 'mock' | 'live';
  providerName!: string;
  watermark: string | null = null;
  content: Buffer | null = null;
  createdAt: Date = new Date();
}

export const MarketplaceContractArtifactEntitySchema = new EntitySchema<MarketplaceContractArtifactEntity>({
  class: MarketplaceContractArtifactEntity,
  tableName: 'marketplace_contract_artifacts',
  properties: {
    id: { type: 'uuid', primary: true },
    contractId: { type: 'uuid', fieldName: 'contract_id' },
    providerOperationId: { type: 'uuid', fieldName: 'provider_operation_id' },
    snapshotRevision: { type: 'int', default: 1, fieldName: 'snapshot_revision' },
    templateVersion: { type: 'varchar', length: 50, fieldName: 'template_version' },
    snapshotFingerprint: { type: 'varchar', length: 64, fieldName: 'snapshot_fingerprint' },
    checksumSha256: { type: 'varchar', length: 64, fieldName: 'checksum_sha256' },
    mediaType: { type: 'varchar', length: 50, fieldName: 'media_type' },
    byteSize: { type: 'int', fieldName: 'byte_size' },
    storageReference: { type: 'varchar', length: 300, fieldName: 'storage_reference' },
    providerMode: { type: 'varchar', length: 10, fieldName: 'provider_mode' },
    providerName: { type: 'varchar', length: 100, fieldName: 'provider_name' },
    watermark: { type: 'varchar', length: 100, nullable: true },
    content: { type: 'blob', nullable: true },
    createdAt: { type: 'timestamptz', fieldName: 'created_at', defaultRaw: 'now()' },
  },
  uniques: [
    { name: 'uq__marketplace_contract_artifacts__contract_id', properties: ['contractId'] },
    { name: 'uq__marketplace_contract_artifacts__provider_operation_id', properties: ['providerOperationId'] },
    { name: 'uq__marketplace_contract_artifacts__storage_reference', properties: ['storageReference'] },
  ],
  checks: [
    {
      name: 'ck__contract_artifacts__fingerprints',
      expression: `"snapshot_fingerprint" ~ '^[a-f0-9]{64}$' and "checksum_sha256" ~ '^[a-f0-9]{64}$'`,
    },
    {
      name: 'ck__contract_artifacts__shape',
      expression: `"snapshot_revision" = 1 and "template_version" = 'dehqonhub-contract-v1' and "media_type" = 'application/pdf' and "byte_size" between 64 and 1048576`,
    },
    {
      name: 'ck__contract_artifacts__provider',
      expression: `
        ("provider_mode" = 'mock' and "content" is not null and "watermark" = 'MOCK PROVIDER — NOT A LEGAL CONTRACT')
        or ("provider_mode" = 'live' and "content" is null and "watermark" is null)
      `,
    },
  ],
});

MarketplaceContractArtifactEntitySchema.addManyToOne<MarketplaceContractArtifactEntity>(
  'contractId',
  ContractEntity.name,
  {
    deleteRule: 'restrict',
    fieldName: 'contract_id',
    foreignKeyName: 'fk__marketplace_contract_artifacts__contract_id',
    mapToPk: true,
  },
);
MarketplaceContractArtifactEntitySchema.addManyToOne<MarketplaceContractArtifactEntity>(
  'providerOperationId',
  MarketplaceProviderOperationEntity.name,
  {
    deleteRule: 'restrict',
    fieldName: 'provider_operation_id',
    foreignKeyName: 'fk__marketplace_contract_artifacts__provider_operation_id',
    mapToPk: true,
  },
);

export class MarketplaceContractSignatureEntity {
  id: string = randomUUID();
  contractId!: string;
  artifactId!: string;
  providerOperationId!: string;
  party!: MarketplaceContractParty;
  partyTenantId!: string;
  partyUserId!: string;
  partyPartnerId!: string;
  artifactChecksum!: string;
  snapshotRevision = 1;
  providerMode!: 'mock' | 'live';
  providerName!: string;
  providerReference!: string;
  safeReceipt!: MarketplaceProviderSafeReceipt;
  signedAt!: Date;
  createdAt: Date = new Date();
}

export const MarketplaceContractSignatureEntitySchema = new EntitySchema<MarketplaceContractSignatureEntity>({
  class: MarketplaceContractSignatureEntity,
  tableName: 'marketplace_contract_signatures',
  properties: {
    id: { type: 'uuid', primary: true },
    contractId: { type: 'uuid', fieldName: 'contract_id' },
    artifactId: { type: 'uuid', fieldName: 'artifact_id' },
    providerOperationId: { type: 'uuid', fieldName: 'provider_operation_id' },
    party: { type: 'varchar', length: 10 },
    partyTenantId: { type: 'varchar', length: 100, fieldName: 'party_tenant_id' },
    partyUserId: { type: 'varchar', length: 100, fieldName: 'party_user_id' },
    partyPartnerId: { type: 'uuid', fieldName: 'party_partner_id' },
    artifactChecksum: { type: 'varchar', length: 64, fieldName: 'artifact_checksum' },
    snapshotRevision: { type: 'int', default: 1, fieldName: 'snapshot_revision' },
    providerMode: { type: 'varchar', length: 10, fieldName: 'provider_mode' },
    providerName: { type: 'varchar', length: 100, fieldName: 'provider_name' },
    providerReference: { type: 'varchar', length: 300, fieldName: 'provider_reference' },
    safeReceipt: { type: 'jsonb', fieldName: 'safe_receipt' },
    signedAt: { type: 'timestamptz', fieldName: 'signed_at' },
    createdAt: { type: 'timestamptz', fieldName: 'created_at', defaultRaw: 'now()' },
  },
  uniques: [
    { name: 'uq__marketplace_contract_signatures__contract_id_party', properties: ['contractId', 'party'] },
    {
      name: 'uq__marketplace_contract_signatures__provider_operation_id',
      properties: ['providerOperationId'],
    },
  ],
  checks: [
    { name: 'ck__contract_signatures__party', expression: `"party" in ('buyer', 'seller')` },
    {
      name: 'ck__contract_signatures__provider',
      expression: `"provider_mode" in ('mock', 'live') and btrim("provider_name") <> '' and btrim("provider_reference") <> ''`,
    },
    {
      name: 'ck__contract_signatures__artifact',
      expression: `"snapshot_revision" = 1 and "artifact_checksum" ~ '^[a-f0-9]{64}$'`,
    },
    {
      name: 'ck__contract_signatures__safe_receipt',
      expression: `jsonb_typeof("safe_receipt") = 'object' and pg_column_size("safe_receipt") <= 4096`,
    },
  ],
});

MarketplaceContractSignatureEntitySchema.addManyToOne<MarketplaceContractSignatureEntity>(
  'contractId',
  ContractEntity.name,
  {
    deleteRule: 'restrict',
    fieldName: 'contract_id',
    foreignKeyName: 'fk__marketplace_contract_signatures__contract_id',
    mapToPk: true,
  },
);
MarketplaceContractSignatureEntitySchema.addManyToOne<MarketplaceContractSignatureEntity>(
  'artifactId',
  MarketplaceContractArtifactEntity.name,
  {
    deleteRule: 'restrict',
    fieldName: 'artifact_id',
    foreignKeyName: 'fk__marketplace_contract_signatures__artifact_id',
    mapToPk: true,
  },
);
MarketplaceContractSignatureEntitySchema.addManyToOne<MarketplaceContractSignatureEntity>(
  'providerOperationId',
  MarketplaceProviderOperationEntity.name,
  {
    deleteRule: 'restrict',
    fieldName: 'provider_operation_id',
    foreignKeyName: 'fk__marketplace_contract_signatures__provider_operation_id',
    mapToPk: true,
  },
);

export class MarketplaceContractSettlementEntity {
  id: string = randomUUID();
  contractId!: string;
  kind!: MarketplaceContractSettlementKind;
  status!: MarketplaceContractSettlementStatus;
  amountUzs!: number;
  currency = 'UZS';
  selectedByTenantId!: string;
  selectedByUserId!: string;
  selectionIdempotencyKey!: string;
  selectionRequestFingerprint!: string;
  buyerConsentedAt: Date | null = null;
  sellerConsentedAt: Date | null = null;
  latestProviderMode: MarketplaceContractSettlementProviderMode = 'none';
  reconciliationState: MarketplaceReconciliationState = 'clear';
  reconciliationReason: string | null = null;
  revision = 0;
  createdAt: Date = new Date();
  updatedAt: Date = new Date();
}

export const MarketplaceContractSettlementEntitySchema = new EntitySchema<MarketplaceContractSettlementEntity>({
  class: MarketplaceContractSettlementEntity,
  tableName: 'marketplace_contract_settlements',
  properties: {
    id: { type: 'uuid', primary: true },
    contractId: { type: 'uuid', fieldName: 'contract_id' },
    kind: { type: 'varchar', length: 20 },
    status: { type: 'varchar', length: 40 },
    amountUzs: { type: 'decimal', precision: 15, scale: 0, fieldName: 'amount_uzs' },
    currency: { type: 'varchar', length: 3, default: 'UZS' },
    selectedByTenantId: { type: 'varchar', length: 100, fieldName: 'selected_by_tenant_id' },
    selectedByUserId: { type: 'varchar', length: 100, fieldName: 'selected_by_user_id' },
    selectionIdempotencyKey: { type: 'varchar', length: 100, fieldName: 'selection_idempotency_key' },
    selectionRequestFingerprint: { type: 'varchar', length: 64, fieldName: 'selection_request_fingerprint' },
    buyerConsentedAt: { type: 'timestamptz', nullable: true, fieldName: 'buyer_consented_at' },
    sellerConsentedAt: { type: 'timestamptz', nullable: true, fieldName: 'seller_consented_at' },
    latestProviderMode: { type: 'varchar', length: 10, default: 'none', fieldName: 'latest_provider_mode' },
    reconciliationState: { type: 'varchar', length: 10, default: 'clear', fieldName: 'reconciliation_state' },
    reconciliationReason: { type: 'varchar', length: 100, nullable: true, fieldName: 'reconciliation_reason' },
    revision: { type: 'int', default: 0 },
    createdAt: { type: 'timestamptz', fieldName: 'created_at', defaultRaw: 'now()' },
    updatedAt: { type: 'timestamptz', fieldName: 'updated_at', defaultRaw: 'now()' },
  },
  uniques: [{ name: 'uq__marketplace_contract_settlements__contract_id', properties: ['contractId'] }],
  checks: [
    {
      name: 'ck__contract_settlements__kind_status',
      expression: `
        ("kind" = 'direct_payment' and "status" in ('awaiting_buyer_confirmation', 'buyer_confirmed', 'seller_received'))
        or ("kind" = 'factoring' and "status" in ('awaiting_consents', 'ready_to_request', 'approved', 'rejected', 'seller_paid', 'buyer_repaid', 'closed'))
      `,
    },
    {
      name: 'ck__contract_settlements__amount',
      expression: `"amount_uzs" > 0 and "amount_uzs" = trunc("amount_uzs") and "currency" = 'UZS'`,
    },
    {
      name: 'ck__contract_settlements__selection',
      expression: `"selection_request_fingerprint" ~ '^[a-f0-9]{64}$' and btrim("selection_idempotency_key") <> ''`,
    },
    {
      name: 'ck__contract_settlements__consents',
      expression: `
        ("kind" = 'direct_payment' and "buyer_consented_at" is null and "seller_consented_at" is null)
        or ("kind" = 'factoring' and (
          ("status" = 'awaiting_consents')
          or ("buyer_consented_at" is not null and "seller_consented_at" is not null)
        ))
      `,
    },
    {
      name: 'ck__contract_settlements__provider_mode',
      expression: `"latest_provider_mode" in ('none', 'mock', 'live')`,
    },
    {
      name: 'ck__contract_settlements__reconciliation',
      expression: `
        ("reconciliation_state" = 'clear' and "reconciliation_reason" is null)
        or ("reconciliation_state" = 'required' and btrim(coalesce("reconciliation_reason", '')) <> '')
      `,
    },
    { name: 'ck__contract_settlements__revision', expression: `"revision" >= 0` },
  ],
});

MarketplaceContractSettlementEntitySchema.addManyToOne<MarketplaceContractSettlementEntity>(
  'contractId',
  ContractEntity.name,
  {
    deleteRule: 'restrict',
    fieldName: 'contract_id',
    foreignKeyName: 'fk__marketplace_contract_settlements__contract_id',
    mapToPk: true,
  },
);

export type MarketplaceContractTimelineCategory =
  'artifact' | 'signature' | 'settlement' | 'fulfillment' | 'dispute' | 'completion';

export class MarketplaceContractLifecycleEventEntity {
  id: string = randomUUID();
  contractId!: string;
  sequence!: number;
  category!: MarketplaceContractTimelineCategory;
  eventType!: string;
  actorParty!: MarketplaceContractTimelineActor;
  actorTenantId!: string;
  actorUserId!: string;
  idempotencyKey: string | null = null;
  requestFingerprint: string | null = null;
  providerOperationId: string | null = null;
  providerEventId: string | null = null;
  providerMode: 'none' | 'mock' | 'live' = 'none';
  providerName: string | null = null;
  providerReference: string | null = null;
  safeReceipt: MarketplaceProviderSafeReceipt | null = null;
  createdAt: Date = new Date();
}

export const MarketplaceContractLifecycleEventEntitySchema = new EntitySchema<MarketplaceContractLifecycleEventEntity>({
  class: MarketplaceContractLifecycleEventEntity,
  tableName: 'marketplace_contract_lifecycle_events',
  properties: {
    id: { type: 'uuid', primary: true },
    contractId: { type: 'uuid', fieldName: 'contract_id' },
    sequence: { type: 'int' },
    category: { type: 'varchar', length: 20 },
    eventType: { type: 'varchar', length: 50, fieldName: 'event_type' },
    actorParty: { type: 'varchar', length: 10, fieldName: 'actor_party' },
    actorTenantId: { type: 'varchar', length: 100, fieldName: 'actor_tenant_id' },
    actorUserId: { type: 'varchar', length: 100, fieldName: 'actor_user_id' },
    idempotencyKey: { type: 'varchar', length: 100, nullable: true, fieldName: 'idempotency_key' },
    requestFingerprint: { type: 'varchar', length: 64, nullable: true, fieldName: 'request_fingerprint' },
    providerOperationId: { type: 'uuid', nullable: true, fieldName: 'provider_operation_id' },
    providerEventId: { type: 'varchar', length: 200, nullable: true, fieldName: 'provider_event_id' },
    providerMode: { type: 'varchar', length: 10, default: 'none', fieldName: 'provider_mode' },
    providerName: { type: 'varchar', length: 100, nullable: true, fieldName: 'provider_name' },
    providerReference: { type: 'varchar', length: 300, nullable: true, fieldName: 'provider_reference' },
    safeReceipt: { type: 'jsonb', nullable: true, fieldName: 'safe_receipt' },
    createdAt: { type: 'timestamptz', fieldName: 'created_at', defaultRaw: 'now()' },
  },
  uniques: [
    { name: 'uq__contract_lifecycle_events__contract_id_sequence', properties: ['contractId', 'sequence'] },
    { name: 'uq__contract_lifecycle_events__provider_operation_id', properties: ['providerOperationId'] },
    {
      name: 'uq__marketplace_contract_lifecycle_events__contract_id_ab13d8ba',
      properties: ['contractId', 'actorTenantId', 'actorUserId', 'eventType', 'idempotencyKey'],
      where: `"idempotency_key" is not null`,
    },
  ],
  checks: [
    { name: 'ck__contract_lifecycle_events__sequence', expression: `"sequence" > 0` },
    {
      name: 'ck__contract_lifecycle_events__category',
      expression: `"category" in ('artifact', 'signature', 'settlement', 'fulfillment', 'dispute', 'completion')`,
    },
    { name: 'ck__contract_lifecycle_events__party', expression: `"actor_party" in ('buyer', 'seller', 'admin')` },
    {
      name: 'ck__contract_lifecycle_events__idempotency',
      expression: `
        ("idempotency_key" is null and "request_fingerprint" is null)
        or (btrim("idempotency_key") <> '' and "request_fingerprint" ~ '^[a-f0-9]{64}$')
      `,
    },
    {
      name: 'ck__contract_lifecycle_events__provider',
      expression: `
        ("provider_mode" = 'none' and "provider_operation_id" is null and "provider_event_id" is null
          and "provider_name" is null and "provider_reference" is null and "safe_receipt" is null)
        or ("provider_mode" in ('mock', 'live') and "provider_operation_id" is not null
          and btrim(coalesce("provider_name", '')) <> '' and btrim(coalesce("provider_reference", '')) <> ''
          and jsonb_typeof("safe_receipt") = 'object' and pg_column_size("safe_receipt") <= 4096)
      `,
    },
  ],
});

MarketplaceContractLifecycleEventEntitySchema.addManyToOne<MarketplaceContractLifecycleEventEntity>(
  'contractId',
  ContractEntity.name,
  {
    deleteRule: 'restrict',
    fieldName: 'contract_id',
    foreignKeyName: 'fk__contract_lifecycle_events__contract_id',
    mapToPk: true,
  },
);
MarketplaceContractLifecycleEventEntitySchema.addManyToOne<MarketplaceContractLifecycleEventEntity>(
  'providerOperationId',
  MarketplaceProviderOperationEntity.name,
  {
    deleteRule: 'restrict',
    fieldName: 'provider_operation_id',
    foreignKeyName: 'fk__contract_lifecycle_events__provider_operation_id',
    mapToPk: true,
    nullable: true,
  },
);

export class MarketplaceContractFulfillmentEntity {
  id: string = randomUUID();
  contractId!: string;
  status: MarketplaceContractFulfillmentStatus = 'awaiting_settlement';
  revision = 0;
  startedAt: Date | null = null;
  deliveredAt: Date | null = null;
  completedAt: Date | null = null;
  createdAt: Date = new Date();
  updatedAt: Date = new Date();
}

export const MarketplaceContractFulfillmentEntitySchema = new EntitySchema<MarketplaceContractFulfillmentEntity>({
  class: MarketplaceContractFulfillmentEntity,
  tableName: 'marketplace_contract_fulfillments',
  properties: {
    id: { type: 'uuid', primary: true },
    contractId: { type: 'uuid', fieldName: 'contract_id' },
    status: { type: 'varchar', length: 30, default: 'awaiting_settlement' },
    revision: { type: 'int', default: 0 },
    startedAt: { type: 'timestamptz', nullable: true, fieldName: 'started_at' },
    deliveredAt: { type: 'timestamptz', nullable: true, fieldName: 'delivered_at' },
    completedAt: { type: 'timestamptz', nullable: true, fieldName: 'completed_at' },
    createdAt: { type: 'timestamptz', fieldName: 'created_at', defaultRaw: 'now()' },
    updatedAt: { type: 'timestamptz', fieldName: 'updated_at', defaultRaw: 'now()' },
  },
  uniques: [{ name: 'uq__marketplace_contract_fulfillments__contract_id', properties: ['contractId'] }],
  checks: [
    {
      name: 'ck__contract_fulfillments__status',
      expression: `"status" in ('awaiting_settlement', 'ready', 'in_progress', 'delivered', 'disputed', 'cancelled', 'completed')`,
    },
    { name: 'ck__contract_fulfillments__revision', expression: `"revision" >= 0` },
    {
      name: 'ck__contract_fulfillments__timeline',
      expression: `
        ("status" in ('awaiting_settlement', 'ready') and "started_at" is null and "delivered_at" is null and "completed_at" is null)
        or ("status" in ('in_progress', 'disputed', 'cancelled') and "started_at" is not null and "completed_at" is null)
        or ("status" = 'delivered' and "started_at" is not null and "delivered_at" is not null and "completed_at" is null)
        or ("status" = 'completed' and "started_at" is not null and "delivered_at" is not null and "completed_at" is not null)
      `,
    },
  ],
});
MarketplaceContractFulfillmentEntitySchema.addManyToOne<MarketplaceContractFulfillmentEntity>(
  'contractId',
  ContractEntity.name,
  {
    deleteRule: 'restrict',
    fieldName: 'contract_id',
    foreignKeyName: 'fk__marketplace_contract_fulfillments__contract_id',
    mapToPk: true,
  },
);

export class MarketplaceContractDisputeEntity {
  id: string = randomUUID();
  contractId!: string;
  openedByParty!: MarketplaceContractParty;
  openedByTenantId!: string;
  openedByUserId!: string;
  reason!: MarketplaceContractDisputeReason;
  status: 'open' | 'resolved' = 'open';
  previousFulfillmentStatus!: 'in_progress' | 'delivered';
  decision: 'dismissed' | 'upheld_cancelled' | null = null;
  resolutionEvidenceRevision: number | null = null;
  outcomeNote: string | null = null;
  resolvedByAdminId: string | null = null;
  resolvedAt: Date | null = null;
  resolutionIdempotencyKey: string | null = null;
  resolutionRequestFingerprint: string | null = null;
  revision = 0;
  createdAt: Date = new Date();
}

export const MarketplaceContractDisputeEntitySchema = new EntitySchema<MarketplaceContractDisputeEntity>({
  class: MarketplaceContractDisputeEntity,
  tableName: 'marketplace_contract_disputes',
  properties: {
    id: { type: 'uuid', primary: true },
    contractId: { type: 'uuid', fieldName: 'contract_id' },
    openedByParty: { type: 'varchar', length: 10, fieldName: 'opened_by_party' },
    openedByTenantId: { type: 'varchar', length: 100, fieldName: 'opened_by_tenant_id' },
    openedByUserId: { type: 'varchar', length: 100, fieldName: 'opened_by_user_id' },
    reason: { type: 'varchar', length: 30 },
    status: { type: 'varchar', length: 10, default: 'open' },
    previousFulfillmentStatus: { type: 'varchar', length: 20, fieldName: 'previous_fulfillment_status' },
    decision: { type: 'varchar', length: 30, nullable: true },
    resolutionEvidenceRevision: {
      type: 'int',
      nullable: true,
      fieldName: 'resolution_evidence_revision',
    },
    outcomeNote: { type: 'varchar', length: 1000, nullable: true, fieldName: 'outcome_note' },
    resolvedByAdminId: { type: 'varchar', length: 100, nullable: true, fieldName: 'resolved_by_admin_id' },
    resolvedAt: { type: 'timestamptz', nullable: true, fieldName: 'resolved_at' },
    resolutionIdempotencyKey: {
      type: 'varchar',
      length: 100,
      nullable: true,
      fieldName: 'resolution_idempotency_key',
    },
    resolutionRequestFingerprint: {
      type: 'varchar',
      length: 64,
      nullable: true,
      fieldName: 'resolution_request_fingerprint',
    },
    revision: { type: 'int', default: 0 },
    createdAt: { type: 'timestamptz', fieldName: 'created_at', defaultRaw: 'now()' },
  },
  uniques: [{ name: 'uq__marketplace_contract_disputes__contract_id', properties: ['contractId'] }],
  checks: [
    { name: 'ck__contract_disputes__party', expression: `"opened_by_party" in ('buyer', 'seller')` },
    {
      name: 'ck__contract_disputes__reason',
      expression: `"reason" in ('delivery_issue', 'quality_issue', 'quantity_issue', 'other')`,
    },
    { name: 'ck__contract_disputes__status', expression: `"status" in ('open', 'resolved')` },
    {
      name: 'ck__contract_disputes__previous_status',
      expression: `"previous_fulfillment_status" in ('in_progress', 'delivered')`,
    },
    {
      name: 'ck__contract_disputes__resolution',
      expression: `
        ("status" = 'open' and "decision" is null and "resolution_evidence_revision" is null
          and "outcome_note" is null and "resolved_by_admin_id" is null and "resolved_at" is null
          and "resolution_idempotency_key" is null and "resolution_request_fingerprint" is null and "revision" = 0)
        or ("status" = 'resolved' and "decision" in ('dismissed', 'upheld_cancelled')
          and "resolution_evidence_revision" > 0 and btrim("outcome_note") <> ''
          and btrim("resolved_by_admin_id") <> '' and "resolved_at" is not null
          and btrim("resolution_idempotency_key") <> ''
          and "resolution_request_fingerprint" ~ '^[a-f0-9]{64}$' and "revision" = 1)
      `,
    },
  ],
});
MarketplaceContractDisputeEntitySchema.addManyToOne<MarketplaceContractDisputeEntity>(
  'contractId',
  ContractEntity.name,
  {
    deleteRule: 'restrict',
    fieldName: 'contract_id',
    foreignKeyName: 'fk__marketplace_contract_disputes__contract_id',
    mapToPk: true,
  },
);

export class MarketplaceContractDisputeEvidenceEntity {
  id: string = randomUUID();
  contractId!: string;
  disputeId!: string;
  providerOperationId!: string;
  disputeRevision!: number;
  revision!: number;
  uploadedByParty!: MarketplaceContractParty;
  uploadedByTenantId!: string;
  uploadedByUserId!: string;
  fileName!: string;
  mediaType!: MarketplaceDisputeEvidenceMediaType;
  byteSize!: number;
  checksumSha256!: string;
  storageReference!: string;
  providerMode!: 'mock' | 'live';
  providerName!: string;
  providerReference!: string;
  createdAt: Date = new Date();
}

export const MarketplaceContractDisputeEvidenceEntitySchema =
  new EntitySchema<MarketplaceContractDisputeEvidenceEntity>({
    class: MarketplaceContractDisputeEvidenceEntity,
    tableName: 'marketplace_contract_dispute_evidence',
    properties: {
      id: { type: 'uuid', primary: true },
      contractId: { type: 'uuid', fieldName: 'contract_id' },
      disputeId: { type: 'uuid', fieldName: 'dispute_id' },
      providerOperationId: { type: 'uuid', fieldName: 'provider_operation_id' },
      disputeRevision: { type: 'int', fieldName: 'dispute_revision' },
      revision: { type: 'int' },
      uploadedByParty: { type: 'varchar', length: 10, fieldName: 'uploaded_by_party' },
      uploadedByTenantId: { type: 'varchar', length: 100, fieldName: 'uploaded_by_tenant_id' },
      uploadedByUserId: { type: 'varchar', length: 100, fieldName: 'uploaded_by_user_id' },
      fileName: { type: 'varchar', length: 200, fieldName: 'file_name' },
      mediaType: { type: 'varchar', length: 50, fieldName: 'media_type' },
      byteSize: { type: 'int', fieldName: 'byte_size' },
      checksumSha256: { type: 'varchar', length: 64, fieldName: 'checksum_sha256' },
      storageReference: { type: 'varchar', length: 300, fieldName: 'storage_reference' },
      providerMode: { type: 'varchar', length: 10, fieldName: 'provider_mode' },
      providerName: { type: 'varchar', length: 100, fieldName: 'provider_name' },
      providerReference: { type: 'varchar', length: 200, fieldName: 'provider_reference' },
      createdAt: { type: 'timestamptz', fieldName: 'created_at', defaultRaw: 'now()' },
    },
    uniques: [
      { name: 'uq__contract_dispute_evidence__provider_operation', properties: ['providerOperationId'] },
      { name: 'uq__contract_dispute_evidence__dispute_revision', properties: ['disputeId', 'revision'] },
    ],
    indexes: [
      {
        name: 'ix__marketplace_contract_dispute_evidence__contract_id_ef48c1a2',
        properties: ['contractId', 'createdAt'],
      },
    ],
    checks: [
      { name: 'ck__contract_dispute_evidence__party', expression: `"uploaded_by_party" in ('buyer', 'seller')` },
      {
        name: 'ck__contract_dispute_evidence__media_type',
        expression: `"media_type" in ('application/pdf', 'image/jpeg', 'image/png')`,
      },
      {
        name: 'ck__contract_dispute_evidence__shape',
        expression: `"dispute_revision" >= 0 and "revision" > 0 and "byte_size" between 1 and 10485760 and "checksum_sha256" ~ '^[a-f0-9]{64}$' and btrim("file_name") <> '' and btrim("storage_reference") <> '' and btrim("provider_name") <> '' and "provider_reference" ~ '^[!-~]{1,200}$' and "provider_mode" in ('mock', 'live')`,
      },
    ],
  });
MarketplaceContractDisputeEvidenceEntitySchema.addManyToOne<MarketplaceContractDisputeEvidenceEntity>(
  'contractId',
  ContractEntity.name,
  {
    deleteRule: 'restrict',
    fieldName: 'contract_id',
    foreignKeyName: 'fk__contract_dispute_evidence__contract_id',
    mapToPk: true,
  },
);
MarketplaceContractDisputeEvidenceEntitySchema.addManyToOne<MarketplaceContractDisputeEvidenceEntity>(
  'disputeId',
  MarketplaceContractDisputeEntity.name,
  {
    deleteRule: 'restrict',
    fieldName: 'dispute_id',
    foreignKeyName: 'fk__contract_dispute_evidence__dispute_id',
    mapToPk: true,
  },
);
MarketplaceContractDisputeEvidenceEntitySchema.addManyToOne<MarketplaceContractDisputeEvidenceEntity>(
  'providerOperationId',
  MarketplaceProviderOperationEntity.name,
  {
    deleteRule: 'restrict',
    fieldName: 'provider_operation_id',
    foreignKeyName: 'fk__contract_dispute_evidence__provider_operation_id',
    mapToPk: true,
  },
);

export class MarketplaceContractDisputeResolutionEvidenceEntity {
  id: string = randomUUID();
  disputeId!: string;
  evidenceId!: string;
  evidenceRevision!: number;
  createdAt: Date = new Date();
}

export const MarketplaceContractDisputeResolutionEvidenceEntitySchema =
  new EntitySchema<MarketplaceContractDisputeResolutionEvidenceEntity>({
    class: MarketplaceContractDisputeResolutionEvidenceEntity,
    tableName: 'marketplace_contract_dispute_resolution_evidence',
    properties: {
      id: { type: 'uuid', primary: true },
      disputeId: { type: 'uuid', fieldName: 'dispute_id' },
      evidenceId: { type: 'uuid', fieldName: 'evidence_id' },
      evidenceRevision: { type: 'int', fieldName: 'evidence_revision' },
      createdAt: { type: 'timestamptz', fieldName: 'created_at', defaultRaw: 'now()' },
    },
    uniques: [
      { name: 'uq__contract_dispute_resolution_evidence__dispute_evidence', properties: ['disputeId', 'evidenceId'] },
    ],
    checks: [{ name: 'ck__contract_dispute_resolution_evidence__revision', expression: `"evidence_revision" > 0` }],
  });
MarketplaceContractDisputeResolutionEvidenceEntitySchema.addManyToOne<MarketplaceContractDisputeResolutionEvidenceEntity>(
  'disputeId',
  MarketplaceContractDisputeEntity.name,
  {
    deleteRule: 'restrict',
    fieldName: 'dispute_id',
    foreignKeyName: 'fk__contract_dispute_resolution_evidence__dispute_id',
    mapToPk: true,
  },
);
MarketplaceContractDisputeResolutionEvidenceEntitySchema.addManyToOne<MarketplaceContractDisputeResolutionEvidenceEntity>(
  'evidenceId',
  MarketplaceContractDisputeEvidenceEntity.name,
  {
    deleteRule: 'restrict',
    fieldName: 'evidence_id',
    foreignKeyName: 'fk__contract_dispute_resolution_evidence__evidence_id',
    mapToPk: true,
  },
);

export class MarketplaceContractReputationSignalEntity {
  id: string = randomUUID();
  contractId!: string;
  disputeId!: string;
  disputeRevision!: number;
  subjectParty!: MarketplaceContractParty;
  outcome!: 'dispute_dismissed' | 'dispute_upheld';
  impact = 'negative' as const;
  reason!: MarketplaceContractDisputeReason;
  createdAt: Date = new Date();
}

export const MarketplaceContractReputationSignalEntitySchema =
  new EntitySchema<MarketplaceContractReputationSignalEntity>({
    class: MarketplaceContractReputationSignalEntity,
    tableName: 'marketplace_contract_reputation_signals',
    properties: {
      id: { type: 'uuid', primary: true },
      contractId: { type: 'uuid', fieldName: 'contract_id' },
      disputeId: { type: 'uuid', fieldName: 'dispute_id' },
      disputeRevision: { type: 'int', fieldName: 'dispute_revision' },
      subjectParty: { type: 'varchar', length: 10, fieldName: 'subject_party' },
      outcome: { type: 'varchar', length: 30 },
      impact: { type: 'varchar', length: 10, default: 'negative' },
      reason: { type: 'varchar', length: 30 },
      createdAt: { type: 'timestamptz', fieldName: 'created_at', defaultRaw: 'now()' },
    },
    uniques: [{ name: 'uq__contract_reputation_signals__dispute_id', properties: ['disputeId'] }],
    indexes: [
      {
        name: 'ix__marketplace_contract_reputation_signals__contract_300c7c25',
        properties: ['contractId', 'createdAt'],
      },
    ],
    checks: [
      { name: 'ck__contract_reputation_signals__party', expression: `"subject_party" in ('buyer', 'seller')` },
      {
        name: 'ck__contract_reputation_signals__outcome',
        expression: `"outcome" in ('dispute_dismissed', 'dispute_upheld') and "impact" = 'negative'`,
      },
      {
        name: 'ck__contract_reputation_signals__reason',
        expression: `"reason" in ('delivery_issue', 'quality_issue', 'quantity_issue', 'other') and "dispute_revision" > 0`,
      },
    ],
  });
MarketplaceContractReputationSignalEntitySchema.addManyToOne<MarketplaceContractReputationSignalEntity>(
  'contractId',
  ContractEntity.name,
  {
    deleteRule: 'restrict',
    fieldName: 'contract_id',
    foreignKeyName: 'fk__contract_reputation_signals__contract_id',
    mapToPk: true,
  },
);
MarketplaceContractReputationSignalEntitySchema.addManyToOne<MarketplaceContractReputationSignalEntity>(
  'disputeId',
  MarketplaceContractDisputeEntity.name,
  {
    deleteRule: 'restrict',
    fieldName: 'dispute_id',
    foreignKeyName: 'fk__contract_reputation_signals__dispute_id',
    mapToPk: true,
  },
);

export class MarketplaceCommissionRatePolicyEntity {
  id: string = randomUUID();
  version!: string;
  rateSnapshot!: MarketplaceCommissionRateSnapshot;
  status: 'active' | 'retired' = 'active';
  createdByAdminId!: string;
  activationIdempotencyKey!: string;
  activationRequestFingerprint!: string;
  retiredAt: Date | null = null;
  createdAt: Date = new Date();
}

export const MarketplaceCommissionRatePolicyEntitySchema = new EntitySchema<MarketplaceCommissionRatePolicyEntity>({
  class: MarketplaceCommissionRatePolicyEntity,
  tableName: 'marketplace_commission_rate_policies',
  properties: {
    id: { type: 'uuid', primary: true },
    version: { type: 'varchar', length: 50 },
    rateSnapshot: { type: 'jsonb', fieldName: 'rate_snapshot' },
    status: { type: 'varchar', length: 10, default: 'active' },
    createdByAdminId: { type: 'varchar', length: 100, fieldName: 'created_by_admin_id' },
    activationIdempotencyKey: { type: 'varchar', length: 100, fieldName: 'activation_idempotency_key' },
    activationRequestFingerprint: {
      type: 'varchar',
      length: 64,
      fieldName: 'activation_request_fingerprint',
    },
    retiredAt: { type: 'timestamptz', nullable: true, fieldName: 'retired_at' },
    createdAt: { type: 'timestamptz', fieldName: 'created_at', defaultRaw: 'now()' },
  },
  uniques: [
    { name: 'uq__commission_rate_policies__version', properties: ['version'] },
    { name: 'uq__commission_rate_policies__activation_key', properties: ['activationIdempotencyKey'] },
    { name: 'uq__marketplace_commission_rate_policies__status', properties: ['status'], where: `"status" = 'active'` },
  ],
  checks: [
    { name: 'ck__commission_rate_policies__version', expression: `"version" ~ '^[a-z0-9][a-z0-9-]{2,49}$'` },
    { name: 'ck__commission_rate_policies__status', expression: `"status" in ('active', 'retired')` },
    {
      name: 'ck__commission_rate_policies__rates',
      expression: `
        jsonb_typeof("rate_snapshot") = 'object'
        and "rate_snapshot" - array['product', 'produce', 'request'] = '{}'::jsonb
        and "rate_snapshot" ?& array['product', 'produce', 'request']
        and ("rate_snapshot"->>'product')::int between 0 and 1000
        and ("rate_snapshot"->>'produce')::int between 0 and 1000
        and ("rate_snapshot"->>'request')::int between 0 and 1000
      `,
    },
    {
      name: 'ck__commission_rate_policies__fingerprint',
      expression: `"activation_request_fingerprint" ~ '^[a-f0-9]{64}$'`,
    },
    {
      name: 'ck__commission_rate_policies__retirement',
      expression: `("status" = 'active' and "retired_at" is null) or ("status" = 'retired' and "retired_at" is not null)`,
    },
  ],
});

export class MarketplaceContractCommissionEntity {
  id: string = randomUUID();
  contractId!: string;
  rateVersion!: string;
  rateSnapshot!: MarketplaceCommissionRateSnapshot;
  baseAmountUzs!: number;
  amountUzs!: number;
  currency = 'UZS';
  createdAt: Date = new Date();
}

export const MarketplaceContractCommissionEntitySchema = new EntitySchema<MarketplaceContractCommissionEntity>({
  class: MarketplaceContractCommissionEntity,
  tableName: 'marketplace_contract_commissions',
  properties: {
    id: { type: 'uuid', primary: true },
    contractId: { type: 'uuid', fieldName: 'contract_id' },
    rateVersion: { type: 'varchar', length: 50, fieldName: 'rate_version' },
    rateSnapshot: { type: 'jsonb', fieldName: 'rate_snapshot' },
    baseAmountUzs: { type: 'decimal', precision: 15, scale: 0, fieldName: 'base_amount_uzs' },
    amountUzs: { type: 'decimal', precision: 15, scale: 0, fieldName: 'amount_uzs' },
    currency: { type: 'varchar', length: 3, default: 'UZS' },
    createdAt: { type: 'timestamptz', fieldName: 'created_at', defaultRaw: 'now()' },
  },
  uniques: [{ name: 'uq__marketplace_contract_commissions__contract_id', properties: ['contractId'] }],
  checks: [
    {
      name: 'ck__contract_commissions__amount',
      expression: `"base_amount_uzs" > 0 and "base_amount_uzs" = trunc("base_amount_uzs") and "amount_uzs" >= 0 and "amount_uzs" = trunc("amount_uzs") and "amount_uzs" <= "base_amount_uzs" and "currency" = 'UZS'`,
    },
    {
      name: 'ck__contract_commissions__rate_snapshot',
      expression: `jsonb_typeof("rate_snapshot") = 'object' and pg_column_size("rate_snapshot") <= 1024`,
    },
  ],
});
MarketplaceContractCommissionEntitySchema.addManyToOne<MarketplaceContractCommissionEntity>(
  'contractId',
  ContractEntity.name,
  {
    deleteRule: 'restrict',
    fieldName: 'contract_id',
    foreignKeyName: 'fk__marketplace_contract_commissions__contract_id',
    mapToPk: true,
  },
);

export class MarketplaceContractNotificationIntentEntity {
  id: string = randomUUID();
  contractId!: string;
  timelineEventId!: string;
  recipientParty!: MarketplaceContractParty;
  templateKey!: string;
  channel: 'telegram' | 'sms' = 'telegram';
  status: MarketplaceContractNotificationStatus = 'pending';
  providerMode: 'none' | 'mock' | 'live' = 'none';
  providerName: string | null = null;
  recipientLocale: MarketplaceContractNotificationLocale = marketplaceContractNotificationDefaultLocale;
  simulation = false;
  attempts = 0;
  channelAttempts = 0;
  nextAttemptAt: Date = new Date();
  claimedAt: Date = new Date(0);
  claimToken: string = marketplaceNotificationUnclaimedClaimId;
  lastAttemptAt: Date | null = null;
  lastErrorCode: string | null = null;
  providerReference: string | null = null;
  safeReceipt: MarketplaceProviderSafeReceipt | null = null;
  dispatchedAt: Date | null = null;
  createdAt: Date = new Date();
  updatedAt: Date = new Date();
}

export const MarketplaceContractNotificationIntentEntitySchema =
  new EntitySchema<MarketplaceContractNotificationIntentEntity>({
    class: MarketplaceContractNotificationIntentEntity,
    tableName: 'marketplace_contract_notification_intents',
    properties: {
      id: { type: 'uuid', primary: true },
      contractId: { type: 'uuid', fieldName: 'contract_id' },
      timelineEventId: { type: 'uuid', fieldName: 'timeline_event_id' },
      recipientParty: { type: 'varchar', length: 10, fieldName: 'recipient_party' },
      templateKey: { type: 'varchar', length: 80, fieldName: 'template_key' },
      channel: { type: 'varchar', length: 20, default: 'telegram' },
      status: { type: 'varchar', length: 32, default: 'pending' },
      providerMode: { type: 'varchar', length: 10, default: 'none', fieldName: 'provider_mode' },
      providerName: { type: 'varchar', length: 100, nullable: true, fieldName: 'provider_name' },
      recipientLocale: {
        type: 'varchar',
        length: 16,
        default: marketplaceContractNotificationDefaultLocale,
        fieldName: 'recipient_locale',
      },
      simulation: { type: 'boolean', default: false },
      attempts: { type: 'int', default: 0 },
      channelAttempts: { type: 'int', default: 0, fieldName: 'channel_attempts' },
      nextAttemptAt: { type: 'timestamptz', fieldName: 'next_attempt_at', defaultRaw: 'now()' },
      claimedAt: { type: 'timestamptz', fieldName: 'claimed_at', defaultRaw: 'to_timestamp(0)' },
      claimToken: {
        type: 'uuid',
        fieldName: 'claim_token',
        default: marketplaceNotificationUnclaimedClaimId,
      },
      lastAttemptAt: { type: 'timestamptz', nullable: true, fieldName: 'last_attempt_at' },
      lastErrorCode: { type: 'varchar', length: 80, nullable: true, fieldName: 'last_error_code' },
      providerReference: { type: 'varchar', length: 300, nullable: true, fieldName: 'provider_reference' },
      safeReceipt: { type: 'jsonb', nullable: true, fieldName: 'safe_receipt' },
      dispatchedAt: { type: 'timestamptz', nullable: true, fieldName: 'dispatched_at' },
      createdAt: { type: 'timestamptz', fieldName: 'created_at', defaultRaw: 'now()' },
      updatedAt: { type: 'timestamptz', fieldName: 'updated_at', defaultRaw: 'now()' },
    },
    uniques: [
      {
        name: 'uq__contract_notification_intents__event_recipient',
        properties: ['timelineEventId', 'recipientParty'],
      },
    ],
    indexes: [
      {
        name: 'ix__marketplace_contract_notification_intents__contrac_9207e973',
        properties: ['contractId', 'status', 'createdAt'],
      },
      {
        name: 'ix__marketplace_contract_notification_intents__status_b9dc6f48',
        properties: ['status', 'nextAttemptAt', 'claimedAt', 'createdAt'],
      },
    ],
    checks: [
      { name: 'ck__contract_notification_intents__party', expression: `"recipient_party" in ('buyer', 'seller')` },
      {
        name: 'ck__contract_notification_intents__status',
        expression: `"status" in ('pending', 'simulated', 'delivered', 'failed', 'reconciliation_required')`,
      },
      {
        name: 'ck__contract_notification_intents__delivery_shape',
        expression: `
          "channel" in ('telegram', 'sms') and "provider_mode" in ('none', 'mock', 'live')
          and "attempts" between 0 and 10 and "channel_attempts" between 0 and 5
          and "channel_attempts" <= "attempts"
          and "recipient_locale" in ('en', 'ru', 'uz', 'uz-cyrl')
          and (("claim_token" = '00000000-0000-0000-0000-000000000000' and "claimed_at" = to_timestamp(0))
            or ("claim_token" <> '00000000-0000-0000-0000-000000000000' and "claimed_at" > to_timestamp(0)))
          and ("safe_receipt" is null or (jsonb_typeof("safe_receipt") = 'object' and pg_column_size("safe_receipt") <= 2048))
          and (("provider_mode" = 'none' and "provider_name" is null and "simulation" = false
                and "channel" = 'telegram' and "attempts" = 0 and "channel_attempts" = 0)
            or ("provider_mode" = 'mock' and btrim("provider_name") <> '' and "simulation" = true and "attempts" > 0)
            or ("provider_mode" = 'live' and btrim("provider_name") <> '' and "simulation" = false and "attempts" > 0))
          and (("status" = 'pending' and "provider_reference" is null and "safe_receipt" is null and "dispatched_at" is null)
            or ("status" = 'simulated' and "provider_mode" = 'mock' and "simulation" = true
              and "provider_reference" is not null and "safe_receipt" is not null and "dispatched_at" is not null
              and "claim_token" = '00000000-0000-0000-0000-000000000000')
            or ("status" = 'delivered' and "provider_mode" = 'live' and "simulation" = false
              and "provider_reference" is not null and "safe_receipt" is not null and "dispatched_at" is not null
              and "claim_token" = '00000000-0000-0000-0000-000000000000')
            or ("status" in ('failed', 'reconciliation_required') and "last_error_code" is not null
              and "claim_token" = '00000000-0000-0000-0000-000000000000'))
        `,
      },
    ],
  });
MarketplaceContractNotificationIntentEntitySchema.addManyToOne<MarketplaceContractNotificationIntentEntity>(
  'contractId',
  ContractEntity.name,
  {
    deleteRule: 'restrict',
    fieldName: 'contract_id',
    foreignKeyName: 'fk__contract_notification_intents__contract_id',
    mapToPk: true,
  },
);

export class MarketplaceContractReviewEligibilityEntity {
  id: string = randomUUID();
  contractId!: string;
  buyerTenantId!: string;
  buyerUserId!: string;
  buyerPartnerId!: string;
  sellerTenantId!: string;
  sellerPartnerId!: string;
  sourceKind!: 'produce' | 'product';
  sourceId!: string;
  sourcePublicationId!: string;
  createdAt: Date = new Date();
}

export const MarketplaceContractReviewEligibilityEntitySchema =
  new EntitySchema<MarketplaceContractReviewEligibilityEntity>({
    class: MarketplaceContractReviewEligibilityEntity,
    tableName: 'marketplace_contract_review_eligibilities',
    properties: {
      id: { type: 'uuid', primary: true },
      contractId: { type: 'uuid', fieldName: 'contract_id' },
      buyerTenantId: { type: 'varchar', length: 100, fieldName: 'buyer_tenant_id' },
      buyerUserId: { type: 'varchar', length: 100, fieldName: 'buyer_user_id' },
      buyerPartnerId: { type: 'uuid', fieldName: 'buyer_partner_id' },
      sellerTenantId: { type: 'varchar', length: 100, fieldName: 'seller_tenant_id' },
      sellerPartnerId: { type: 'uuid', fieldName: 'seller_partner_id' },
      sourceKind: { type: 'varchar', length: 20, fieldName: 'source_kind' },
      sourceId: { type: 'uuid', fieldName: 'source_id' },
      sourcePublicationId: { type: 'uuid', fieldName: 'source_publication_id' },
      createdAt: { type: 'timestamptz', fieldName: 'created_at', defaultRaw: 'now()' },
    },
    uniques: [
      {
        name: 'uq__contract_review_eligibilities__contract_source',
        properties: ['contractId', 'sourceKind', 'sourceId'],
      },
    ],
    indexes: [
      {
        name: 'ix__marketplace_contract_review_eligibilities__buyer_t_25c85359',
        properties: ['buyerTenantId', 'buyerUserId', 'sourceKind', 'sourceId'],
      },
    ],
    checks: [
      {
        name: 'ck__contract_review_eligibilities__source_kind',
        expression: `"source_kind" in ('product', 'produce')`,
      },
      {
        name: 'ck__contract_review_eligibilities__different_parties',
        expression: `"buyer_partner_id" <> "seller_partner_id"`,
      },
    ],
  });
MarketplaceContractReviewEligibilityEntitySchema.addManyToOne<MarketplaceContractReviewEligibilityEntity>(
  'contractId',
  ContractEntity.name,
  {
    deleteRule: 'restrict',
    fieldName: 'contract_id',
    foreignKeyName: 'fk__contract_review_eligibilities__contract_id',
    mapToPk: true,
  },
);
MarketplaceContractReviewEligibilityEntitySchema.addManyToOne<MarketplaceContractReviewEligibilityEntity>(
  'sourcePublicationId',
  'MarketplaceListingPublicationEntity',
  {
    deleteRule: 'restrict',
    fieldName: 'source_publication_id',
    foreignKeyName: 'fk__contract_review_eligibilities__publication_id',
    mapToPk: true,
  },
);
MarketplaceContractReviewEligibilityEntitySchema.addManyToOne<MarketplaceContractReviewEligibilityEntity>(
  'buyerPartnerId',
  'AgriTechPartnerEntity',
  {
    deleteRule: 'restrict',
    fieldName: 'buyer_partner_id',
    foreignKeyName: 'fk__contract_review_eligibilities__buyer_partner_id',
    mapToPk: true,
  },
);
MarketplaceContractReviewEligibilityEntitySchema.addManyToOne<MarketplaceContractReviewEligibilityEntity>(
  'sellerPartnerId',
  'AgriTechPartnerEntity',
  {
    deleteRule: 'restrict',
    fieldName: 'seller_partner_id',
    foreignKeyName: 'fk__contract_review_eligibilities__seller_partner_id',
    mapToPk: true,
  },
);
MarketplaceContractNotificationIntentEntitySchema.addManyToOne<MarketplaceContractNotificationIntentEntity>(
  'timelineEventId',
  MarketplaceContractLifecycleEventEntity.name,
  {
    deleteRule: 'restrict',
    fieldName: 'timeline_event_id',
    foreignKeyName: 'fk__contract_notification_intents__timeline_event_id',
    mapToPk: true,
  },
);
