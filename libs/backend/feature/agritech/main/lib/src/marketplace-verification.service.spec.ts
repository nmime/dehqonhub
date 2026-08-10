// @requirements REQ-AGRITECH-INTEGRATION-013 REQ-AGRITECH-MARKETPLACE-016 REQ-AGRITECH-STAGE2-017
import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { BadRequestException, ConflictException } from '@app/backend-common-exception';
import type {
  MarketplaceDocumentProvider,
  MarketplaceIdentityProvider,
  MarketplaceVerificationRepository,
  Verification,
  VerificationDocumentInput,
} from '@app/backend-feature-agritech-shared';
import {
  MarketplaceProviderUnavailableException,
  MarketplaceVerificationService,
} from './marketplace-verification.service';

const owner = { tenantId: 'tenant-1', userId: 'user-1' };
const timestamp = new Date('2030-01-01T00:00:00.000Z');

const verification = (overrides: Partial<Verification> = {}): Verification => ({
  caseRevision: 0,
  createdAt: timestamp,
  documents: [],
  id: '11111111-1111-4111-8111-111111111111',
  identityAssurance: 'none',
  level: 'basic',
  oneIdLinked: false,
  providerMode: 'none',
  role: 'farmer',
  status: 'none',
  tenantId: owner.tenantId,
  updatedAt: timestamp,
  userId: owner.userId,
  version: 0,
  ...overrides,
});

function fixture(input?: {
  documentMode?: MarketplaceDocumentProvider['mode'];
  identityMode?: MarketplaceIdentityProvider['mode'];
  oneIdTimeoutMs?: number;
}) {
  const repository = {
    completeIdentityLink: vi.fn(),
    completeVerificationDocuments: vi.fn(),
    createVerification: vi.fn(),
    failProviderOperation: vi.fn().mockResolvedValue(undefined),
    getVerification: vi.fn().mockResolvedValue(verification()),
    prepareProviderOperation: vi.fn(),
    submitVerification: vi.fn(),
  };
  const identityProvider = {
    linkIdentity: vi.fn(),
    mode: input?.identityMode ?? 'mock',
    name: 'mock-oneid',
  };
  const documentProvider = {
    mode: input?.documentMode ?? 'mock',
    name: 'mock-document-storage',
    storeVerificationDocuments: vi.fn(),
  };
  const service = new MarketplaceVerificationService(
    repository as unknown as MarketplaceVerificationRepository,
    identityProvider as MarketplaceIdentityProvider,
    documentProvider as MarketplaceDocumentProvider,
    {
      contractArtifactStorage: { mode: 'disabled', providerName: null, timeoutMs: 100 },
      directPayment: { mode: 'disabled', providerName: null, timeoutMs: 100 },
      disputeEvidenceStorage: { mode: 'disabled', providerName: null, timeoutMs: 100 },
      factoring: { mode: 'disabled', providerName: null, timeoutMs: 100 },
      oneId: {
        mode: input?.identityMode ?? 'mock',
        providerName: 'mock-oneid',
        timeoutMs: input?.oneIdTimeoutMs ?? 100,
      },
      notificationDelivery: { mode: 'disabled', providerName: null, timeoutMs: 100 },
      promotionBilling: { mode: 'disabled', providerName: null, timeoutMs: 100 },
      qualifiedSignature: { mode: 'disabled', providerName: null, timeoutMs: 100 },
      verificationDocuments: {
        mode: input?.documentMode ?? 'mock',
        providerName: 'mock-document-storage',
        timeoutMs: 100,
      },
    },
  );
  return { documentProvider, identityProvider, repository, service };
}

describe('MarketplaceVerificationService', () => {
  it('creates a persisted verification case for the authenticated actor', async () => {
    const { repository, service } = fixture();
    repository.createVerification.mockResolvedValue({ status: 'ok', value: verification() });

    await expect(service.createVerification(owner, 'farmer', 0, 'verification-create-0001')).resolves.toMatchObject({
      role: 'farmer',
    });
    expect(repository.createVerification).toHaveBeenCalledWith(owner, 'farmer', 0, 'verification-create-0001');
  });

  it('scopes a OneID command to the real verification resource and completes provider evidence', async () => {
    const { identityProvider, repository, service } = fixture();
    repository.prepareProviderOperation.mockResolvedValue({
      status: 'ok',
      value: { attempt: 1, execute: true, operationId: 'operation-1' },
    });
    const providerResult = {
      identityAssurance: 'mock' as const,
      linkedAt: timestamp,
      providerMode: 'mock' as const,
      providerName: 'mock-oneid',
      receiptId: 'receipt-1',
      subjectKey: createHash('sha256').update('subject').digest('hex'),
    };
    identityProvider.linkIdentity.mockResolvedValue(providerResult);
    repository.completeIdentityLink.mockResolvedValue({
      status: 'ok',
      value: verification({ identityAssurance: 'mock', oneIdLinked: true, providerMode: 'mock' }),
    });

    await service.linkOneId(owner, 'oneid-key-0001');

    expect(repository.prepareProviderOperation).toHaveBeenCalledWith(
      owner,
      expect.objectContaining({
        capability: 'oneid_link',
        resourceId: '11111111-1111-4111-8111-111111111111',
        resourceRevision: 0,
        resourceType: 'verification',
      }),
    );
    expect(identityProvider.linkIdentity).toHaveBeenCalledWith({
      operationAttempt: 1,
      operationId: 'operation-1',
      owner,
      signal: expect.any(AbortSignal),
    });
    expect(repository.completeIdentityLink).toHaveBeenCalledWith(owner, 'operation-1', 1, providerResult);
  });

  it('replays the original persisted command result without calling the provider again', async () => {
    const original = verification({
      identityAssurance: 'mock',
      oneIdLinked: true,
      providerMode: 'mock',
      providerReceiptId: 'original-receipt',
      version: 1,
    });
    const { identityProvider, repository, service } = fixture();
    repository.prepareProviderOperation.mockResolvedValue({
      status: 'ok',
      value: { attempt: 1, execute: false, operationId: 'operation-1', replay: original },
    });

    await expect(service.linkOneId(owner, 'oneid-key-0001')).resolves.toBe(original);
    expect(identityProvider.linkIdentity).not.toHaveBeenCalled();
    expect(repository.completeIdentityLink).not.toHaveBeenCalled();
  });

  it('fails closed when the selected provider is disabled', async () => {
    const { repository, service } = fixture({ identityMode: 'disabled' });

    await expect(service.linkOneId(owner, 'oneid-key-0001')).rejects.toBeInstanceOf(
      MarketplaceProviderUnavailableException,
    );
    expect(repository.getVerification).not.toHaveBeenCalled();
    expect(repository.prepareProviderOperation).not.toHaveBeenCalled();
  });

  it('marks a prepared operation failed when the provider fails', async () => {
    const { identityProvider, repository, service } = fixture();
    repository.prepareProviderOperation.mockResolvedValue({
      status: 'ok',
      value: { attempt: 1, execute: true, operationId: 'operation-1' },
    });
    identityProvider.linkIdentity.mockRejectedValue(new Error('provider unavailable'));

    await expect(service.linkOneId(owner, 'oneid-key-0001')).rejects.toBeInstanceOf(
      MarketplaceProviderUnavailableException,
    );
    expect(repository.failProviderOperation).toHaveBeenCalledWith(owner, 'operation-1', 1, 'identity_provider_failed');
  });

  it('accepts one exact 10 MiB PDF and fingerprints its server-computed checksum', async () => {
    const { documentProvider, repository, service } = fixture();
    const content = new Uint8Array(10 * 1024 * 1024);
    content.set(Buffer.from('%PDF-'));
    const document: VerificationDocumentInput = {
      content,
      fileName: 'farm.pdf',
      kind: 'farm',
      mimeType: 'application/pdf',
    };
    repository.prepareProviderOperation.mockResolvedValue({
      status: 'ok',
      value: { attempt: 1, execute: true, operationId: 'operation-2' },
    });
    const providerResult = {
      evidence: [],
      providerMode: 'mock' as const,
      providerName: 'mock-document-storage',
      receiptId: 'receipt-2',
      storedAt: timestamp,
    };
    documentProvider.storeVerificationDocuments.mockResolvedValue(providerResult);
    repository.completeVerificationDocuments.mockResolvedValue({ status: 'ok', value: verification() });

    await expect(service.storeDocuments(owner, [document], 'document-key-0001')).resolves.toMatchObject({
      id: verification().id,
    });
    expect(repository.prepareProviderOperation).toHaveBeenCalledWith(
      owner,
      expect.objectContaining({
        capability: 'verification_documents',
        requestFingerprint: expect.stringMatching(/^[0-9a-f]{64}$/),
        resourceId: verification().id,
        resourceRevision: 0,
      }),
    );
    expect(documentProvider.storeVerificationDocuments).toHaveBeenCalledWith({
      documents: [document],
      operationAttempt: 1,
      operationId: 'operation-2',
      signal: expect.any(AbortSignal),
    });
  });

  it('aborts a timed-out provider attempt, marks it retryable, and fences a late result', async () => {
    vi.useFakeTimers();
    try {
      const { identityProvider, repository, service } = fixture({ oneIdTimeoutMs: 100 });
      repository.prepareProviderOperation.mockResolvedValue({
        status: 'ok',
        value: { attempt: 1, execute: true, operationId: 'operation-timeout' },
      });
      let resolveProvider: ((value: never) => void) | undefined;
      identityProvider.linkIdentity.mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveProvider = resolve;
          }),
      );

      const result = service.linkOneId(owner, 'oneid-key-timeout');
      const rejection = expect(result).rejects.toBeInstanceOf(MarketplaceProviderUnavailableException);
      await vi.advanceTimersByTimeAsync(101);
      await rejection;
      expect(repository.failProviderOperation).toHaveBeenCalledWith(
        owner,
        'operation-timeout',
        1,
        'identity_provider_timeout',
      );

      resolveProvider?.({
        identityAssurance: 'mock',
        linkedAt: timestamp,
        providerMode: 'mock',
        providerName: 'mock-oneid',
        receiptId: 'late-receipt',
        subjectKey: createHash('sha256').update('late-subject').digest('hex'),
      } as never);
      await Promise.resolve();
      expect(repository.completeIdentityLink).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it.each([
    {
      label: 'oversize evidence',
      content: (() => {
        const value = new Uint8Array(10 * 1024 * 1024 + 1);
        value.set(Buffer.from('%PDF-'));
        return value;
      })(),
      mimeType: 'application/pdf' as const,
    },
    {
      label: 'invalid file signature',
      content: Uint8Array.from(Buffer.from('not-a-png')),
      mimeType: 'image/png' as const,
    },
  ])('rejects $label before any persistence or provider call', async ({ content, mimeType }) => {
    const { documentProvider, repository, service } = fixture();

    await expect(
      service.storeDocuments(
        owner,
        [{ content, fileName: 'evidence.bin', kind: 'farm', mimeType }],
        'document-key-0001',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repository.getVerification).not.toHaveBeenCalled();
    expect(repository.prepareProviderOperation).not.toHaveBeenCalled();
    expect(documentProvider.storeVerificationDocuments).not.toHaveBeenCalled();
  });

  it('propagates a conflicting scoped idempotency key without invoking the provider', async () => {
    const { documentProvider, repository, service } = fixture();
    repository.prepareProviderOperation.mockResolvedValue({ status: 'conflict', field: 'idempotencyKey' });
    const content = Uint8Array.from(Buffer.from('%PDF-evidence'));

    await expect(
      service.storeDocuments(
        owner,
        [{ content, fileName: 'farm.pdf', kind: 'farm', mimeType: 'application/pdf' }],
        'document-key-0001',
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(documentProvider.storeVerificationDocuments).not.toHaveBeenCalled();
  });

  it('submits only through the persisted verification repository', async () => {
    const { repository, service } = fixture();
    repository.submitVerification.mockResolvedValue({
      status: 'ok',
      value: verification({ status: 'pending' }),
    });

    await expect(service.submitVerification(owner, 0, 'verification-submit-0001')).resolves.toMatchObject({
      status: 'pending',
    });
    expect(repository.submitVerification).toHaveBeenCalledWith(owner, 0, 'verification-submit-0001');
  });
});
