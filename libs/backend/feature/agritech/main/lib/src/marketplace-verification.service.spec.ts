// @requirements REQ-AGRITECH-INTEGRATION-013 REQ-AGRITECH-MARKETPLACE-016 REQ-AGRITECH-STAGE2-017
/* eslint-disable no-await-in-loop -- table-driven cases mutate stateful mocks and must remain ordered */
import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { BadRequestException, ConflictException, ResourceNotFoundException } from '@app/backend-common-exception';
import type {
  MarketplaceDocumentProvider,
  MarketplaceIdentityProvider,
  MarketplaceVerificationRepository,
  Verification,
  VerificationDocumentInput,
} from '@app/backend-feature-agritech-shared';
import {
  MarketplaceProviderUnavailableException,
  MarketplaceVerificationDomainService,
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
  }, 15_000);

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

  it('covers all verification validation, replay, provider-failure, media, and repository-result boundaries', async () => {
    const { documentProvider, identityProvider, repository, service } = fixture();

    for (const expectedRevision of [-1, 0.5]) {
      await expect(
        service.createVerification(owner, 'farmer', expectedRevision, `create-${String(expectedRevision)}-key`),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        service.submitVerification(owner, expectedRevision, `submit-${String(expectedRevision)}-key`),
      ).rejects.toBeInstanceOf(BadRequestException);
    }
    for (const [result, ErrorType] of [
      [{ status: 'not_found' }, ResourceNotFoundException],
      [{ status: 'conflict' }, ConflictException],
      [{ status: 'invalid_state', field: 'role' }, BadRequestException],
    ] as const) {
      repository.createVerification.mockResolvedValueOnce(result);
      await expect(
        service.createVerification(owner, 'farmer', 0, `create-${result.status}-key`),
      ).rejects.toBeInstanceOf(ErrorType);
    }

    repository.getVerification.mockResolvedValueOnce(undefined);
    await expect(service.linkOneId(owner, 'oneid-missing-key')).rejects.toBeInstanceOf(ResourceNotFoundException);
    repository.prepareProviderOperation.mockResolvedValueOnce({
      status: 'ok',
      value: { attempt: 1, execute: false, operationId: 'operation-no-replay' },
    });
    await expect(service.linkOneId(owner, 'oneid-replay-key')).rejects.toBeInstanceOf(BadRequestException);

    for (const providerError of [new BadRequestException(), new ConflictException('verification'), 'opaque failure']) {
      repository.prepareProviderOperation.mockResolvedValueOnce({
        status: 'ok',
        value: { attempt: 1, execute: true, operationId: `operation-${typeof providerError}` },
      });
      repository.failProviderOperation.mockRejectedValueOnce(new Error('failure ledger unavailable'));
      identityProvider.linkIdentity.mockRejectedValueOnce(providerError);
      const result = service.linkOneId(owner, `oneid-error-${typeof providerError}-key`);
      if (providerError instanceof BadRequestException || providerError instanceof ConflictException) {
        await expect(result).rejects.toBe(providerError);
      } else {
        await expect(result).rejects.toBeInstanceOf(MarketplaceProviderUnavailableException);
      }
    }

    const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0x00]);
    const documentResult = {
      evidence: [],
      providerMode: 'mock' as const,
      providerName: 'mock-document-storage',
      receiptId: 'receipt-media',
      storedAt: timestamp,
    };
    for (const [content, mimeType] of [
      [png, 'image/png'],
      [jpeg, 'image/jpeg'],
    ] as const) {
      repository.prepareProviderOperation.mockResolvedValueOnce({
        status: 'ok',
        value: { attempt: 1, execute: true, operationId: `operation-${mimeType}` },
      });
      documentProvider.storeVerificationDocuments.mockResolvedValueOnce(documentResult);
      repository.completeVerificationDocuments.mockResolvedValueOnce({ status: 'ok', value: verification() });
      await expect(
        service.storeDocuments(
          owner,
          [{ content, fileName: `proof.${mimeType === 'image/png' ? 'png' : 'jpg'}`, kind: 'farm', mimeType }],
          `documents-${mimeType.replace('/', '-')}-key`,
        ),
      ).resolves.toMatchObject({ id: verification().id });
    }
    for (const documents of [
      [],
      [
        { content: png, fileName: 'one.png', kind: 'farm' as const, mimeType: 'image/png' as const },
        { content: png, fileName: 'two.png', kind: 'farm' as const, mimeType: 'image/png' as const },
      ],
      [{ content: new Uint8Array(), fileName: 'empty.png', kind: 'farm' as const, mimeType: 'image/png' as const }],
      [
        {
          content: Uint8Array.from([0xff, 0x00, 0x00]),
          fileName: 'bad.jpg',
          kind: 'farm' as const,
          mimeType: 'image/jpeg' as const,
        },
      ],
    ]) {
      await expect(service.storeDocuments(owner, documents, 'documents-invalid-key')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    }

    const sortable = [{ content: png, fileName: 'z.png', kind: 'farm' as const, mimeType: 'image/png' as const }];
    Object.defineProperty(sortable, Symbol.iterator, {
      *value() {
        yield { content: png, fileName: 'z.png', kind: 'farm' as const, mimeType: 'image/png' as const };
        yield { content: png, fileName: 'a.png', kind: 'identity' as const, mimeType: 'image/png' as const };
      },
    });
    repository.prepareProviderOperation.mockResolvedValueOnce({
      status: 'ok',
      value: { attempt: 1, execute: true, operationId: 'operation-sorted' },
    });
    documentProvider.storeVerificationDocuments.mockResolvedValueOnce(documentResult);
    repository.completeVerificationDocuments.mockResolvedValueOnce({ status: 'ok', value: verification() });
    await service.storeDocuments(owner, sortable, 'documents-sorted-key');
    expect(documentProvider.storeVerificationDocuments).toHaveBeenLastCalledWith(
      expect.objectContaining({
        documents: [expect.objectContaining({ fileName: 'z.png' }), expect.objectContaining({ fileName: 'a.png' })],
      }),
    );

    const emptySpread = [
      { content: png, fileName: 'proof.png', kind: 'farm' as const, mimeType: 'image/png' as const },
    ];
    Object.defineProperty(emptySpread, Symbol.iterator, { *value() {} });
    await expect(service.storeDocuments(owner, emptySpread, 'documents-empty-spread-key')).rejects.toBeInstanceOf(
      BadRequestException,
    );

    repository.prepareProviderOperation.mockResolvedValueOnce({
      status: 'ok',
      value: { attempt: 1, execute: false, operationId: 'operation-document-no-replay' },
    });
    await expect(
      service.storeDocuments(
        owner,
        [{ content: png, fileName: 'proof.png', kind: 'farm', mimeType: 'image/png' }],
        'documents-no-replay-key',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    for (const providerError of [new BadRequestException(), new ConflictException('verification'), 42]) {
      repository.prepareProviderOperation.mockResolvedValueOnce({
        status: 'ok',
        value: { attempt: 1, execute: true, operationId: `document-operation-${String(providerError)}` },
      });
      repository.failProviderOperation.mockRejectedValueOnce(new Error('failure ledger unavailable'));
      documentProvider.storeVerificationDocuments.mockRejectedValueOnce(providerError);
      const result = service.storeDocuments(
        owner,
        [{ content: png, fileName: 'proof.png', kind: 'farm', mimeType: 'image/png' }],
        `documents-error-${typeof providerError}-key`,
      );
      if (providerError instanceof BadRequestException || providerError instanceof ConflictException) {
        await expect(result).rejects.toBe(providerError);
      } else {
        await expect(result).rejects.toBeInstanceOf(MarketplaceProviderUnavailableException);
      }
    }

    vi.useFakeTimers();
    try {
      const timeoutFixture = fixture();
      timeoutFixture.repository.prepareProviderOperation.mockResolvedValueOnce({
        status: 'ok',
        value: { attempt: 1, execute: true, operationId: 'document-timeout-operation' },
      });
      timeoutFixture.documentProvider.storeVerificationDocuments.mockImplementation(() => new Promise(() => undefined));
      const timeoutResult = timeoutFixture.service.storeDocuments(
        owner,
        [{ content: png, fileName: 'proof.png', kind: 'farm', mimeType: 'image/png' }],
        'documents-timeout-key',
      );
      const timeoutRejection = expect(timeoutResult).rejects.toBeInstanceOf(MarketplaceProviderUnavailableException);
      await vi.advanceTimersByTimeAsync(101);
      await timeoutRejection;
      expect(timeoutFixture.repository.failProviderOperation).toHaveBeenCalledWith(
        owner,
        'document-timeout-operation',
        1,
        'document_provider_timeout',
      );
    } finally {
      vi.useRealTimers();
    }

    vi.stubGlobal(
      'setTimeout',
      vi.fn(() => undefined),
    );
    try {
      repository.prepareProviderOperation.mockResolvedValueOnce({
        status: 'ok',
        value: { attempt: 1, execute: true, operationId: 'operation-without-timer-handle' },
      });
      identityProvider.linkIdentity.mockResolvedValueOnce({
        identityAssurance: 'mock',
        linkedAt: timestamp,
        providerMode: 'mock',
        providerName: 'mock-oneid',
        receiptId: 'receipt-without-timer-handle',
        subjectKey: createHash('sha256').update('subject-without-timer').digest('hex'),
      });
      repository.completeIdentityLink.mockResolvedValueOnce({ status: 'ok', value: verification() });
      await expect(service.linkOneId(owner, 'oneid-no-timer-handle-key')).resolves.toMatchObject({
        id: verification().id,
      });
    } finally {
      vi.unstubAllGlobals();
    }

    const disabled = fixture({ documentMode: 'disabled' });
    await expect(
      disabled.service.storeDocuments(
        owner,
        [{ content: png, fileName: 'proof.png', kind: 'farm', mimeType: 'image/png' }],
        'documents-disabled-key',
      ),
    ).rejects.toBeInstanceOf(MarketplaceProviderUnavailableException);
    expect(service.getProviderReadiness()).toMatchObject({ oneId: expect.any(Object) });

    const directDomain = new MarketplaceVerificationDomainService(
      repository as unknown as MarketplaceVerificationRepository,
      identityProvider as MarketplaceIdentityProvider,
      documentProvider as MarketplaceDocumentProvider,
    );
    repository.submitVerification.mockResolvedValueOnce({ status: 'not_found' });
    await expect(directDomain.submitVerification(owner, 0, 'submit-default-timeout-key')).rejects.toBeInstanceOf(
      ResourceNotFoundException,
    );
  });
});
