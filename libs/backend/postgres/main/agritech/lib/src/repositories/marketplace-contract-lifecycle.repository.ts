// @requirements REQ-AGRITECH-INTEGRATION-013 REQ-AGRITECH-STAGE2-017 REQ-AGRITECH-NOTIFICATION-022
import { LockMode } from '@mikro-orm/core';
import { createHash } from 'node:crypto';
import { EntityManager } from '@mikro-orm/postgresql';
import { Inject, Injectable } from '@nestjs/common';
import {
  marketplaceContractTemplateVersion,
  marketplaceMockContractWatermark,
  marketplaceProviderFingerprint,
  type AgriTechOwner,
  type ContractLine,
  type MarketplaceContractArtifact,
  type MarketplaceContractArtifactDownload,
  type MarketplaceContractArtifactSnapshot,
  type MarketplaceContractDisputeEvidence,
  type MarketplaceContractDisputeReason,
  type MarketplaceContractFulfillmentCommand,
  type MarketplaceContractLifecycle,
  type MarketplaceContractLifecycleRepository,
  type MarketplaceContractParty,
  type MarketplaceContractTimelineActor,
  type MarketplaceDisputeEvidenceMetadata,
  type MarketplaceDisputeDecision,
  type MarketplaceCommissionRatePolicy,
  type MarketplaceContractSettlementEvent,
  type MarketplaceContractSettlementKind,
  type MarketplacePartySnapshot,
  type MarketplaceProviderCapability,
  type MarketplaceSettlementProviderCommand,
  type OperationResult,
  type PreparedMarketplaceContractArtifact,
  type PreparedMarketplaceContractSignature,
  type PreparedMarketplaceSettlementProviderCommand,
} from '@app/backend-feature-agritech-shared';
import { marketplaceCapabilityRoleFilter } from './marketplace-role-predicates';
import { ContractEntity, MarketplaceProviderOperationEntity, VerificationEntity } from '../entities/marketplace.entity';
import { MarketplacePartnerMembershipEntity } from '../entities/marketplace-commerce.entity';
import {
  MarketplaceContractArtifactEntity,
  MarketplaceContractCommissionEntity,
  MarketplaceContractDisputeEntity,
  MarketplaceContractDisputeEvidenceEntity,
  MarketplaceContractDisputeResolutionEvidenceEntity,
  MarketplaceContractFulfillmentEntity,
  MarketplaceContractLifecycleEventEntity,
  MarketplaceContractNotificationIntentEntity,
  MarketplaceContractReviewEligibilityEntity,
  MarketplaceContractReputationSignalEntity,
  MarketplaceContractSettlementEntity,
  MarketplaceContractSignatureEntity,
  MarketplaceCommissionRatePolicyEntity,
  type MarketplaceContractTimelineCategory,
} from '../entities/marketplace-contract-lifecycle.entity';
import { MarketplaceProduceOrganizationBindingEntity } from '../entities/marketplace-source-binding.entity';
import { AgriTechPartnerEntity, ProduceListingEntity } from '../entities/operations.entity';
import { ProductEntity } from '../entities/product.entity';

const ok = <T>(value: T): OperationResult<T> => ({ status: 'ok', value });
interface AuthorizedContract {
  contract: ContractEntity;
  party: MarketplaceContractParty;
  partnerId: string;
}

interface ProviderEventInput {
  actorParty: MarketplaceContractTimelineActor;
  actorTenantId: string;
  actorUserId: string;
  category: MarketplaceContractTimelineCategory;
  eventType: string;
  idempotencyKey?: string;
  providerEventId?: string;
  providerMode?: 'mock' | 'live';
  providerName?: string;
  providerOperationId?: string;
  providerReference?: string;
  requestFingerprint?: string;
  safeReceipt?: Record<string, boolean | number | string | null>;
}

function partyFor(contract: ContractEntity, owner: AgriTechOwner): MarketplaceContractParty | undefined {
  const buyer = contract.tenantId === owner.tenantId && contract.buyerUserId === owner.userId;
  const seller = contract.sellerTenantId === owner.tenantId && contract.sellerUserId === owner.userId;
  if (buyer === seller) {
    return undefined;
  }
  return buyer ? 'buyer' : 'seller';
}

function partnerFor(contract: ContractEntity, party: MarketplaceContractParty): string | undefined {
  return (party === 'buyer' ? contract.buyerPartnerId : contract.sellerPartnerId) ?? undefined;
}

function actorTypeFor(party: MarketplaceContractParty): 'contract_buyer' | 'contract_seller' {
  return party === 'buyer' ? 'contract_buyer' : 'contract_seller';
}

function fulfillmentEventType(command: MarketplaceContractFulfillmentCommand): string {
  if (command === 'start') {
    return 'fulfillment_started';
  }
  return command === 'mark_delivered' ? 'fulfillment_delivered' : 'contract_completed';
}

function reputationSubjectParty(
  decision: MarketplaceDisputeDecision,
  openedByParty: MarketplaceContractParty,
): MarketplaceContractParty {
  if (decision === 'dismissed') {
    return openedByParty;
  }
  return openedByParty === 'buyer' ? 'seller' : 'buyer';
}

function ownerFor(contract: ContractEntity, party: MarketplaceContractParty): AgriTechOwner {
  return party === 'buyer'
    ? { tenantId: contract.tenantId, userId: contract.buyerUserId }
    : { tenantId: contract.sellerTenantId ?? '', userId: contract.sellerUserId };
}

function partySnapshot(value: Record<string, unknown> | null): MarketplacePartySnapshot | undefined {
  if (
    !value ||
    typeof value.tenantId !== 'string' ||
    typeof value.userId !== 'string' ||
    typeof value.partnerId !== 'string' ||
    typeof value.legalName !== 'string' ||
    typeof value.region !== 'string'
  ) {
    return undefined;
  }
  return {
    legalName: value.legalName,
    partnerId: value.partnerId,
    region: value.region,
    tenantId: value.tenantId,
    userId: value.userId,
  };
}

function artifactSnapshot(
  contract: ContractEntity,
  settlementKind: MarketplaceContractSettlementKind,
): MarketplaceContractArtifactSnapshot | undefined {
  const buyer = partySnapshot(contract.buyerPartySnapshot);
  const seller = partySnapshot(contract.sellerPartySnapshot);
  const deliveryPriceUzs = contract.deliveryPriceUzs === null ? 0 : Number(contract.deliveryPriceUzs);
  const amountUzs = Number(contract.amountUzs) + deliveryPriceUzs;
  if (
    !buyer ||
    !seller ||
    !Number.isSafeInteger(amountUzs) ||
    amountUzs <= 0 ||
    contract.lines.length === 0 ||
    contract.lines.some(
      (line) =>
        !Number.isSafeInteger(line.unitPriceUzs) ||
        !Number.isSafeInteger(line.quantity) ||
        !Number.isSafeInteger(line.lineTotalUzs),
    )
  ) {
    return undefined;
  }
  return {
    amountUzs,
    buyer,
    contractCreatedAt: contract.createdAt.toISOString(),
    contractId: contract.id,
    delivery: {
      ...(contract.deliveryDays === null ? {} : { days: contract.deliveryDays }),
      ...(contract.deliveryNote === null ? {} : { note: contract.deliveryNote }),
      ...(contract.deliveryPriceUzs === null ? {} : { priceUzs: Number(contract.deliveryPriceUzs) }),
      terms: contract.deliveryTerms,
    },
    lines: contract.lines.map((line) => ({ ...line })),
    seller,
    settlementKind,
    snapshotRevision: 1,
    subject: contract.subject,
    templateVersion: marketplaceContractTemplateVersion,
  };
}

function toArtifact(entity: MarketplaceContractArtifactEntity): MarketplaceContractArtifact {
  return {
    byteSize: entity.byteSize,
    checksumSha256: entity.checksumSha256,
    contractId: entity.contractId,
    createdAt: entity.createdAt,
    id: entity.id,
    mediaType: 'application/pdf',
    providerMode: entity.providerMode,
    providerName: entity.providerName,
    simulation: entity.providerMode === 'mock',
    snapshotFingerprint: entity.snapshotFingerprint,
    snapshotRevision: entity.snapshotRevision,
    storageReference: entity.storageReference,
    templateVersion: marketplaceContractTemplateVersion,
    watermark: entity.providerMode === 'mock' ? marketplaceMockContractWatermark : null,
  };
}

function toDisputeEvidence(entity: MarketplaceContractDisputeEvidenceEntity): MarketplaceContractDisputeEvidence {
  return {
    byteSize: entity.byteSize,
    checksumSha256: entity.checksumSha256,
    contractId: entity.contractId,
    createdAt: entity.createdAt,
    disputeId: entity.disputeId,
    fileName: entity.fileName,
    id: entity.id,
    mediaType: entity.mediaType,
    providerMode: entity.providerMode,
    providerName: entity.providerName,
    revision: entity.revision,
    simulation: entity.providerMode === 'mock',
    storageReference: entity.storageReference,
    uploadedByParty: entity.uploadedByParty,
    uploadedByTenantId: entity.uploadedByTenantId,
    uploadedByUserId: entity.uploadedByUserId,
  };
}

function toSettlement(entity: MarketplaceContractSettlementEntity) {
  return {
    amountUzs: Number(entity.amountUzs),
    ...(entity.buyerConsentedAt ? { buyerConsentedAt: entity.buyerConsentedAt } : {}),
    contractId: entity.contractId,
    createdAt: entity.createdAt,
    currency: 'UZS' as const,
    id: entity.id,
    kind: entity.kind,
    latestProviderMode: entity.latestProviderMode,
    ...(entity.reconciliationReason ? { reconciliationReason: entity.reconciliationReason } : {}),
    reconciliationState: entity.reconciliationState,
    revision: entity.revision,
    ...(entity.sellerConsentedAt ? { sellerConsentedAt: entity.sellerConsentedAt } : {}),
    simulation: entity.latestProviderMode === 'mock',
    status: entity.status,
    updatedAt: entity.updatedAt,
  };
}

function artifactParametersFingerprint(checksum: string, byteSize: number, snapshotFingerprint: string): string {
  return marketplaceProviderFingerprint({
    artifactChecksum: checksum,
    byteSize,
    snapshotFingerprint,
    snapshotRevision: 1,
  });
}

function signatureParametersFingerprint(artifactChecksum: string, party: MarketplaceContractParty): string {
  return marketplaceProviderFingerprint({ artifactChecksum, party, snapshotRevision: 1 });
}

function settlementParametersFingerprint(
  amountUzs: number,
  command: MarketplaceSettlementProviderCommand,
  revision: number,
): string {
  return marketplaceProviderFingerprint({ amountUzs, command, settlementRevision: revision });
}

function descriptorFingerprint(operation: MarketplaceProviderOperationEntity): string | undefined {
  return 'parametersFingerprint' in operation.requestDescriptor
    ? operation.requestDescriptor.parametersFingerprint
    : undefined;
}

function eventTemplateKey(eventType: string): string {
  return `marketplace.contract.${eventType.replaceAll('_', '.')}`;
}

async function authorizeParty(
  em: EntityManager,
  contract: ContractEntity,
  owner: AgriTechOwner,
  party: MarketplaceContractParty,
): Promise<boolean> {
  const partnerId = partnerFor(contract, party);
  if (!partnerId) {
    return false;
  }
  const capability = party;
  const [membership, partner, verification] = await Promise.all([
    em.findOne(
      MarketplacePartnerMembershipEntity,
      { capability, partnerId, status: 'active', tenantId: owner.tenantId, userId: owner.userId },
      { lockMode: LockMode.PESSIMISTIC_READ },
    ),
    em.findOne(
      AgriTechPartnerEntity,
      {
        id: partnerId,
        kind: party === 'buyer' ? 'buyer' : 'supplier',
        status: 'approved',
        tenantId: owner.tenantId,
      },
      { lockMode: LockMode.PESSIMISTIC_READ },
    ),
    em.findOne(
      VerificationEntity,
      {
        role: marketplaceCapabilityRoleFilter(party),
        status: 'verified',
        tenantId: owner.tenantId,
        userId: owner.userId,
      },
      { lockMode: LockMode.PESSIMISTIC_READ },
    ),
  ]);
  return Boolean(membership && partner && verification);
}

async function authorizeBoth(em: EntityManager, contract: ContractEntity): Promise<boolean> {
  const sellerOwner = ownerFor(contract, 'seller');
  return (
    Boolean(sellerOwner.tenantId) &&
    (await authorizeParty(em, contract, ownerFor(contract, 'buyer'), 'buyer')) &&
    (await authorizeParty(em, contract, sellerOwner, 'seller'))
  );
}

async function lockAuthorizedContract(
  em: EntityManager,
  owner: AgriTechOwner,
  contractId: string,
): Promise<OperationResult<AuthorizedContract>> {
  const contract = await em.findOne(
    ContractEntity,
    {
      bindingStatus: 'resolved',
      id: contractId,
      $or: [
        { buyerUserId: owner.userId, tenantId: owner.tenantId },
        { sellerTenantId: owner.tenantId, sellerUserId: owner.userId },
      ],
    },
    { lockMode: LockMode.PESSIMISTIC_WRITE },
  );
  if (!contract) {
    return { status: 'not_found' };
  }
  const party = partyFor(contract, owner);
  const partnerId = party ? partnerFor(contract, party) : undefined;
  if (!party || !partnerId) {
    return { status: 'invalid_state', field: 'parties' };
  }
  if (!(await authorizeParty(em, contract, owner, party))) {
    return { status: 'forbidden', field: 'organization' };
  }
  return ok({ contract, partnerId, party });
}

async function appendEvent(
  em: EntityManager,
  contractId: string,
  input: ProviderEventInput,
  recipients: readonly MarketplaceContractParty[] = ['buyer', 'seller'],
): Promise<MarketplaceContractLifecycleEventEntity> {
  const latest = await em.findOne(
    MarketplaceContractLifecycleEventEntity,
    { contractId },
    { lockMode: LockMode.PESSIMISTIC_READ, orderBy: { sequence: 'DESC' } },
  );
  const event = new MarketplaceContractLifecycleEventEntity();
  event.contractId = contractId;
  event.sequence = (latest?.sequence ?? 0) + 1;
  event.category = input.category;
  event.eventType = input.eventType;
  event.actorParty = input.actorParty;
  event.actorTenantId = input.actorTenantId;
  event.actorUserId = input.actorUserId;
  event.idempotencyKey = input.idempotencyKey ?? null;
  event.requestFingerprint = input.requestFingerprint ?? null;
  event.providerOperationId = input.providerOperationId ?? null;
  event.providerEventId = input.providerEventId ?? null;
  event.providerMode = input.providerMode ?? 'none';
  event.providerName = input.providerName ?? null;
  event.providerReference = input.providerReference ?? null;
  event.safeReceipt = input.safeReceipt ?? null;
  em.persist(event);
  for (const recipientParty of recipients) {
    const intent = new MarketplaceContractNotificationIntentEntity();
    intent.contractId = contractId;
    intent.timelineEventId = event.id;
    intent.recipientParty = recipientParty;
    intent.templateKey = eventTemplateKey(input.eventType);
    em.persist(intent);
  }
  return event;
}

// eslint-disable-next-line sonarjs/cognitive-complexity -- product and produce stock must be validated and decremented in this one transaction
async function commitContractInventory(em: EntityManager, contract: ContractEntity): Promise<OperationResult<void>> {
  if (contract.sourceType !== 'cart_checkout') {
    return ok(undefined);
  }
  if (!contract.sellerTenantId || !contract.sellerPartnerId) {
    return { status: 'invalid_state', field: 'parties' };
  }
  const products = new Map<string, number>();
  const produce = new Map<string, number>();
  for (const line of contract.lines) {
    let target: Map<string, number> | undefined;
    if (line.sourceKind === 'product') {
      target = products;
    } else if (line.sourceKind === 'produce') {
      target = produce;
    }
    if (!target || !Number.isSafeInteger(line.quantity) || line.quantity <= 0) {
      return { status: 'invalid_state', field: 'lines' };
    }
    target.set(line.sourceId, (target.get(line.sourceId) ?? 0) + line.quantity);
  }
  const productRows = products.size
    ? await em.find(
        ProductEntity,
        {
          id: { $in: [...products.keys()] },
          supplierId: contract.sellerPartnerId,
          tenantId: contract.sellerTenantId,
        },
        { lockMode: LockMode.PESSIMISTIC_WRITE },
      )
    : [];
  const produceBindings = produce.size
    ? await em.find(MarketplaceProduceOrganizationBindingEntity, {
        produceListingId: { $in: [...produce.keys()] },
        supplierPartnerId: contract.sellerPartnerId,
        tenantId: contract.sellerTenantId,
      })
    : [];
  const produceRows = produce.size
    ? await em.find(
        ProduceListingEntity,
        { id: { $in: [...produce.keys()] }, tenantId: contract.sellerTenantId },
        { lockMode: LockMode.PESSIMISTIC_WRITE },
      )
    : [];
  const productById = new Map(productRows.map((row) => [row.id, row]));
  const produceById = new Map(produceRows.map((row) => [row.id, row]));
  if (
    produceBindings.length !== produce.size ||
    [...products].some(([id, quantity]) => {
      const row = productById.get(id);
      return !row || row.status !== 'active' || row.stockQuantity < quantity;
    }) ||
    [...produce].some(([id, quantity]) => {
      const row = produceById.get(id);
      return !row || row.status !== 'active' || row.availableQuantityKg < quantity;
    })
  ) {
    return { status: 'conflict', field: 'stockQuantity' };
  }
  const now = new Date();
  for (const [id, quantity] of products) {
    const row = productById.get(id);
    if (!row) {
      throw new Error('Locked product inventory is incomplete');
    }
    row.stockQuantity -= quantity;
    row.status = row.stockQuantity === 0 ? 'out_of_stock' : row.status;
    row.updatedAt = now;
  }
  for (const [id, quantity] of produce) {
    const row = produceById.get(id);
    if (!row) {
      throw new Error('Locked produce inventory is incomplete');
    }
    row.availableQuantityKg -= quantity;
    row.status = row.availableQuantityKg === 0 ? 'sold' : row.status;
    row.updatedAt = now;
  }
  return ok(undefined);
}

function isSucceededOperation(
  operation: MarketplaceProviderOperationEntity,
  capability: MarketplaceProviderCapability,
): boolean {
  return (
    operation.status === 'succeeded' &&
    operation.capability === capability &&
    operation.resourceType === 'contract' &&
    Boolean(operation.providerReference && operation.receipt && operation.resultSnapshot)
  );
}

function matchesSettlementSelection(
  settlement: MarketplaceContractSettlementEntity,
  settlementKind: MarketplaceContractSettlementKind,
  requestFingerprint: string,
): boolean {
  return settlement.kind === settlementKind && settlement.selectionRequestFingerprint === requestFingerprint;
}

function matchesSettlementSelector(
  settlement: MarketplaceContractSettlementEntity,
  owner: AgriTechOwner,
  idempotencyKey: string,
): boolean {
  return (
    settlement.selectedByTenantId === owner.tenantId &&
    settlement.selectedByUserId === owner.userId &&
    settlement.selectionIdempotencyKey === idempotencyKey
  );
}

function replayExistingArtifact(
  settlement: MarketplaceContractSettlementEntity,
  existing: MarketplaceContractArtifactEntity,
  snapshot: MarketplaceContractArtifactSnapshot,
  snapshotFingerprint: string,
): OperationResult<PreparedMarketplaceContractArtifact> {
  if (
    Number(settlement.amountUzs) !== snapshot.amountUzs ||
    existing.snapshotRevision !== snapshot.snapshotRevision ||
    existing.templateVersion !== snapshot.templateVersion ||
    existing.snapshotFingerprint !== snapshotFingerprint
  ) {
    return { status: 'conflict', field: 'snapshot' };
  }
  return ok({ existingArtifact: toArtifact(existing), snapshot, snapshotFingerprint });
}

function hasValidDeliveryPrice(contract: ContractEntity): boolean {
  return contract.deliveryTerms !== 'seller_delivery' || Number(contract.deliveryPriceUzs) > 0;
}

@Injectable()
export class PostgresMarketplaceContractLifecycleRepository implements MarketplaceContractLifecycleRepository {
  constructor(@Inject(EntityManager) private readonly em: EntityManager) {}

  prepareArtifact(
    owner: AgriTechOwner,
    contractId: string,
    settlementKind: MarketplaceContractSettlementKind,
    idempotencyKey: string,
    requestFingerprint: string,
  ): Promise<OperationResult<PreparedMarketplaceContractArtifact>> {
    return this.em.transactional(async (em) => {
      const authorization = await lockAuthorizedContract(em, owner, contractId);
      if (authorization.status !== 'ok') {
        return authorization;
      }
      const { contract } = authorization.value;
      if (!(await authorizeBoth(em, contract))) {
        return { status: 'forbidden', field: 'organization' };
      }
      if (!hasValidDeliveryPrice(contract)) {
        return { status: 'invalid_state', field: 'deliveryPriceUzs' };
      }
      const snapshot = artifactSnapshot(contract, settlementKind);
      if (!snapshot) {
        return { status: 'invalid_state', field: 'snapshot' };
      }
      const snapshotFingerprint = marketplaceProviderFingerprint(snapshot);
      let settlement = await em.findOne(
        MarketplaceContractSettlementEntity,
        { contractId },
        { lockMode: LockMode.PESSIMISTIC_WRITE },
      );
      if (settlement) {
        if (!matchesSettlementSelection(settlement, settlementKind, requestFingerprint)) {
          return { status: 'conflict', field: 'idempotencyKey' };
        }
        const existing = await em.findOne(MarketplaceContractArtifactEntity, { contractId });
        if (existing) {
          return replayExistingArtifact(settlement, existing, snapshot, snapshotFingerprint);
        }
        if (!matchesSettlementSelector(settlement, owner, idempotencyKey)) {
          return { status: 'conflict', field: 'idempotencyKey' };
        }
      }
      if (!['draft', 'signed'].includes(contract.status)) {
        return { status: 'invalid_state', field: 'status' };
      }
      if (!settlement) {
        settlement = new MarketplaceContractSettlementEntity();
        settlement.contractId = contractId;
        settlement.kind = settlementKind;
        settlement.status = settlementKind === 'direct_payment' ? 'awaiting_buyer_confirmation' : 'awaiting_consents';
        settlement.amountUzs = snapshot.amountUzs;
        settlement.selectedByTenantId = owner.tenantId;
        settlement.selectedByUserId = owner.userId;
        settlement.selectionIdempotencyKey = idempotencyKey;
        settlement.selectionRequestFingerprint = requestFingerprint;
        em.persist(settlement);
        const fulfillment = new MarketplaceContractFulfillmentEntity();
        fulfillment.contractId = contractId;
        em.persist(fulfillment);
      }
      await em.flush();
      return ok({ snapshot, snapshotFingerprint });
    });
  }

  completeArtifact(
    owner: AgriTechOwner,
    operationId: string,
    content: Uint8Array,
  ): Promise<OperationResult<MarketplaceContractArtifact>> {
    return this.em.transactional(async (em) => {
      const operation = await em.findOne(
        MarketplaceProviderOperationEntity,
        { id: operationId, tenantId: owner.tenantId, userId: owner.userId },
        { lockMode: LockMode.PESSIMISTIC_WRITE },
      );
      if (!operation || !isSucceededOperation(operation, 'contract_artifact_storage')) {
        return { status: 'not_found' };
      }
      const authorization = await lockAuthorizedContract(em, owner, operation.resourceId);
      if (authorization.status !== 'ok') {
        return authorization;
      }
      if (operation.actorType !== actorTypeFor(authorization.value.party) || operation.resourceRevision !== 1) {
        return { status: 'forbidden' };
      }
      const existing = await em.findOne(MarketplaceContractArtifactEntity, {
        $or: [{ contractId: operation.resourceId }, { providerOperationId: operation.id }],
      });
      if (existing) {
        return ok(toArtifact(existing));
      }
      const settlement = await em.findOne(MarketplaceContractSettlementEntity, { contractId: operation.resourceId });
      if (!settlement) {
        return { status: 'invalid_state', field: 'settlement' };
      }
      const snapshot = artifactSnapshot(authorization.value.contract, settlement.kind);
      if (!snapshot) {
        return { status: 'invalid_state', field: 'snapshot' };
      }
      const snapshotFingerprint = marketplaceProviderFingerprint(snapshot);
      const checksum = createHash('sha256').update(content).digest('hex');
      const receipt = operation.receipt;
      const resultSnapshot = operation.resultSnapshot;
      if (!receipt || !resultSnapshot) {
        return { status: 'conflict', field: 'providerOperation' };
      }
      const storageReference = receipt.storageReference;
      if (
        operation.requestDescriptor.action !== 'store-contract-artifact' ||
        descriptorFingerprint(operation) !==
          artifactParametersFingerprint(checksum, content.byteLength, snapshotFingerprint) ||
        resultSnapshot.outcome !== 'stored' ||
        receipt.checksumSha256 !== checksum ||
        receipt.byteSize !== content.byteLength ||
        typeof storageReference !== 'string'
      ) {
        return { status: 'conflict', field: 'providerOperation' };
      }
      const artifact = new MarketplaceContractArtifactEntity();
      artifact.contractId = operation.resourceId;
      artifact.providerOperationId = operation.id;
      artifact.snapshotRevision = 1;
      artifact.templateVersion = marketplaceContractTemplateVersion;
      artifact.snapshotFingerprint = snapshotFingerprint;
      artifact.checksumSha256 = checksum;
      artifact.mediaType = 'application/pdf';
      artifact.byteSize = content.byteLength;
      artifact.storageReference = storageReference;
      artifact.providerMode = operation.providerMode;
      artifact.providerName = operation.providerName;
      artifact.watermark = operation.providerMode === 'mock' ? marketplaceMockContractWatermark : null;
      artifact.content = operation.providerMode === 'mock' ? Buffer.from(content) : null;
      em.persist(artifact);
      await appendEvent(em, operation.resourceId, {
        actorParty: authorization.value.party,
        actorTenantId: owner.tenantId,
        actorUserId: owner.userId,
        category: 'artifact',
        eventType: 'artifact_stored',
        providerMode: operation.providerMode,
        providerName: operation.providerName,
        providerOperationId: operation.id,
        providerReference: operation.providerReference ?? undefined,
        safeReceipt: receipt,
      });
      await em.flush();
      return ok(toArtifact(artifact));
    });
  }

  async findArtifact(
    owner: AgriTechOwner,
    contractId: string,
  ): Promise<OperationResult<MarketplaceContractArtifact | undefined>> {
    const lifecycle = await this.em.transactional(async (em) => {
      const authorization = await lockAuthorizedContract(em, owner, contractId);
      if (authorization.status !== 'ok') {
        return authorization;
      }
      const artifact = await em.findOne(MarketplaceContractArtifactEntity, { contractId });
      return ok(artifact ? toArtifact(artifact) : undefined);
    });
    return lifecycle;
  }

  downloadArtifact(
    owner: AgriTechOwner,
    contractId: string,
  ): Promise<OperationResult<MarketplaceContractArtifactDownload>> {
    return this.em.transactional(async (em) => {
      const authorization = await lockAuthorizedContract(em, owner, contractId);
      if (authorization.status !== 'ok') {
        return authorization;
      }
      const artifact = await em.findOne(MarketplaceContractArtifactEntity, { contractId });
      if (!artifact) {
        return { status: 'not_found' };
      }
      if (!artifact.content) {
        return { status: 'invalid_state', field: 'content' };
      }
      return ok({
        artifact: toArtifact(artifact),
        content: new Uint8Array(artifact.content),
        fileName: `dehqonhub-contract-${contractId}.pdf`,
      });
    });
  }

  prepareSignature(
    owner: AgriTechOwner,
    contractId: string,
  ): Promise<OperationResult<PreparedMarketplaceContractSignature>> {
    return this.em.transactional(async (em) => {
      const authorization = await lockAuthorizedContract(em, owner, contractId);
      if (authorization.status !== 'ok') {
        return authorization;
      }
      if (!(await authorizeBoth(em, authorization.value.contract))) {
        return { status: 'forbidden', field: 'organization' };
      }
      const artifact = await em.findOne(MarketplaceContractArtifactEntity, { contractId });
      const settlement = await em.findOne(MarketplaceContractSettlementEntity, { contractId });
      if (!artifact || !settlement) {
        return { status: 'invalid_state', field: 'artifact' };
      }
      if (!['draft', 'signed'].includes(authorization.value.contract.status)) {
        return { status: 'invalid_state', field: 'status' };
      }
      const existing = await em.findOne(MarketplaceContractSignatureEntity, {
        contractId,
        party: authorization.value.party,
      });
      return ok({
        artifact: toArtifact(artifact),
        ...(existing
          ? {
              existingSignature: {
                artifactChecksum: existing.artifactChecksum,
                artifactId: existing.artifactId,
                contractId: existing.contractId,
                id: existing.id,
                party: existing.party,
                partyPartnerId: existing.partyPartnerId,
                partyTenantId: existing.partyTenantId,
                partyUserId: existing.partyUserId,
                providerMode: existing.providerMode,
                providerName: existing.providerName,
                providerReference: existing.providerReference,
                safeReceipt: existing.safeReceipt,
                signedAt: existing.signedAt,
                simulation: existing.providerMode === 'mock',
                snapshotRevision: existing.snapshotRevision,
              },
            }
          : {}),
        party: authorization.value.party,
        settlement: toSettlement(settlement),
      });
    });
  }

  completeSignature(owner: AgriTechOwner, operationId: string): Promise<OperationResult<MarketplaceContractLifecycle>> {
    // eslint-disable-next-line sonarjs/cognitive-complexity -- signature validation and second-party inventory commit are one atomic boundary
    return this.em.transactional(async (em) => {
      const operation = await em.findOne(
        MarketplaceProviderOperationEntity,
        { id: operationId, tenantId: owner.tenantId, userId: owner.userId },
        { lockMode: LockMode.PESSIMISTIC_WRITE },
      );
      if (!operation || !isSucceededOperation(operation, 'qualified_signature')) {
        return { status: 'not_found' };
      }
      const authorization = await lockAuthorizedContract(em, owner, operation.resourceId);
      if (authorization.status !== 'ok') {
        return authorization;
      }
      const { contract, partnerId, party } = authorization.value;
      if (operation.actorType !== actorTypeFor(party) || operation.resourceRevision !== 1) {
        return { status: 'forbidden' };
      }
      const alreadyApplied = await em.findOne(MarketplaceContractLifecycleEventEntity, {
        providerOperationId: operation.id,
      });
      if (alreadyApplied) {
        return this.lifecycleIn(em, contract, party);
      }
      if (!(await authorizeBoth(em, contract))) {
        return { status: 'forbidden', field: 'organization' };
      }
      const artifact = await em.findOne(MarketplaceContractArtifactEntity, { contractId: contract.id });
      if (!artifact) {
        return { status: 'invalid_state', field: 'artifact' };
      }
      const receipt = operation.receipt;
      const resultSnapshot = operation.resultSnapshot;
      if (!receipt || !resultSnapshot) {
        return { status: 'conflict', field: 'providerOperation' };
      }
      if (
        operation.requestDescriptor.action !== 'qualify-contract-signature' ||
        descriptorFingerprint(operation) !== signatureParametersFingerprint(artifact.checksumSha256, party) ||
        resultSnapshot.outcome !== 'signature_recorded' ||
        receipt.artifactChecksum !== artifact.checksumSha256 ||
        receipt.party !== party ||
        receipt.snapshotRevision !== 1
      ) {
        return { status: 'conflict', field: 'providerOperation' };
      }
      const existing = await em.findOne(MarketplaceContractSignatureEntity, { contractId: contract.id, party });
      if (existing) {
        return { status: 'conflict', field: 'signature' };
      }
      const signature = new MarketplaceContractSignatureEntity();
      signature.contractId = contract.id;
      signature.artifactId = artifact.id;
      signature.providerOperationId = operation.id;
      signature.party = party;
      signature.partyTenantId = owner.tenantId;
      signature.partyUserId = owner.userId;
      signature.partyPartnerId = partnerId;
      signature.artifactChecksum = artifact.checksumSha256;
      signature.providerMode = operation.providerMode;
      signature.providerName = operation.providerName;
      signature.providerReference = operation.providerReference ?? '';
      signature.safeReceipt = receipt;
      signature.signedAt = new Date(String(resultSnapshot.completedAt));
      em.persist(signature);
      const otherSignature = await em.findOne(MarketplaceContractSignatureEntity, {
        contractId: contract.id,
        party: party === 'buyer' ? 'seller' : 'buyer',
      });
      if (otherSignature) {
        if (otherSignature.artifactChecksum !== artifact.checksumSha256) {
          return { status: 'conflict', field: 'artifactChecksum' };
        }
        const inventory = await commitContractInventory(em, contract);
        if (inventory.status !== 'ok') {
          return inventory;
        }
      }
      const now = signature.signedAt;
      if (party === 'buyer') {
        contract.buyerSignedAt = now;
      } else {
        contract.sellerSignedAt = now;
      }
      if (otherSignature) {
        contract.status = 'active';
        contract.signedAt = now;
      } else {
        contract.status = 'signed';
      }
      contract.updatedAt = now;
      await appendEvent(em, contract.id, {
        actorParty: party,
        actorTenantId: owner.tenantId,
        actorUserId: owner.userId,
        category: 'signature',
        eventType: 'signature_recorded',
        providerMode: operation.providerMode,
        providerName: operation.providerName,
        providerOperationId: operation.id,
        providerReference: operation.providerReference ?? undefined,
        safeReceipt: receipt,
      });
      await em.flush();
      return this.lifecycleIn(em, contract, party);
    });
  }

  recordFactoringConsent(
    owner: AgriTechOwner,
    contractId: string,
    idempotencyKey: string,
    requestFingerprint: string,
  ): Promise<OperationResult<MarketplaceContractLifecycle>> {
    return this.em.transactional(async (em) => {
      const authorization = await lockAuthorizedContract(em, owner, contractId);
      if (authorization.status !== 'ok') {
        return authorization;
      }
      const { contract, party } = authorization.value;
      const eventType = party === 'buyer' ? 'buyer_consented' : 'seller_consented';
      const replay = await em.findOne(MarketplaceContractLifecycleEventEntity, {
        actorTenantId: owner.tenantId,
        actorUserId: owner.userId,
        contractId,
        eventType,
        idempotencyKey,
      });
      if (replay) {
        return replay.requestFingerprint === requestFingerprint
          ? this.lifecycleIn(em, contract, party)
          : { status: 'conflict', field: 'idempotencyKey' };
      }
      if (contract.status !== 'active' || !(await authorizeBoth(em, contract))) {
        return { status: 'invalid_state', field: 'status' };
      }
      const settlement = await em.findOne(
        MarketplaceContractSettlementEntity,
        { contractId },
        { lockMode: LockMode.PESSIMISTIC_WRITE },
      );
      if (!settlement || settlement.kind !== 'factoring' || settlement.status !== 'awaiting_consents') {
        return { status: 'invalid_state', field: 'settlement' };
      }
      const now = new Date();
      if (party === 'buyer') {
        if (settlement.buyerConsentedAt) {
          return this.lifecycleIn(em, contract, party);
        }
        settlement.buyerConsentedAt = now;
      } else {
        if (settlement.sellerConsentedAt) {
          return this.lifecycleIn(em, contract, party);
        }
        settlement.sellerConsentedAt = now;
      }
      if (settlement.buyerConsentedAt && settlement.sellerConsentedAt) {
        settlement.status = 'ready_to_request';
      }
      settlement.revision += 1;
      settlement.updatedAt = now;
      await appendEvent(em, contractId, {
        actorParty: party,
        actorTenantId: owner.tenantId,
        actorUserId: owner.userId,
        category: 'settlement',
        eventType,
        idempotencyKey,
        requestFingerprint,
      });
      await em.flush();
      return this.lifecycleIn(em, contract, party);
    });
  }

  prepareSettlementProviderCommand(
    owner: AgriTechOwner,
    contractId: string,
    command: MarketplaceSettlementProviderCommand,
  ): Promise<OperationResult<PreparedMarketplaceSettlementProviderCommand>> {
    return this.em.transactional(async (em) => {
      const authorization = await lockAuthorizedContract(em, owner, contractId);
      if (authorization.status !== 'ok') {
        return authorization;
      }
      const { contract, party } = authorization.value;
      if (contract.status !== 'active' || !(await authorizeBoth(em, contract))) {
        return { status: 'invalid_state', field: 'status' };
      }
      const settlement = await em.findOne(
        MarketplaceContractSettlementEntity,
        { contractId },
        { lockMode: LockMode.PESSIMISTIC_WRITE },
      );
      if (!settlement || !this.isSettlementCommandAllowed(settlement, party, command)) {
        return { status: 'invalid_state', field: 'command' };
      }
      return ok({
        amountUzs: Number(settlement.amountUzs),
        command,
        expectedRevision: settlement.revision,
        party,
        settlement: toSettlement(settlement),
      });
    });
  }

  completeSettlementProviderCommand(
    owner: AgriTechOwner,
    operationId: string,
  ): Promise<OperationResult<MarketplaceContractLifecycle>> {
    // eslint-disable-next-line sonarjs/cognitive-complexity -- ordered settlement transitions and provider evidence must commit atomically
    return this.em.transactional(async (em) => {
      const operation = await em.findOne(
        MarketplaceProviderOperationEntity,
        { id: operationId, tenantId: owner.tenantId, userId: owner.userId },
        { lockMode: LockMode.PESSIMISTIC_WRITE },
      );
      if (
        !operation ||
        (!isSucceededOperation(operation, 'direct_payment') && !isSucceededOperation(operation, 'factoring'))
      ) {
        return { status: 'not_found' };
      }
      const receipt = operation.receipt;
      const resultSnapshot = operation.resultSnapshot;
      if (!receipt || !resultSnapshot) {
        return { status: 'conflict', field: 'providerOperation' };
      }
      const authorization = await lockAuthorizedContract(em, owner, operation.resourceId);
      if (authorization.status !== 'ok') {
        return authorization;
      }
      const { contract, party } = authorization.value;
      if (operation.actorType !== actorTypeFor(party)) {
        return { status: 'forbidden' };
      }
      const replay = await em.findOne(MarketplaceContractLifecycleEventEntity, { providerOperationId: operation.id });
      if (replay) {
        return this.lifecycleIn(em, contract, party);
      }
      const settlement = await em.findOne(
        MarketplaceContractSettlementEntity,
        { contractId: contract.id },
        { lockMode: LockMode.PESSIMISTIC_WRITE },
      );
      if (!settlement || settlement.revision !== operation.resourceRevision) {
        return { status: 'conflict', field: 'revision' };
      }
      const command = this.commandFor(settlement, party);
      if (
        !command ||
        descriptorFingerprint(operation) !==
          settlementParametersFingerprint(Number(settlement.amountUzs), command, settlement.revision) ||
        !operation.providerEventId
      ) {
        return { status: 'conflict', field: 'providerOperation' };
      }
      const now = new Date(String(resultSnapshot.completedAt));
      let eventType: MarketplaceContractSettlementEvent['eventType'];
      let settlementFinished = false;
      if (settlement.kind === 'direct_payment') {
        if (operation.capability !== 'direct_payment' || resultSnapshot.outcome !== command) {
          return { status: 'conflict', field: 'providerOperation' };
        }
        if (command === 'confirm_buyer_payment') {
          settlement.status = 'buyer_confirmed';
          eventType = 'buyer_payment_confirmed';
        } else {
          settlement.status = 'seller_received';
          eventType = 'seller_receipt_confirmed';
          settlementFinished = true;
        }
      } else {
        if (operation.capability !== 'factoring') {
          return { status: 'conflict', field: 'providerOperation' };
        }
        if (command === 'request_decision') {
          await appendEvent(em, contract.id, {
            actorParty: party,
            actorTenantId: owner.tenantId,
            actorUserId: owner.userId,
            category: 'settlement',
            eventType: 'factoring_requested',
            idempotencyKey: operation.idempotencyKey,
            requestFingerprint: operation.requestFingerprint,
          });
          if (resultSnapshot.outcome === 'approved') {
            settlement.status = 'approved';
            eventType = 'factoring_approved';
          } else if (resultSnapshot.outcome === 'rejected') {
            settlement.status = 'rejected';
            eventType = 'factoring_rejected';
          } else {
            return { status: 'conflict', field: 'providerOperation' };
          }
        } else if (command === 'record_seller_payout' && resultSnapshot.outcome === command) {
          settlement.status = 'seller_paid';
          eventType = 'seller_paid';
        } else if (command === 'record_buyer_repayment' && resultSnapshot.outcome === command) {
          settlement.status = 'buyer_repaid';
          eventType = 'buyer_repaid';
        } else if (command === 'close' && resultSnapshot.outcome === command) {
          settlement.status = 'closed';
          eventType = 'factoring_closed';
          settlementFinished = true;
        } else {
          return { status: 'conflict', field: 'providerOperation' };
        }
      }
      settlement.latestProviderMode = operation.providerMode;
      settlement.reconciliationState = operation.reconciliationRequired ? 'required' : 'clear';
      settlement.reconciliationReason = operation.reconciliationReason;
      settlement.revision += 1;
      settlement.updatedAt = now;
      await appendEvent(em, contract.id, {
        actorParty: party,
        actorTenantId: owner.tenantId,
        actorUserId: owner.userId,
        category: 'settlement',
        eventType,
        providerEventId: operation.providerEventId,
        providerMode: operation.providerMode,
        providerName: operation.providerName,
        providerOperationId: operation.id,
        providerReference: operation.providerReference ?? undefined,
        safeReceipt: receipt,
      });
      if (settlementFinished) {
        const fulfillment = await em.findOne(
          MarketplaceContractFulfillmentEntity,
          { contractId: contract.id },
          { lockMode: LockMode.PESSIMISTIC_WRITE },
        );
        if (!fulfillment || fulfillment.status !== 'awaiting_settlement') {
          return { status: 'invalid_state', field: 'fulfillment' };
        }
        fulfillment.status = 'ready';
        fulfillment.revision += 1;
        fulfillment.updatedAt = now;
        await appendEvent(em, contract.id, {
          actorParty: party,
          actorTenantId: owner.tenantId,
          actorUserId: owner.userId,
          category: 'fulfillment',
          eventType: 'fulfillment_ready',
        });
      }
      await em.flush();
      return this.lifecycleIn(em, contract, party);
    });
  }

  transitionFulfillment(
    owner: AgriTechOwner,
    contractId: string,
    command: MarketplaceContractFulfillmentCommand,
    idempotencyKey: string,
    requestFingerprint: string,
  ): Promise<OperationResult<MarketplaceContractLifecycle>> {
    // eslint-disable-next-line sonarjs/cognitive-complexity -- fulfillment, commission, eligibility, and intent writes share one authoritative transaction
    return this.em.transactional(async (em) => {
      const authorization = await lockAuthorizedContract(em, owner, contractId);
      if (authorization.status !== 'ok') {
        return authorization;
      }
      const { contract, party } = authorization.value;
      const eventType = fulfillmentEventType(command);
      const replay = await em.findOne(MarketplaceContractLifecycleEventEntity, {
        actorTenantId: owner.tenantId,
        actorUserId: owner.userId,
        contractId,
        eventType,
        idempotencyKey,
      });
      if (replay) {
        if (replay.requestFingerprint !== requestFingerprint) {
          return { status: 'conflict', field: 'idempotencyKey' };
        }
        return this.lifecycleIn(em, contract, party);
      }
      const fulfillment = await em.findOne(
        MarketplaceContractFulfillmentEntity,
        { contractId },
        { lockMode: LockMode.PESSIMISTIC_WRITE },
      );
      const allowed =
        (command === 'start' && party === 'seller' && fulfillment?.status === 'ready') ||
        (command === 'mark_delivered' && party === 'seller' && fulfillment?.status === 'in_progress') ||
        (command === 'accept_delivery' && party === 'buyer' && fulfillment?.status === 'delivered');
      if (!fulfillment || !allowed || contract.status !== 'active') {
        return { status: 'invalid_state', field: 'command' };
      }
      const now = new Date();
      if (command === 'start') {
        fulfillment.status = 'in_progress';
        fulfillment.startedAt = now;
      } else if (command === 'mark_delivered') {
        fulfillment.status = 'delivered';
        fulfillment.deliveredAt = now;
      } else {
        const policy = await em.findOne(
          MarketplaceCommissionRatePolicyEntity,
          { status: 'active' },
          { lockMode: LockMode.PESSIMISTIC_READ },
        );
        // Commission policy applies to the frozen merchandise line total. Delivery is a separately negotiated field.
        const baseAmountUzs = Number(contract.amountUzs);
        const lineBaseAmountUzs = contract.lines.reduce((sum, line) => sum + line.lineTotalUzs, 0);
        if (
          !policy ||
          !Number.isSafeInteger(baseAmountUzs) ||
          baseAmountUzs <= 0 ||
          lineBaseAmountUzs !== baseAmountUzs
        ) {
          return { status: 'invalid_state', field: 'commissionPolicy' };
        }
        fulfillment.status = 'completed';
        fulfillment.completedAt = now;
        contract.status = 'completed';
        contract.updatedAt = now;
        const commission = new MarketplaceContractCommissionEntity();
        commission.contractId = contractId;
        commission.rateVersion = policy.version;
        commission.rateSnapshot = { ...policy.rateSnapshot };
        commission.baseAmountUzs = baseAmountUzs;
        commission.amountUzs = Math.floor(
          contract.lines.reduce((sum, line) => sum + line.lineTotalUzs * policy.rateSnapshot[line.sourceKind], 0) /
            10_000,
        );
        em.persist(commission);
        const reviewableLines = new Map(
          contract.lines
            .filter(
              (line): line is ContractLine & { sourceKind: 'produce' | 'product' } =>
                line.sourceKind === 'product' || line.sourceKind === 'produce',
            )
            .map((line) => [`${line.sourceKind}:${line.sourceId}`, line]),
        );
        if (!contract.buyerPartnerId || !contract.sellerTenantId || !contract.sellerPartnerId) {
          return { status: 'invalid_state', field: 'contractParties' };
        }
        for (const line of reviewableLines.values()) {
          const eligibility = new MarketplaceContractReviewEligibilityEntity();
          eligibility.contractId = contractId;
          eligibility.buyerTenantId = contract.tenantId;
          eligibility.buyerUserId = contract.buyerUserId;
          eligibility.buyerPartnerId = contract.buyerPartnerId;
          eligibility.sellerTenantId = contract.sellerTenantId;
          eligibility.sellerPartnerId = contract.sellerPartnerId;
          eligibility.sourceKind = line.sourceKind;
          eligibility.sourceId = line.sourceId;
          eligibility.sourcePublicationId = line.sourcePublicationId;
          eligibility.createdAt = now;
          em.persist(eligibility);
        }
      }
      fulfillment.revision += 1;
      fulfillment.updatedAt = now;
      await appendEvent(em, contractId, {
        actorParty: party,
        actorTenantId: owner.tenantId,
        actorUserId: owner.userId,
        category: command === 'accept_delivery' ? 'completion' : 'fulfillment',
        eventType,
        idempotencyKey,
        requestFingerprint,
      });
      await em.flush();
      return this.lifecycleIn(em, contract, party);
    });
  }

  openDispute(
    owner: AgriTechOwner,
    contractId: string,
    reason: MarketplaceContractDisputeReason,
    idempotencyKey: string,
    requestFingerprint: string,
  ): Promise<OperationResult<MarketplaceContractLifecycle>> {
    return this.em.transactional(async (em) => {
      const authorization = await lockAuthorizedContract(em, owner, contractId);
      if (authorization.status !== 'ok') {
        return authorization;
      }
      const { contract, party } = authorization.value;
      const replay = await em.findOne(MarketplaceContractLifecycleEventEntity, {
        actorTenantId: owner.tenantId,
        actorUserId: owner.userId,
        contractId,
        eventType: 'dispute_opened',
        idempotencyKey,
      });
      if (replay) {
        return replay.requestFingerprint === requestFingerprint
          ? this.lifecycleIn(em, contract, party)
          : { status: 'conflict', field: 'idempotencyKey' };
      }
      const fulfillment = await em.findOne(
        MarketplaceContractFulfillmentEntity,
        { contractId },
        { lockMode: LockMode.PESSIMISTIC_WRITE },
      );
      if (!fulfillment || !['in_progress', 'delivered'].includes(fulfillment.status)) {
        return { status: 'invalid_state', field: 'fulfillment' };
      }
      if (await em.findOne(MarketplaceContractDisputeEntity, { contractId })) {
        return { status: 'conflict', field: 'dispute' };
      }
      const now = new Date();
      const dispute = new MarketplaceContractDisputeEntity();
      dispute.contractId = contractId;
      dispute.openedByParty = party;
      dispute.openedByTenantId = owner.tenantId;
      dispute.openedByUserId = owner.userId;
      dispute.reason = reason;
      dispute.previousFulfillmentStatus = fulfillment.status as 'in_progress' | 'delivered';
      dispute.createdAt = now;
      em.persist(dispute);
      fulfillment.status = 'disputed';
      fulfillment.revision += 1;
      fulfillment.updatedAt = now;
      await appendEvent(em, contractId, {
        actorParty: party,
        actorTenantId: owner.tenantId,
        actorUserId: owner.userId,
        category: 'dispute',
        eventType: 'dispute_opened',
        idempotencyKey,
        requestFingerprint,
      });
      await em.flush();
      return this.lifecycleIn(em, contract, party);
    });
  }

  prepareDisputeEvidence(
    owner: AgriTechOwner,
    contractId: string,
  ): Promise<OperationResult<{ disputeId: string; disputeRevision: number; party: MarketplaceContractParty }>> {
    return this.em.transactional(async (em) => {
      const authorization = await lockAuthorizedContract(em, owner, contractId);
      if (authorization.status !== 'ok') {
        return authorization;
      }
      const dispute = await em.findOne(
        MarketplaceContractDisputeEntity,
        { contractId },
        { lockMode: LockMode.PESSIMISTIC_WRITE },
      );
      if (!dispute) {
        return { status: 'not_found', field: 'dispute' };
      }
      if (dispute.status !== 'open') {
        return { status: 'conflict', field: 'dispute' };
      }
      return ok({ disputeId: dispute.id, disputeRevision: dispute.revision, party: authorization.value.party });
    });
  }

  completeDisputeEvidence(
    owner: AgriTechOwner,
    operationId: string,
    metadata: MarketplaceDisputeEvidenceMetadata,
  ): Promise<OperationResult<MarketplaceContractDisputeEvidence>> {
    return this.em.transactional(async (em) => {
      const operation = await em.findOne(
        MarketplaceProviderOperationEntity,
        {
          capability: 'dispute_evidence_storage',
          id: operationId,
          resourceType: 'contract',
          status: 'succeeded',
          tenantId: owner.tenantId,
          userId: owner.userId,
        },
        { lockMode: LockMode.PESSIMISTIC_WRITE },
      );
      if (!operation) {
        return { status: 'not_found', field: 'providerOperation' };
      }
      const existing = await em.findOne(MarketplaceContractDisputeEvidenceEntity, { providerOperationId: operationId });
      if (existing) {
        return ok(toDisputeEvidence(existing));
      }
      const authorization = await lockAuthorizedContract(em, owner, operation.resourceId);
      if (authorization.status !== 'ok') {
        return authorization;
      }
      if (actorTypeFor(authorization.value.party) !== operation.actorType) {
        return { status: 'forbidden', field: 'party' };
      }
      const dispute = await em.findOne(
        MarketplaceContractDisputeEntity,
        { contractId: operation.resourceId },
        { lockMode: LockMode.PESSIMISTIC_WRITE },
      );
      if (!dispute || dispute.status !== 'open') {
        return { status: 'conflict', field: 'dispute' };
      }
      if (dispute.revision !== operation.resourceRevision) {
        return { status: 'conflict', field: 'resourceRevision' };
      }
      const descriptor = operation.requestDescriptor;
      if (
        !('parametersFingerprint' in descriptor) ||
        descriptor.parametersFingerprint !== marketplaceProviderFingerprint(metadata)
      ) {
        return { status: 'conflict', field: 'requestDescriptor' };
      }
      const receipt = operation.receipt;
      const storageReference = receipt?.storageReference;
      if (
        !operation.providerReference ||
        !receipt ||
        typeof storageReference !== 'string' ||
        storageReference.length < 1 ||
        receipt.byteSize !== metadata.byteSize ||
        receipt.checksumSha256 !== metadata.checksumSha256 ||
        receipt.mediaType !== metadata.mediaType ||
        receipt.fileName !== metadata.fileName
      ) {
        return { status: 'invalid_state', field: 'providerReceipt' };
      }
      const latest = await em.findOne(
        MarketplaceContractDisputeEvidenceEntity,
        { disputeId: dispute.id },
        { orderBy: { revision: 'DESC' } },
      );
      const evidence = new MarketplaceContractDisputeEvidenceEntity();
      evidence.contractId = operation.resourceId;
      evidence.disputeId = dispute.id;
      evidence.providerOperationId = operation.id;
      evidence.disputeRevision = dispute.revision;
      evidence.revision = (latest?.revision ?? 0) + 1;
      evidence.uploadedByParty = authorization.value.party;
      evidence.uploadedByTenantId = owner.tenantId;
      evidence.uploadedByUserId = owner.userId;
      evidence.fileName = metadata.fileName;
      evidence.mediaType = metadata.mediaType;
      evidence.byteSize = metadata.byteSize;
      evidence.checksumSha256 = metadata.checksumSha256;
      evidence.storageReference = storageReference;
      evidence.providerMode = operation.providerMode;
      evidence.providerName = operation.providerName;
      evidence.providerReference = operation.providerReference;
      evidence.createdAt = new Date();
      em.persist(evidence);
      await appendEvent(em, operation.resourceId, {
        actorParty: authorization.value.party,
        actorTenantId: owner.tenantId,
        actorUserId: owner.userId,
        category: 'dispute',
        eventType: 'dispute_evidence_stored',
        idempotencyKey: operation.idempotencyKey,
        providerMode: operation.providerMode,
        providerName: operation.providerName,
        providerOperationId: operation.id,
        providerReference: operation.providerReference,
        requestFingerprint: operation.requestFingerprint,
        safeReceipt: receipt,
      });
      await em.flush();
      return ok(toDisputeEvidence(evidence));
    });
  }

  resolveDispute(
    admin: AgriTechOwner,
    contractId: string,
    decision: 'dismissed' | 'upheld_cancelled',
    evidenceIds: string[],
    evidenceRevision: number,
    outcomeNote: string,
    idempotencyKey: string,
    requestFingerprint: string,
  ): Promise<OperationResult<MarketplaceContractLifecycle>> {
    return this.em.transactional(async (em) => {
      const contract = await em.findOne(
        ContractEntity,
        { bindingStatus: 'resolved', id: contractId },
        { lockMode: LockMode.PESSIMISTIC_WRITE },
      );
      if (!contract) {
        return { status: 'not_found' };
      }
      const dispute = await em.findOne(
        MarketplaceContractDisputeEntity,
        { contractId },
        { lockMode: LockMode.PESSIMISTIC_WRITE },
      );
      const fulfillment = await em.findOne(
        MarketplaceContractFulfillmentEntity,
        { contractId },
        { lockMode: LockMode.PESSIMISTIC_WRITE },
      );
      if (!dispute || !fulfillment) {
        return { status: 'invalid_state', field: 'dispute' };
      }
      if (dispute.status === 'resolved') {
        return dispute.resolutionIdempotencyKey === idempotencyKey &&
          dispute.resolutionRequestFingerprint === requestFingerprint
          ? this.lifecycleIn(em, contract, 'buyer')
          : { status: 'conflict', field: 'idempotencyKey' };
      }
      if (fulfillment.status !== 'disputed') {
        return { status: 'invalid_state', field: 'fulfillment' };
      }
      const outcome = outcomeNote.trim();
      const selectedEvidenceIds = [...new Set(evidenceIds)].sort((left, right) => left.localeCompare(right, 'en'));
      if (
        selectedEvidenceIds.length < 1 ||
        selectedEvidenceIds.length > 20 ||
        selectedEvidenceIds.length !== evidenceIds.length ||
        !Number.isSafeInteger(evidenceRevision) ||
        evidenceRevision < 1 ||
        !outcome ||
        outcome.length > 1000
      ) {
        return { status: 'invalid_state', field: 'resolution' };
      }
      const allEvidence = await em.find(
        MarketplaceContractDisputeEvidenceEntity,
        { disputeId: dispute.id },
        { lockMode: LockMode.PESSIMISTIC_WRITE, orderBy: { revision: 'ASC' } },
      );
      const selectedEvidence = allEvidence.filter((evidence) => selectedEvidenceIds.includes(evidence.id));
      if (
        selectedEvidence.length !== selectedEvidenceIds.length ||
        allEvidence.length < 1 ||
        allEvidence.at(-1)?.revision !== evidenceRevision
      ) {
        return { status: 'conflict', field: 'evidenceRevision' };
      }
      const unresolvedProviderOperations = await em.count(MarketplaceProviderOperationEntity, {
        capability: 'dispute_evidence_storage',
        resourceId: contractId,
        $or: [
          { status: 'started' },
          { reconciliationRequired: true },
          {
            id: { $nin: allEvidence.map((evidence) => evidence.providerOperationId) },
            status: 'succeeded',
          },
        ],
      });
      if (unresolvedProviderOperations > 0) {
        return { status: 'conflict', field: 'evidenceReconciliation' };
      }
      const now = new Date();
      for (const evidence of selectedEvidence) {
        const selection = new MarketplaceContractDisputeResolutionEvidenceEntity();
        selection.disputeId = dispute.id;
        selection.evidenceId = evidence.id;
        selection.evidenceRevision = evidence.revision;
        selection.createdAt = now;
        em.persist(selection);
      }
      dispute.status = 'resolved';
      dispute.decision = decision;
      dispute.resolutionEvidenceRevision = evidenceRevision;
      dispute.outcomeNote = outcome;
      dispute.resolvedByAdminId = admin.userId;
      dispute.resolvedAt = now;
      dispute.resolutionIdempotencyKey = idempotencyKey;
      dispute.resolutionRequestFingerprint = requestFingerprint;
      dispute.revision += 1;
      fulfillment.status = decision === 'dismissed' ? dispute.previousFulfillmentStatus : 'cancelled';
      fulfillment.revision += 1;
      fulfillment.updatedAt = now;
      if (decision === 'upheld_cancelled') {
        contract.status = 'cancelled';
        contract.updatedAt = now;
      }
      const reputationSignal = new MarketplaceContractReputationSignalEntity();
      reputationSignal.contractId = contractId;
      reputationSignal.disputeId = dispute.id;
      reputationSignal.disputeRevision = dispute.revision;
      reputationSignal.subjectParty = reputationSubjectParty(decision, dispute.openedByParty);
      reputationSignal.outcome = decision === 'upheld_cancelled' ? 'dispute_upheld' : 'dispute_dismissed';
      reputationSignal.reason = dispute.reason;
      reputationSignal.createdAt = now;
      em.persist(reputationSignal);
      await appendEvent(em, contractId, {
        actorParty: 'admin',
        actorTenantId: admin.tenantId,
        actorUserId: admin.userId,
        category: 'dispute',
        eventType: 'dispute_resolved',
        idempotencyKey,
        requestFingerprint,
      });
      await em.flush();
      return this.lifecycleIn(em, contract, 'buyer');
    });
  }

  listCommissionRatePolicies(): Promise<MarketplaceCommissionRatePolicy[]> {
    return this.em.transactional(async (em) =>
      (await em.find(MarketplaceCommissionRatePolicyEntity, {}, { orderBy: { createdAt: 'DESC' } })).map((policy) => ({
        createdAt: policy.createdAt,
        createdByAdminId: policy.createdByAdminId,
        id: policy.id,
        rateSnapshot: { ...policy.rateSnapshot },
        ...(policy.retiredAt ? { retiredAt: policy.retiredAt } : {}),
        status: policy.status,
        version: policy.version,
      })),
    );
  }

  activateCommissionRatePolicy(
    admin: AgriTechOwner,
    version: string,
    rateSnapshot: Record<'produce' | 'product' | 'request', number>,
    idempotencyKey: string,
    requestFingerprint: string,
  ): Promise<OperationResult<MarketplaceCommissionRatePolicy>> {
    return this.em.transactional(async (em) => {
      await em.execute('select pg_advisory_xact_lock(hashtext(?))', ['marketplace-commission-rate-policy']);
      const existing = await em.findOne(
        MarketplaceCommissionRatePolicyEntity,
        { activationIdempotencyKey: idempotencyKey },
        { lockMode: LockMode.PESSIMISTIC_WRITE },
      );
      if (existing) {
        if (existing.activationRequestFingerprint !== requestFingerprint) {
          return { status: 'conflict', field: 'idempotencyKey' };
        }
        return ok({
          createdAt: existing.createdAt,
          createdByAdminId: existing.createdByAdminId,
          id: existing.id,
          rateSnapshot: { ...existing.rateSnapshot },
          ...(existing.retiredAt ? { retiredAt: existing.retiredAt } : {}),
          status: existing.status,
          version: existing.version,
        });
      }
      if (
        !/^[a-z0-9][a-z0-9-]{2,49}$/.test(version) ||
        Object.values(rateSnapshot).some((rate) => !Number.isInteger(rate) || rate < 0 || rate > 1000)
      ) {
        return { status: 'invalid_state', field: 'ratePolicy' };
      }
      if (await em.findOne(MarketplaceCommissionRatePolicyEntity, { version })) {
        return { status: 'conflict', field: 'version' };
      }
      const active = await em.findOne(
        MarketplaceCommissionRatePolicyEntity,
        { status: 'active' },
        { lockMode: LockMode.PESSIMISTIC_WRITE },
      );
      if (active) {
        active.status = 'retired';
        active.retiredAt = new Date();
        await em.flush();
      }
      const policy = new MarketplaceCommissionRatePolicyEntity();
      policy.version = version;
      policy.rateSnapshot = { ...rateSnapshot };
      policy.createdByAdminId = admin.userId;
      policy.activationIdempotencyKey = idempotencyKey;
      policy.activationRequestFingerprint = requestFingerprint;
      em.persist(policy);
      await em.flush();
      return ok({
        createdAt: policy.createdAt,
        createdByAdminId: policy.createdByAdminId,
        id: policy.id,
        rateSnapshot: { ...policy.rateSnapshot },
        status: policy.status,
        version: policy.version,
      });
    });
  }

  /**
   * Reading a lifecycle that does not exist yet.
   *
   * Settlement and fulfillment rows are created when a contract is signed, so
   * every draft contract answers {@link lifecycleIn} with `invalid_state`. On a
   * command path that is the right answer - the command cannot run - but on a
   * plain read it made the API answer 400 for the ordinary case of a deal nobody
   * has signed yet, and a client cannot tell that apart from a malformed request:
   * the contract screen painted a generic failure with a retry button that could
   * never succeed. A read reports `not_found` instead, which is what a GET on an
   * absent sub-resource means and what the clients already render as "nothing
   * prepared yet".
   */
  private async readLifecycle(
    em: EntityManager,
    contract: ContractEntity,
    party: MarketplaceContractTimelineActor,
  ): Promise<OperationResult<MarketplaceContractLifecycle>> {
    const lifecycle = await this.lifecycleIn(em, contract, party);
    return lifecycle.status === 'invalid_state' ? { status: 'not_found' } : lifecycle;
  }

  getLifecycle(owner: AgriTechOwner, contractId: string): Promise<OperationResult<MarketplaceContractLifecycle>> {
    return this.em.transactional(async (em) => {
      const authorization = await lockAuthorizedContract(em, owner, contractId);
      return authorization.status === 'ok'
        ? this.readLifecycle(em, authorization.value.contract, authorization.value.party)
        : authorization;
    });
  }

  getLifecycleForAdmin(tenantId: string, contractId: string): Promise<OperationResult<MarketplaceContractLifecycle>> {
    return this.em.transactional(async (em) => {
      const contract = await em.findOne(ContractEntity, {
        bindingStatus: 'resolved',
        id: contractId,
        $or: [{ tenantId }, { sellerTenantId: tenantId }],
      });
      return contract ? this.readLifecycle(em, contract, 'admin') : { status: 'not_found' };
    });
  }

  private isSettlementCommandAllowed(
    settlement: MarketplaceContractSettlementEntity,
    party: MarketplaceContractParty,
    command: MarketplaceSettlementProviderCommand,
  ): boolean {
    if (settlement.kind === 'direct_payment') {
      return (
        (command === 'confirm_buyer_payment' &&
          party === 'buyer' &&
          settlement.status === 'awaiting_buyer_confirmation') ||
        (command === 'confirm_seller_receipt' && party === 'seller' && settlement.status === 'buyer_confirmed')
      );
    }
    return (
      (command === 'request_decision' && party === 'buyer' && settlement.status === 'ready_to_request') ||
      (command === 'record_seller_payout' && party === 'seller' && settlement.status === 'approved') ||
      (command === 'record_buyer_repayment' && party === 'buyer' && settlement.status === 'seller_paid') ||
      (command === 'close' && party === 'buyer' && settlement.status === 'buyer_repaid')
    );
  }

  private commandFor(
    settlement: MarketplaceContractSettlementEntity,
    party: MarketplaceContractParty,
  ): MarketplaceSettlementProviderCommand | undefined {
    const candidates: MarketplaceSettlementProviderCommand[] = [
      'confirm_buyer_payment',
      'confirm_seller_receipt',
      'request_decision',
      'record_seller_payout',
      'record_buyer_repayment',
      'close',
    ];
    return candidates.find((command) => this.isSettlementCommandAllowed(settlement, party, command));
  }

  // eslint-disable-next-line sonarjs/cognitive-complexity -- the repository aggregate is an explicit allowlist assembled from persisted lifecycle records
  private async lifecycleIn(
    em: EntityManager,
    contract: ContractEntity,
    party: MarketplaceContractTimelineActor,
  ): Promise<OperationResult<MarketplaceContractLifecycle>> {
    const [
      artifact,
      signatures,
      settlement,
      fulfillment,
      dispute,
      disputeEvidence,
      commission,
      timeline,
      notificationIntents,
      eligibilities,
      reputationSignals,
    ] = await Promise.all([
      em.findOne(MarketplaceContractArtifactEntity, { contractId: contract.id }),
      em.find(MarketplaceContractSignatureEntity, { contractId: contract.id }, { orderBy: { createdAt: 'ASC' } }),
      em.findOne(MarketplaceContractSettlementEntity, { contractId: contract.id }),
      em.findOne(MarketplaceContractFulfillmentEntity, { contractId: contract.id }),
      em.findOne(MarketplaceContractDisputeEntity, { contractId: contract.id }),
      em.find(MarketplaceContractDisputeEvidenceEntity, { contractId: contract.id }, { orderBy: { revision: 'ASC' } }),
      em.findOne(MarketplaceContractCommissionEntity, { contractId: contract.id }),
      em.find(MarketplaceContractLifecycleEventEntity, { contractId: contract.id }, { orderBy: { sequence: 'ASC' } }),
      em.find(
        MarketplaceContractNotificationIntentEntity,
        party === 'admin' ? { contractId: contract.id } : { contractId: contract.id, recipientParty: party },
        { orderBy: { createdAt: 'ASC' } },
      ),
      em.find(MarketplaceContractReviewEligibilityEntity, { contractId: contract.id }),
      em.find(MarketplaceContractReputationSignalEntity, { contractId: contract.id }),
    ]);
    if (!settlement || !fulfillment) {
      return { status: 'invalid_state', field: 'lifecycle' };
    }
    const settlementEventTypes = new Set([
      'buyer_consented',
      'seller_consented',
      'buyer_payment_confirmed',
      'seller_receipt_confirmed',
      'factoring_requested',
      'factoring_approved',
      'factoring_rejected',
      'seller_paid',
      'buyer_repaid',
      'factoring_closed',
    ]);
    return ok({
      ...(artifact ? { artifact: toArtifact(artifact) } : {}),
      ...(commission
        ? {
            commission: {
              amountUzs: Number(commission.amountUzs),
              baseAmountUzs: Number(commission.baseAmountUzs),
              contractId: commission.contractId,
              createdAt: commission.createdAt,
              currency: 'UZS',
              id: commission.id,
              rateSnapshot: commission.rateSnapshot,
              rateVersion: commission.rateVersion,
            },
          }
        : {}),
      contractId: contract.id,
      ...(dispute
        ? {
            dispute: {
              contractId: dispute.contractId,
              createdAt: dispute.createdAt,
              id: dispute.id,
              openedByParty: dispute.openedByParty,
              openedByTenantId: dispute.openedByTenantId,
              openedByUserId: dispute.openedByUserId,
              ...(dispute.decision ? { decision: dispute.decision } : {}),
              ...(dispute.resolutionEvidenceRevision ? { evidenceRevision: dispute.resolutionEvidenceRevision } : {}),
              ...(dispute.outcomeNote ? { outcomeNote: dispute.outcomeNote } : {}),
              reason: dispute.reason,
              ...(dispute.resolvedAt ? { resolvedAt: dispute.resolvedAt } : {}),
              ...(dispute.resolvedByAdminId ? { resolvedByAdminId: dispute.resolvedByAdminId } : {}),
              status: dispute.status,
            },
          }
        : {}),
      disputeEvidence: disputeEvidence.map(toDisputeEvidence),
      fulfillment: {
        ...(fulfillment.completedAt ? { completedAt: fulfillment.completedAt } : {}),
        contractId: fulfillment.contractId,
        createdAt: fulfillment.createdAt,
        ...(fulfillment.deliveredAt ? { deliveredAt: fulfillment.deliveredAt } : {}),
        id: fulfillment.id,
        revision: fulfillment.revision,
        ...(fulfillment.startedAt ? { startedAt: fulfillment.startedAt } : {}),
        status: fulfillment.status,
        updatedAt: fulfillment.updatedAt,
      },
      notificationIntents: notificationIntents.map((intent) => ({
        attempts: intent.attempts,
        channel: intent.channel,
        contractId: intent.contractId,
        createdAt: intent.createdAt,
        id: intent.id,
        ...(intent.lastAttemptAt ? { lastAttemptAt: intent.lastAttemptAt } : {}),
        recipientParty: intent.recipientParty,
        simulation: intent.simulation,
        status: intent.status,
      })),
      reviewEligibilities: eligibilities.map((eligibility) => ({
        buyerPartnerId: eligibility.buyerPartnerId,
        buyerTenantId: eligibility.buyerTenantId,
        buyerUserId: eligibility.buyerUserId,
        contractId: eligibility.contractId,
        createdAt: eligibility.createdAt,
        id: eligibility.id,
        sellerPartnerId: eligibility.sellerPartnerId,
        sellerTenantId: eligibility.sellerTenantId,
        sourceId: eligibility.sourceId,
        sourceKind: eligibility.sourceKind,
        sourcePublicationId: eligibility.sourcePublicationId,
      })),
      reputationSignals: reputationSignals.map((signal) => ({
        contractId: signal.contractId,
        createdAt: signal.createdAt,
        disputeId: signal.disputeId,
        disputeRevision: signal.disputeRevision,
        id: signal.id,
        impact: signal.impact,
        outcome: signal.outcome,
        reason: signal.reason,
        subjectParty: signal.subjectParty,
      })),
      settlement: toSettlement(settlement),
      settlementEvents: timeline
        .filter(
          (event) =>
            event.category === 'settlement' &&
            event.actorParty !== 'admin' &&
            settlementEventTypes.has(event.eventType),
        )
        .map((event) => ({
          actorParty: event.actorParty as MarketplaceContractParty,
          actorTenantId: event.actorTenantId,
          actorUserId: event.actorUserId,
          contractId: event.contractId,
          createdAt: event.createdAt,
          eventType: event.eventType as MarketplaceContractSettlementEvent['eventType'],
          id: event.id,
          ...(event.providerEventId ? { providerEventId: event.providerEventId } : {}),
          providerMode: event.providerMode,
          ...(event.providerName ? { providerName: event.providerName } : {}),
          ...(event.providerReference ? { providerReference: event.providerReference } : {}),
          ...(event.safeReceipt ? { safeReceipt: event.safeReceipt } : {}),
          sequence: event.sequence,
          simulation: event.providerMode === 'mock',
        })),
      signatures: signatures.map((signature) => ({
        artifactChecksum: signature.artifactChecksum,
        artifactId: signature.artifactId,
        contractId: signature.contractId,
        id: signature.id,
        party: signature.party,
        partyPartnerId: signature.partyPartnerId,
        partyTenantId: signature.partyTenantId,
        partyUserId: signature.partyUserId,
        providerMode: signature.providerMode,
        providerName: signature.providerName,
        providerReference: signature.providerReference,
        safeReceipt: signature.safeReceipt,
        signedAt: signature.signedAt,
        simulation: signature.providerMode === 'mock',
        snapshotRevision: signature.snapshotRevision,
      })),
      timeline: timeline.map((event) => ({
        actorParty: event.actorParty,
        actorTenantId: event.actorTenantId,
        actorUserId: event.actorUserId,
        category: event.category,
        contractId: event.contractId,
        createdAt: event.createdAt,
        eventType: event.eventType,
        id: event.id,
        providerMode: event.providerMode,
        sequence: event.sequence,
        simulation: event.providerMode === 'mock',
      })),
    });
  }
}
