// @requirements REQ-AGRITECH-ORDER-003 REQ-AGRITECH-INTEGRATION-013 REQ-AGRITECH-STAGE2-017
import { LockMode } from '@mikro-orm/core';
import { EntityManager } from '@mikro-orm/postgresql';
import { Inject, Injectable } from '@nestjs/common';
import type {
  AddCartItemInput,
  BuyerRequest,
  Cart,
  CheckoutCartInput,
  CheckoutCartResult,
  Contract,
  ContractDeliveryQuoteInput,
  ContractLine,
  CreateBuyerRequestInput,
  CreateRequestOfferInput,
  MarketplaceDocumentProviderResult,
  MarketplaceIdentityProviderResult,
  MarketplacePartySnapshot,
  MarketplaceProviderActorType,
  MarketplaceProviderOperationCompletion,
  MarketplaceProviderOperationPreparation,
  MarketplaceProviderOperationReplay,
  MarketplaceProviderOperationRepository,
  MarketplaceProviderRequestDescriptor,
  MarketplaceProviderSafeReceipt,
  PreparedMarketplaceProviderOperation,
  MarketplaceRepository,
  MarketplaceVerificationRepository,
  OperationResult,
  OfferSelectionResult,
  RequestOffer,
  Verification,
  VerificationDocument,
  VerificationRole,
  VerificationRejectionReason,
} from '@app/backend-feature-agritech-shared';
import {
  hasRequiredVerificationDocuments,
  isVerificationReviewReasonValid,
  marketplaceProviderFingerprint,
  marketplaceProviderOperationScopes,
  type AgriTechOwner,
} from '@app/backend-feature-agritech-shared';
import { marketplaceCapabilityRoleFilter } from './marketplace-role-predicates';
import { createHash, randomUUID } from 'node:crypto';
import {
  BuyerRequestEntity,
  CartEntity,
  ContractEntity,
  MarketplaceProviderOperationEntity,
  RequestOfferEntity,
  VerificationEntity,
  VerificationEvidenceEntity,
} from '../entities/marketplace.entity';
import {
  MarketplaceListingPublicationEntity,
  MarketplacePublicSellerEntity,
  MarketplacePublicSellerRevisionEntity,
  MarketplaceRequestPublicationEntity,
} from '../entities/marketplace-public.entity';
import {
  MarketplaceProduceOrganizationBindingEntity,
  MarketplaceRequestOrganizationBindingEntity,
} from '../entities/marketplace-source-binding.entity';
import {
  MarketplaceCommerceOperationEntity,
  MarketplacePartnerMembershipEntity,
  type MarketplaceCommerceOperationKind,
  type MarketplaceMembershipCapability,
} from '../entities/marketplace-commerce.entity';
import { AgriTechPartnerEntity, ProduceListingEntity } from '../entities/operations.entity';
import { ProductEntity } from '../entities/product.entity';

const ok = <T>(value: T): OperationResult<T> => ({ status: 'ok', value });
const maximumMarketplaceUzs = 9_999_999_999_999;
const maximumDeliveryDays = 365;
const maximumVerificationEvidenceRevisionsPerKind = 3;
const providerOperationLeaseMilliseconds = 60_000;
const providerClockSkewMilliseconds = 5 * 60_000;
const providerResultMaximumAgeMilliseconds = 30 * 24 * 60 * 60_000;
const safeProviderReference = /^[\x21-\x7e]{1,200}$/;
const safeOpaqueSubject = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{15,127}$/;
const safeProviderOutcome = /^[a-z][a-z0-9_-]{0,79}$/u;
const safeProviderErrorCode = /^[a-z][a-z0-9_-]{0,99}$/u;
const forbiddenProviderReceiptKeyFragments = [
  'accesstoken',
  'authorization',
  'cookie',
  'credential',
  'documentbytes',
  'payload',
  'pinfl',
  'privatekey',
  'raw',
  'refreshtoken',
  'secret',
  'tin',
] as const;

function providerOperationLockKey(owner: AgriTechOwner, input: MarketplaceProviderOperationPreparation): string {
  const resourceScope = `${input.capability}:${input.resourceType}:${input.resourceId}:${input.resourceRevision}`;
  if (['contract_artifact_storage', 'direct_payment', 'factoring'].includes(input.capability)) {
    return `marketplace-provider-operation:${resourceScope}`;
  }
  const actorScope = `${owner.tenantId}:${owner.userId}:${input.actorType}:${resourceScope}`;
  if (input.capability === 'qualified_signature') {
    return `marketplace-provider-operation:${actorScope}`;
  }
  if (['verification_documents', 'dispute_evidence_storage'].includes(input.capability)) {
    return `marketplace-provider-operation:${actorScope}:${input.requestFingerprint}`;
  }
  return `marketplace-provider-operation:${actorScope}:${input.idempotencyKey}`;
}

const isForbiddenProviderReceiptKey = (key: string): boolean => {
  const normalized = key.toLowerCase().replaceAll('-', '').replaceAll('_', '');
  return forbiddenProviderReceiptKeyFragments.some((fragment) => normalized.includes(fragment));
};

const hasControlCharacter = (value: string): boolean =>
  [...value].some((character) => {
    const codePoint = character.codePointAt(0);
    return codePoint !== undefined && (codePoint <= 0x1f || codePoint === 0x7f);
  });

const isProviderDescriptorValid = (input: MarketplaceProviderOperationPreparation): boolean => {
  const { requestDescriptor: descriptor } = input;
  const scope = marketplaceProviderOperationScopes[input.capability];
  return (
    scope.action === descriptor.action &&
    scope.resourceType === input.resourceType &&
    scope.actorTypes.some((actorType) => actorType === input.actorType) &&
    descriptor.resourceId === input.resourceId &&
    descriptor.resourceRevision === input.resourceRevision &&
    descriptor.resourceType === input.resourceType &&
    marketplaceProviderFingerprint(descriptor) === input.requestFingerprint &&
    JSON.stringify(descriptor).length <= 4096 &&
    ((input.capability === 'oneid_link' && descriptor.action === 'link-oneid' && descriptor.document === undefined) ||
      (input.capability === 'verification_documents' &&
        descriptor.action === 'store-verification-document' &&
        descriptor.document !== undefined) ||
      ('parametersFingerprint' in descriptor && /^[a-f0-9]{64}$/u.test(descriptor.parametersFingerprint)))
  );
};

const isPlausibleProviderDate = (value: Date, now: Date): boolean =>
  value instanceof Date &&
  Number.isFinite(value.getTime()) &&
  value.getTime() <= now.getTime() + providerClockSkewMilliseconds &&
  value.getTime() >= now.getTime() - providerResultMaximumAgeMilliseconds;

const isIdentityProviderResultValid = (
  operation: MarketplaceProviderOperationEntity,
  result: MarketplaceIdentityProviderResult,
  now: Date,
): boolean =>
  result.providerMode === operation.providerMode &&
  result.providerName === operation.providerName &&
  safeProviderReference.test(result.receiptId) &&
  safeOpaqueSubject.test(result.subjectKey) &&
  (result.providerMode === 'mock'
    ? result.identityAssurance === 'mock'
    : result.identityAssurance === 'provider_verified') &&
  (result.providerMode !== 'mock' || /^[a-f0-9]{64}$/.test(result.subjectKey)) &&
  isPlausibleProviderDate(result.linkedAt, now);

const isDocumentProviderResultValid = (
  operation: MarketplaceProviderOperationEntity,
  result: MarketplaceDocumentProviderResult,
  now: Date,
): boolean =>
  result.providerMode === operation.providerMode &&
  result.providerName === operation.providerName &&
  safeProviderReference.test(result.receiptId) &&
  isPlausibleProviderDate(result.storedAt, now);

const isOptionalVerificationDocument = (role: VerificationRole, kind: VerificationDocument['kind']): boolean => {
  if (role === 'farmer') {
    return kind !== 'farm' && kind !== 'land' && kind !== 'lease';
  }
  return kind !== 'business';
};

const hasApprovedOrganization = async (
  em: EntityManager,
  owner: AgriTechOwner,
  kind: 'buyer' | 'supplier',
  lock = false,
): Promise<boolean> =>
  Boolean(
    await em.findOne(
      AgriTechPartnerEntity,
      {
        tenantId: owner.tenantId,
        ownerUserId: owner.userId,
        kind,
        status: 'approved',
      },
      lock ? { lockMode: LockMode.PESSIMISTIC_READ } : undefined,
    ),
  );

const toVerification = (e: VerificationEntity): Verification => ({
  id: e.id,
  tenantId: e.tenantId,
  userId: e.userId,
  role: e.role,
  level: e.level,
  status: e.status,
  oneIdLinked: e.oneIdLinked,
  providerMode: e.providerMode,
  identityAssurance: e.identityAssurance,
  providerName: e.providerName ?? undefined,
  providerSubjectKey: e.providerSubjectKey ?? undefined,
  providerReceiptId: e.providerReceiptId ?? undefined,
  oneIdLinkedAt: e.oneIdLinkedAt ?? undefined,
  version: e.version,
  caseRevision: e.caseRevision,
  documents: e.documents,
  reviewedBy: e.reviewedBy ?? undefined,
  reviewedAt: e.reviewedAt ?? undefined,
  rejectionReason: e.rejectionReason ?? undefined,
  createdAt: e.createdAt,
  updatedAt: e.updatedAt,
});

type VerificationSnapshot = Omit<Verification, 'createdAt' | 'oneIdLinkedAt' | 'reviewedAt' | 'updatedAt'> & {
  createdAt: string;
  oneIdLinkedAt?: string;
  reviewedAt?: string;
  updatedAt: string;
};

const toVerificationSnapshot = (verification: Verification): VerificationSnapshot => {
  const { createdAt, oneIdLinkedAt, reviewedAt, updatedAt, ...rest } = verification;
  return {
    ...rest,
    createdAt: createdAt.toISOString(),
    ...(oneIdLinkedAt ? { oneIdLinkedAt: oneIdLinkedAt.toISOString() } : {}),
    ...(reviewedAt ? { reviewedAt: reviewedAt.toISOString() } : {}),
    updatedAt: updatedAt.toISOString(),
  };
};

const fromVerificationSnapshot = (snapshot: Record<string, unknown> | null): Verification | undefined => {
  if (!snapshot || typeof snapshot.id !== 'string' || typeof snapshot.createdAt !== 'string') {
    return undefined;
  }
  const value = snapshot as unknown as VerificationSnapshot;
  const { createdAt, oneIdLinkedAt, reviewedAt, updatedAt, ...rest } = value;
  return {
    ...rest,
    createdAt: new Date(createdAt),
    ...(oneIdLinkedAt ? { oneIdLinkedAt: new Date(oneIdLinkedAt) } : {}),
    ...(reviewedAt ? { reviewedAt: new Date(reviewedAt) } : {}),
    updatedAt: new Date(updatedAt),
  };
};

const isSafeProviderReceipt = (receipt: MarketplaceProviderSafeReceipt): boolean => {
  const entries = Object.entries(receipt);
  return (
    entries.length > 0 &&
    entries.length <= 24 &&
    JSON.stringify(receipt).length <= 4096 &&
    entries.every(
      ([key, value]) =>
        /^[a-z]\w{0,63}$/u.test(key) &&
        !isForbiddenProviderReceiptKey(key) &&
        (value === null ||
          typeof value === 'boolean' ||
          (typeof value === 'number' && Number.isSafeInteger(value)) ||
          (typeof value === 'string' && value.length <= 500 && !hasControlCharacter(value))),
    )
  );
};

const toProviderOperationReplay = (
  operation: MarketplaceProviderOperationEntity,
): MarketplaceProviderOperationReplay | undefined => {
  const descriptor = operation.resultSnapshot;
  if (
    operation.status !== 'succeeded' ||
    !operation.providerReference ||
    !operation.receipt ||
    !operation.resultFingerprint ||
    !descriptor ||
    typeof descriptor.completedAt !== 'string' ||
    typeof descriptor.outcome !== 'string' ||
    typeof descriptor.resourceId !== 'string' ||
    typeof descriptor.resourceRevision !== 'number' ||
    typeof descriptor.resourceType !== 'string'
  ) {
    return undefined;
  }
  return {
    attempt: operation.attempt,
    operationId: operation.id,
    ...(operation.providerEventId ? { providerEventId: operation.providerEventId } : {}),
    providerMode: operation.providerMode,
    providerName: operation.providerName,
    providerReference: operation.providerReference,
    reconciliationRequired: operation.reconciliationRequired,
    resultDescriptor: descriptor as unknown as MarketplaceProviderOperationReplay['resultDescriptor'],
    resultFingerprint: operation.resultFingerprint,
    safeReceipt: operation.receipt,
  };
};

const isProviderCompletionValid = (
  operation: MarketplaceProviderOperationEntity,
  result: MarketplaceProviderOperationCompletion,
  now: Date,
): boolean => {
  const completedAt = new Date(result.resultDescriptor.completedAt);
  const requiresEvent = operation.capability === 'direct_payment' || operation.capability === 'factoring';
  return (
    result.providerMode === operation.providerMode &&
    result.providerName === operation.providerName &&
    safeProviderReference.test(result.providerReference) &&
    (!result.providerEventId || safeProviderReference.test(result.providerEventId)) &&
    (!requiresEvent || Boolean(result.providerEventId)) &&
    isSafeProviderReceipt(result.safeReceipt) &&
    result.resultDescriptor.resourceId === operation.resourceId &&
    result.resultDescriptor.resourceRevision === operation.resourceRevision &&
    result.resultDescriptor.resourceType === operation.resourceType &&
    safeProviderOutcome.test(result.resultDescriptor.outcome) &&
    isPlausibleProviderDate(completedAt, now) &&
    completedAt.toISOString() === result.resultDescriptor.completedAt &&
    (!result.reconciliationReason || safeProviderErrorCode.test(result.reconciliationReason))
  );
};

interface ProviderResourceAnchor {
  verification?: VerificationEntity;
}

const lockVerificationProviderResource = async (
  em: EntityManager,
  owner: AgriTechOwner,
  actorType: MarketplaceProviderActorType,
  resourceId: string,
): Promise<ProviderResourceAnchor | undefined> => {
  if (actorType !== 'verification_subject') {
    return undefined;
  }
  const verification = await em.findOne(
    VerificationEntity,
    { id: resourceId, tenantId: owner.tenantId, userId: owner.userId },
    { lockMode: LockMode.PESSIMISTIC_WRITE },
  );
  return verification?.id === resourceId ? { verification } : undefined;
};

const lockContractProviderResource = async (
  em: EntityManager,
  owner: AgriTechOwner,
  actorType: MarketplaceProviderActorType,
  resourceId: string,
): Promise<ProviderResourceAnchor | undefined> => {
  if (actorType !== 'contract_buyer' && actorType !== 'contract_seller') {
    return undefined;
  }
  const tenantColumn = actorType === 'contract_buyer' ? 'tenant_id' : 'seller_tenant_id';
  const userColumn = actorType === 'contract_buyer' ? 'buyer_user_id' : 'seller_user_id';
  const rows = await em.execute<Array<{ id: string }>>(
    `select id
       from marketplace_contracts
      where id = ? and binding_status = 'resolved'
        and ${tenantColumn} = ? and ${userColumn} = ?
      for update`,
    [resourceId, owner.tenantId, owner.userId],
  );
  return rows.length === 1 ? {} : undefined;
};

const lockPromotionProviderResource = async (
  em: EntityManager,
  owner: AgriTechOwner,
  actorType: MarketplaceProviderActorType,
  resourceId: string,
): Promise<ProviderResourceAnchor | undefined> => {
  if (actorType !== 'promotion_owner') {
    return undefined;
  }
  const rows = await em.execute<Array<{ id: string }>>(
    `select id
       from marketplace_listing_promotions
      where id = ? and tenant_id = ? and actor_user_id = ?
      for update`,
    [resourceId, owner.tenantId, owner.userId],
  );
  return rows.length === 1 ? {} : undefined;
};

const lockProviderResource = (
  em: EntityManager,
  owner: AgriTechOwner,
  actorType: MarketplaceProviderActorType,
  resourceType: MarketplaceProviderOperationPreparation['resourceType'],
  resourceId: string,
): Promise<ProviderResourceAnchor | undefined> => {
  if (resourceType === 'verification') {
    return lockVerificationProviderResource(em, owner, actorType, resourceId);
  }
  if (resourceType === 'contract') {
    return lockContractProviderResource(em, owner, actorType, resourceId);
  }
  return lockPromotionProviderResource(em, owner, actorType, resourceId);
};

const sellerSummary = (seller: Pick<AgriTechPartnerEntity, 'legalName' | 'region'>) => ({
  displayName: seller.legalName,
  region: seller.region,
});

const findSellerOrganization = (
  em: EntityManager,
  tenantId: string | null | undefined,
  partnerId: string | null | undefined,
): Promise<AgriTechPartnerEntity | null> => {
  if (!tenantId || !partnerId) {
    return Promise.resolve(null);
  }
  return em.findOne(AgriTechPartnerEntity, { id: partnerId, kind: 'supplier', tenantId });
};

const toCart = (e: CartEntity, seller: Pick<AgriTechPartnerEntity, 'legalName' | 'region'>): Cart => ({
  buyerPartnerId: e.buyerPartnerId as string,
  buyerTenantId: e.tenantId,
  buyerUserId: e.userId,
  id: e.id,
  items: e.items,
  seller: sellerSummary(seller),
  sellerPartnerId: e.sellerPartnerId as string,
  sellerTenantId: e.sellerTenantId as string,
  sellerUserId: e.sellerUserId as string,
  status: e.status,
  createdAt: e.createdAt,
  updatedAt: e.updatedAt,
});

const toRequest = (e: BuyerRequestEntity, publication?: MarketplaceRequestPublicationEntity): BuyerRequest => ({
  id: e.id,
  tenantId: e.tenantId,
  buyerUserId: e.buyerUserId,
  buyerPartnerId: e.buyerPartnerId as string,
  title: e.title,
  product: e.product ?? undefined,
  volume: e.volume ?? undefined,
  region: e.region,
  deadline: e.deadline ?? undefined,
  budgetUzs: e.budgetUzs === null ? undefined : Number(e.budgetUzs),
  requirements: e.requirements ?? undefined,
  status: e.status,
  // The offer endpoints are keyed by the publication, never by the request row, so
  // a reader that never sees this id cannot reach its own offers. It stays absent
  // while the request is unpublished rather than falling back to the request id.
  publicationId: publication?.id,
  publicationStatus: publication?.status,
  moderationStatus: publication?.moderationStatus,
  createdAt: e.createdAt,
  updatedAt: e.updatedAt,
});

/**
 * The left side of the request-to-publication join. A request without a publication
 * keeps its entry absent, which is what marks it as still awaiting moderation.
 */
const findRequestPublications = async (
  em: EntityManager,
  tenantId: string,
  requests: readonly BuyerRequestEntity[],
): Promise<Map<string, MarketplaceRequestPublicationEntity>> => {
  if (requests.length === 0) {
    return new Map();
  }
  const rows = await em.find(MarketplaceRequestPublicationEntity, {
    requestId: { $in: requests.map((request) => request.id) },
    tenantId,
  });
  return new Map(rows.map((row) => [row.requestId, row]));
};

const toOffer = (e: RequestOfferEntity, seller: Pick<AgriTechPartnerEntity, 'legalName' | 'region'>): RequestOffer => ({
  buyerPartnerId: e.buyerPartnerId as string,
  buyerTenantId: e.tenantId,
  buyerUserId: e.buyerUserId as string,
  id: e.id,
  requestPublicId: e.requestPublicId as string,
  seller: sellerSummary(seller),
  sellerPartnerId: e.sellerPartnerId as string,
  sellerTenantId: e.sellerTenantId as string,
  sellerUserId: e.sellerUserId,
  priceUzs: Number(e.priceUzs),
  deliveryTerms: e.deliveryTerms,
  deliveryPriceUzs: e.deliveryPriceUzs === null ? undefined : Number(e.deliveryPriceUzs),
  deliveryNote: e.deliveryNote ?? undefined,
  deliveryDays: e.deliveryDays ?? undefined,
  status: e.status,
  createdAt: e.createdAt,
});

const toContract = (e: ContractEntity): Contract => ({
  revision: e.version,
  buyerPartnerId: e.buyerPartnerId as string,
  buyerPartySnapshot: e.buyerPartySnapshot as unknown as MarketplacePartySnapshot,
  buyerTenantId: e.tenantId,
  buyerUserId: e.buyerUserId,
  id: e.id,
  sellerPartnerId: e.sellerPartnerId as string,
  sellerPartySnapshot: e.sellerPartySnapshot as unknown as MarketplacePartySnapshot,
  sellerTenantId: e.sellerTenantId as string,
  sellerUserId: e.sellerUserId,
  sourceType: e.sourceType ?? undefined,
  sourceId: e.sourceId ?? undefined,
  subject: e.subject,
  amountUzs: Number(e.amountUzs),
  lines: e.lines,
  deliveryTerms: e.deliveryTerms,
  deliveryPriceUzs: e.deliveryPriceUzs === null ? undefined : Number(e.deliveryPriceUzs),
  deliveryNote: e.deliveryNote ?? undefined,
  deliveryDays: e.deliveryDays ?? undefined,
  factoringEnabled: false,
  status: e.status,
  buyerSignedAt: e.buyerSignedAt ?? undefined,
  sellerSignedAt: e.sellerSignedAt ?? undefined,
  signedAt: e.signedAt ?? undefined,
  createdAt: e.createdAt,
  updatedAt: e.updatedAt,
});

interface ContractDraftInput {
  buyerTenantId: string;
  buyerUserId: string;
  buyerPartnerId: string;
  buyerPartySnapshot: MarketplacePartySnapshot;
  sellerTenantId: string;
  sellerUserId: string;
  sellerPartnerId: string;
  sellerPartySnapshot: MarketplacePartySnapshot;
  sourceType: 'cart_checkout' | 'offer_selection';
  sourceId: string;
  subject: string;
  amountUzs: number;
  lines?: ContractLine[];
  deliveryTerms: 'pickup' | 'seller_delivery' | 'by_agreement';
  deliveryPriceUzs?: number;
  deliveryNote?: string;
  deliveryDays?: number;
}

const createDraftContract = (input: ContractDraftInput): ContractEntity => {
  const entity = new ContractEntity();
  entity.id = randomUUID();
  entity.tenantId = input.buyerTenantId;
  entity.buyerUserId = input.buyerUserId;
  entity.buyerPartnerId = input.buyerPartnerId;
  entity.buyerPartySnapshot = { ...input.buyerPartySnapshot };
  entity.sellerTenantId = input.sellerTenantId;
  entity.sellerUserId = input.sellerUserId;
  entity.sellerPartnerId = input.sellerPartnerId;
  entity.sellerPartySnapshot = { ...input.sellerPartySnapshot };
  entity.bindingStatus = 'resolved';
  entity.sourceType = input.sourceType;
  entity.sourceId = input.sourceId;
  entity.subject = input.subject;
  entity.amountUzs = input.amountUzs;
  entity.lines = input.lines ?? [];
  entity.deliveryTerms = input.deliveryTerms;
  entity.deliveryPriceUzs = input.deliveryPriceUzs ?? null;
  entity.deliveryNote = input.deliveryNote ?? null;
  entity.deliveryDays = input.deliveryDays ?? null;
  entity.factoringEnabled = false;
  entity.status = 'draft';
  return entity;
};

interface AuthorizedMarketplaceParty {
  membership: MarketplacePartnerMembershipEntity;
  partner: AgriTechPartnerEntity;
  verification: VerificationEntity;
}

interface ResolvedCommerceListing {
  listing: MarketplaceListingPublicationEntity;
  seller: AuthorizedMarketplaceParty;
  sellerPublic: MarketplacePublicSellerEntity;
  source: ProductEntity | ProduceListingEntity;
}

const commerceIdempotencyKeyPattern = /^[A-Za-z0-9:_-]{8,100}$/u;

const canonicalCommerceValue = (value: unknown): unknown => {
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (Array.isArray(value)) {
    return value.map(canonicalCommerceValue);
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, canonicalCommerceValue(nested)]),
    );
  }
  return value;
};

const commerceFingerprint = (value: unknown): string =>
  createHash('sha256')
    .update(JSON.stringify(canonicalCommerceValue(value)))
    .digest('hex');

const commerceDateKeys = new Set([
  'buyerSignedAt',
  'createdAt',
  'oneIdLinkedAt',
  'reviewedAt',
  'sellerSignedAt',
  'signedAt',
  'updatedAt',
]);

const reviveCommerceValue = (value: unknown, key?: string): unknown => {
  if (Array.isArray(value)) {
    return value.map((nested) => reviveCommerceValue(nested));
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([nestedKey, nested]) => [
        nestedKey,
        reviveCommerceValue(nested, nestedKey),
      ]),
    );
  }
  if (typeof value === 'string' && key && commerceDateKeys.has(key) && /^\d{4}-\d{2}-\d{2}T/u.test(value)) {
    return new Date(value);
  }
  return value;
};

const executeCommerceOperation = async <T>(
  em: EntityManager,
  owner: AgriTechOwner,
  operation: MarketplaceCommerceOperationKind,
  resourceKey: string,
  idempotencyKey: string,
  input: unknown,
  mutate: () => Promise<OperationResult<T>>,
): Promise<OperationResult<T>> => {
  if (!commerceIdempotencyKeyPattern.test(idempotencyKey) || resourceKey.length > 100) {
    return { status: 'invalid_state', field: 'idempotencyKey' };
  }
  await em.execute('select pg_advisory_xact_lock(hashtext(?))', [
    `marketplace-commerce:${owner.tenantId}:${owner.userId}:${operation}:${resourceKey}:${idempotencyKey}`,
  ]);
  const fingerprint = commerceFingerprint(input);
  const existing = await em.findOne(MarketplaceCommerceOperationEntity, {
    actorTenantId: owner.tenantId,
    actorUserId: owner.userId,
    idempotencyKey,
    operation,
    resourceKey,
  });
  if (existing) {
    if (existing.requestFingerprint !== fingerprint) {
      return { status: 'conflict', field: 'idempotencyKey' };
    }
    return ok(reviveCommerceValue(existing.resultSnapshot.value) as T);
  }

  const result = await mutate();
  if (result.status !== 'ok') {
    return result;
  }
  const receipt = new MarketplaceCommerceOperationEntity();
  Object.assign(receipt, {
    actorTenantId: owner.tenantId,
    actorUserId: owner.userId,
    idempotencyKey,
    operation,
    requestFingerprint: fingerprint,
    resourceKey,
    resultSnapshot: { value: canonicalCommerceValue(result.value) },
  });
  em.persist(receipt);
  await em.flush();
  return result;
};

const lockAuthorizedMarketplaceParty = async (
  em: EntityManager,
  owner: AgriTechOwner,
  partnerId: string,
  capability: MarketplaceMembershipCapability,
): Promise<AuthorizedMarketplaceParty | undefined> => {
  const membership = await em.findOne(
    MarketplacePartnerMembershipEntity,
    {
      capability,
      partnerId,
      status: 'active',
      tenantId: owner.tenantId,
      userId: owner.userId,
    },
    { lockMode: LockMode.PESSIMISTIC_READ },
  );
  if (!membership) {
    return undefined;
  }
  const partner = await em.findOne(
    AgriTechPartnerEntity,
    {
      id: partnerId,
      kind: capability === 'buyer' ? 'buyer' : 'supplier',
      status: 'approved',
      tenantId: owner.tenantId,
    },
    { lockMode: LockMode.PESSIMISTIC_READ },
  );
  if (!partner) {
    return undefined;
  }
  const verification = await em.findOne(
    VerificationEntity,
    {
      role: marketplaceCapabilityRoleFilter(capability),
      status: 'verified',
      tenantId: owner.tenantId,
      userId: owner.userId,
    },
    { lockMode: LockMode.PESSIMISTIC_READ },
  );
  return verification ? { membership, partner, verification } : undefined;
};

const marketplacePartySnapshot = (
  party: Pick<AuthorizedMarketplaceParty, 'partner'>,
  userId: string,
): MarketplacePartySnapshot => ({
  legalName: party.partner.legalName,
  partnerId: party.partner.id,
  region: party.partner.region,
  tenantId: party.partner.tenantId,
  userId,
});

const lockResolvedCommerceListing = async (
  em: EntityManager,
  listingPublicationId: string,
): Promise<ResolvedCommerceListing | undefined> => {
  const listing = await em.findOne(
    MarketplaceListingPublicationEntity,
    { id: listingPublicationId, moderationStatus: 'approved', status: 'published' },
    { lockMode: LockMode.PESSIMISTIC_READ },
  );
  if (!listing) {
    return undefined;
  }
  const sellerPublic = await em.findOne(
    MarketplacePublicSellerEntity,
    {
      id: listing.sellerPublicId,
      ownerUserId: listing.ownerUserId,
      status: 'published',
      tenantId: listing.tenantId,
    },
    { lockMode: LockMode.PESSIMISTIC_READ },
  );
  if (!sellerPublic) {
    return undefined;
  }
  const sellerRevision = await em.findOne(
    MarketplacePublicSellerRevisionEntity,
    {
      contentRevision: listing.sellerContentRevision,
      id: listing.sellerRevisionId,
      moderationStatus: 'approved',
      sellerPublicId: sellerPublic.id,
      tenantId: listing.tenantId,
    },
    { lockMode: LockMode.PESSIMISTIC_READ },
  );
  if (!sellerRevision) {
    return undefined;
  }
  const sellerOwner = { tenantId: listing.tenantId, userId: sellerPublic.ownerUserId };
  const seller = await lockAuthorizedMarketplaceParty(em, sellerOwner, sellerPublic.partnerId, 'seller');
  if (!seller) {
    return undefined;
  }

  if (listing.sourceKind === 'product' && listing.productId) {
    const product = await em.findOne(
      ProductEntity,
      {
        id: listing.productId,
        status: 'active',
        supplierId: sellerPublic.partnerId,
        tenantId: listing.tenantId,
      },
      { lockMode: LockMode.PESSIMISTIC_READ },
    );
    return product ? { listing, seller, sellerPublic, source: product } : undefined;
  }
  if (listing.sourceKind !== 'produce' || !listing.produceListingId) {
    return undefined;
  }
  const binding = await em.findOne(MarketplaceProduceOrganizationBindingEntity, {
    ownerUserId: sellerPublic.ownerUserId,
    produceListingId: listing.produceListingId,
    supplierPartnerId: sellerPublic.partnerId,
    tenantId: listing.tenantId,
  });
  if (!binding) {
    return undefined;
  }
  const produce = await em.findOne(
    ProduceListingEntity,
    { id: listing.produceListingId, status: 'active', tenantId: listing.tenantId },
    { lockMode: LockMode.PESSIMISTIC_READ },
  );
  return produce ? { listing, seller, sellerPublic, source: produce } : undefined;
};

const commerceListingTerms = (
  resolved: ResolvedCommerceListing,
): { availableQuantity: number; line: Omit<ContractLine, 'lineTotalUzs' | 'quantity'> } | undefined => {
  const { listing, source } = resolved;
  const unitPriceUzs = Number(source instanceof ProductEntity ? source.priceUzs : source.pricePerKgUzs);
  const availableQuantity = source instanceof ProductEntity ? source.stockQuantity : source.availableQuantityKg;
  if (
    !Number.isSafeInteger(unitPriceUzs) ||
    unitPriceUzs <= 0 ||
    unitPriceUzs > maximumMarketplaceUzs ||
    !Number.isInteger(availableQuantity) ||
    availableQuantity < 0
  ) {
    return undefined;
  }
  return {
    availableQuantity,
    line: {
      name: source instanceof ProductEntity ? source.name : source.crop,
      sourceId: source.id,
      sourceKind: listing.sourceKind,
      sourcePublicationId: listing.id,
      sourceRevision: listing.contentRevision,
      unit: source instanceof ProductEntity ? source.unit : 'kg',
      unitPriceUzs,
    },
  };
};

const resolveCartContractLines = async (
  em: EntityManager,
  cart: CartEntity,
): Promise<OperationResult<ContractLine[]>> => {
  const resolutions = await Promise.all(
    cart.items.map(async (item) => {
      const resolved = await lockResolvedCommerceListing(em, item.listingPublicationId);
      return { item, resolved, terms: resolved ? commerceListingTerms(resolved) : undefined };
    }),
  );
  const lines: ContractLine[] = [];
  for (const { item, resolved, terms } of resolutions) {
    if (
      !resolved ||
      !terms ||
      resolved.seller.partner.id !== cart.sellerPartnerId ||
      resolved.seller.partner.tenantId !== cart.sellerTenantId ||
      resolved.sellerPublic.ownerUserId !== cart.sellerUserId ||
      resolved.source.id !== item.sourceId ||
      resolved.listing.sourceKind !== item.sourceKind
    ) {
      return { status: 'not_found', field: 'listingPublicationId' };
    }
    if (item.quantity <= 0 || item.quantity > terms.availableQuantity) {
      return { status: 'conflict', field: 'stockQuantity' };
    }
    lines.push({
      ...terms.line,
      lineTotalUzs: terms.line.unitPriceUzs * item.quantity,
      quantity: item.quantity,
    });
  }
  return ok(lines);
};

@Injectable()
export class PostgresMarketplaceRepository
  implements MarketplaceRepository, MarketplaceVerificationRepository, MarketplaceProviderOperationRepository
{
  constructor(@Inject(EntityManager) private readonly em: EntityManager) {}

  // ---- Verification ----
  async getVerification(owner: AgriTechOwner): Promise<Verification | undefined> {
    const entity = await this.em.findOne(VerificationEntity, {
      tenantId: owner.tenantId,
      userId: owner.userId,
    });
    return entity ? toVerification(entity) : undefined;
  }

  createVerification(
    owner: AgriTechOwner,
    role: VerificationRole,
    expectedRevision: number,
    idempotencyKey: string,
  ): Promise<OperationResult<Verification>> {
    if (!Number.isInteger(expectedRevision) || expectedRevision < 0) {
      return Promise.resolve({ status: 'invalid_state', field: 'expectedRevision' });
    }
    return this.em.transactional((em) =>
      executeCommerceOperation(
        em,
        owner,
        'verification_create',
        'self',
        idempotencyKey,
        { expectedRevision, role },
        async () => {
          await em.execute('select pg_advisory_xact_lock(hashtext(?))', [
            `marketplace-verification:${owner.tenantId}:${owner.userId}`,
          ]);
          const entity = await em.findOne(
            VerificationEntity,
            { tenantId: owner.tenantId, userId: owner.userId },
            { lockMode: LockMode.PESSIMISTIC_WRITE },
          );
          if (!entity) {
            if (expectedRevision !== 0) {
              return { status: 'conflict', field: 'expectedRevision' };
            }
            const created = new VerificationEntity();
            created.tenantId = owner.tenantId;
            created.userId = owner.userId;
            created.role = role;
            created.level = 'basic';
            created.status = 'none';
            em.persist(created);
            await em.flush();
            await em.execute(
              `update marketplace_verifications
                  set version = 1
                where id = ? and tenant_id = ? and user_id = ? and version = 0`,
              [created.id, owner.tenantId, owner.userId],
            );
            await em.refresh(created);
            return ok(toVerification(created));
          }
          if (entity.version !== expectedRevision) {
            return { status: 'conflict', field: 'expectedRevision' };
          }
          if ((entity.status === 'pending' || entity.status === 'verified') && entity.role !== role) {
            return { status: 'conflict', field: 'role' };
          }
          if (entity.status === 'rejected') {
            entity.caseRevision += 1;
            if (entity.rejectionReason === 'identity_mismatch' || entity.providerMode === 'legacy') {
              entity.oneIdLinked = false;
              entity.providerMode = 'none';
              entity.identityAssurance = 'none';
              entity.providerName = null;
              entity.providerSubjectKey = null;
              entity.providerReceiptId = null;
              entity.oneIdLinkedAt = null;
            }
            entity.documents = [];
            entity.status = 'none';
            entity.level = 'basic';
            entity.reviewedBy = null;
            entity.reviewedAt = null;
            entity.rejectionReason = null;
          }
          entity.role = role;
          entity.updatedAt = new Date();
          await em.flush();
          return ok(toVerification(entity));
        },
      ),
    );
  }

  prepareProviderOperation(
    owner: AgriTechOwner,
    input: MarketplaceProviderOperationPreparation,
  ): Promise<OperationResult<PreparedMarketplaceProviderOperation>> {
    if (!isProviderDescriptorValid(input)) {
      return Promise.resolve({ status: 'invalid_state', field: 'requestDescriptor' });
    }
    // eslint-disable-next-line sonarjs/cognitive-complexity -- lock, replay, lease takeover, and insert-race decisions share one atomic transaction
    return this.em.transactional(async (em) => {
      const now = new Date();
      const contractGlobalClaim = ['contract_artifact_storage', 'direct_payment', 'factoring'].includes(
        input.capability,
      );
      const contractPartyClaim = input.capability === 'qualified_signature';
      const fingerprintClaim = ['verification_documents', 'dispute_evidence_storage'].includes(input.capability);
      const semanticClaim = contractGlobalClaim || contractPartyClaim || fingerprintClaim;
      await em.execute('select pg_advisory_xact_lock(hashtext(?))', [providerOperationLockKey(owner, input)]);
      const anchor = await lockProviderResource(em, owner, input.actorType, input.resourceType, input.resourceId);
      if (!anchor) {
        return { status: 'not_found', field: 'resource' };
      }
      if (input.capability === 'dispute_evidence_storage') {
        const disputes = await em.execute<Array<{ revision: number; status: string }>>(
          `select revision, status
             from marketplace_contract_disputes
            where contract_id = ?
            for update`,
          [input.resourceId],
        );
        const dispute = disputes[0];
        if (!dispute) {
          return { status: 'not_found', field: 'dispute' };
        }
        if (dispute.status !== 'open') {
          return { status: 'conflict', field: 'dispute' };
        }
        if (dispute.revision !== input.resourceRevision) {
          return { status: 'conflict', field: 'resourceRevision' };
        }
      }
      const verification = anchor.verification;
      if (verification && input.resourceRevision !== verification.caseRevision) {
        return { status: 'conflict', field: 'resourceRevision' };
      }
      const existing = await em.findOne(
        MarketplaceProviderOperationEntity,
        {
          actorType: input.actorType,
          capability: input.capability,
          resourceId: input.resourceId,
          resourceType: input.resourceType,
          idempotencyKey: input.idempotencyKey,
          tenantId: owner.tenantId,
          userId: owner.userId,
        },
        { lockMode: LockMode.PESSIMISTIC_WRITE },
      );
      if (existing) {
        if (
          existing.requestFingerprint !== input.requestFingerprint ||
          existing.providerMode !== input.providerMode ||
          existing.providerName !== input.providerName ||
          existing.actorType !== input.actorType ||
          existing.resourceId !== input.resourceId ||
          existing.resourceType !== input.resourceType ||
          existing.resourceRevision !== input.resourceRevision
        ) {
          return { status: 'conflict', field: 'idempotencyKey' };
        }
        if (existing.status === 'succeeded') {
          const replay = fromVerificationSnapshot(existing.resultSnapshot);
          const providerReplay = toProviderOperationReplay(existing);
          if (!replay && !providerReplay) {
            return { status: 'invalid_state', field: 'resultSnapshot' };
          }
          return ok({
            attempt: existing.attempt,
            execute: false,
            operationId: existing.id,
            ...(providerReplay ? { providerReplay } : {}),
            ...(replay ? { replay } : {}),
          });
        }
        if (existing.status === 'started') {
          if (existing.leaseExpiresAt && existing.leaseExpiresAt > now) {
            return { status: 'conflict', field: 'operationInProgress' };
          }
        }
        if (existing.status === 'failed' && existing.reconciliationRequired) {
          return { status: 'conflict', field: 'reconciliationRequired' };
        }
      }
      const claimedByAnotherKey = semanticClaim
        ? await em.findOne(
            MarketplaceProviderOperationEntity,
            {
              ...(contractGlobalClaim
                ? {}
                : { actorType: input.actorType, tenantId: owner.tenantId, userId: owner.userId }),
              capability: input.capability,
              ...(fingerprintClaim ? { requestFingerprint: input.requestFingerprint } : {}),
              resourceId: input.resourceId,
              resourceRevision: input.resourceRevision,
              resourceType: input.resourceType,
              ...(existing ? { id: { $ne: existing.id } } : {}),
              $or: [{ status: { $in: ['started', 'succeeded'] } }, { reconciliationRequired: true, status: 'failed' }],
            },
            { lockMode: LockMode.PESSIMISTIC_WRITE },
          )
        : null;
      if (claimedByAnotherKey) {
        return {
          status: 'conflict',
          field: claimedByAnotherKey.reconciliationRequired ? 'reconciliationRequired' : 'operationInProgress',
        };
      }
      if (verification && verification.status !== 'none') {
        return { status: 'conflict', field: 'status' };
      }
      if (verification && input.capability === 'oneid_link' && verification.oneIdLinked) {
        return { status: 'conflict', field: 'identity' };
      }
      if (existing) {
        existing.status = 'started';
        existing.attempt += 1;
        existing.leaseExpiresAt = new Date(now.getTime() + providerOperationLeaseMilliseconds);
        existing.errorCode = null;
        existing.providerEventId = null;
        existing.receipt = null;
        existing.resultSnapshot = null;
        existing.resultFingerprint = null;
        existing.reconciliationRequired = false;
        existing.reconciliationReason = null;
        existing.updatedAt = new Date();
        await em.flush();
        return ok({ attempt: existing.attempt, execute: true, operationId: existing.id });
      }
      const operationId = randomUUID();
      const leaseExpiresAt = new Date(now.getTime() + providerOperationLeaseMilliseconds);
      const inserted = await em.execute<Array<{ id: string }>>(
        `insert into marketplace_provider_operations (
           id, tenant_id, user_id, actor_type, capability, resource_type, resource_id, resource_revision,
           idempotency_key, request_fingerprint, request_descriptor, provider_mode, provider_name,
           status, attempt, lease_expires_at, created_at, updated_at
         ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?::jsonb, ?, ?, 'started', 1, ?, ?, ?)
         on conflict (tenant_id, user_id, actor_type, capability, resource_type, resource_id, idempotency_key)
         do nothing
         returning id`,
        [
          operationId,
          owner.tenantId,
          owner.userId,
          input.actorType,
          input.capability,
          input.resourceType,
          input.resourceId,
          input.resourceRevision,
          input.idempotencyKey,
          input.requestFingerprint,
          JSON.stringify(input.requestDescriptor),
          input.providerMode,
          input.providerName,
          leaseExpiresAt,
          now,
          now,
        ],
      );
      if (inserted.length > 0) {
        return ok({ attempt: 1, execute: true, operationId });
      }
      const raced = await em.findOne(
        MarketplaceProviderOperationEntity,
        {
          tenantId: owner.tenantId,
          userId: owner.userId,
          actorType: input.actorType,
          capability: input.capability,
          resourceId: input.resourceId,
          resourceType: input.resourceType,
          idempotencyKey: input.idempotencyKey,
        },
        { lockMode: LockMode.PESSIMISTIC_WRITE },
      );
      if (!raced) {
        return { status: 'invalid_state', field: 'providerOperation' };
      }
      if (
        raced.requestFingerprint !== input.requestFingerprint ||
        raced.providerMode !== input.providerMode ||
        raced.providerName !== input.providerName ||
        raced.actorType !== input.actorType ||
        raced.resourceType !== input.resourceType ||
        raced.resourceRevision !== input.resourceRevision
      ) {
        return { status: 'conflict', field: 'idempotencyKey' };
      }
      if (raced.status === 'succeeded') {
        const replay = fromVerificationSnapshot(raced.resultSnapshot);
        const providerReplay = toProviderOperationReplay(raced);
        if (!replay && !providerReplay) {
          return { status: 'invalid_state', field: 'resultSnapshot' };
        }
        return ok({
          attempt: raced.attempt,
          execute: false,
          operationId: raced.id,
          ...(providerReplay ? { providerReplay } : {}),
          ...(replay ? { replay } : {}),
        });
      }
      return { status: 'conflict', field: 'operationInProgress' };
    });
  }

  completeIdentityLink(
    owner: AgriTechOwner,
    operationId: string,
    operationAttempt: number,
    result: MarketplaceIdentityProviderResult,
  ): Promise<OperationResult<Verification>> {
    return this.em.transactional(async (em) => {
      const now = new Date();
      const operation = await em.findOne(
        MarketplaceProviderOperationEntity,
        {
          actorType: 'verification_subject',
          capability: 'oneid_link',
          id: operationId,
          tenantId: owner.tenantId,
          userId: owner.userId,
        },
        { lockMode: LockMode.PESSIMISTIC_WRITE },
      );
      if (!operation) {
        return { status: 'not_found', field: 'operationId' };
      }
      const verification = await em.findOne(
        VerificationEntity,
        { tenantId: owner.tenantId, userId: owner.userId },
        { lockMode: LockMode.PESSIMISTIC_WRITE },
      );
      if (!verification) {
        return { status: 'not_found', field: 'verification' };
      }
      if (operation.attempt !== operationAttempt) {
        return { status: 'conflict', field: 'operationAttempt' };
      }
      if (operation.status === 'succeeded') {
        const replay = fromVerificationSnapshot(operation.resultSnapshot);
        return replay ? ok(replay) : { status: 'invalid_state', field: 'resultSnapshot' };
      }
      if (
        operation.status !== 'started' ||
        !operation.leaseExpiresAt ||
        operation.requestDescriptor.action !== 'link-oneid' ||
        operation.resourceId !== verification.id ||
        operation.resourceRevision !== verification.caseRevision ||
        verification.status !== 'none' ||
        verification.oneIdLinked ||
        !isIdentityProviderResultValid(operation, result, now)
      ) {
        return { status: 'conflict', field: 'status' };
      }
      await em.execute('select pg_advisory_xact_lock(hashtext(?))', [
        `marketplace-verification-subject:${result.providerMode}:${result.subjectKey}`,
      ]);
      const duplicate = await em.findOne(VerificationEntity, {
        id: { $ne: verification.id },
        tenantId: owner.tenantId,
        providerMode: result.providerMode,
        providerSubjectKey: result.subjectKey,
      });
      if (duplicate) {
        return { status: 'conflict', field: 'identity' };
      }
      Object.assign(verification, {
        identityAssurance: result.identityAssurance,
        oneIdLinked: true,
        oneIdLinkedAt: result.linkedAt,
        providerMode: result.providerMode,
        providerName: result.providerName,
        providerReceiptId: result.receiptId,
        providerSubjectKey: result.subjectKey,
        updatedAt: now,
      });
      const mapped = toVerification(verification);
      const resultSnapshot = toVerificationSnapshot(mapped);
      Object.assign(operation, {
        errorCode: null,
        providerReference: result.receiptId,
        receipt: {
          identityAssurance: result.identityAssurance,
          linkedAt: result.linkedAt.toISOString(),
        },
        resultFingerprint: marketplaceProviderFingerprint(resultSnapshot),
        resultSnapshot,
        status: 'succeeded',
        leaseExpiresAt: null,
        updatedAt: now,
      });
      await em.flush();
      return ok(mapped);
    });
  }

  completeVerificationDocuments(
    owner: AgriTechOwner,
    operationId: string,
    operationAttempt: number,
    result: MarketplaceDocumentProviderResult,
  ): Promise<OperationResult<Verification>> {
    return this.em.transactional(async (em) => {
      const now = new Date();
      const operation = await em.findOne(
        MarketplaceProviderOperationEntity,
        {
          capability: 'verification_documents',
          actorType: 'verification_subject',
          id: operationId,
          tenantId: owner.tenantId,
          userId: owner.userId,
        },
        { lockMode: LockMode.PESSIMISTIC_WRITE },
      );
      if (!operation) {
        return { status: 'not_found', field: 'operationId' };
      }
      const verification = await em.findOne(
        VerificationEntity,
        { tenantId: owner.tenantId, userId: owner.userId },
        { lockMode: LockMode.PESSIMISTIC_WRITE },
      );
      if (!verification) {
        return { status: 'not_found', field: 'verification' };
      }
      if (operation.attempt !== operationAttempt) {
        return { status: 'conflict', field: 'operationAttempt' };
      }
      if (operation.status === 'succeeded') {
        const replay = fromVerificationSnapshot(operation.resultSnapshot);
        return replay ? ok(replay) : { status: 'invalid_state', field: 'resultSnapshot' };
      }
      if (
        operation.status !== 'started' ||
        !operation.leaseExpiresAt ||
        operation.resourceId !== verification.id ||
        operation.resourceRevision !== verification.caseRevision ||
        verification.status !== 'none' ||
        !verification.oneIdLinked ||
        !isDocumentProviderResultValid(operation, result, now)
      ) {
        return { status: 'conflict', field: 'status' };
      }
      if (result.evidence.length !== 1) {
        return { status: 'invalid_state', field: 'documents' };
      }
      const descriptor: MarketplaceProviderRequestDescriptor = operation.requestDescriptor;
      if (descriptor.action !== 'store-verification-document' || !descriptor.document) {
        return { status: 'invalid_state', field: 'requestDescriptor' };
      }
      const expectedDocument = descriptor.document;
      const evidenceUsage = await em.execute<Array<{ count: number }>>(
        `select count(*)::int as count
           from marketplace_verification_evidence
          where verification_id = ? and case_revision = ? and kind = ?`,
        [verification.id, verification.caseRevision, expectedDocument.kind],
      );
      const documentRevision = Number(evidenceUsage[0]?.count ?? 0) + 1;
      if (documentRevision > maximumVerificationEvidenceRevisionsPerKind) {
        return { status: 'conflict', field: 'evidenceQuota' };
      }
      const nextDocuments = new Map(verification.documents.map((document) => [document.kind, document]));
      const checksums: string[] = [];
      for (const item of result.evidence) {
        if (
          item.document.fileName !== expectedDocument.fileName ||
          item.document.kind !== expectedDocument.kind ||
          item.document.mimeType !== expectedDocument.mimeType ||
          item.document.sha256 !== expectedDocument.sha256 ||
          item.document.sizeBytes !== expectedDocument.sizeBytes ||
          item.document.providerMode !== result.providerMode ||
          item.document.providerName !== result.providerName ||
          item.document.providerReceiptId !== result.receiptId
        ) {
          return { status: 'invalid_state', field: 'documents' };
        }
        const evidence = new VerificationEvidenceEntity();
        Object.assign(evidence, {
          caseRevision: verification.caseRevision,
          documentRevision,
          fileName: item.document.fileName,
          kind: item.document.kind,
          mimeType: item.document.mimeType,
          providerMode: result.providerMode,
          providerName: result.providerName,
          providerReceiptId: result.receiptId,
          sha256: expectedDocument.sha256,
          sizeBytes: expectedDocument.sizeBytes,
          tenantId: owner.tenantId,
          userId: owner.userId,
          verificationId: verification.id,
        });
        em.persist(evidence);
        checksums.push(expectedDocument.sha256);
        nextDocuments.set(item.document.kind, {
          ...item.document,
          caseRevision: verification.caseRevision,
          evidenceId: evidence.id,
          evidenceRevision: documentRevision,
          optional: isOptionalVerificationDocument(verification.role, item.document.kind),
        });
      }
      verification.documents = [...nextDocuments.values()];
      verification.updatedAt = now;
      const mapped = toVerification(verification);
      const resultSnapshot = toVerificationSnapshot(mapped);
      Object.assign(operation, {
        errorCode: null,
        providerReference: result.receiptId,
        receipt: {
          checksumFingerprint: marketplaceProviderFingerprint(checksums),
          documentCount: result.evidence.length,
          storedAt: result.storedAt.toISOString(),
        },
        resultFingerprint: marketplaceProviderFingerprint(resultSnapshot),
        resultSnapshot,
        status: 'succeeded',
        leaseExpiresAt: null,
        updatedAt: now,
      });
      await em.flush();
      return ok(mapped);
    });
  }

  completeProviderOperation(
    owner: AgriTechOwner,
    operationId: string,
    operationAttempt: number,
    result: MarketplaceProviderOperationCompletion,
  ): Promise<OperationResult<MarketplaceProviderOperationReplay>> {
    return this.em.transactional(async (em) => {
      const now = new Date();
      const operation = await em.findOne(
        MarketplaceProviderOperationEntity,
        { id: operationId, tenantId: owner.tenantId, userId: owner.userId },
        { lockMode: LockMode.PESSIMISTIC_WRITE },
      );
      if (!operation) {
        return { status: 'not_found', field: 'operationId' };
      }
      if (operation.attempt !== operationAttempt) {
        return { status: 'conflict', field: 'operationAttempt' };
      }
      if (operation.status === 'succeeded') {
        const replay = toProviderOperationReplay(operation);
        return replay ? ok(replay) : { status: 'invalid_state', field: 'resultSnapshot' };
      }
      if (operation.capability === 'oneid_link' || operation.capability === 'verification_documents') {
        return { status: 'invalid_state', field: 'capability' };
      }
      if (
        operation.status !== 'started' ||
        !operation.leaseExpiresAt ||
        !isProviderCompletionValid(operation, result, now)
      ) {
        return { status: 'conflict', field: 'status' };
      }
      const anchor = await lockProviderResource(
        em,
        owner,
        operation.actorType,
        operation.resourceType,
        operation.resourceId,
      );
      if (!anchor) {
        return { status: 'not_found', field: 'resource' };
      }
      if (result.providerEventId) {
        await em.execute('select pg_advisory_xact_lock(hashtext(?))', [
          `marketplace-provider-event:${result.providerMode}:${result.providerName}:${operation.capability}:${result.providerEventId}`,
        ]);
        const duplicateEvent = await em.findOne(MarketplaceProviderOperationEntity, {
          capability: operation.capability,
          id: { $ne: operation.id },
          providerEventId: result.providerEventId,
          providerMode: result.providerMode,
          providerName: result.providerName,
        });
        if (duplicateEvent) {
          return { status: 'conflict', field: 'providerEventId' };
        }
      }
      const resultFingerprint = marketplaceProviderFingerprint(result.resultDescriptor);
      Object.assign(operation, {
        errorCode: null,
        leaseExpiresAt: null,
        providerEventId: result.providerEventId ?? null,
        providerReference: result.providerReference,
        receipt: result.safeReceipt,
        reconciliationReason: result.reconciliationReason ?? null,
        reconciliationRequired: Boolean(result.reconciliationReason),
        resultFingerprint,
        resultSnapshot: result.resultDescriptor,
        status: 'succeeded',
        updatedAt: now,
      });
      await em.flush();
      const replay = toProviderOperationReplay(operation);
      return replay ? ok(replay) : { status: 'invalid_state', field: 'resultSnapshot' };
    });
  }

  failProviderOperation(
    owner: AgriTechOwner,
    operationId: string,
    operationAttempt: number,
    errorCode: string,
    reconciliationReason?: string,
  ): Promise<void> {
    if (
      !safeProviderErrorCode.test(errorCode) ||
      (reconciliationReason && !safeProviderErrorCode.test(reconciliationReason))
    ) {
      return Promise.resolve();
    }
    return this.em.transactional(async (em) => {
      const operation = await em.findOne(
        MarketplaceProviderOperationEntity,
        { id: operationId, tenantId: owner.tenantId, userId: owner.userId },
        { lockMode: LockMode.PESSIMISTIC_WRITE },
      );
      if (!operation || operation.status !== 'started' || operation.attempt !== operationAttempt) {
        return;
      }
      operation.status = 'failed';
      operation.errorCode = errorCode;
      operation.leaseExpiresAt = null;
      operation.receipt = null;
      operation.resultSnapshot = null;
      operation.resultFingerprint = null;
      operation.providerReference = null;
      operation.providerEventId = null;
      operation.reconciliationRequired = Boolean(reconciliationReason);
      operation.reconciliationReason = reconciliationReason ?? null;
      operation.updatedAt = new Date();
      await em.flush();
    });
  }

  submitVerification(
    owner: AgriTechOwner,
    expectedRevision: number,
    idempotencyKey: string,
  ): Promise<OperationResult<Verification>> {
    if (!Number.isInteger(expectedRevision) || expectedRevision < 0) {
      return Promise.resolve({ status: 'invalid_state', field: 'expectedRevision' });
    }
    return this.em.transactional((em) =>
      executeCommerceOperation(
        em,
        owner,
        'verification_submit',
        'self',
        idempotencyKey,
        { expectedRevision },
        async () => {
          const verification = await em.findOne(
            VerificationEntity,
            { tenantId: owner.tenantId, userId: owner.userId },
            { lockMode: LockMode.PESSIMISTIC_WRITE },
          );
          if (!verification) {
            return { status: 'not_found' };
          }
          if (verification.version !== expectedRevision) {
            return { status: 'conflict', field: 'expectedRevision' };
          }
          if (verification.status !== 'none') {
            return { status: 'conflict', field: 'status' };
          }
          if (
            !verification.oneIdLinked ||
            (verification.providerMode !== 'mock' && verification.providerMode !== 'live') ||
            !hasRequiredVerificationDocuments(verification.role, verification.documents) ||
            verification.documents.some((document) => !document.evidenceId || !document.sha256) ||
            verification.documents.some((document) => document.caseRevision !== verification.caseRevision)
          ) {
            return { status: 'invalid_state', field: 'evidence' };
          }
          verification.status = 'pending';
          verification.updatedAt = new Date();
          await em.flush();
          return ok(toVerification(verification));
        },
      ),
    );
  }

  async reviewVerification(
    tenantId: string,
    verificationId: string,
    decision: 'verified' | 'rejected',
    reviewedBy: string,
    expectedRevision: number,
    idempotencyKey: string,
    reason?: VerificationRejectionReason,
  ): Promise<OperationResult<Verification>> {
    if (!isVerificationReviewReasonValid(decision, reason)) {
      return { status: 'invalid_state', field: 'reason' };
    }
    if (!Number.isInteger(expectedRevision) || expectedRevision < 0) {
      return { status: 'invalid_state', field: 'expectedRevision' };
    }
    const actor = { tenantId, userId: reviewedBy };
    return this.em.transactional((em) =>
      executeCommerceOperation(
        em,
        actor,
        'verification_review',
        verificationId,
        idempotencyKey,
        { decision, expectedRevision, ...(reason ? { reason } : {}) },
        async () => {
          const entity = await em.findOne(
            VerificationEntity,
            {
              tenantId,
              id: verificationId,
            },
            { lockMode: LockMode.PESSIMISTIC_WRITE },
          );
          if (!entity) {
            return { status: 'not_found' };
          }
          if (entity.version !== expectedRevision) {
            return { status: 'conflict', field: 'expectedRevision' };
          }
          if (entity.status !== 'pending') {
            return { status: 'conflict', field: 'status' };
          }
          entity.status = decision === 'verified' ? 'verified' : 'rejected';
          entity.level = decision === 'verified' ? 'verified' : 'basic';
          entity.reviewedBy = reviewedBy;
          entity.reviewedAt = new Date();
          entity.rejectionReason = decision === 'rejected' ? (reason as VerificationRejectionReason) : null;
          entity.updatedAt = new Date();
          await em.flush();
          return ok(toVerification(entity));
        },
      ),
    );
  }

  listVerifications(tenantId: string): Promise<Verification[]> {
    return this.em
      .find(VerificationEntity, { tenantId }, { orderBy: { createdAt: 'DESC' } })
      .then((rows) => rows.map(toVerification));
  }

  isApprovedOrganization(owner: AgriTechOwner, kind: 'buyer' | 'supplier'): Promise<boolean> {
    return hasApprovedOrganization(this.em, owner, kind);
  }

  // ---- Cart ----
  async getCart(owner: AgriTechOwner, cartId: string): Promise<Cart | undefined> {
    const entity = await this.em.findOne(CartEntity, {
      bindingStatus: 'resolved',
      tenantId: owner.tenantId,
      id: cartId,
      userId: owner.userId,
    });
    const seller = entity ? await findSellerOrganization(this.em, entity.sellerTenantId, entity.sellerPartnerId) : null;
    return entity && seller ? toCart(entity, seller) : undefined;
  }

  async listCarts(owner: AgriTechOwner): Promise<Cart[]> {
    const rows = await this.em.find(
      CartEntity,
      { bindingStatus: 'resolved', tenantId: owner.tenantId, userId: owner.userId, status: 'open' },
      { orderBy: { updatedAt: 'DESC' } },
    );
    const views = await Promise.all(
      rows.map(async (row) => {
        const seller = await findSellerOrganization(this.em, row.sellerTenantId, row.sellerPartnerId);
        return seller ? toCart(row, seller) : undefined;
      }),
    );
    return views.filter((view): view is Cart => view !== undefined);
  }

  async addToCart(
    owner: AgriTechOwner,
    item: AddCartItemInput,
    idempotencyKey: string,
  ): Promise<OperationResult<Cart>> {
    if (item.quantity <= 0) {
      return { status: 'invalid_state', field: 'quantity' };
    }
    return this.em.transactional((em) =>
      executeCommerceOperation(em, owner, 'cart_add', item.listingPublicationId, idempotencyKey, item, async () => {
        const buyer = await lockAuthorizedMarketplaceParty(em, owner, item.actingPartnerId, 'buyer');
        if (!buyer) {
          return { status: 'forbidden', field: 'organization' };
        }
        const resolved = await lockResolvedCommerceListing(em, item.listingPublicationId);
        const terms = resolved ? commerceListingTerms(resolved) : undefined;
        if (!resolved || !terms) {
          return { status: 'not_found', field: 'listingPublicationId' };
        }
        if (
          resolved.seller.partner.tenantId === owner.tenantId &&
          resolved.seller.partner.id === item.actingPartnerId
        ) {
          return { status: 'forbidden', field: 'organization' };
        }
        await em.execute('select pg_advisory_xact_lock(hashtext(?))', [
          `marketplace-cart:${owner.tenantId}:${owner.userId}:${item.actingPartnerId}:${resolved.seller.partner.tenantId}:${resolved.seller.partner.id}`,
        ]);
        let cart = await em.findOne(
          CartEntity,
          {
            bindingStatus: 'resolved',
            buyerPartnerId: item.actingPartnerId,
            sellerPartnerId: resolved.seller.partner.id,
            sellerTenantId: resolved.seller.partner.tenantId,
            status: 'open',
            tenantId: owner.tenantId,
            userId: owner.userId,
          },
          { lockMode: LockMode.PESSIMISTIC_WRITE },
        );
        const existing = cart?.items.find((cartItem) => cartItem.listingPublicationId === item.listingPublicationId);
        const nextQuantity = (existing?.quantity ?? 0) + item.quantity;
        if (nextQuantity > terms.availableQuantity) {
          return { status: 'conflict', field: 'stockQuantity' };
        }
        if (!cart) {
          cart = new CartEntity();
          Object.assign(cart, {
            bindingStatus: 'resolved',
            buyerPartnerId: buyer.partner.id,
            id: randomUUID(),
            items: [],
            sellerId: resolved.seller.partner.id,
            sellerPartnerId: resolved.seller.partner.id,
            sellerTenantId: resolved.seller.partner.tenantId,
            sellerUserId: resolved.sellerPublic.ownerUserId,
            tenantId: owner.tenantId,
            userId: owner.userId,
          });
          em.persist(cart);
        }
        if (existing) {
          existing.quantity = nextQuantity;
        } else {
          cart.items.push({
            listingPublicationId: item.listingPublicationId,
            quantity: item.quantity,
            sourceId: resolved.source.id,
            sourceKind: resolved.listing.sourceKind,
          });
        }
        cart.updatedAt = new Date();
        return ok(toCart(cart, resolved.seller.partner));
      }),
    );
  }

  async updateCartItem(
    owner: AgriTechOwner,
    cartId: string,
    listingPublicationId: string,
    quantity: number,
    idempotencyKey: string,
  ): Promise<OperationResult<Cart>> {
    return this.em.transactional((em) =>
      executeCommerceOperation(
        em,
        owner,
        'cart_update',
        `${cartId}:${listingPublicationId}`,
        idempotencyKey,
        { quantity },
        async () => {
          const cart = await em.findOne(
            CartEntity,
            {
              bindingStatus: 'resolved',
              id: cartId,
              status: 'open',
              tenantId: owner.tenantId,
              userId: owner.userId,
            },
            { lockMode: LockMode.PESSIMISTIC_WRITE },
          );
          if (!cart || !cart.buyerPartnerId) {
            return { status: 'not_found' };
          }
          if (!(await lockAuthorizedMarketplaceParty(em, owner, cart.buyerPartnerId, 'buyer'))) {
            return { status: 'forbidden', field: 'organization' };
          }
          const existing = cart.items.find((cartItem) => cartItem.listingPublicationId === listingPublicationId);
          if (!existing) {
            return { status: 'not_found', field: 'listingPublicationId' };
          }
          if (quantity <= 0) {
            cart.items = cart.items.filter((cartItem) => cartItem.listingPublicationId !== listingPublicationId);
          } else {
            const resolved = await lockResolvedCommerceListing(em, listingPublicationId);
            const terms = resolved ? commerceListingTerms(resolved) : undefined;
            if (
              !resolved ||
              !terms ||
              resolved.seller.partner.id !== cart.sellerPartnerId ||
              resolved.seller.partner.tenantId !== cart.sellerTenantId ||
              resolved.source.id !== existing.sourceId ||
              resolved.listing.sourceKind !== existing.sourceKind
            ) {
              return { status: 'not_found', field: 'listingPublicationId' };
            }
            if (quantity > terms.availableQuantity) {
              return { status: 'conflict', field: 'stockQuantity' };
            }
            existing.quantity = quantity;
          }
          const seller = await findSellerOrganization(em, cart.sellerTenantId, cart.sellerPartnerId);
          if (!seller) {
            return { status: 'not_found', field: 'organization' };
          }
          cart.updatedAt = new Date();
          return ok(toCart(cart, seller));
        },
      ),
    );
  }

  async removeCartItem(
    owner: AgriTechOwner,
    cartId: string,
    listingPublicationId: string,
    idempotencyKey: string,
  ): Promise<OperationResult<Cart>> {
    return this.em.transactional((em) =>
      executeCommerceOperation(
        em,
        owner,
        'cart_remove',
        `${cartId}:${listingPublicationId}`,
        idempotencyKey,
        {},
        async () => {
          const cart = await em.findOne(
            CartEntity,
            {
              bindingStatus: 'resolved',
              id: cartId,
              status: 'open',
              tenantId: owner.tenantId,
              userId: owner.userId,
            },
            { lockMode: LockMode.PESSIMISTIC_WRITE },
          );
          if (!cart || !cart.buyerPartnerId) {
            return { status: 'not_found' };
          }
          if (!(await lockAuthorizedMarketplaceParty(em, owner, cart.buyerPartnerId, 'buyer'))) {
            return { status: 'forbidden', field: 'organization' };
          }
          const countBefore = cart.items.length;
          cart.items = cart.items.filter((cartItem) => cartItem.listingPublicationId !== listingPublicationId);
          if (cart.items.length === countBefore) {
            return { status: 'not_found', field: 'listingPublicationId' };
          }
          const seller = await findSellerOrganization(em, cart.sellerTenantId, cart.sellerPartnerId);
          if (!seller) {
            return { status: 'not_found', field: 'organization' };
          }
          cart.updatedAt = new Date();
          return ok(toCart(cart, seller));
        },
      ),
    );
  }

  async checkoutCart(
    owner: AgriTechOwner,
    cartId: string,
    input: CheckoutCartInput,
    idempotencyKey: string,
  ): Promise<OperationResult<CheckoutCartResult>> {
    return this.em.transactional((em) =>
      executeCommerceOperation(em, owner, 'cart_checkout', cartId, idempotencyKey, input, async () => {
        const cart = await em.findOne(
          CartEntity,
          {
            bindingStatus: 'resolved',
            id: cartId,
            status: 'open',
            tenantId: owner.tenantId,
            userId: owner.userId,
          },
          { lockMode: LockMode.PESSIMISTIC_WRITE },
        );
        if (!cart || !cart.buyerPartnerId || !cart.sellerTenantId || !cart.sellerPartnerId || !cart.sellerUserId) {
          return { status: 'not_found' };
        }
        if (cart.items.length === 0) {
          return { status: 'invalid_state', field: 'items' };
        }
        const buyer = await lockAuthorizedMarketplaceParty(em, owner, cart.buyerPartnerId, 'buyer');
        const seller = await lockAuthorizedMarketplaceParty(
          em,
          { tenantId: cart.sellerTenantId, userId: cart.sellerUserId },
          cart.sellerPartnerId,
          'seller',
        );
        if (!buyer || !seller) {
          return { status: 'forbidden', field: 'organization' };
        }
        if (buyer.partner.tenantId === seller.partner.tenantId && buyer.partner.id === seller.partner.id) {
          return { status: 'forbidden', field: 'organization' };
        }

        const linesResult = await resolveCartContractLines(em, cart);
        if (linesResult.status !== 'ok') {
          return linesResult;
        }
        const lines = linesResult.value;
        const amountUzs = lines.reduce((sum, line) => sum + line.lineTotalUzs, 0);
        if (!Number.isSafeInteger(amountUzs) || amountUzs <= 0 || amountUzs > maximumMarketplaceUzs) {
          return { status: 'invalid_state', field: 'amountUzs' };
        }
        const contract = createDraftContract({
          amountUzs,
          buyerPartnerId: buyer.partner.id,
          buyerPartySnapshot: marketplacePartySnapshot(buyer, owner.userId),
          buyerTenantId: owner.tenantId,
          buyerUserId: owner.userId,
          deliveryPriceUzs: input.deliveryTerms === 'pickup' ? 0 : undefined,
          deliveryTerms: input.deliveryTerms,
          lines,
          sellerPartnerId: seller.partner.id,
          sellerPartySnapshot: marketplacePartySnapshot(seller, cart.sellerUserId),
          sellerTenantId: cart.sellerTenantId,
          sellerUserId: cart.sellerUserId,
          sourceId: cart.id,
          sourceType: 'cart_checkout',
          subject: lines
            .map((line) => line.name)
            .join(', ')
            .slice(0, 300),
        });
        cart.status = 'ordered';
        cart.updatedAt = new Date();
        em.persist(contract);
        return ok({ cartId: cart.id, contractId: contract.id });
      }),
    );
  }

  // ---- Requests (reverse auction) ----
  async createRequest(
    owner: AgriTechOwner,
    input: CreateBuyerRequestInput,
    idempotencyKey: string,
  ): Promise<OperationResult<BuyerRequest>> {
    if (
      input.budgetUzs !== undefined &&
      (!Number.isSafeInteger(input.budgetUzs) || input.budgetUzs <= 0 || input.budgetUzs > maximumMarketplaceUzs)
    ) {
      return { status: 'invalid_state', field: 'budgetUzs' };
    }
    return this.em.transactional((em) =>
      executeCommerceOperation(em, owner, 'request_create', 'new', idempotencyKey, input, async () => {
        const buyer = await lockAuthorizedMarketplaceParty(em, owner, input.actingPartnerId, 'buyer');
        if (!buyer) {
          return { status: 'forbidden', field: 'organization' };
        }
        const entity = new BuyerRequestEntity();
        Object.assign(entity, {
          bindingStatus: 'review_required',
          budgetUzs: input.budgetUzs ?? null,
          buyerPartnerId: buyer.partner.id,
          buyerUserId: owner.userId,
          deadline: input.deadline ?? null,
          id: randomUUID(),
          product: input.product ?? null,
          region: input.region,
          requirements: input.requirements ?? null,
          status: 'open',
          tenantId: owner.tenantId,
          title: input.title,
          volume: input.volume ?? null,
        });
        const binding = new MarketplaceRequestOrganizationBindingEntity();
        Object.assign(binding, {
          buyerPartnerId: buyer.partner.id,
          buyerUserId: owner.userId,
          requestId: entity.id,
          tenantId: owner.tenantId,
        });
        em.persist([entity, binding]);
        return ok(toRequest(entity));
      }),
    );
  }

  async listRequests(tenantId: string, status?: string): Promise<BuyerRequest[]> {
    const where: Record<string, unknown> = { bindingStatus: 'resolved', tenantId };
    if (status && status !== 'all') {
      where.status = status;
    }
    const rows = await this.em.find(BuyerRequestEntity, where, { orderBy: { createdAt: 'DESC' } });
    const publications = await findRequestPublications(this.em, tenantId, rows);
    return rows.map((row) => toRequest(row, publications.get(row.id)));
  }

  async listMyRequests(owner: AgriTechOwner): Promise<BuyerRequest[]> {
    const rows = await this.em.find(
      BuyerRequestEntity,
      { bindingStatus: 'resolved', tenantId: owner.tenantId, buyerUserId: owner.userId },
      { orderBy: { createdAt: 'DESC' } },
    );
    const publications = await findRequestPublications(this.em, owner.tenantId, rows);
    return rows.map((row) => toRequest(row, publications.get(row.id)));
  }

  async makeOffer(
    owner: AgriTechOwner,
    requestPublicId: string,
    input: CreateRequestOfferInput,
    idempotencyKey: string,
  ): Promise<OperationResult<RequestOffer>> {
    if (!Number.isSafeInteger(input.priceUzs) || input.priceUzs <= 0 || input.priceUzs > maximumMarketplaceUzs) {
      return { status: 'invalid_state', field: 'priceUzs' };
    }
    const validDeliveryPrice =
      (input.deliveryTerms === 'pickup' && input.deliveryPriceUzs === undefined) ||
      (input.deliveryTerms === 'seller_delivery' &&
        input.deliveryPriceUzs !== undefined &&
        Number.isSafeInteger(input.deliveryPriceUzs) &&
        input.deliveryPriceUzs > 0 &&
        input.deliveryPriceUzs <= maximumMarketplaceUzs) ||
      (input.deliveryTerms === 'by_agreement' && input.deliveryPriceUzs === undefined);
    if (!validDeliveryPrice) {
      return { status: 'invalid_state', field: 'deliveryPriceUzs' };
    }
    if (
      input.deliveryDays !== undefined &&
      (!Number.isInteger(input.deliveryDays) || input.deliveryDays <= 0 || input.deliveryDays > maximumDeliveryDays)
    ) {
      return { status: 'invalid_state', field: 'deliveryDays' };
    }
    return this.em.transactional((em) =>
      executeCommerceOperation(em, owner, 'offer_create', requestPublicId, idempotencyKey, input, async () => {
        const seller = await lockAuthorizedMarketplaceParty(em, owner, input.actingPartnerId, 'seller');
        if (!seller) {
          return { status: 'forbidden', field: 'organization' };
        }
        const publication = await em.findOne(
          MarketplaceRequestPublicationEntity,
          { id: requestPublicId, moderationStatus: 'approved', status: 'published' },
          { lockMode: LockMode.PESSIMISTIC_READ },
        );
        if (!publication) {
          return { status: 'not_found' };
        }
        const request = await em.findOne(
          BuyerRequestEntity,
          {
            bindingStatus: 'resolved',
            buyerPartnerId: publication.buyerPartnerId,
            buyerUserId: publication.buyerUserId,
            id: publication.requestId,
            tenantId: publication.tenantId,
          },
          { lockMode: LockMode.PESSIMISTIC_WRITE },
        );
        const binding = request
          ? await em.findOne(MarketplaceRequestOrganizationBindingEntity, {
              buyerPartnerId: publication.buyerPartnerId,
              buyerUserId: publication.buyerUserId,
              requestId: request.id,
              tenantId: publication.tenantId,
            })
          : undefined;
        const buyer = request
          ? await lockAuthorizedMarketplaceParty(
              em,
              { tenantId: publication.tenantId, userId: publication.buyerUserId },
              publication.buyerPartnerId,
              'buyer',
            )
          : undefined;
        if (!request || !binding || !buyer) {
          return { status: 'not_found' };
        }
        if (request.status !== 'open' && request.status !== 'offering') {
          return { status: 'invalid_state' };
        }
        if (
          (publication.tenantId === owner.tenantId && publication.buyerUserId === owner.userId) ||
          (publication.tenantId === owner.tenantId && publication.buyerPartnerId === seller.partner.id)
        ) {
          return { status: 'forbidden', field: 'organization' };
        }
        const entity = new RequestOfferEntity();
        Object.assign(entity, {
          bindingStatus: 'resolved',
          buyerPartnerId: publication.buyerPartnerId,
          buyerUserId: publication.buyerUserId,
          deliveryDays: input.deliveryDays ?? null,
          deliveryNote: input.deliveryNote ?? null,
          deliveryPriceUzs: input.deliveryTerms === 'pickup' ? 0 : (input.deliveryPriceUzs ?? null),
          deliveryTerms: input.deliveryTerms,
          id: randomUUID(),
          priceUzs: input.priceUzs,
          requestId: request.id,
          requestPublicId,
          sellerPartnerId: seller.partner.id,
          sellerTenantId: owner.tenantId,
          sellerUserId: owner.userId,
          status: 'pending',
          tenantId: publication.tenantId,
        });
        if (request.status === 'open') {
          request.status = 'offering';
          request.updatedAt = new Date();
        }
        em.persist(entity);
        return ok(toOffer(entity, seller.partner));
      }),
    );
  }

  listOffers(owner: AgriTechOwner, requestPublicId: string): Promise<OperationResult<RequestOffer[]>> {
    return this.em.transactional(async (em) => {
      const publication = await em.findOne(MarketplaceRequestPublicationEntity, {
        buyerUserId: owner.userId,
        id: requestPublicId,
        moderationStatus: 'approved',
        status: 'published',
        tenantId: owner.tenantId,
      });
      if (!publication) {
        return { status: 'not_found' };
      }
      const request = await em.findOne(BuyerRequestEntity, {
        bindingStatus: 'resolved',
        buyerPartnerId: publication.buyerPartnerId,
        buyerUserId: owner.userId,
        id: publication.requestId,
        tenantId: owner.tenantId,
      });
      if (
        !request ||
        !request.buyerPartnerId ||
        !(await lockAuthorizedMarketplaceParty(em, owner, request.buyerPartnerId, 'buyer'))
      ) {
        return { status: 'not_found' };
      }
      const rows = await em.find(
        RequestOfferEntity,
        {
          bindingStatus: 'resolved',
          requestId: request.id,
          requestPublicId,
          tenantId: owner.tenantId,
        },
        { orderBy: { createdAt: 'ASC' } },
      );
      const offers = await Promise.all(
        rows.map(async (row) => {
          const seller = await findSellerOrganization(em, row.sellerTenantId, row.sellerPartnerId);
          return seller ? toOffer(row, seller) : undefined;
        }),
      );
      return ok(offers.filter((offer): offer is RequestOffer => offer !== undefined));
    });
  }

  async chooseOffer(
    owner: AgriTechOwner,
    requestPublicId: string,
    offerId: string,
    idempotencyKey: string,
  ): Promise<OperationResult<OfferSelectionResult>> {
    return this.em.transactional((em) =>
      executeCommerceOperation(em, owner, 'offer_choose', requestPublicId, idempotencyKey, { offerId }, async () => {
        const publication = await em.findOne(
          MarketplaceRequestPublicationEntity,
          {
            buyerUserId: owner.userId,
            id: requestPublicId,
            moderationStatus: 'approved',
            status: 'published',
            tenantId: owner.tenantId,
          },
          { lockMode: LockMode.PESSIMISTIC_READ },
        );
        if (!publication) {
          return { status: 'not_found' };
        }
        const buyer = await lockAuthorizedMarketplaceParty(em, owner, publication.buyerPartnerId, 'buyer');
        if (!buyer) {
          return { status: 'forbidden', field: 'organization' };
        }
        const request = await em.findOne(
          BuyerRequestEntity,
          {
            bindingStatus: 'resolved',
            buyerPartnerId: publication.buyerPartnerId,
            buyerUserId: owner.userId,
            id: publication.requestId,
            tenantId: owner.tenantId,
          },
          { lockMode: LockMode.PESSIMISTIC_WRITE },
        );
        if (!request) {
          return { status: 'not_found' };
        }
        if (request.status !== 'offering' && request.status !== 'open') {
          return { status: 'conflict', field: 'status' };
        }
        const offer = await em.findOne(
          RequestOfferEntity,
          {
            bindingStatus: 'resolved',
            id: offerId,
            requestId: request.id,
            requestPublicId,
            tenantId: owner.tenantId,
          },
          { lockMode: LockMode.PESSIMISTIC_WRITE },
        );
        if (!offer || !offer.sellerTenantId || !offer.sellerPartnerId) {
          return { status: 'not_found', field: 'offerId' };
        }
        if (offer.status !== 'pending') {
          return { status: 'conflict', field: 'status' };
        }
        const seller = await lockAuthorizedMarketplaceParty(
          em,
          { tenantId: offer.sellerTenantId, userId: offer.sellerUserId },
          offer.sellerPartnerId,
          'seller',
        );
        if (!seller) {
          return { status: 'forbidden', field: 'organization' };
        }
        if (seller.partner.tenantId === buyer.partner.tenantId && seller.partner.id === buyer.partner.id) {
          return { status: 'forbidden', field: 'organization' };
        }
        const amountUzs = Number(offer.priceUzs);
        if (!Number.isSafeInteger(amountUzs) || amountUzs <= 0 || amountUzs > maximumMarketplaceUzs) {
          return { status: 'invalid_state', field: 'priceUzs' };
        }

        const pendingOffers = await em.find(
          RequestOfferEntity,
          { bindingStatus: 'resolved', requestId: request.id, status: 'pending', tenantId: owner.tenantId },
          { lockMode: LockMode.PESSIMISTIC_WRITE },
        );
        for (const pendingOffer of pendingOffers) {
          pendingOffer.status = pendingOffer.id === offer.id ? 'accepted' : 'declined';
        }
        request.status = 'selected';
        request.updatedAt = new Date();

        const contract = createDraftContract({
          amountUzs,
          buyerPartnerId: buyer.partner.id,
          buyerPartySnapshot: marketplacePartySnapshot(buyer, owner.userId),
          buyerTenantId: owner.tenantId,
          buyerUserId: owner.userId,
          deliveryDays: offer.deliveryDays ?? undefined,
          deliveryNote: offer.deliveryNote ?? undefined,
          deliveryPriceUzs: offer.deliveryPriceUzs ?? undefined,
          deliveryTerms: offer.deliveryTerms,
          lines: [
            {
              lineTotalUzs: amountUzs,
              name: request.title,
              quantity: 1,
              sourceId: request.id,
              sourceKind: 'request',
              sourcePublicationId: requestPublicId,
              sourceRevision: publication.contentRevision,
              unit: request.volume ?? 'request',
              unitPriceUzs: amountUzs,
            },
          ],
          sellerPartnerId: seller.partner.id,
          sellerPartySnapshot: marketplacePartySnapshot(seller, offer.sellerUserId),
          sellerTenantId: offer.sellerTenantId,
          sellerUserId: offer.sellerUserId,
          sourceId: offer.id,
          sourceType: 'offer_selection',
          subject: [request.title, request.volume].filter(Boolean).join(' — ').slice(0, 300),
        });
        em.persist(contract);
        return ok({
          contractId: contract.id,
          offerId,
          requestPublicId,
          sellerUserId: offer.sellerUserId,
        });
      }),
    );
  }

  // ---- Contracts ----
  async updateContractDeliveryQuote(
    owner: AgriTechOwner,
    contractId: string,
    input: ContractDeliveryQuoteInput,
    idempotencyKey: string,
  ): Promise<OperationResult<Contract>> {
    if (!Number.isInteger(input.expectedRevision) || input.expectedRevision < 0) {
      return { status: 'invalid_state', field: 'expectedRevision' };
    }
    return this.em.transactional((em) =>
      executeCommerceOperation(em, owner, 'contract_delivery_quote', contractId, idempotencyKey, input, async () => {
        const entity = await em.findOne(
          ContractEntity,
          {
            bindingStatus: 'resolved',
            id: contractId,
            sellerTenantId: owner.tenantId,
            sellerUserId: owner.userId,
          },
          { lockMode: LockMode.PESSIMISTIC_WRITE },
        );
        if (!entity) {
          return { status: 'not_found' };
        }
        if (entity.version !== input.expectedRevision) {
          return { status: 'conflict', field: 'expectedRevision' };
        }
        if (
          !entity.sellerPartnerId ||
          !(await lockAuthorizedMarketplaceParty(em, owner, entity.sellerPartnerId, 'seller'))
        ) {
          return { status: 'forbidden', field: 'organization' };
        }
        if (
          !entity.buyerPartnerId ||
          !(await lockAuthorizedMarketplaceParty(
            em,
            { tenantId: entity.tenantId, userId: entity.buyerUserId },
            entity.buyerPartnerId,
            'buyer',
          ))
        ) {
          return { status: 'forbidden', field: 'organization' };
        }
        if (
          entity.deliveryTerms !== 'seller_delivery' ||
          entity.sourceType !== 'cart_checkout' ||
          entity.deliveryPriceUzs !== null ||
          entity.status !== 'draft' ||
          entity.buyerSignedAt !== null ||
          entity.sellerSignedAt !== null ||
          !Number.isSafeInteger(input.deliveryPriceUzs) ||
          input.deliveryPriceUzs <= 0 ||
          input.deliveryPriceUzs > maximumMarketplaceUzs ||
          (input.deliveryDays !== undefined &&
            (!Number.isInteger(input.deliveryDays) ||
              input.deliveryDays <= 0 ||
              input.deliveryDays > maximumDeliveryDays))
        ) {
          return { status: 'invalid_state', field: 'deliveryPriceUzs' };
        }
        entity.deliveryPriceUzs = input.deliveryPriceUzs;
        entity.deliveryNote = input.deliveryNote ?? null;
        entity.deliveryDays = input.deliveryDays ?? null;
        entity.updatedAt = new Date();
        await em.flush();
        return ok(toContract(entity));
      }),
    );
  }

  listContracts(owner: AgriTechOwner): Promise<Contract[]> {
    return this.em
      .find(
        ContractEntity,
        {
          bindingStatus: 'resolved',
          $or: [
            { buyerUserId: owner.userId, tenantId: owner.tenantId },
            { sellerTenantId: owner.tenantId, sellerUserId: owner.userId },
          ],
        },
        { orderBy: { updatedAt: 'DESC' } },
      )
      .then((rows) => rows.map(toContract));
  }

  listTenantContracts(tenantId: string): Promise<Contract[]> {
    return this.em
      .find(
        ContractEntity,
        { bindingStatus: 'resolved', $or: [{ tenantId }, { sellerTenantId: tenantId }] },
        { orderBy: { updatedAt: 'DESC' } },
      )
      .then((rows) => rows.map(toContract));
  }

  async roleOf(owner: AgriTechOwner): Promise<VerificationRole | undefined> {
    const entity = await this.em.findOne(VerificationEntity, {
      tenantId: owner.tenantId,
      userId: owner.userId,
    });
    return entity?.status === 'verified' ? entity.role : undefined;
  }
}
