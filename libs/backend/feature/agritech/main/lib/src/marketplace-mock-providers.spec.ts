// @requirements REQ-AGRITECH-INTEGRATION-013 REQ-AGRITECH-STAGE2-017
import { describe, expect, it } from 'vitest';
import type { MarketplaceProviderConfig } from './marketplace-provider.config';
import {
  MockContractArtifactStorageProvider,
  MockDirectPaymentProvider,
  MockDisputeEvidenceStorageProvider,
  MockFactoringProvider,
  MockQualifiedSignatureProvider,
  createContractArtifactStorageProvider,
  createDirectPaymentProvider,
  createDisputeEvidenceStorageProvider,
  createFactoringProvider,
  createQualifiedSignatureProvider,
} from './marketplace-contract.mock-providers';
import {
  MockMarketplaceDocumentProvider,
  MockMarketplaceIdentityProvider,
  createMarketplaceDocumentProvider,
  createMarketplaceIdentityProvider,
} from './marketplace.mock-providers';

const timestamp = new Date('2030-01-01T00:00:00.000Z');
const clock = () => timestamp;

function config(overrides: Partial<MarketplaceProviderConfig> = {}): MarketplaceProviderConfig {
  return {
    contractArtifactStorage: { mode: 'disabled', providerName: null, timeoutMs: 100 },
    directPayment: { mode: 'disabled', providerName: null, timeoutMs: 100 },
    disputeEvidenceStorage: { mode: 'disabled', providerName: null, timeoutMs: 100 },
    factoring: { mode: 'disabled', providerName: null, timeoutMs: 100 },
    notificationDelivery: { mode: 'disabled', providerName: null, timeoutMs: 100 },
    oneId: { mode: 'disabled', providerName: null, timeoutMs: 100 },
    promotionBilling: { mode: 'disabled', providerName: null, timeoutMs: 100 },
    qualifiedSignature: { mode: 'disabled', providerName: null, timeoutMs: 100 },
    verificationDocuments: { mode: 'disabled', providerName: null, timeoutMs: 100 },
    ...overrides,
  };
}

describe('marketplace mock providers', () => {
  it('implements deterministic identity, document, and contract provider boundaries', async () => {
    const identity = new MockMarketplaceIdentityProvider(clock);
    const documents = new MockMarketplaceDocumentProvider(clock);
    const controller = new AbortController();

    await expect(
      identity.linkIdentity({
        operationAttempt: 1,
        operationId: 'identity-operation',
        owner: { tenantId: 'tenant-1', userId: 'user-1' },
        signal: controller.signal,
      }),
    ).resolves.toMatchObject({
      linkedAt: timestamp,
      providerMode: 'mock',
      receiptId: 'mock-oneid:identity-operation',
      subjectKey: expect.stringMatching(/^[a-f0-9]{64}$/u),
    });

    await expect(
      documents.storeVerificationDocuments({
        documents: [
          {
            content: Uint8Array.from(Buffer.from('%PDF-proof')),
            fileName: 'proof.pdf',
            kind: 'farm',
            mimeType: 'application/pdf',
          },
        ],
        operationAttempt: 1,
        operationId: 'document-operation',
        signal: controller.signal,
      }),
    ).resolves.toMatchObject({
      evidence: [
        {
          document: {
            fileName: 'proof.pdf',
            providerReceiptId: 'mock-documents:document-operation',
            sha256: expect.stringMatching(/^[a-f0-9]{64}$/u),
            sizeBytes: 10,
          },
        },
      ],
      storedAt: timestamp,
    });
    expect(
      createMarketplaceIdentityProvider(config({ oneId: { mode: 'mock', providerName: 'mock', timeoutMs: 1 } })),
    ).toBeInstanceOf(MockMarketplaceIdentityProvider);
    expect(
      createMarketplaceDocumentProvider(
        config({ verificationDocuments: { mode: 'mock', providerName: 'mock', timeoutMs: 1 } }),
      ),
    ).toBeInstanceOf(MockMarketplaceDocumentProvider);

    const disabledIdentity = createMarketplaceIdentityProvider(config());
    const disabledDocuments = createMarketplaceDocumentProvider(config());
    await expect(
      disabledIdentity.linkIdentity({
        operationAttempt: 1,
        operationId: 'disabled',
        owner: { tenantId: 'tenant-1', userId: 'user-1' },
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow('disabled');
    await expect(
      disabledDocuments.storeVerificationDocuments({
        documents: [],
        operationAttempt: 1,
        operationId: 'disabled',
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow('disabled');

    expect(() =>
      createMarketplaceIdentityProvider(config({ oneId: { mode: 'live', providerName: 'oneid', timeoutMs: 1 } })),
    ).toThrow('requires a configured OneID provider adapter');
    expect(() =>
      createMarketplaceDocumentProvider(
        config({ verificationDocuments: { mode: 'live', providerName: 'documents', timeoutMs: 1 } }),
      ),
    ).toThrow('requires a configured document storage provider adapter');
    const artifact = new MockContractArtifactStorageProvider(clock);
    const signature = new MockQualifiedSignatureProvider(clock);
    const evidence = new MockDisputeEvidenceStorageProvider(clock);
    const payment = new MockDirectPaymentProvider(clock);
    const factoring = new MockFactoringProvider(clock);

    await expect(
      artifact.storeContractArtifact({
        artifactChecksum: 'a'.repeat(64),
        byteSize: 128,
        contractId: 'contract-1',
        operationId: 'operation-1',
      }),
    ).resolves.toMatchObject({ completedAt: timestamp, providerReference: 'mock-artifact-receipt:operation-1' });
    await expect(
      signature.qualifyContractSignature({
        artifactChecksum: 'a'.repeat(64),
        operationId: 'operation-2',
        party: 'buyer',
        snapshotRevision: 2,
      }),
    ).resolves.toMatchObject({
      completedAt: timestamp,
      providerReference: 'mock-qes:operation-2:buyer',
      safeReceipt: { signedAt: timestamp.toISOString() },
    });
    await expect(
      evidence.storeDisputeEvidence({
        checksumSha256: 'c'.repeat(64),
        content: Uint8Array.from([1, 2, 3]),
        contractId: 'contract-1',
        disputeId: 'dispute-1',
        fileName: 'proof.pdf',
        mediaType: 'application/pdf',
        operationId: 'operation-3',
      }),
    ).resolves.toMatchObject({ completedAt: timestamp, safeReceipt: { byteSize: 3, fileName: 'proof.pdf' } });
    await expect(
      payment.recordDirectPayment({
        amountUzs: 1_000,
        command: 'confirm_buyer_payment',
        contractId: 'contract-1',
        operationId: 'operation-4',
        party: 'buyer',
      }),
    ).resolves.toMatchObject({ outcome: 'confirm_buyer_payment', safeReceipt: { moneyMoved: false } });
    await expect(
      factoring.recordFactoring({
        amountUzs: 1_000,
        command: 'request_decision',
        contractId: 'contract-1',
        operationId: 'operation-5',
        party: 'seller',
      }),
    ).resolves.toMatchObject({ outcome: 'approved', safeReceipt: { decision: 'approved' } });
    await expect(
      factoring.recordFactoring({
        amountUzs: 1_000,
        command: 'close',
        contractId: 'contract-1',
        operationId: 'operation-6',
        party: 'buyer',
      }),
    ).resolves.toMatchObject({ outcome: 'close', safeReceipt: { decision: null } });
  });

  it.each([
    ['artifact', createContractArtifactStorageProvider, 'contractArtifactStorage'],
    ['signature', createQualifiedSignatureProvider, 'qualifiedSignature'],
    ['evidence', createDisputeEvidenceStorageProvider, 'disputeEvidenceStorage'],
    ['payment', createDirectPaymentProvider, 'directPayment'],
    ['factoring', createFactoringProvider, 'factoring'],
  ] as const)(
    'selects mock and disabled %s adapters and rejects unconfigured live mode',
    async (_name, factory, key) => {
      const mockConfig = config({ [key]: { mode: 'mock', providerName: 'mock', timeoutMs: 1 } });
      expect(factory(mockConfig).mode).toBe('mock');

      const disabled = factory(config());
      expect(disabled.mode).toBe('disabled');
      let invokeDisabled: () => Promise<unknown>;
      if ('storeContractArtifact' in disabled) {
        invokeDisabled = () => disabled.storeContractArtifact({} as never);
      } else if ('qualifyContractSignature' in disabled) {
        invokeDisabled = () => disabled.qualifyContractSignature({} as never);
      } else if ('storeDisputeEvidence' in disabled) {
        invokeDisabled = () => disabled.storeDisputeEvidence({} as never);
      } else if ('recordDirectPayment' in disabled) {
        invokeDisabled = () => disabled.recordDirectPayment({} as never);
      } else {
        invokeDisabled = () => disabled.recordFactoring({} as never);
      }
      await expect(invokeDisabled()).rejects.toThrow('disabled');

      expect(() => factory(config({ [key]: { mode: 'live', providerName: 'live', timeoutMs: 1 } }))).toThrow(
        'requires a configured',
      );
    },
  );

  it('supports the production clock defaults for all mock provider constructors', async () => {
    const signal = new AbortController().signal;
    await expect(
      new MockMarketplaceIdentityProvider().linkIdentity({
        operationAttempt: 1,
        operationId: 'default-clock',
        owner: { tenantId: 'tenant', userId: 'user' },
        signal,
      }),
    ).resolves.toMatchObject({ linkedAt: expect.any(Date) });
    await expect(
      new MockContractArtifactStorageProvider().storeContractArtifact({
        artifactChecksum: 'a',
        byteSize: 1,
        contractId: 'contract',
        operationId: 'default-clock',
      }),
    ).resolves.toMatchObject({ completedAt: expect.any(Date) });
    await expect(
      new MockQualifiedSignatureProvider().qualifyContractSignature({
        artifactChecksum: 'a',
        operationId: 'default-clock',
        party: 'seller',
        snapshotRevision: 0,
      }),
    ).resolves.toMatchObject({ completedAt: expect.any(Date) });
    await expect(
      new MockDisputeEvidenceStorageProvider().storeDisputeEvidence({
        checksumSha256: 'a',
        content: Uint8Array.from([1]),
        contractId: 'contract',
        disputeId: 'dispute',
        fileName: 'proof.jpg',
        mediaType: 'image/jpeg',
        operationId: 'default-clock',
      }),
    ).resolves.toMatchObject({ completedAt: expect.any(Date) });
    await expect(
      new MockDirectPaymentProvider().recordDirectPayment({
        amountUzs: 1,
        command: 'confirm_seller_receipt',
        contractId: 'contract',
        operationId: 'default-clock',
        party: 'seller',
      }),
    ).resolves.toMatchObject({ completedAt: expect.any(Date) });
    await expect(
      new MockFactoringProvider().recordFactoring({
        amountUzs: 1,
        command: 'record_seller_payout',
        contractId: 'contract',
        operationId: 'default-clock',
        party: 'seller',
      }),
    ).resolves.toMatchObject({ completedAt: expect.any(Date) });
    await expect(
      new MockMarketplaceDocumentProvider().storeVerificationDocuments({
        documents: [],
        operationAttempt: 1,
        operationId: 'default-clock',
        signal,
      }),
    ).resolves.toMatchObject({ storedAt: expect.any(Date) });
  });
});
