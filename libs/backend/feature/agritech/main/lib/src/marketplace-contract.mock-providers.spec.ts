// @requirements REQ-AGRITECH-INTEGRATION-013 REQ-AGRITECH-STAGE2-017 REQ-AGRITECH-LIFECYCLE-020
import { describe, expect, it } from 'vitest';
import type { MarketplaceExternalProviderMode } from '@app/backend-feature-agritech-shared';
import {
  createContractArtifactStorageProvider,
  createDirectPaymentProvider,
  createDisputeEvidenceStorageProvider,
  createFactoringProvider,
  createQualifiedSignatureProvider,
  MockContractArtifactStorageProvider,
  MockDirectPaymentProvider,
  MockDisputeEvidenceStorageProvider,
  MockFactoringProvider,
  MockQualifiedSignatureProvider,
} from './marketplace-contract.mock-providers';
import {
  resolveMarketplaceProviderConfig,
  type MarketplaceProviderConfig,
  type MarketplaceProviderConfigCapability,
} from './marketplace-provider.config';

const capabilities = [
  'oneId',
  'verificationDocuments',
  'contractArtifactStorage',
  'disputeEvidenceStorage',
  'qualifiedSignature',
  'promotionBilling',
  'directPayment',
  'factoring',
  'notificationDelivery',
] as const satisfies readonly MarketplaceProviderConfigCapability[];

const completedAt = new Date('2030-05-01T10:00:00.000Z');
const clock = () => completedAt;
const signal = new AbortController().signal;
const content = Uint8Array.from(Buffer.from('%PDF-contract'));

const mockConfig = resolveMarketplaceProviderConfig({
  MARKETPLACE_CONTRACT_ARTIFACT_STORAGE_PROVIDER_MODE: 'mock',
  MARKETPLACE_DIRECT_PAYMENT_PROVIDER_MODE: 'mock',
  MARKETPLACE_DISPUTE_EVIDENCE_STORAGE_PROVIDER_MODE: 'mock',
  MARKETPLACE_FACTORING_PROVIDER_MODE: 'mock',
  MARKETPLACE_QUALIFIED_SIGNATURE_PROVIDER_MODE: 'mock',
  NODE_ENV: 'test',
});
const disabledConfig = resolveMarketplaceProviderConfig({ NODE_ENV: 'test' });

/**
 * `resolveMarketplaceProviderConfig` never hands back a live capability — it
 * throws while reading the environment — so a hand-built config is the only way
 * to reach the factory guards, which are what still stops a future adapter
 * wiring from booting a live contract flow with no adapter behind it.
 */
function configWithEveryCapability(mode: MarketplaceExternalProviderMode): MarketplaceProviderConfig {
  return Object.fromEntries(
    capabilities.map((capability) => [capability, { mode, providerName: null, timeoutMs: 10_000 }]),
  ) as MarketplaceProviderConfig;
}

const liveConfig = configWithEveryCapability('live');

const liveGuards = [
  [
    'contract artifact storage',
    createContractArtifactStorageProvider,
    'MARKETPLACE_CONTRACT_ARTIFACT_STORAGE_PROVIDER_MODE=live requires a configured storage adapter.',
  ],
  [
    'qualified signature',
    createQualifiedSignatureProvider,
    'MARKETPLACE_QUALIFIED_SIGNATURE_PROVIDER_MODE=live requires a configured signing adapter.',
  ],
  [
    'dispute evidence storage',
    createDisputeEvidenceStorageProvider,
    'MARKETPLACE_DISPUTE_EVIDENCE_STORAGE_PROVIDER_MODE=live requires a configured storage adapter.',
  ],
  [
    'direct payment',
    createDirectPaymentProvider,
    'MARKETPLACE_DIRECT_PAYMENT_PROVIDER_MODE=live requires a configured payment adapter.',
  ],
  ['factoring', createFactoringProvider, 'MARKETPLACE_FACTORING_PROVIDER_MODE=live requires a configured factoring adapter.'],
] as const;

describe('contract provider factories', () => {
  it('builds a deterministic simulation adapter for every contract capability switched to mock', () => {
    expect(createContractArtifactStorageProvider(mockConfig)).toBeInstanceOf(MockContractArtifactStorageProvider);
    expect(createQualifiedSignatureProvider(mockConfig)).toBeInstanceOf(MockQualifiedSignatureProvider);
    expect(createDisputeEvidenceStorageProvider(mockConfig)).toBeInstanceOf(MockDisputeEvidenceStorageProvider);
    expect(createDirectPaymentProvider(mockConfig)).toBeInstanceOf(MockDirectPaymentProvider);
    expect(createFactoringProvider(mockConfig)).toBeInstanceOf(MockFactoringProvider);
    expect(createFactoringProvider(mockConfig)).toMatchObject({ mode: 'mock', name: 'mock-factoring' });
  });

  it('fails closed with a disabled adapter for every contract capability left unset', () => {
    for (const provider of [
      createContractArtifactStorageProvider(disabledConfig),
      createQualifiedSignatureProvider(disabledConfig),
      createDisputeEvidenceStorageProvider(disabledConfig),
      createDirectPaymentProvider(disabledConfig),
      createFactoringProvider(disabledConfig),
    ]) {
      expect(provider).toMatchObject({ mode: 'disabled', name: 'disabled' });
    }
  });

  it.each(liveGuards)('refuses to build a live %s adapter that does not exist yet', (_label, factory, message) => {
    expect(() => factory(liveConfig)).toThrow(message);
  });
});

describe('disabled contract providers', () => {
  it('rejects an artifact upload instead of silently reporting a stored contract', async () => {
    await expect(
      createContractArtifactStorageProvider(disabledConfig).storeContractArtifact({
        artifactChecksum: 'checksum-1',
        byteSize: content.byteLength,
        content,
        contractId: 'contract-1',
        operationAttempt: 1,
        operationId: 'operation-1',
        signal,
        snapshotFingerprint: 'fingerprint-1',
        snapshotRevision: 3,
      }),
    ).rejects.toThrow('Marketplace contract artifact storage provider is disabled.');
  });

  it('rejects a qualified signature instead of reporting an unsigned contract as signed', async () => {
    await expect(
      createQualifiedSignatureProvider(disabledConfig).qualifyContractSignature({
        artifactChecksum: 'checksum-1',
        contractId: 'contract-1',
        operationAttempt: 1,
        operationId: 'operation-1',
        party: 'buyer',
        signal,
        snapshotRevision: 3,
      }),
    ).rejects.toThrow('Marketplace qualified signature provider is disabled.');
  });

  it('rejects dispute evidence instead of dropping a claimant proof', async () => {
    await expect(
      createDisputeEvidenceStorageProvider(disabledConfig).storeDisputeEvidence({
        checksumSha256: 'checksum-1',
        content,
        contractId: 'contract-1',
        disputeId: 'dispute-1',
        fileName: 'proof.pdf',
        mediaType: 'application/pdf',
        operationAttempt: 1,
        operationId: 'operation-1',
        signal,
      }),
    ).rejects.toThrow('Marketplace dispute evidence storage provider is disabled.');
  });

  it('rejects a direct payment instead of confirming money that never moved', async () => {
    await expect(
      createDirectPaymentProvider(disabledConfig).recordDirectPayment({
        amountUzs: 4_080_000,
        command: 'confirm_buyer_payment',
        contractId: 'contract-1',
        operationAttempt: 1,
        operationId: 'operation-1',
        party: 'buyer',
        signal,
      }),
    ).rejects.toThrow('Marketplace direct payment provider is disabled.');
  });

  it('rejects a factoring command instead of inventing a financing decision', async () => {
    await expect(
      createFactoringProvider(disabledConfig).recordFactoring({
        amountUzs: 4_080_000,
        command: 'request_decision',
        contractId: 'contract-1',
        operationAttempt: 1,
        operationId: 'operation-1',
        party: 'seller',
        signal,
      }),
    ).rejects.toThrow('Marketplace factoring provider is disabled.');
  });
});

describe('mock contract providers', () => {
  it('derives the artifact storage reference from the contract and its checksum, keeping no bytes', async () => {
    const provider = new MockContractArtifactStorageProvider(clock);

    const result = await provider.storeContractArtifact({
      artifactChecksum: 'checksum-1',
      byteSize: content.byteLength,
      content,
      contractId: 'contract-1',
      operationAttempt: 2,
      operationId: 'operation-1',
      signal,
      snapshotFingerprint: 'fingerprint-1',
      snapshotRevision: 3,
    });

    expect(result).toEqual({
      completedAt,
      providerMode: 'mock',
      providerName: 'mock-contract-artifact-storage',
      providerReference: 'mock-artifact-receipt:operation-1',
      safeReceipt: {
        byteSize: content.byteLength,
        checksumSha256: 'checksum-1',
        simulated: true,
        storageReference: 'mock-artifact:contract-1:checksum-1',
      },
      storageReference: 'mock-artifact:contract-1:checksum-1',
    });
    expect(JSON.stringify(result)).not.toContain('%PDF-');
  });

  it.each(['buyer', 'seller'] as const)('signs for %s under its own provider reference', async (party) => {
    const provider = new MockQualifiedSignatureProvider(clock);

    const result = await provider.qualifyContractSignature({
      artifactChecksum: 'checksum-1',
      contractId: 'contract-1',
      operationAttempt: 1,
      operationId: 'operation-1',
      party,
      signal,
      snapshotRevision: 3,
    });

    expect(result).toEqual({
      completedAt,
      providerMode: 'mock',
      providerName: 'mock-qualified-signature',
      providerReference: `mock-qes:operation-1:${party}`,
      safeReceipt: {
        artifactChecksum: 'checksum-1',
        party,
        signedAt: completedAt.toISOString(),
        simulated: true,
        snapshotRevision: 3,
      },
    });
  });

  it.each(['application/pdf', 'image/jpeg', 'image/png'] as const)(
    'stores %s dispute evidence under a contract-scoped and dispute-scoped reference',
    async (mediaType) => {
      const provider = new MockDisputeEvidenceStorageProvider(clock);

      const result = await provider.storeDisputeEvidence({
        checksumSha256: 'checksum-1',
        content,
        contractId: 'contract-1',
        disputeId: 'dispute-1',
        fileName: 'proof.pdf',
        mediaType,
        operationAttempt: 1,
        operationId: 'operation-1',
        signal,
      });

      expect(result).toEqual({
        completedAt,
        providerMode: 'mock',
        providerName: 'mock-dispute-evidence-storage',
        providerReference: 'mock-dispute-evidence-receipt:operation-1',
        safeReceipt: {
          byteSize: content.byteLength,
          checksumSha256: 'checksum-1',
          fileName: 'proof.pdf',
          mediaType,
          simulated: true,
          storageReference: 'mock-dispute-evidence:contract-1:dispute-1:checksum-1',
        },
        storageReference: 'mock-dispute-evidence:contract-1:dispute-1:checksum-1',
      });
      expect(JSON.stringify(result)).not.toContain('%PDF-');
    },
  );

  it.each([
    ['confirm_buyer_payment', 'buyer'],
    ['confirm_seller_receipt', 'seller'],
  ] as const)('echoes the %s command back as its outcome without moving money', async (command, party) => {
    const provider = new MockDirectPaymentProvider(clock);

    const result = await provider.recordDirectPayment({
      amountUzs: 4_080_000,
      command,
      contractId: 'contract-1',
      operationAttempt: 1,
      operationId: 'operation-1',
      party,
      signal,
    });

    expect(result).toEqual({
      completedAt,
      outcome: command,
      providerEventId: `mock-direct-payment-event:contract-1:${command}`,
      providerMode: 'mock',
      providerName: 'mock-direct-payment',
      providerReference: 'mock-direct-payment:operation-1',
      safeReceipt: {
        amountUzs: 4_080_000,
        command,
        currency: 'UZS',
        moneyMoved: false,
        party,
        simulated: true,
      },
    });
  });

  it.each([
    ['request_decision', 'approved', 'approved'],
    ['record_seller_payout', 'record_seller_payout', null],
    ['record_buyer_repayment', 'record_buyer_repayment', null],
    ['close', 'close', null],
  ] as const)('resolves the %s factoring command to %s', async (command, outcome, decision) => {
    const provider = new MockFactoringProvider(clock);

    const result = await provider.recordFactoring({
      amountUzs: 4_080_000,
      command,
      contractId: 'contract-1',
      operationAttempt: 1,
      operationId: 'operation-1',
      party: 'seller',
      signal,
    });

    expect(result).toEqual({
      completedAt,
      outcome,
      providerEventId: `mock-factoring-event:contract-1:${outcome}`,
      providerMode: 'mock',
      providerName: 'mock-factoring',
      providerReference: 'mock-factoring:operation-1',
      safeReceipt: {
        amountUzs: 4_080_000,
        currency: 'UZS',
        decision,
        moneyMoved: false,
        outcome,
        party: 'seller',
        simulated: true,
      },
    });
  });

  it('reuses the system clock when no clock is injected', async () => {
    const before = Date.now();

    const result = await new MockFactoringProvider().recordFactoring({
      amountUzs: 1,
      command: 'close',
      contractId: 'contract-1',
      operationAttempt: 1,
      operationId: 'operation-1',
      party: 'buyer',
      signal,
    });

    expect(result.completedAt.getTime()).toBeGreaterThanOrEqual(before);
  });
});
