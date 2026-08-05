// @requirements REQ-AGRITECH-INTEGRATION-013 REQ-AGRITECH-STAGE2-017
import { randomUUID } from 'node:crypto';
import { EntitySchema } from '@mikro-orm/core';
import type {
  CartItem,
  ContractLine,
  ContractSourceType,
  ContractStatus,
  DeliveryTerms,
  OfferStatus,
  MarketplaceProviderActorType,
  MarketplaceProviderCapability,
  MarketplaceProviderMode,
  MarketplaceProviderOperationStatus,
  MarketplaceProviderRequestDescriptor,
  MarketplaceProviderResourceType,
  MarketplaceProviderSafeReceipt,
  RequestStatus,
  VerificationDocument,
  VerificationLevel,
  VerificationIdentityAssurance,
  VerificationRejectionReason,
  VerificationRole,
  VerificationStatus,
} from '@app/backend-feature-agritech-shared';
import { AgriTechPartnerEntity } from './operations.entity';

export class VerificationEntity {
  id: string = randomUUID();
  tenantId!: string;
  userId!: string;
  role!: VerificationRole;
  level!: VerificationLevel;
  status: VerificationStatus = 'pending';
  oneIdLinked = false;
  providerMode: MarketplaceProviderMode = 'none';
  identityAssurance: VerificationIdentityAssurance = 'none';
  providerName: string | null = null;
  providerSubjectKey: string | null = null;
  providerReceiptId: string | null = null;
  oneIdLinkedAt: Date | null = null;
  version = 0;
  caseRevision = 0;
  documents: VerificationDocument[] = [];
  reviewedBy: string | null = null;
  reviewedAt: Date | null = null;
  rejectionReason: VerificationRejectionReason | null = null;
  createdAt: Date = new Date();
  updatedAt: Date = new Date();
}

export const VerificationEntitySchema = new EntitySchema<VerificationEntity>({
  class: VerificationEntity,
  tableName: 'marketplace_verifications',
  properties: {
    id: { type: 'uuid', primary: true },
    tenantId: { type: 'varchar', length: 100, fieldName: 'tenant_id' },
    userId: { type: 'varchar', length: 100, fieldName: 'user_id' },
    role: { type: 'varchar', length: 20 },
    level: { type: 'varchar', length: 20 },
    status: { type: 'varchar', length: 20, default: 'pending' },
    oneIdLinked: { type: 'boolean', fieldName: 'one_id_linked' },
    providerMode: { type: 'varchar', length: 20, fieldName: 'provider_mode', default: 'none' },
    identityAssurance: { type: 'varchar', length: 30, fieldName: 'identity_assurance', default: 'none' },
    providerName: { type: 'varchar', length: 80, nullable: true, fieldName: 'provider_name' },
    providerSubjectKey: { type: 'varchar', length: 128, nullable: true, fieldName: 'provider_subject_key' },
    providerReceiptId: { type: 'varchar', length: 200, nullable: true, fieldName: 'provider_receipt_id' },
    oneIdLinkedAt: { type: 'timestamptz', nullable: true, fieldName: 'one_id_linked_at' },
    version: { type: 'int', default: 0, version: true },
    caseRevision: { type: 'int', default: 0, fieldName: 'case_revision' },
    documents: { type: 'jsonb', default: '[]' },
    reviewedBy: { type: 'varchar', length: 100, nullable: true, fieldName: 'reviewed_by' },
    reviewedAt: { type: 'timestamptz', nullable: true, fieldName: 'reviewed_at' },
    rejectionReason: { type: 'varchar', length: 500, nullable: true, fieldName: 'rejection_reason' },
    createdAt: { type: 'timestamptz', fieldName: 'created_at', defaultRaw: 'now()' },
    updatedAt: { type: 'timestamptz', fieldName: 'updated_at', defaultRaw: 'now()' },
  },
  uniques: [
    { name: 'ux__marketplace_verifications__tenant_user', properties: ['tenantId', 'userId'] },
    {
      name: 'uq__marketplace_verifications__id_tenant_id_user_id',
      properties: ['id', 'tenantId', 'userId'],
    },
    {
      name: 'uq__marketplace_verifications__tenant_id_provider_mode_8abb5356',
      properties: ['tenantId', 'providerMode', 'providerSubjectKey'],
      where: '"provider_subject_key" is not null',
    },
  ],
  indexes: [{ name: 'ix__marketplace_verifications__tenant_id_status', properties: ['tenantId', 'status'] }],
  checks: [
    {
      name: 'ck__marketplace_verifications__role',
      expression: `"role" in ('farmer', 'seller', 'buyer')`,
    },
    {
      name: 'ck__marketplace_verifications__level',
      expression: `"level" in ('basic', 'verified', 'trusted')`,
    },
    {
      name: 'ck__marketplace_verifications__status',
      expression: `"status" in ('none', 'pending', 'verified', 'rejected')`,
    },
    {
      name: 'ck__marketplace_verifications__provider_mode',
      expression: `"provider_mode" in ('none', 'legacy', 'mock', 'live')`,
    },
    {
      name: 'ck__marketplace_verifications__identity_assurance',
      expression: `"identity_assurance" in ('none', 'legacy_unknown', 'mock', 'provider_verified')`,
    },
    {
      name: 'ck__marketplace_verifications__identity_provenance',
      expression: `
        ("one_id_linked" = false and "provider_mode" = 'none' and "identity_assurance" = 'none'
          and "provider_name" is null and "provider_subject_key" is null
          and "provider_receipt_id" is null and "one_id_linked_at" is null)
        or ("one_id_linked" = true and "provider_mode" = 'legacy' and "identity_assurance" = 'legacy_unknown')
        or ("one_id_linked" = true and "provider_mode" = 'mock' and "identity_assurance" = 'mock'
          and "provider_name" is not null and "provider_subject_key" is not null
          and "provider_receipt_id" is not null and "one_id_linked_at" is not null)
        or ("one_id_linked" = true and "provider_mode" = 'live' and "identity_assurance" = 'provider_verified'
          and "provider_name" is not null and "provider_subject_key" is not null
          and "provider_receipt_id" is not null and "one_id_linked_at" is not null)
      `,
    },
    {
      name: 'ck__marketplace_verifications__version',
      expression: `"version" >= 0`,
    },
    {
      name: 'ck__marketplace_verifications__case_revision',
      expression: `"case_revision" >= 0`,
    },
    {
      name: 'ck__marketplace_verifications__rejection_reason',
      expression: `
        (("status")::text = 'rejected'::text
          and ("rejection_reason")::text = any (
            (array[
              'criteria_not_met'::character varying,
              'documents_unreadable'::character varying,
              'identity_mismatch'::character varying
            ])::text[]
          ))
        or (("status")::text <> 'rejected'::text and "rejection_reason" is null)
      `,
    },
  ],
});

export class MarketplaceProviderOperationEntity {
  id: string = randomUUID();
  tenantId!: string;
  userId!: string;
  actorType!: MarketplaceProviderActorType;
  capability!: MarketplaceProviderCapability;
  resourceType!: MarketplaceProviderResourceType;
  resourceId!: string;
  resourceRevision!: number;
  idempotencyKey!: string;
  requestFingerprint!: string;
  requestDescriptor!: MarketplaceProviderRequestDescriptor;
  providerMode!: Extract<MarketplaceProviderMode, 'mock' | 'live'>;
  providerName!: string;
  status: MarketplaceProviderOperationStatus = 'started';
  attempt = 1;
  leaseExpiresAt: Date | null = null;
  providerReference: string | null = null;
  providerEventId: string | null = null;
  receipt: MarketplaceProviderSafeReceipt | null = null;
  resultSnapshot: Record<string, unknown> | null = null;
  resultFingerprint: string | null = null;
  errorCode: string | null = null;
  reconciliationRequired = false;
  reconciliationReason: string | null = null;
  createdAt: Date = new Date();
  updatedAt: Date = new Date();
}

export const MarketplaceProviderOperationEntitySchema = new EntitySchema<MarketplaceProviderOperationEntity>({
  class: MarketplaceProviderOperationEntity,
  tableName: 'marketplace_provider_operations',
  properties: {
    id: { type: 'uuid', primary: true },
    tenantId: { type: 'varchar', length: 100, fieldName: 'tenant_id' },
    userId: { type: 'varchar', length: 100, fieldName: 'user_id' },
    actorType: { type: 'varchar', length: 30, fieldName: 'actor_type' },
    capability: { type: 'varchar', length: 50 },
    resourceType: { type: 'varchar', length: 50, fieldName: 'resource_type' },
    resourceId: { type: 'uuid', fieldName: 'resource_id' },
    resourceRevision: { type: 'int', fieldName: 'resource_revision' },
    idempotencyKey: { type: 'varchar', length: 100, fieldName: 'idempotency_key' },
    requestFingerprint: { type: 'varchar', length: 64, fieldName: 'request_fingerprint' },
    requestDescriptor: { type: 'jsonb', fieldName: 'request_descriptor' },
    providerMode: { type: 'varchar', length: 20, fieldName: 'provider_mode' },
    providerName: { type: 'varchar', length: 80, fieldName: 'provider_name' },
    status: { type: 'varchar', length: 20, default: 'started' },
    attempt: { type: 'int', default: 1 },
    leaseExpiresAt: { type: 'timestamptz', nullable: true, fieldName: 'lease_expires_at' },
    providerReference: { type: 'varchar', length: 200, nullable: true, fieldName: 'provider_reference' },
    providerEventId: { type: 'varchar', length: 200, nullable: true, fieldName: 'provider_event_id' },
    receipt: { type: 'jsonb', nullable: true },
    resultSnapshot: { type: 'jsonb', nullable: true, fieldName: 'result_snapshot' },
    resultFingerprint: { type: 'varchar', length: 64, nullable: true, fieldName: 'result_fingerprint' },
    errorCode: { type: 'varchar', length: 100, nullable: true, fieldName: 'error_code' },
    reconciliationRequired: {
      type: 'boolean',
      default: false,
      fieldName: 'reconciliation_required',
    },
    reconciliationReason: {
      type: 'varchar',
      length: 100,
      nullable: true,
      fieldName: 'reconciliation_reason',
    },
    createdAt: { type: 'timestamptz', fieldName: 'created_at', defaultRaw: 'now()' },
    updatedAt: { type: 'timestamptz', fieldName: 'updated_at', defaultRaw: 'now()' },
  },
  uniques: [
    {
      name: 'uq__marketplace_provider_ops__scope_key',
      properties: ['tenantId', 'userId', 'actorType', 'capability', 'resourceType', 'resourceId', 'idempotencyKey'],
    },
    {
      name: 'uq__marketplace_provider_operations__provider_mode_pro_24c07bd3',
      properties: ['providerMode', 'providerName', 'capability', 'providerEventId'],
      where: '"provider_event_id" is not null',
    },
    {
      name: 'uq__marketplace_provider_operations__resource_type_res_7c8d5a0e',
      properties: ['resourceType', 'resourceId', 'resourceRevision', 'capability'],
      where: `"status" in ('started', 'succeeded') and "capability" in ('contract_artifact_storage', 'direct_payment', 'factoring')`,
    },
    {
      name: 'uq__marketplace_provider_operations__resource_type_res_60f8f54d',
      properties: ['resourceType', 'resourceId', 'resourceRevision', 'capability', 'actorType', 'tenantId', 'userId'],
      where: `"status" in ('started', 'succeeded') and "capability" = 'qualified_signature'`,
    },
    {
      name: 'uq__marketplace_provider_operations__resource_type_res_e15a456d',
      properties: [
        'resourceType',
        'resourceId',
        'resourceRevision',
        'capability',
        'actorType',
        'tenantId',
        'userId',
        'requestFingerprint',
      ],
      where: `"status" in ('started', 'succeeded') and "capability" in ('verification_documents', 'dispute_evidence_storage')`,
    },
  ],
  indexes: [
    {
      name: 'ix__marketplace_provider_operations__tenant_id_user_id_e0057efd',
      properties: ['tenantId', 'userId', 'actorType', 'status'],
    },
  ],
  checks: [
    {
      name: 'ck__marketplace_provider_ops__capability',
      expression: `"capability" in ('oneid_link', 'verification_documents', 'contract_artifact_storage', 'dispute_evidence_storage', 'qualified_signature', 'promotion_billing', 'direct_payment', 'factoring')`,
    },
    {
      name: 'ck__marketplace_provider_ops__scope',
      expression: `
        ("capability" in ('oneid_link', 'verification_documents')
          and "resource_type" = 'verification' and "actor_type" = 'verification_subject')
        or ("capability" in ('contract_artifact_storage', 'dispute_evidence_storage', 'qualified_signature', 'direct_payment', 'factoring')
          and "resource_type" = 'contract' and "actor_type" in ('contract_buyer', 'contract_seller'))
        or ("capability" = 'promotion_billing'
          and "resource_type" = 'promotion' and "actor_type" = 'promotion_owner')
      `,
    },
    {
      name: 'ck__marketplace_provider_ops__resource_revision',
      expression: `"resource_revision" >= 0`,
    },
    {
      name: 'ck__marketplace_provider_ops__request_descriptor',
      expression: `marketplace_provider_descriptor_is_valid("request_descriptor", "capability", "resource_type", "resource_id", "resource_revision")`,
    },
    {
      name: 'ck__marketplace_provider_ops__request_fingerprint',
      expression: `"request_fingerprint" ~ '^[a-f0-9]{64}$'`,
    },
    {
      name: 'ck__marketplace_provider_ops__provider_mode',
      expression: `"provider_mode" in ('mock', 'live')`,
    },
    {
      name: 'ck__marketplace_provider_ops__status',
      expression: `"status" in ('started', 'succeeded', 'failed')`,
    },
    {
      name: 'ck__marketplace_provider_ops__attempt',
      expression: `"attempt" >= 1`,
    },
    {
      name: 'ck__marketplace_provider_ops__provider_reference',
      expression: `"provider_reference" is null or "provider_reference" ~ '^[!-~]{1,200}$'`,
    },
    {
      name: 'ck__marketplace_provider_ops__provider_event',
      expression: `
        ("provider_event_id" is null or "provider_event_id" ~ '^[!-~]{1,200}$')
        and ("status" <> 'succeeded' or "capability" not in ('direct_payment', 'factoring')
          or "provider_event_id" is not null)
      `,
    },
    {
      name: 'ck__marketplace_provider_ops__safe_receipt',
      expression: `"receipt" is null or marketplace_provider_receipt_is_safe("receipt")`,
    },
    {
      name: 'ck__marketplace_provider_ops__result_descriptor',
      expression: `
        "status" <> 'succeeded'
        or "capability" in ('oneid_link', 'verification_documents')
        or marketplace_provider_result_is_valid(
          "result_snapshot", "resource_type", "resource_id", "resource_revision"
        )
      `,
    },
    {
      name: 'ck__marketplace_provider_ops__result_fingerprint',
      expression: `"result_fingerprint" is null or "result_fingerprint" ~ '^[a-f0-9]{64}$'`,
    },
    {
      name: 'ck__marketplace_provider_ops__reconciliation',
      expression: `
        "reconciliation_required" = ("reconciliation_reason" is not null)
        and ("reconciliation_reason" is null or "reconciliation_reason" ~ '^[a-z][a-z0-9_-]{0,99}$')
      `,
    },
    {
      name: 'ck__marketplace_provider_ops__receipt_state',
      expression: `
        ("status" = 'succeeded' and "provider_reference" is not null and "receipt" is not null
          and "result_snapshot" is not null and "result_fingerprint" is not null
          and "error_code" is null and "lease_expires_at" is null)
        or ("status" = 'failed' and "provider_reference" is null and "receipt" is null
          and "result_snapshot" is null and "result_fingerprint" is null
          and "error_code" is not null and "lease_expires_at" is null)
        or ("status" = 'started' and "provider_reference" is null and "receipt" is null
          and "result_snapshot" is null and "result_fingerprint" is null
          and "error_code" is null and "lease_expires_at" is not null)
      `,
    },
  ],
});

export class VerificationEvidenceEntity {
  id: string = randomUUID();
  verificationId!: string;
  caseRevision!: number;
  documentRevision!: number;
  tenantId!: string;
  userId!: string;
  kind!: VerificationDocument['kind'];
  fileName!: string;
  mimeType!: NonNullable<VerificationDocument['mimeType']>;
  sizeBytes!: number;
  sha256!: string;
  providerMode!: Extract<MarketplaceProviderMode, 'mock' | 'live'>;
  providerName!: string;
  providerReceiptId!: string;
  createdAt: Date = new Date();
}

export const VerificationEvidenceEntitySchema = new EntitySchema<VerificationEvidenceEntity>({
  class: VerificationEvidenceEntity,
  tableName: 'marketplace_verification_evidence',
  properties: {
    id: { type: 'uuid', primary: true },
    verificationId: { type: 'uuid', fieldName: 'verification_id' },
    caseRevision: { type: 'int', fieldName: 'case_revision' },
    documentRevision: { type: 'int', fieldName: 'document_revision' },
    tenantId: { type: 'varchar', length: 100, fieldName: 'tenant_id' },
    userId: { type: 'varchar', length: 100, fieldName: 'user_id' },
    kind: { type: 'varchar', length: 30 },
    fileName: { type: 'varchar', length: 200, fieldName: 'file_name' },
    mimeType: { type: 'varchar', length: 50, fieldName: 'mime_type' },
    sizeBytes: { type: 'int', fieldName: 'size_bytes' },
    sha256: { type: 'varchar', length: 64 },
    providerMode: { type: 'varchar', length: 20, fieldName: 'provider_mode' },
    providerName: { type: 'varchar', length: 80, fieldName: 'provider_name' },
    providerReceiptId: { type: 'varchar', length: 200, fieldName: 'provider_receipt_id' },
    createdAt: { type: 'timestamptz', fieldName: 'created_at', defaultRaw: 'now()' },
  },
  indexes: [
    {
      name: 'ix__marketplace_verification_evidence__verification_id_b2bbaa0a',
      properties: ['verificationId', 'createdAt'],
    },
    {
      name: 'ix__marketplace_verification_evidence__tenant_id_user_id',
      properties: ['tenantId', 'userId'],
    },
  ],
  uniques: [
    {
      name: 'uq__marketplace_verification_evidence__case_kind_revision',
      properties: ['verificationId', 'caseRevision', 'kind', 'documentRevision'],
    },
  ],
  checks: [
    {
      name: 'ck__marketplace_verification_evidence__kind',
      expression: `"kind" in ('id', 'land', 'lease', 'cadastre', 'farm', 'machinery', 'warehouse', 'business', 'license')`,
    },
    {
      name: 'ck__marketplace_verification_evidence__mime_type',
      expression: `"mime_type" in ('application/pdf', 'image/jpeg', 'image/png')`,
    },
    {
      name: 'ck__marketplace_verification_evidence__size',
      expression: `"size_bytes" between 1 and 10485760`,
    },
    {
      name: 'ck__marketplace_verification_evidence__case_revision',
      expression: `"case_revision" >= 0`,
    },
    {
      name: 'ck__marketplace_verification_evidence__document_revision',
      expression: `"document_revision" between 1 and 3`,
    },
    {
      name: 'ck__marketplace_verification_evidence__sha256',
      expression: `"sha256" ~ '^[0-9a-f]{64}$'`,
    },
    {
      name: 'ck__marketplace_verification_evidence__provider_mode',
      expression: `"provider_mode" in ('mock', 'live')`,
    },
  ],
});

export class CartEntity {
  id: string = randomUUID();
  tenantId!: string;
  userId!: string;
  sellerId!: string;
  buyerPartnerId: string | null = null;
  sellerTenantId: string | null = null;
  sellerUserId: string | null = null;
  sellerPartnerId: string | null = null;
  bindingStatus: 'resolved' | 'review_required' = 'review_required';
  items: CartItem[] = [];
  status: 'open' | 'ordered' | 'abandoned' = 'open';
  createdAt: Date = new Date();
  updatedAt: Date = new Date();
}

export const CartEntitySchema = new EntitySchema<CartEntity>({
  class: CartEntity,
  tableName: 'marketplace_carts',
  properties: {
    id: { type: 'uuid', primary: true },
    tenantId: { type: 'varchar', length: 100, fieldName: 'tenant_id' },
    userId: { type: 'varchar', length: 100, fieldName: 'user_id' },
    sellerId: { type: 'varchar', length: 100, fieldName: 'seller_id' },
    buyerPartnerId: { type: 'uuid', nullable: true, fieldName: 'buyer_partner_id' },
    sellerTenantId: { type: 'varchar', length: 100, nullable: true, fieldName: 'seller_tenant_id' },
    sellerUserId: { type: 'varchar', length: 100, nullable: true, fieldName: 'seller_user_id' },
    sellerPartnerId: { type: 'uuid', nullable: true, fieldName: 'seller_partner_id' },
    bindingStatus: { type: 'varchar', length: 20, default: 'review_required', fieldName: 'binding_status' },
    items: { type: 'jsonb', default: '[]' },
    status: { type: 'varchar', length: 20, default: 'open' },
    createdAt: { type: 'timestamptz', fieldName: 'created_at', defaultRaw: 'now()' },
    updatedAt: { type: 'timestamptz', fieldName: 'updated_at', defaultRaw: 'now()' },
  },
  indexes: [
    { name: 'ix__marketplace_carts__tenant_id_user_id_status', properties: ['tenantId', 'userId', 'status'] },
    { name: 'ix__marketplace_carts__tenant_id_seller_id', properties: ['tenantId', 'sellerId'] },
    {
      name: 'ix__marketplace_carts__seller_tenant_id_seller_user_id_3d500628',
      properties: ['sellerTenantId', 'sellerUserId', 'sellerPartnerId'],
    },
  ],
  uniques: [
    {
      name: 'uq__marketplace_carts__tenant_id_user_id_buyer_partner_490fd0d3',
      properties: ['tenantId', 'userId', 'buyerPartnerId', 'sellerTenantId', 'sellerPartnerId'],
      where: `status = 'open' and binding_status = 'resolved'`,
    },
  ],
  checks: [
    {
      name: 'ck__marketplace_carts__status',
      expression: `"status" in ('open', 'ordered', 'abandoned')`,
    },
    {
      name: 'ck__marketplace_carts__binding_status',
      expression: `"binding_status" in ('resolved', 'review_required')`,
    },
    {
      name: 'ck__marketplace_carts__resolved_parties',
      expression: `"binding_status" = 'review_required' or ("buyer_partner_id" is not null and "seller_tenant_id" is not null and "seller_user_id" is not null and "seller_partner_id" is not null)`,
    },
  ],
});

CartEntitySchema.addManyToOne<CartEntity>('buyerPartnerId', AgriTechPartnerEntity.name, {
  deleteRule: 'restrict',
  fieldName: 'buyer_partner_id',
  foreignKeyName: 'fk__marketplace_carts__buyer_partner_id',
  mapToPk: true,
  nullable: true,
});
CartEntitySchema.addManyToOne<CartEntity>('sellerPartnerId', AgriTechPartnerEntity.name, {
  deleteRule: 'restrict',
  fieldName: 'seller_partner_id',
  foreignKeyName: 'fk__marketplace_carts__seller_partner_id',
  mapToPk: true,
  nullable: true,
});

/** Read-only schema ownership for records retained by migration 138000. */
export class MarketplaceLegacySampleRequestArchiveEntity {
  id: string = randomUUID();
  tenantId!: string;
  userId!: string;
  productId!: string;
  sellerId!: string;
  status: 'pending' | 'shipped' | 'delivered' | 'cancelled' = 'pending';
  createdAt: Date = new Date();
}

export const MarketplaceLegacySampleRequestArchiveEntitySchema =
  new EntitySchema<MarketplaceLegacySampleRequestArchiveEntity>({
    class: MarketplaceLegacySampleRequestArchiveEntity,
    tableName: 'marketplace_legacy_sample_requests_archive',
    properties: {
      id: { type: 'uuid', primary: true },
      tenantId: { type: 'varchar', length: 100, fieldName: 'tenant_id' },
      userId: { type: 'varchar', length: 100, fieldName: 'user_id' },
      productId: { type: 'varchar', length: 100, fieldName: 'product_id' },
      sellerId: { type: 'varchar', length: 100, fieldName: 'seller_id' },
      status: { type: 'varchar', length: 20, default: 'pending' },
      createdAt: { type: 'timestamptz', fieldName: 'created_at', defaultRaw: 'now()' },
    },
    indexes: [
      { name: 'ix__marketplace_sample_requests__tenant_id_user_id', properties: ['tenantId', 'userId'] },
      { name: 'ix__marketplace_sample_requests__tenant_id_seller_id', properties: ['tenantId', 'sellerId'] },
    ],
    checks: [
      {
        name: 'ck__marketplace_sample_requests__status',
        expression: `"status" in ('pending', 'shipped', 'delivered', 'cancelled')`,
      },
    ],
  });

/** Read-only schema ownership for records retained by migration 138000. */
export class MarketplaceLegacyFavoriteArchiveEntity {
  tenantId!: string;
  userId!: string;
  productId!: string;
  createdAt: Date = new Date();
}

export const MarketplaceLegacyFavoriteArchiveEntitySchema = new EntitySchema<MarketplaceLegacyFavoriteArchiveEntity>({
  class: MarketplaceLegacyFavoriteArchiveEntity,
  tableName: 'marketplace_legacy_favorites_archive',
  properties: {
    tenantId: { type: 'varchar', length: 100, fieldName: 'tenant_id', primary: true },
    userId: { type: 'varchar', length: 100, fieldName: 'user_id', primary: true },
    productId: { type: 'varchar', length: 100, fieldName: 'product_id', primary: true },
    createdAt: { type: 'timestamptz', fieldName: 'created_at', defaultRaw: 'now()' },
  },
  indexes: [{ name: 'ix__marketplace_favorites__tenant_id_user_id', properties: ['tenantId', 'userId'] }],
});

/** Read-only schema ownership for records retained by migration 138000. */
export class MarketplaceLegacyReviewArchiveEntity {
  id: string = randomUUID();
  tenantId!: string;
  productId!: string;
  userId!: string;
  rating!: number;
  comment: string | null = null;
  createdAt: Date = new Date();
}

export const MarketplaceLegacyReviewArchiveEntitySchema = new EntitySchema<MarketplaceLegacyReviewArchiveEntity>({
  class: MarketplaceLegacyReviewArchiveEntity,
  tableName: 'marketplace_legacy_reviews_archive',
  properties: {
    id: { type: 'uuid', primary: true },
    tenantId: { type: 'varchar', length: 100, fieldName: 'tenant_id' },
    productId: { type: 'varchar', length: 100, fieldName: 'product_id' },
    userId: { type: 'varchar', length: 100, fieldName: 'user_id' },
    rating: { type: 'int' },
    comment: { type: 'varchar', length: 2000, nullable: true },
    createdAt: { type: 'timestamptz', fieldName: 'created_at', defaultRaw: 'now()' },
  },
  indexes: [{ name: 'ix__marketplace_reviews__tenant_id_product_id', properties: ['tenantId', 'productId'] }],
  uniques: [
    {
      name: 'uq__marketplace_reviews__tenant_id_product_id_user_id',
      properties: ['tenantId', 'productId', 'userId'],
    },
  ],
  checks: [
    {
      name: 'ck__marketplace_reviews__rating',
      expression: '"rating" >= 1 and "rating" <= 5',
    },
  ],
});

export class BuyerRequestEntity {
  id: string = randomUUID();
  tenantId!: string;
  buyerUserId!: string;
  buyerPartnerId: string | null = null;
  bindingStatus: 'resolved' | 'review_required' = 'review_required';
  title!: string;
  product: string | null = null;
  volume: string | null = null;
  region!: string;
  deadline: string | null = null;
  budgetUzs: number | null = null;
  requirements: string | null = null;
  status: RequestStatus = 'open';
  createdAt: Date = new Date();
  updatedAt: Date = new Date();
}

export const BuyerRequestEntitySchema = new EntitySchema<BuyerRequestEntity>({
  class: BuyerRequestEntity,
  tableName: 'marketplace_requests',
  properties: {
    id: { type: 'uuid', primary: true },
    tenantId: { type: 'varchar', length: 100, fieldName: 'tenant_id' },
    buyerUserId: { type: 'varchar', length: 100, fieldName: 'buyer_user_id' },
    buyerPartnerId: { type: 'uuid', nullable: true, fieldName: 'buyer_partner_id' },
    bindingStatus: { type: 'varchar', length: 20, default: 'review_required', fieldName: 'binding_status' },
    title: { type: 'varchar', length: 200 },
    product: { type: 'varchar', length: 200, nullable: true },
    volume: { type: 'varchar', length: 100, nullable: true },
    region: { type: 'varchar', length: 100 },
    deadline: { type: 'varchar', length: 100, nullable: true },
    budgetUzs: { type: 'numeric', precision: 15, scale: 2, nullable: true, fieldName: 'budget_uzs' },
    requirements: { type: 'text', nullable: true },
    status: { type: 'varchar', length: 20, default: 'open' },
    createdAt: { type: 'timestamptz', fieldName: 'created_at', defaultRaw: 'now()' },
    updatedAt: { type: 'timestamptz', fieldName: 'updated_at', defaultRaw: 'now()' },
  },
  indexes: [
    { name: 'ix__marketplace_requests__tenant_id_status', properties: ['tenantId', 'status'] },
    { name: 'ix__marketplace_requests__tenant_id_buyer_user_id', properties: ['tenantId', 'buyerUserId'] },
    { name: 'ix__marketplace_requests__buyer_partner_id', properties: ['buyerPartnerId'] },
  ],
  checks: [
    {
      name: 'ck__marketplace_requests__status',
      expression: `"status" in ('open', 'offering', 'selected', 'closed', 'expired')`,
    },
    {
      name: 'ck__marketplace_requests__binding_status',
      expression: `"binding_status" in ('resolved', 'review_required')`,
    },
    {
      name: 'ck__marketplace_requests__resolved_party',
      expression: `"binding_status" = 'review_required' or "buyer_partner_id" is not null`,
    },
  ],
});

BuyerRequestEntitySchema.addManyToOne<BuyerRequestEntity>('buyerPartnerId', AgriTechPartnerEntity.name, {
  deleteRule: 'restrict',
  fieldName: 'buyer_partner_id',
  foreignKeyName: 'fk__marketplace_requests__buyer_partner_id',
  mapToPk: true,
  nullable: true,
});

export class RequestOfferEntity {
  id: string = randomUUID();
  requestId!: string;
  tenantId!: string;
  requestPublicId: string | null = null;
  buyerUserId: string | null = null;
  buyerPartnerId: string | null = null;
  sellerTenantId: string | null = null;
  sellerUserId!: string;
  sellerPartnerId: string | null = null;
  bindingStatus: 'resolved' | 'review_required' = 'review_required';
  priceUzs!: number;
  deliveryTerms!: DeliveryTerms;
  deliveryPriceUzs: number | null = null;
  deliveryNote: string | null = null;
  deliveryDays: number | null = null;
  status: OfferStatus = 'pending';
  createdAt: Date = new Date();
}

export const RequestOfferEntitySchema = new EntitySchema<RequestOfferEntity>({
  class: RequestOfferEntity,
  tableName: 'marketplace_request_offers',
  properties: {
    id: { type: 'uuid', primary: true },
    requestId: { type: 'uuid', fieldName: 'request_id' },
    tenantId: { type: 'varchar', length: 100, fieldName: 'tenant_id' },
    requestPublicId: { type: 'uuid', nullable: true, fieldName: 'request_public_id' },
    buyerUserId: { type: 'varchar', length: 100, nullable: true, fieldName: 'buyer_user_id' },
    buyerPartnerId: { type: 'uuid', nullable: true, fieldName: 'buyer_partner_id' },
    sellerTenantId: { type: 'varchar', length: 100, nullable: true, fieldName: 'seller_tenant_id' },
    sellerUserId: { type: 'varchar', length: 100, fieldName: 'seller_user_id' },
    sellerPartnerId: { type: 'uuid', nullable: true, fieldName: 'seller_partner_id' },
    bindingStatus: { type: 'varchar', length: 20, default: 'review_required', fieldName: 'binding_status' },
    priceUzs: { type: 'numeric', precision: 15, scale: 2, fieldName: 'price_uzs' },
    deliveryTerms: { type: 'varchar', length: 30, fieldName: 'delivery_terms' },
    deliveryPriceUzs: {
      type: 'numeric',
      precision: 15,
      scale: 2,
      nullable: true,
      fieldName: 'delivery_price_uzs',
    },
    deliveryNote: { type: 'varchar', length: 500, nullable: true, fieldName: 'delivery_note' },
    deliveryDays: { type: 'int', nullable: true, fieldName: 'delivery_days' },
    status: { type: 'varchar', length: 20, default: 'pending' },
    createdAt: { type: 'timestamptz', fieldName: 'created_at', defaultRaw: 'now()' },
  },
  indexes: [
    { name: 'ix__marketplace_request_offers__tenant_id_request_id', properties: ['tenantId', 'requestId'] },
    { name: 'ix__marketplace_request_offers__tenant_id_seller_user_id', properties: ['tenantId', 'sellerUserId'] },
    {
      name: 'ix__marketplace_request_offers__seller_tenant_id_selle_65cd20e7',
      properties: ['sellerTenantId', 'sellerUserId', 'sellerPartnerId'],
    },
  ],
  uniques: [
    {
      name: 'uq__marketplace_request_offers__request_id_seller_tena_78eb02ed',
      properties: ['requestId', 'sellerTenantId', 'sellerPartnerId'],
      where: `status = 'pending' and binding_status = 'resolved'`,
    },
  ],
  checks: [
    {
      name: 'ck__marketplace_offers__price',
      expression: '"price_uzs" > 0',
    },
    {
      name: 'ck__marketplace_offers__status',
      expression: `"status" in ('pending', 'accepted', 'declined')`,
    },
    {
      name: 'ck__marketplace_offers__binding_status',
      expression: `"binding_status" in ('resolved', 'review_required')`,
    },
    {
      name: 'ck__marketplace_offers__resolved_parties',
      expression: `"binding_status" = 'review_required' or ("request_public_id" is not null and "buyer_user_id" is not null and "buyer_partner_id" is not null and "seller_tenant_id" is not null and "seller_partner_id" is not null)`,
    },
    {
      name: 'ck__marketplace_offers__delivery_terms',
      expression: `"delivery_terms" in ('pickup', 'seller_delivery', 'by_agreement')`,
    },
    {
      name: 'ck__marketplace_offers__delivery_price',
      expression: `
        ("delivery_terms" = 'pickup' and "delivery_price_uzs" = 0)
        or ("delivery_terms" = 'seller_delivery' and "delivery_price_uzs" > 0)
        or ("delivery_terms" = 'by_agreement' and "delivery_price_uzs" is null)
      `,
    },
  ],
});

RequestOfferEntitySchema.addManyToOne<BuyerRequestEntity>('requestId', BuyerRequestEntity.name, {
  fieldName: 'request_id',
  mapToPk: true,
  deleteRule: 'cascade',
  foreignKeyName: 'fk__marketplace_offers__request',
});
RequestOfferEntitySchema.addManyToOne<RequestOfferEntity>('requestPublicId', 'MarketplaceRequestPublicationEntity', {
  deleteRule: 'restrict',
  fieldName: 'request_public_id',
  foreignKeyName: 'fk__marketplace_offers__request_public_id',
  mapToPk: true,
  nullable: true,
});
RequestOfferEntitySchema.addManyToOne<RequestOfferEntity>('buyerPartnerId', AgriTechPartnerEntity.name, {
  deleteRule: 'restrict',
  fieldName: 'buyer_partner_id',
  foreignKeyName: 'fk__marketplace_offers__buyer_partner_id',
  mapToPk: true,
  nullable: true,
});
RequestOfferEntitySchema.addManyToOne<RequestOfferEntity>('sellerPartnerId', AgriTechPartnerEntity.name, {
  deleteRule: 'restrict',
  fieldName: 'seller_partner_id',
  foreignKeyName: 'fk__marketplace_offers__seller_partner_id',
  mapToPk: true,
  nullable: true,
});

export class ContractEntity {
  id: string = randomUUID();
  version = 0;
  tenantId!: string;
  buyerUserId!: string;
  buyerPartnerId: string | null = null;
  sellerTenantId: string | null = null;
  sellerUserId!: string;
  sellerPartnerId: string | null = null;
  buyerPartySnapshot: Record<string, unknown> | null = null;
  sellerPartySnapshot: Record<string, unknown> | null = null;
  bindingStatus: 'resolved' | 'review_required' = 'review_required';
  sourceType: ContractSourceType | null = null;
  sourceId: string | null = null;
  subject!: string;
  amountUzs!: number;
  lines: ContractLine[] = [];
  deliveryTerms!: DeliveryTerms;
  deliveryPriceUzs: number | null = null;
  deliveryNote: string | null = null;
  deliveryDays: number | null = null;
  factoringEnabled = false;
  status: ContractStatus = 'draft';
  buyerSignedAt: Date | null = null;
  sellerSignedAt: Date | null = null;
  legacyStatus: 'draft' | 'signed' | 'active' | null = null;
  legacySignedAt: Date | null = null;
  legacyFactoringEnabled: boolean | null = null;
  signedAt: Date | null = null;
  createdAt: Date = new Date();
  updatedAt: Date = new Date();
}

export const ContractEntitySchema = new EntitySchema<ContractEntity>({
  class: ContractEntity,
  tableName: 'marketplace_contracts',
  properties: {
    id: { type: 'uuid', primary: true },
    version: { type: 'int', default: 0, version: true },
    tenantId: { type: 'varchar', length: 100, fieldName: 'tenant_id' },
    buyerUserId: { type: 'varchar', length: 100, fieldName: 'buyer_user_id' },
    buyerPartnerId: { type: 'uuid', nullable: true, fieldName: 'buyer_partner_id' },
    sellerTenantId: { type: 'varchar', length: 100, nullable: true, fieldName: 'seller_tenant_id' },
    sellerUserId: { type: 'varchar', length: 100, fieldName: 'seller_user_id' },
    sellerPartnerId: { type: 'uuid', nullable: true, fieldName: 'seller_partner_id' },
    buyerPartySnapshot: { type: 'jsonb', nullable: true, fieldName: 'buyer_party_snapshot' },
    sellerPartySnapshot: { type: 'jsonb', nullable: true, fieldName: 'seller_party_snapshot' },
    bindingStatus: { type: 'varchar', length: 20, default: 'review_required', fieldName: 'binding_status' },
    sourceType: { type: 'varchar', length: 30, nullable: true, fieldName: 'source_type' },
    sourceId: { type: 'varchar', length: 100, nullable: true, fieldName: 'source_id' },
    subject: { type: 'varchar', length: 300 },
    amountUzs: { type: 'numeric', precision: 15, scale: 2, fieldName: 'amount_uzs' },
    lines: { type: 'jsonb', default: '[]' },
    deliveryTerms: { type: 'varchar', length: 30, fieldName: 'delivery_terms' },
    deliveryPriceUzs: {
      type: 'numeric',
      precision: 15,
      scale: 2,
      nullable: true,
      fieldName: 'delivery_price_uzs',
    },
    deliveryNote: { type: 'varchar', length: 500, nullable: true, fieldName: 'delivery_note' },
    deliveryDays: { type: 'int', nullable: true, fieldName: 'delivery_days' },
    factoringEnabled: { type: 'boolean', fieldName: 'factoring_enabled' },
    status: { type: 'varchar', length: 30, default: 'draft' },
    buyerSignedAt: { type: 'timestamptz', nullable: true, fieldName: 'buyer_signed_at' },
    sellerSignedAt: { type: 'timestamptz', nullable: true, fieldName: 'seller_signed_at' },
    legacyStatus: { type: 'varchar', length: 20, nullable: true, fieldName: 'legacy_status' },
    legacySignedAt: { type: 'timestamptz', nullable: true, fieldName: 'legacy_signed_at' },
    legacyFactoringEnabled: { type: 'boolean', nullable: true, fieldName: 'legacy_factoring_enabled' },
    signedAt: { type: 'timestamptz', nullable: true, fieldName: 'signed_at' },
    createdAt: { type: 'timestamptz', fieldName: 'created_at', defaultRaw: 'now()' },
    updatedAt: { type: 'timestamptz', fieldName: 'updated_at', defaultRaw: 'now()' },
  },
  indexes: [
    { name: 'ix__marketplace_contracts__tenant_id_buyer_user_id', properties: ['tenantId', 'buyerUserId'] },
    { name: 'ix__marketplace_contracts__tenant_id_seller_user_id', properties: ['tenantId', 'sellerUserId'] },
    {
      name: 'ix__marketplace_contracts__seller_tenant_id_seller_use_f78f6f14',
      properties: ['sellerTenantId', 'sellerUserId', 'sellerPartnerId'],
    },
  ],
  uniques: [
    {
      name: 'uq__marketplace_contracts__tenant_id_source_type_source_id',
      properties: ['tenantId', 'sourceType', 'sourceId'],
    },
    {
      name: 'uq__marketplace_contracts__source_type_source_id',
      properties: ['sourceType', 'sourceId'],
      where: `source_type is not null and source_id is not null and binding_status = 'resolved'`,
    },
  ],
  checks: [
    {
      name: 'ck__marketplace_contracts__version',
      expression: '"version" >= 0',
    },
    {
      name: 'ck__marketplace_contracts__amount',
      expression: '"amount_uzs" > 0',
    },
    {
      name: 'ck__marketplace_contracts__binding_status',
      expression: `"binding_status" in ('resolved', 'review_required')`,
    },
    {
      name: 'ck__marketplace_contracts__resolved_parties',
      expression: `
        "binding_status" = 'review_required' or (
          "buyer_partner_id" is not null and "seller_tenant_id" is not null
          and "seller_partner_id" is not null and "buyer_party_snapshot" is not null
          and "seller_party_snapshot" is not null
          and "marketplace_contract_snapshot_is_valid"(
            "buyer_party_snapshot", "tenant_id", "buyer_user_id", "buyer_partner_id"
          )
          and "marketplace_contract_snapshot_is_valid"(
            "seller_party_snapshot", "seller_tenant_id", "seller_user_id", "seller_partner_id"
          )
          and "marketplace_contract_lines_are_frozen"("lines")
        )
      `,
    },
    {
      name: 'ck__marketplace_contracts__delivery_terms',
      expression: `"delivery_terms" in ('pickup', 'seller_delivery', 'by_agreement')`,
    },
    {
      name: 'ck__marketplace_contracts__status',
      expression: "\"status\" in ('draft', 'signed', 'active', 'completed', 'cancelled', 'legacy_review_required')",
    },
    {
      name: 'ck__marketplace_contracts__source_type',
      expression: `
        "source_type" is null
        or ("source_type")::text = any (
          (array['cart_checkout'::character varying, 'offer_selection'::character varying])::text[]
        )
      `,
    },
    {
      name: 'ck__marketplace_contracts__source_pair',
      expression: '("source_type" is null) = ("source_id" is null)',
    },
    {
      name: 'ck__marketplace_contracts__delivery_days',
      expression: '"delivery_days" is null or "delivery_days" > 0',
    },
    {
      name: 'ck__marketplace_contracts__delivery_price',
      expression: `
        ("delivery_terms" = 'pickup' and "delivery_price_uzs" = 0)
        or ("delivery_terms" = 'seller_delivery' and ("delivery_price_uzs" is null or "delivery_price_uzs" > 0))
        or ("delivery_terms" = 'by_agreement' and "delivery_price_uzs" is null)
      `,
    },
    {
      name: 'ck__marketplace_contracts__factoring_disabled',
      expression: '"factoring_enabled" = false',
    },
    {
      name: 'ck__marketplace_contracts__party_consent',
      expression: `
        ("status")::text <> all (
          (array[
            'draft'::character varying,
            'signed'::character varying,
            'active'::character varying,
            'legacy_review_required'::character varying
          ])::text[]
        )
        or (
          ("status")::text = 'draft'::text
          and "buyer_signed_at" is null
          and "seller_signed_at" is null
          and "signed_at" is null
        )
        or (
          ("status")::text = 'signed'::text
          and (("buyer_signed_at" is null) <> ("seller_signed_at" is null))
          and "signed_at" is null
        )
        or (
          ("status")::text = 'active'::text
          and "buyer_signed_at" is not null
          and "seller_signed_at" is not null
          and "signed_at" is not null
        )
        or (
          ("status")::text = 'legacy_review_required'::text
          and "buyer_signed_at" is null
          and "seller_signed_at" is null
          and "signed_at" is null
          and ("legacy_status")::text = any (
            (array[
              'draft'::character varying,
              'signed'::character varying,
              'active'::character varying
            ])::text[]
          )
        )
      `,
    },
  ],
});

ContractEntitySchema.addManyToOne<ContractEntity>('buyerPartnerId', AgriTechPartnerEntity.name, {
  deleteRule: 'restrict',
  fieldName: 'buyer_partner_id',
  foreignKeyName: 'fk__marketplace_contracts__buyer_partner_id',
  mapToPk: true,
  nullable: true,
});
ContractEntitySchema.addManyToOne<ContractEntity>('sellerPartnerId', AgriTechPartnerEntity.name, {
  deleteRule: 'restrict',
  fieldName: 'seller_partner_id',
  foreignKeyName: 'fk__marketplace_contracts__seller_partner_id',
  mapToPk: true,
  nullable: true,
});
