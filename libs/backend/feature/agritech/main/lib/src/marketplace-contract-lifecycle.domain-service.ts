// @requirements REQ-AGRITECH-INTEGRATION-013 REQ-AGRITECH-STAGE2-017
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  ResourceNotFoundException,
} from '@app/backend-common-exception';
import {
  marketplaceProviderFingerprint,
  type AgriTechOwner,
  type MarketplaceContractArtifact,
  type MarketplaceContractArtifactDownload,
  type MarketplaceContractArtifactStorageProvider,
  type MarketplaceContractDisputeEvidence,
  type MarketplaceContractDisputeReason,
  type MarketplaceContractFulfillmentCommand,
  type MarketplaceContractLifecycle,
  type MarketplaceContractLifecycleRepository,
  type MarketplaceContractSettlementKind,
  type MarketplaceCommissionRateSnapshot,
  type MarketplaceDirectPaymentProvider,
  type MarketplaceDisputeEvidenceMediaType,
  type MarketplaceDisputeEvidenceStorageProvider,
  type MarketplaceFactoringProvider,
  type MarketplaceProviderCapability,
  type MarketplaceProviderIdentity,
  type MarketplaceProviderOperationCompletion,
  type MarketplaceProviderOperationRepository,
  type MarketplaceQualifiedSignatureProvider,
  type MarketplaceSettlementProviderCommand,
  type OperationResult,
} from '@app/backend-feature-agritech-shared';
import { maximumMarketplaceDisputeEvidenceBytes } from '@app/backend-feature-agritech-shared';
import { createHash } from 'node:crypto';
import { generateMarketplaceContractPdf } from './marketplace-contract-pdf';
import { MarketplaceProviderUnavailableException } from './marketplace-verification.domain-service';

export interface MarketplaceContractProviderTimeouts {
  artifactStorageTimeoutMs: number;
  directPaymentTimeoutMs: number;
  disputeEvidenceStorageTimeoutMs: number;
  factoringTimeoutMs: number;
  qualifiedSignatureTimeoutMs: number;
}

const defaultTimeouts: MarketplaceContractProviderTimeouts = {
  artifactStorageTimeoutMs: 10_000,
  directPaymentTimeoutMs: 10_000,
  disputeEvidenceStorageTimeoutMs: 10_000,
  factoringTimeoutMs: 10_000,
  qualifiedSignatureTimeoutMs: 10_000,
};

function hasUnsafeEvidenceFileNameCharacter(value: string): boolean {
  return [...value].some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return (
      character === '/' ||
      character === '\\' ||
      codePoint <= 0x1f ||
      codePoint === 0x7f ||
      (codePoint >= 0x202a && codePoint <= 0x202e) ||
      (codePoint >= 0x2066 && codePoint <= 0x2069)
    );
  });
}

class ContractProviderTimeoutError extends Error {
  constructor() {
    super('Marketplace contract provider timed out.');
    this.name = 'ContractProviderTimeoutError';
  }
}

function unwrap<T>(result: OperationResult<T>, label: string): T {
  if (result.status === 'ok') {
    return result.value;
  }
  if (result.status === 'not_found') {
    throw new ResourceNotFoundException(label);
  }
  if (result.status === 'forbidden' || result.status === 'partner_unapproved') {
    throw new ForbiddenException(label);
  }
  if (result.status === 'conflict') {
    throw new ConflictException(label);
  }
  throw new BadRequestException({ meta: { field: result.field, resourceType: label } });
}

async function callProvider<T>(timeoutMs: number, invoke: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      invoke(controller.signal),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new ContractProviderTimeoutError());
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

/** Provider calls run outside DB transactions; succeeded-ledger replay heals a domain-write crash gap. */
export class MarketplaceContractLifecycleDomainService {
  constructor(
    protected readonly lifecycleRepository: MarketplaceContractLifecycleRepository,
    protected readonly providerOperations: MarketplaceProviderOperationRepository,
    protected readonly artifactStorage: MarketplaceContractArtifactStorageProvider,
    protected readonly qualifiedSignature: MarketplaceQualifiedSignatureProvider,
    protected readonly directPayment: MarketplaceDirectPaymentProvider,
    protected readonly factoring: MarketplaceFactoringProvider,
    protected readonly disputeEvidenceStorage: MarketplaceDisputeEvidenceStorageProvider,
    protected readonly timeouts: MarketplaceContractProviderTimeouts = defaultTimeouts,
  ) {}

  async createArtifact(
    owner: AgriTechOwner,
    contractId: string,
    settlementKind: MarketplaceContractSettlementKind,
    idempotencyKey: string,
  ): Promise<MarketplaceContractArtifact> {
    this.requireProvider(this.artifactStorage, 'contract_artifact_storage');
    const selectionFingerprint = marketplaceProviderFingerprint({ contractId, settlementKind });
    const preparedArtifact = unwrap(
      await this.lifecycleRepository.prepareArtifact(
        owner,
        contractId,
        settlementKind,
        idempotencyKey,
        selectionFingerprint,
      ),
      'contract-artifact',
    );
    if (preparedArtifact.existingArtifact) {
      return preparedArtifact.existingArtifact;
    }
    const pdf = await generateMarketplaceContractPdf(preparedArtifact.snapshot, preparedArtifact.snapshotFingerprint);
    const parametersFingerprint = marketplaceProviderFingerprint({
      artifactChecksum: pdf.checksumSha256,
      byteSize: pdf.content.byteLength,
      snapshotFingerprint: preparedArtifact.snapshotFingerprint,
      snapshotRevision: preparedArtifact.snapshot.snapshotRevision,
    });
    const descriptor = {
      action: 'store-contract-artifact' as const,
      parametersFingerprint,
      resourceId: contractId,
      resourceRevision: preparedArtifact.snapshot.snapshotRevision,
      resourceType: 'contract' as const,
    };
    const preparedOperation = unwrap(
      await this.providerOperations.prepareProviderOperation(owner, {
        actorType: this.actorType(preparedArtifact.snapshot, owner),
        capability: 'contract_artifact_storage',
        idempotencyKey,
        providerMode: this.artifactStorage.mode as 'mock' | 'live',
        providerName: this.artifactStorage.name,
        requestDescriptor: descriptor,
        resourceId: contractId,
        resourceRevision: preparedArtifact.snapshot.snapshotRevision,
        resourceType: 'contract',
        requestFingerprint: marketplaceProviderFingerprint(descriptor),
      }),
      'contract-provider-operation',
    );
    if (preparedOperation.execute) {
      const result = await this.invokeProvider(
        owner,
        preparedOperation.operationId,
        preparedOperation.attempt,
        'contract_artifact_storage',
        this.artifactStorage.mode,
        this.timeouts.artifactStorageTimeoutMs,
        (signal) =>
          this.artifactStorage.storeContractArtifact({
            artifactChecksum: pdf.checksumSha256,
            byteSize: pdf.content.byteLength,
            content: pdf.content,
            contractId,
            operationAttempt: preparedOperation.attempt,
            operationId: preparedOperation.operationId,
            signal,
            snapshotFingerprint: preparedArtifact.snapshotFingerprint,
            snapshotRevision: preparedArtifact.snapshot.snapshotRevision,
          }),
      );
      await this.persistProviderCompletion(
        owner,
        preparedOperation.operationId,
        preparedOperation.attempt,
        'contract_artifact_storage',
        this.artifactStorage.mode,
        {
          providerMode: result.providerMode,
          providerName: result.providerName,
          providerReference: result.providerReference,
          resultDescriptor: {
            completedAt: result.completedAt.toISOString(),
            outcome: 'stored',
            resourceId: contractId,
            resourceRevision: preparedArtifact.snapshot.snapshotRevision,
            resourceType: 'contract',
          },
          safeReceipt: result.safeReceipt,
        },
      );
    }
    return unwrap(
      await this.lifecycleRepository.completeArtifact(owner, preparedOperation.operationId, pdf.content),
      'contract-artifact',
    );
  }

  async sign(owner: AgriTechOwner, contractId: string, idempotencyKey: string): Promise<MarketplaceContractLifecycle> {
    this.requireProvider(this.qualifiedSignature, 'qualified_signature');
    const preparedSignature = unwrap(
      await this.lifecycleRepository.prepareSignature(owner, contractId),
      'contract-signature',
    );
    if (preparedSignature.existingSignature) {
      return unwrap(await this.lifecycleRepository.getLifecycle(owner, contractId), 'contract-lifecycle');
    }
    const parametersFingerprint = marketplaceProviderFingerprint({
      artifactChecksum: preparedSignature.artifact.checksumSha256,
      party: preparedSignature.party,
      snapshotRevision: preparedSignature.artifact.snapshotRevision,
    });
    const descriptor = {
      action: 'qualify-contract-signature' as const,
      parametersFingerprint,
      resourceId: contractId,
      resourceRevision: preparedSignature.artifact.snapshotRevision,
      resourceType: 'contract' as const,
    };
    const preparedOperation = unwrap(
      await this.providerOperations.prepareProviderOperation(owner, {
        actorType: preparedSignature.party === 'buyer' ? 'contract_buyer' : 'contract_seller',
        capability: 'qualified_signature',
        idempotencyKey,
        providerMode: this.qualifiedSignature.mode as 'mock' | 'live',
        providerName: this.qualifiedSignature.name,
        requestDescriptor: descriptor,
        resourceId: contractId,
        resourceRevision: preparedSignature.artifact.snapshotRevision,
        resourceType: 'contract',
        requestFingerprint: marketplaceProviderFingerprint(descriptor),
      }),
      'contract-provider-operation',
    );
    if (preparedOperation.execute) {
      const result = await this.invokeProvider(
        owner,
        preparedOperation.operationId,
        preparedOperation.attempt,
        'qualified_signature',
        this.qualifiedSignature.mode,
        this.timeouts.qualifiedSignatureTimeoutMs,
        (signal) =>
          this.qualifiedSignature.qualifyContractSignature({
            artifactChecksum: preparedSignature.artifact.checksumSha256,
            contractId,
            operationAttempt: preparedOperation.attempt,
            operationId: preparedOperation.operationId,
            party: preparedSignature.party,
            signal,
            snapshotRevision: preparedSignature.artifact.snapshotRevision,
          }),
      );
      await this.persistProviderCompletion(
        owner,
        preparedOperation.operationId,
        preparedOperation.attempt,
        'qualified_signature',
        this.qualifiedSignature.mode,
        {
          providerMode: result.providerMode,
          providerName: result.providerName,
          providerReference: result.providerReference,
          resultDescriptor: {
            completedAt: result.completedAt.toISOString(),
            outcome: 'signature_recorded',
            resourceId: contractId,
            resourceRevision: preparedSignature.artifact.snapshotRevision,
            resourceType: 'contract',
          },
          safeReceipt: result.safeReceipt,
        },
      );
    }
    return unwrap(
      await this.lifecycleRepository.completeSignature(owner, preparedOperation.operationId),
      'contract-signature',
    );
  }

  consentFactoring(owner: AgriTechOwner, contractId: string, idempotencyKey: string) {
    const fingerprint = marketplaceProviderFingerprint({ command: 'consent_factoring', contractId });
    return this.lifecycleRepository
      .recordFactoringConsent(owner, contractId, idempotencyKey, fingerprint)
      .then((result) => unwrap(result, 'contract-settlement'));
  }

  async recordSettlementCommand(
    owner: AgriTechOwner,
    contractId: string,
    command: MarketplaceSettlementProviderCommand,
    idempotencyKey: string,
  ): Promise<MarketplaceContractLifecycle> {
    const prepared = unwrap(
      await this.lifecycleRepository.prepareSettlementProviderCommand(owner, contractId, command),
      'contract-settlement',
    );
    const capability = prepared.settlement.kind === 'direct_payment' ? 'direct_payment' : 'factoring';
    const provider = capability === 'direct_payment' ? this.directPayment : this.factoring;
    this.requireProvider(provider, capability);
    const parametersFingerprint = marketplaceProviderFingerprint({
      amountUzs: prepared.amountUzs,
      command,
      settlementRevision: prepared.expectedRevision,
    });
    const descriptor = {
      action: capability === 'direct_payment' ? ('record-direct-payment' as const) : ('record-factoring' as const),
      parametersFingerprint,
      resourceId: contractId,
      resourceRevision: prepared.expectedRevision,
      resourceType: 'contract' as const,
    };
    const preparedOperation = unwrap(
      await this.providerOperations.prepareProviderOperation(owner, {
        actorType: prepared.party === 'buyer' ? 'contract_buyer' : 'contract_seller',
        capability,
        idempotencyKey,
        providerMode: provider.mode as 'mock' | 'live',
        providerName: provider.name,
        requestDescriptor: descriptor,
        resourceId: contractId,
        resourceRevision: prepared.expectedRevision,
        resourceType: 'contract',
        requestFingerprint: marketplaceProviderFingerprint(descriptor),
      }),
      'contract-provider-operation',
    );
    if (preparedOperation.execute) {
      const result = await this.invokeProvider(
        owner,
        preparedOperation.operationId,
        preparedOperation.attempt,
        capability,
        provider.mode,
        capability === 'direct_payment' ? this.timeouts.directPaymentTimeoutMs : this.timeouts.factoringTimeoutMs,
        (signal) =>
          capability === 'direct_payment'
            ? this.directPayment.recordDirectPayment({
                amountUzs: prepared.amountUzs,
                command: command as 'confirm_buyer_payment' | 'confirm_seller_receipt',
                contractId,
                operationAttempt: preparedOperation.attempt,
                operationId: preparedOperation.operationId,
                party: prepared.party,
                signal,
              })
            : this.factoring.recordFactoring({
                amountUzs: prepared.amountUzs,
                command: command as 'request_decision' | 'record_seller_payout' | 'record_buyer_repayment' | 'close',
                contractId,
                operationAttempt: preparedOperation.attempt,
                operationId: preparedOperation.operationId,
                party: prepared.party,
                signal,
              }),
      );
      await this.persistProviderCompletion(
        owner,
        preparedOperation.operationId,
        preparedOperation.attempt,
        capability,
        provider.mode,
        {
          providerEventId: result.providerEventId,
          providerMode: result.providerMode,
          providerName: result.providerName,
          providerReference: result.providerReference,
          ...(result.reconciliationReason ? { reconciliationReason: result.reconciliationReason } : {}),
          resultDescriptor: {
            completedAt: result.completedAt.toISOString(),
            outcome: result.outcome,
            resourceId: contractId,
            resourceRevision: prepared.expectedRevision,
            resourceType: 'contract',
          },
          safeReceipt: result.safeReceipt,
        },
      );
    }
    return unwrap(
      await this.lifecycleRepository.completeSettlementProviderCommand(owner, preparedOperation.operationId),
      'contract-settlement',
    );
  }

  transitionFulfillment(
    owner: AgriTechOwner,
    contractId: string,
    command: MarketplaceContractFulfillmentCommand,
    idempotencyKey: string,
  ): Promise<MarketplaceContractLifecycle> {
    const fingerprint = marketplaceProviderFingerprint({ command, contractId });
    return this.lifecycleRepository
      .transitionFulfillment(owner, contractId, command, idempotencyKey, fingerprint)
      .then((result) => unwrap(result, 'contract-fulfillment'));
  }

  openDispute(
    owner: AgriTechOwner,
    contractId: string,
    reason: MarketplaceContractDisputeReason,
    idempotencyKey: string,
  ): Promise<MarketplaceContractLifecycle> {
    const fingerprint = marketplaceProviderFingerprint({ command: 'open_dispute', contractId, reason });
    return this.lifecycleRepository
      .openDispute(owner, contractId, reason, idempotencyKey, fingerprint)
      .then((result) => unwrap(result, 'contract-dispute'));
  }

  async storeDisputeEvidence(
    owner: AgriTechOwner,
    contractId: string,
    input: {
      content: Uint8Array;
      fileName: string;
      mediaType: MarketplaceDisputeEvidenceMediaType;
    },
    idempotencyKey: string,
  ): Promise<MarketplaceContractDisputeEvidence> {
    this.requireProvider(this.disputeEvidenceStorage, 'dispute_evidence_storage');
    const metadata = this.disputeEvidenceMetadata(input);
    const preparedEvidence = unwrap(
      await this.lifecycleRepository.prepareDisputeEvidence(owner, contractId),
      'contract-dispute-evidence',
    );
    const parametersFingerprint = marketplaceProviderFingerprint(metadata);
    const descriptor = {
      action: 'store-dispute-evidence' as const,
      parametersFingerprint,
      resourceId: contractId,
      resourceRevision: preparedEvidence.disputeRevision,
      resourceType: 'contract' as const,
    };
    const preparedOperation = unwrap(
      await this.providerOperations.prepareProviderOperation(owner, {
        actorType: preparedEvidence.party === 'buyer' ? 'contract_buyer' : 'contract_seller',
        capability: 'dispute_evidence_storage',
        idempotencyKey,
        providerMode: this.disputeEvidenceStorage.mode as 'mock' | 'live',
        providerName: this.disputeEvidenceStorage.name,
        requestDescriptor: descriptor,
        requestFingerprint: marketplaceProviderFingerprint(descriptor),
        resourceId: contractId,
        resourceRevision: preparedEvidence.disputeRevision,
        resourceType: 'contract',
      }),
      'contract-provider-operation',
    );
    if (preparedOperation.execute) {
      const result = await this.invokeProvider(
        owner,
        preparedOperation.operationId,
        preparedOperation.attempt,
        'dispute_evidence_storage',
        this.disputeEvidenceStorage.mode,
        this.timeouts.disputeEvidenceStorageTimeoutMs,
        (signal) =>
          this.disputeEvidenceStorage.storeDisputeEvidence({
            checksumSha256: metadata.checksumSha256,
            content: input.content,
            contractId,
            disputeId: preparedEvidence.disputeId,
            fileName: metadata.fileName,
            mediaType: metadata.mediaType,
            operationAttempt: preparedOperation.attempt,
            operationId: preparedOperation.operationId,
            signal,
          }),
      );
      await this.persistProviderCompletion(
        owner,
        preparedOperation.operationId,
        preparedOperation.attempt,
        'dispute_evidence_storage',
        this.disputeEvidenceStorage.mode,
        {
          providerMode: result.providerMode,
          providerName: result.providerName,
          providerReference: result.providerReference,
          resultDescriptor: {
            completedAt: result.completedAt.toISOString(),
            outcome: 'stored',
            resourceId: contractId,
            resourceRevision: preparedEvidence.disputeRevision,
            resourceType: 'contract',
          },
          safeReceipt: result.safeReceipt,
        },
      );
    }
    return unwrap(
      await this.lifecycleRepository.completeDisputeEvidence(owner, preparedOperation.operationId, metadata),
      'contract-dispute-evidence',
    );
  }

  resolveDispute(
    admin: AgriTechOwner,
    contractId: string,
    decision: 'dismissed' | 'upheld_cancelled',
    evidenceIds: string[],
    evidenceRevision: number,
    outcomeNote: string,
    idempotencyKey: string,
  ): Promise<MarketplaceContractLifecycle> {
    const requestFingerprint = marketplaceProviderFingerprint({
      command: 'resolve_dispute',
      contractId,
      decision,
      evidenceIds: [...evidenceIds].sort((left, right) => left.localeCompare(right, 'en')),
      evidenceRevision,
      outcomeNote: outcomeNote.trim(),
    });
    return this.lifecycleRepository
      .resolveDispute(
        admin,
        contractId,
        decision,
        evidenceIds,
        evidenceRevision,
        outcomeNote,
        idempotencyKey,
        requestFingerprint,
      )
      .then((result) => unwrap(result, 'contract-dispute'));
  }

  listCommissionRatePolicies() {
    return this.lifecycleRepository.listCommissionRatePolicies();
  }

  activateCommissionRatePolicy(
    admin: AgriTechOwner,
    version: string,
    rateSnapshot: MarketplaceCommissionRateSnapshot,
    idempotencyKey: string,
  ) {
    const requestFingerprint = marketplaceProviderFingerprint({ rateSnapshot, version });
    return this.lifecycleRepository
      .activateCommissionRatePolicy(admin, version, rateSnapshot, idempotencyKey, requestFingerprint)
      .then((result) => unwrap(result, 'commission-rate-policy'));
  }

  getLifecycle(owner: AgriTechOwner, contractId: string): Promise<MarketplaceContractLifecycle> {
    return this.lifecycleRepository
      .getLifecycle(owner, contractId)
      .then((result) => unwrap(result, 'contract-lifecycle'));
  }

  getLifecycleForAdmin(tenantId: string, contractId: string): Promise<MarketplaceContractLifecycle> {
    return this.lifecycleRepository
      .getLifecycleForAdmin(tenantId, contractId)
      .then((result) => unwrap(result, 'contract-lifecycle'));
  }

  getArtifact(owner: AgriTechOwner, contractId: string): Promise<MarketplaceContractArtifact | undefined> {
    return this.lifecycleRepository
      .findArtifact(owner, contractId)
      .then((result) => unwrap(result, 'contract-artifact'));
  }

  downloadArtifact(owner: AgriTechOwner, contractId: string): Promise<MarketplaceContractArtifactDownload> {
    return this.lifecycleRepository
      .downloadArtifact(owner, contractId)
      .then((result) => unwrap(result, 'contract-artifact'));
  }

  private actorType(
    snapshot: { buyer: { tenantId: string; userId: string }; seller: { tenantId: string; userId: string } },
    owner: AgriTechOwner,
  ): 'contract_buyer' | 'contract_seller' {
    if (snapshot.buyer.tenantId === owner.tenantId && snapshot.buyer.userId === owner.userId) {
      return 'contract_buyer';
    }
    if (snapshot.seller.tenantId === owner.tenantId && snapshot.seller.userId === owner.userId) {
      return 'contract_seller';
    }
    throw new ForbiddenException('contract');
  }

  private disputeEvidenceMetadata(input: {
    content: Uint8Array;
    fileName: string;
    mediaType: MarketplaceDisputeEvidenceMediaType;
  }) {
    const fileName = input.fileName.normalize('NFC').trim();
    if (
      input.content.byteLength < 1 ||
      input.content.byteLength > maximumMarketplaceDisputeEvidenceBytes ||
      fileName.length < 1 ||
      fileName.length > 200 ||
      hasUnsafeEvidenceFileNameCharacter(fileName) ||
      !this.hasExpectedEvidenceMagic(input.mediaType, input.content)
    ) {
      throw new BadRequestException({ meta: { field: 'evidence', resourceType: 'contract-dispute' } });
    }
    return {
      byteSize: input.content.byteLength,
      checksumSha256: createHash('sha256').update(input.content).digest('hex'),
      fileName,
      mediaType: input.mediaType,
    };
  }

  private hasExpectedEvidenceMagic(mediaType: MarketplaceDisputeEvidenceMediaType, content: Uint8Array): boolean {
    if (mediaType === 'application/pdf') {
      return content.length >= 5 && String.fromCharCode(...content.slice(0, 5)) === '%PDF-';
    }
    if (mediaType === 'image/jpeg') {
      return content[0] === 0xff && content[1] === 0xd8 && content[2] === 0xff;
    }
    return (
      content.length >= 8 &&
      [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((byte, index) => content[index] === byte)
    );
  }

  private requireProvider(provider: MarketplaceProviderIdentity, capability: MarketplaceProviderCapability): void {
    if (provider.mode === 'disabled') {
      throw new MarketplaceProviderUnavailableException({
        extensions: { capability, providerMode: provider.mode, retryable: false },
        meta: { provider: provider.name },
      });
    }
  }

  private async invokeProvider<T>(
    owner: AgriTechOwner,
    operationId: string,
    attempt: number,
    capability: MarketplaceProviderCapability,
    providerMode: MarketplaceProviderIdentity['mode'],
    timeoutMs: number,
    invoke: (signal: AbortSignal) => Promise<T>,
  ): Promise<T> {
    try {
      return await callProvider(timeoutMs, invoke);
    } catch (error) {
      return this.recordProviderFailure(owner, operationId, attempt, capability, providerMode, error);
    }
  }

  private async persistProviderCompletion(
    owner: AgriTechOwner,
    operationId: string,
    attempt: number,
    capability: MarketplaceProviderCapability,
    providerMode: 'disabled' | 'mock' | 'live',
    completion: MarketplaceProviderOperationCompletion,
  ): Promise<void> {
    try {
      unwrap(
        await this.providerOperations.completeProviderOperation(owner, operationId, attempt, completion),
        'contract-provider-operation',
      );
    } catch (error) {
      await this.providerOperations
        .failProviderOperation(
          owner,
          operationId,
          attempt,
          `${capability}_completion_persist_failed`,
          'provider_outcome_unknown',
        )
        .catch(() => undefined);
      throw new MarketplaceProviderUnavailableException({
        cause: error instanceof Error ? error : new Error('Marketplace provider completion persistence failed.'),
        extensions: { capability, providerMode, retryable: false },
        meta: { reconciliationRequired: true },
      });
    }
  }

  private async recordProviderFailure(
    owner: AgriTechOwner,
    operationId: string,
    attempt: number,
    capability: MarketplaceProviderCapability,
    providerMode: 'disabled' | 'mock' | 'live',
    error: unknown,
  ): Promise<never> {
    const timedOut = error instanceof ContractProviderTimeoutError;
    await this.providerOperations
      .failProviderOperation(
        owner,
        operationId,
        attempt,
        timedOut ? `${capability}_timeout` : `${capability}_failed`,
        timedOut ? 'provider_outcome_unknown' : undefined,
      )
      .catch(() => undefined);
    if (
      error instanceof BadRequestException ||
      error instanceof ConflictException ||
      error instanceof ForbiddenException
    ) {
      throw error;
    }
    throw new MarketplaceProviderUnavailableException({
      cause: error instanceof Error ? error : new Error('Marketplace contract provider failed.'),
      extensions: { capability, providerMode, retryAfterSeconds: 30, retryable: true },
    });
  }
}
