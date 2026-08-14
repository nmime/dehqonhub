// @requirements REQ-AGRITECH-INTEGRATION-013 REQ-AGRITECH-STAGE2-017
import type {
  MarketplaceContractArtifactStorageProvider,
  MarketplaceContractArtifactStorageProviderResult,
  MarketplaceDirectPaymentProvider,
  MarketplaceDisputeEvidenceStorageProvider,
  MarketplaceDisputeEvidenceStorageProviderResult,
  MarketplaceFactoringProvider,
  MarketplaceQualifiedSignatureProvider,
  MarketplaceQualifiedSignatureProviderResult,
  MarketplaceSettlementProviderResult,
} from '@app/backend-feature-agritech-shared';
import type { MarketplaceProviderConfig } from './marketplace-provider.config';

type Clock = () => Date;
type RequiredInputFields<T, K extends keyof T> = Pick<T, K> & Partial<Omit<T, K>>;
const systemClock: Clock = () => new Date();

class DisabledContractArtifactStorageProvider implements MarketplaceContractArtifactStorageProvider {
  readonly mode = 'disabled' as const;
  readonly name = 'disabled';
  storeContractArtifact(): Promise<MarketplaceContractArtifactStorageProviderResult> {
    return Promise.reject(new Error('Marketplace contract artifact storage provider is disabled.'));
  }
}

class DisabledQualifiedSignatureProvider implements MarketplaceQualifiedSignatureProvider {
  readonly mode = 'disabled' as const;
  readonly name = 'disabled';
  qualifyContractSignature(): Promise<MarketplaceQualifiedSignatureProviderResult> {
    return Promise.reject(new Error('Marketplace qualified signature provider is disabled.'));
  }
}

class DisabledDisputeEvidenceStorageProvider implements MarketplaceDisputeEvidenceStorageProvider {
  readonly mode = 'disabled' as const;
  readonly name = 'disabled';
  storeDisputeEvidence(): Promise<MarketplaceDisputeEvidenceStorageProviderResult> {
    return Promise.reject(new Error('Marketplace dispute evidence storage provider is disabled.'));
  }
}

class DisabledDirectPaymentProvider implements MarketplaceDirectPaymentProvider {
  readonly mode = 'disabled' as const;
  readonly name = 'disabled';
  recordDirectPayment(): Promise<MarketplaceSettlementProviderResult> {
    return Promise.reject(new Error('Marketplace direct payment provider is disabled.'));
  }
}

class DisabledFactoringProvider implements MarketplaceFactoringProvider {
  readonly mode = 'disabled' as const;
  readonly name = 'disabled';
  recordFactoring(): Promise<MarketplaceSettlementProviderResult> {
    return Promise.reject(new Error('Marketplace factoring provider is disabled.'));
  }
}

export class MockContractArtifactStorageProvider implements MarketplaceContractArtifactStorageProvider {
  readonly mode = 'mock' as const;
  readonly name = 'mock-contract-artifact-storage';

  constructor(private readonly clock: Clock = systemClock) {}

  storeContractArtifact(
    input: RequiredInputFields<
      Parameters<MarketplaceContractArtifactStorageProvider['storeContractArtifact']>[0],
      'artifactChecksum' | 'byteSize' | 'contractId' | 'operationId'
    >,
  ): Promise<MarketplaceContractArtifactStorageProviderResult> {
    const storageReference = `mock-artifact:${input.contractId}:${input.artifactChecksum}`;
    return Promise.resolve({
      completedAt: this.clock(),
      providerMode: 'mock',
      providerName: this.name,
      providerReference: `mock-artifact-receipt:${input.operationId}`,
      safeReceipt: {
        byteSize: input.byteSize,
        checksumSha256: input.artifactChecksum,
        simulated: true,
        storageReference,
      },
      storageReference,
    });
  }
}

export class MockQualifiedSignatureProvider implements MarketplaceQualifiedSignatureProvider {
  readonly mode = 'mock' as const;
  readonly name = 'mock-qualified-signature';

  constructor(private readonly clock: Clock = systemClock) {}

  qualifyContractSignature(
    input: RequiredInputFields<
      Parameters<MarketplaceQualifiedSignatureProvider['qualifyContractSignature']>[0],
      'artifactChecksum' | 'operationId' | 'party' | 'snapshotRevision'
    >,
  ): Promise<MarketplaceQualifiedSignatureProviderResult> {
    const completedAt = this.clock();
    return Promise.resolve({
      completedAt,
      providerMode: 'mock',
      providerName: this.name,
      providerReference: `mock-qes:${input.operationId}:${input.party}`,
      safeReceipt: {
        artifactChecksum: input.artifactChecksum,
        party: input.party,
        signedAt: completedAt.toISOString(),
        simulated: true,
        snapshotRevision: input.snapshotRevision,
      },
    });
  }
}

export class MockDisputeEvidenceStorageProvider implements MarketplaceDisputeEvidenceStorageProvider {
  readonly mode = 'mock' as const;
  readonly name = 'mock-dispute-evidence-storage';

  constructor(private readonly clock: Clock = systemClock) {}

  storeDisputeEvidence(
    input: RequiredInputFields<
      Parameters<MarketplaceDisputeEvidenceStorageProvider['storeDisputeEvidence']>[0],
      'checksumSha256' | 'content' | 'contractId' | 'disputeId' | 'fileName' | 'mediaType' | 'operationId'
    >,
  ): Promise<MarketplaceDisputeEvidenceStorageProviderResult> {
    const storageReference = `mock-dispute-evidence:${input.contractId}:${input.disputeId}:${input.checksumSha256}`;
    return Promise.resolve({
      completedAt: this.clock(),
      providerMode: 'mock',
      providerName: this.name,
      providerReference: `mock-dispute-evidence-receipt:${input.operationId}`,
      safeReceipt: {
        byteSize: input.content.byteLength,
        checksumSha256: input.checksumSha256,
        fileName: input.fileName,
        mediaType: input.mediaType,
        simulated: true,
        storageReference,
      },
      storageReference,
    });
  }
}

export class MockDirectPaymentProvider implements MarketplaceDirectPaymentProvider {
  readonly mode = 'mock' as const;
  readonly name = 'mock-direct-payment';

  constructor(private readonly clock: Clock = systemClock) {}

  recordDirectPayment(
    input: RequiredInputFields<
      Parameters<MarketplaceDirectPaymentProvider['recordDirectPayment']>[0],
      'amountUzs' | 'command' | 'contractId' | 'operationId' | 'party'
    >,
  ): Promise<MarketplaceSettlementProviderResult> {
    const completedAt = this.clock();
    return Promise.resolve({
      completedAt,
      outcome: input.command,
      providerEventId: `mock-direct-payment-event:${input.contractId}:${input.command}`,
      providerMode: 'mock',
      providerName: this.name,
      providerReference: `mock-direct-payment:${input.operationId}`,
      safeReceipt: {
        amountUzs: input.amountUzs,
        command: input.command,
        currency: 'UZS',
        moneyMoved: false,
        party: input.party,
        simulated: true,
      },
    });
  }
}

export class MockFactoringProvider implements MarketplaceFactoringProvider {
  readonly mode = 'mock' as const;
  readonly name = 'mock-factoring';

  constructor(private readonly clock: Clock = systemClock) {}

  recordFactoring(
    input: RequiredInputFields<
      Parameters<MarketplaceFactoringProvider['recordFactoring']>[0],
      'amountUzs' | 'command' | 'contractId' | 'operationId' | 'party'
    >,
  ): Promise<MarketplaceSettlementProviderResult> {
    const completedAt = this.clock();
    const outcome = input.command === 'request_decision' ? 'approved' : input.command;
    return Promise.resolve({
      completedAt,
      outcome,
      providerEventId: `mock-factoring-event:${input.contractId}:${outcome}`,
      providerMode: 'mock',
      providerName: this.name,
      providerReference: `mock-factoring:${input.operationId}`,
      safeReceipt: {
        amountUzs: input.amountUzs,
        currency: 'UZS',
        decision: input.command === 'request_decision' ? 'approved' : null,
        moneyMoved: false,
        outcome,
        party: input.party,
        simulated: true,
      },
    });
  }
}

export function createContractArtifactStorageProvider(
  config: MarketplaceProviderConfig,
): MarketplaceContractArtifactStorageProvider {
  if (config.contractArtifactStorage.mode === 'mock') {
    return new MockContractArtifactStorageProvider();
  }
  if (config.contractArtifactStorage.mode === 'live') {
    throw new Error('MARKETPLACE_CONTRACT_ARTIFACT_STORAGE_PROVIDER_MODE=live requires a configured storage adapter.');
  }
  return new DisabledContractArtifactStorageProvider();
}

export function createQualifiedSignatureProvider(
  config: MarketplaceProviderConfig,
): MarketplaceQualifiedSignatureProvider {
  if (config.qualifiedSignature.mode === 'mock') {
    return new MockQualifiedSignatureProvider();
  }
  if (config.qualifiedSignature.mode === 'live') {
    throw new Error('MARKETPLACE_QUALIFIED_SIGNATURE_PROVIDER_MODE=live requires a configured signing adapter.');
  }
  return new DisabledQualifiedSignatureProvider();
}

export function createDisputeEvidenceStorageProvider(
  config: MarketplaceProviderConfig,
): MarketplaceDisputeEvidenceStorageProvider {
  if (config.disputeEvidenceStorage.mode === 'mock') {
    return new MockDisputeEvidenceStorageProvider();
  }
  if (config.disputeEvidenceStorage.mode === 'live') {
    throw new Error('MARKETPLACE_DISPUTE_EVIDENCE_STORAGE_PROVIDER_MODE=live requires a configured storage adapter.');
  }
  return new DisabledDisputeEvidenceStorageProvider();
}

export function createDirectPaymentProvider(config: MarketplaceProviderConfig): MarketplaceDirectPaymentProvider {
  if (config.directPayment.mode === 'mock') {
    return new MockDirectPaymentProvider();
  }
  if (config.directPayment.mode === 'live') {
    throw new Error('MARKETPLACE_DIRECT_PAYMENT_PROVIDER_MODE=live requires a configured payment adapter.');
  }
  return new DisabledDirectPaymentProvider();
}

export function createFactoringProvider(config: MarketplaceProviderConfig): MarketplaceFactoringProvider {
  if (config.factoring.mode === 'mock') {
    return new MockFactoringProvider();
  }
  if (config.factoring.mode === 'live') {
    throw new Error('MARKETPLACE_FACTORING_PROVIDER_MODE=live requires a configured factoring adapter.');
  }
  return new DisabledFactoringProvider();
}
