// @requirements REQ-AGRITECH-INTEGRATION-013 REQ-AGRITECH-MARKETPLACE-016 REQ-AGRITECH-STAGE2-017
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
  MarketplaceVerificationService,
} from './marketplace-verification.service';

const owner = { tenantId: 'tenant-1', userId: 'user-1' };
const timestamp = new Date('2030-01-01T00:00:00.000Z');

const pdfDocument = (): VerificationDocumentInput => ({
  content: Uint8Array.from(Buffer.from('%PDF-farm-registry')),
  fileName: 'farm.pdf',
  kind: 'farm',
  mimeType: 'application/pdf',
});

const jpegDocument = (): VerificationDocumentInput => ({
  content: Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]),
  fileName: 'passport.jpg',
  kind: 'id',
  mimeType: 'image/jpeg',
});

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

  describe('repository refusals', () => {
    it.each([
      { expected: ResourceNotFoundException, label: 'no case to advance', result: { status: 'not_found' as const } },
      { expected: ConflictException, label: 'a stale revision', result: { status: 'conflict' as const } },
      {
        expected: BadRequestException,
        label: 'an unusable role',
        result: { field: 'role', status: 'invalid_state' as const },
      },
    ])('turns $label into the matching client error', async ({ expected, result }) => {
      const { repository, service } = fixture();
      repository.createVerification.mockResolvedValue(result);
      repository.submitVerification.mockResolvedValue(result);

      await expect(service.createVerification(owner, 'farmer', 0, 'verification-create-0001')).rejects.toBeInstanceOf(
        expected,
      );
      await expect(service.submitVerification(owner, 0, 'verification-submit-0001')).rejects.toBeInstanceOf(expected);
    });

    it.each([1.5, -1])('refuses the non-integer or negative expected revision %s', async (expectedRevision) => {
      const { repository, service } = fixture();

      await expect(
        service.createVerification(owner, 'farmer', expectedRevision, 'verification-create-0001'),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        service.submitVerification(owner, expectedRevision, 'verification-submit-0001'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(repository.createVerification).not.toHaveBeenCalled();
      expect(repository.submitVerification).not.toHaveBeenCalled();
    });

    it('refuses a OneID link before the subject has any verification case', async () => {
      const { repository, service } = fixture();
      repository.getVerification.mockResolvedValue(undefined);

      await expect(service.linkOneId(owner, 'oneid-key-0001')).rejects.toBeInstanceOf(ResourceNotFoundException);
      expect(repository.prepareProviderOperation).not.toHaveBeenCalled();
    });

    it('refuses to replay a prepared operation that stored no result snapshot', async () => {
      const { identityProvider, repository, service } = fixture();
      repository.prepareProviderOperation.mockResolvedValue({
        status: 'ok',
        value: { attempt: 2, execute: false, operationId: 'operation-1' },
      });

      await expect(service.linkOneId(owner, 'oneid-key-0001')).rejects.toBeInstanceOf(BadRequestException);
      expect(identityProvider.linkIdentity).not.toHaveBeenCalled();
    });
  });

  describe('document uploads', () => {
    it.each([
      { documents: [], label: 'an upload with no document at all' },
      { documents: [pdfDocument(), pdfDocument()], label: 'a batch of two documents' },
      { documents: [{ ...pdfDocument(), content: new Uint8Array(0) }], label: 'an empty file' },
      {
        documents: [{ ...jpegDocument(), content: Uint8Array.from([0xff, 0xd8, 0x00]) }],
        label: 'a JPEG that carries no JPEG signature',
      },
      {
        documents: [{ ...pdfDocument(), content: Uint8Array.from(Buffer.from('PKzip')) }],
        label: 'a PDF that carries no PDF signature',
      },
    ])('rejects $label before any persistence or provider call', async ({ documents }) => {
      const { documentProvider, repository, service } = fixture();

      await expect(service.storeDocuments(owner, documents, 'document-key-0001')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(repository.getVerification).not.toHaveBeenCalled();
      expect(documentProvider.storeVerificationDocuments).not.toHaveBeenCalled();
    });

    it('accepts a JPEG scan and forwards exactly that document to the provider', async () => {
      const { documentProvider, repository, service } = fixture();
      const document = jpegDocument();
      repository.prepareProviderOperation.mockResolvedValue({
        status: 'ok',
        value: { attempt: 1, execute: true, operationId: 'operation-jpeg' },
      });
      documentProvider.storeVerificationDocuments.mockResolvedValue({
        evidence: [],
        providerMode: 'mock' as const,
        providerName: 'mock-document-storage',
        receiptId: 'receipt-jpeg',
        storedAt: timestamp,
      });
      repository.completeVerificationDocuments.mockResolvedValue({ status: 'ok', value: verification() });

      await expect(service.storeDocuments(owner, [document], 'document-key-0002')).resolves.toMatchObject({
        id: verification().id,
      });
      expect(documentProvider.storeVerificationDocuments).toHaveBeenCalledWith({
        documents: [document],
        operationAttempt: 1,
        operationId: 'operation-jpeg',
        signal: expect.any(AbortSignal),
      });
    });

    it('replays a stored document result without touching the storage provider', async () => {
      const original = verification({ version: 3 });
      const { documentProvider, repository, service } = fixture();
      repository.prepareProviderOperation.mockResolvedValue({
        status: 'ok',
        value: { attempt: 1, execute: false, operationId: 'operation-3', replay: original },
      });

      await expect(service.storeDocuments(owner, [pdfDocument()], 'document-key-0001')).resolves.toBe(original);
      expect(documentProvider.storeVerificationDocuments).not.toHaveBeenCalled();
      expect(repository.completeVerificationDocuments).not.toHaveBeenCalled();
    });

    it('fails closed when the document provider is disabled', async () => {
      const { repository, service } = fixture({ documentMode: 'disabled' });

      await expect(service.storeDocuments(owner, [pdfDocument()], 'document-key-0001')).rejects.toMatchObject({
        extensions: { capability: 'verification_documents', providerMode: 'disabled', retryable: false },
      });
      expect(repository.getVerification).not.toHaveBeenCalled();
    });

    it('marks a crashed document attempt failed and reports it as retryable', async () => {
      const { documentProvider, repository, service } = fixture();
      repository.prepareProviderOperation.mockResolvedValue({
        status: 'ok',
        value: { attempt: 2, execute: true, operationId: 'operation-4' },
      });
      documentProvider.storeVerificationDocuments.mockRejectedValue(new Error('storage bucket offline'));

      await expect(service.storeDocuments(owner, [pdfDocument()], 'document-key-0001')).rejects.toMatchObject({
        extensions: { capability: 'verification_documents', providerMode: 'mock', retryable: true },
      });
      expect(repository.failProviderOperation).toHaveBeenCalledWith(
        owner,
        'operation-4',
        2,
        'document_provider_failed',
      );
    });

    it('aborts a timed-out document attempt and records the timeout reason', async () => {
      vi.useFakeTimers();
      try {
        const { documentProvider, repository, service } = fixture();
        repository.prepareProviderOperation.mockResolvedValue({
          status: 'ok',
          value: { attempt: 1, execute: true, operationId: 'operation-5' },
        });
        documentProvider.storeVerificationDocuments.mockImplementation(() => new Promise(() => undefined));

        const result = service.storeDocuments(owner, [pdfDocument()], 'document-key-0001');
        const rejection = expect(result).rejects.toBeInstanceOf(MarketplaceProviderUnavailableException);
        await vi.advanceTimersByTimeAsync(101);
        await rejection;

        expect(repository.failProviderOperation).toHaveBeenCalledWith(
          owner,
          'operation-5',
          1,
          'document_provider_timeout',
        );
      } finally {
        vi.useRealTimers();
      }
    });

    it.each([
      { error: new BadRequestException({ meta: { field: 'documents' } }), label: 'a rejected upload' },
      { error: new ConflictException('verification-document'), label: 'a duplicate upload' },
    ])('rethrows $label reported by the document provider verbatim', async ({ error }) => {
      const { documentProvider, repository, service } = fixture();
      repository.prepareProviderOperation.mockResolvedValue({
        status: 'ok',
        value: { attempt: 1, execute: true, operationId: 'operation-6' },
      });
      documentProvider.storeVerificationDocuments.mockRejectedValue(error);

      await expect(service.storeDocuments(owner, [pdfDocument()], 'document-key-0001')).rejects.toBe(error);
      expect(repository.failProviderOperation).toHaveBeenCalledWith(
        owner,
        'operation-6',
        1,
        'document_provider_failed',
      );
    });
  });

  describe('provider crash bookkeeping', () => {
    it.each([
      { error: new BadRequestException({ meta: { field: 'subjectKey' } }), label: 'a rejected subject' },
      { error: new ConflictException('verification'), label: 'an already linked subject' },
    ])('rethrows $label reported by the identity provider verbatim', async ({ error }) => {
      const { identityProvider, repository, service } = fixture();
      repository.prepareProviderOperation.mockResolvedValue({
        status: 'ok',
        value: { attempt: 1, execute: true, operationId: 'operation-7' },
      });
      identityProvider.linkIdentity.mockRejectedValue(error);

      await expect(service.linkOneId(owner, 'oneid-key-0001')).rejects.toBe(error);
      expect(repository.completeIdentityLink).not.toHaveBeenCalled();
    });

    it.each([
      { call: 'linkOneId' as const, capability: 'oneid_link' },
      { call: 'storeDocuments' as const, capability: 'verification_documents' },
    ])('wraps a non-Error $call rejection in a synthetic cause', async ({ call, capability }) => {
      const { documentProvider, identityProvider, repository, service } = fixture();
      repository.prepareProviderOperation.mockResolvedValue({
        status: 'ok',
        value: { attempt: 1, execute: true, operationId: 'operation-8' },
      });
      identityProvider.linkIdentity.mockRejectedValue('socket hang up');
      documentProvider.storeVerificationDocuments.mockRejectedValue('socket hang up');

      const rejected =
        call === 'linkOneId'
          ? service.linkOneId(owner, 'oneid-key-0001')
          : service.storeDocuments(owner, [pdfDocument()], 'document-key-0001');

      await expect(rejected).rejects.toMatchObject({
        cause: expect.any(Error),
        extensions: { capability, retryable: true },
      });
    });

    it.each([{ call: 'linkOneId' as const }, { call: 'storeDocuments' as const }])(
      'still reports the $call outage when the failure ledger write itself fails',
      async ({ call }) => {
        const { documentProvider, identityProvider, repository, service } = fixture();
        repository.prepareProviderOperation.mockResolvedValue({
          status: 'ok',
          value: { attempt: 1, execute: true, operationId: 'operation-9' },
        });
        identityProvider.linkIdentity.mockRejectedValue(new Error('provider unavailable'));
        documentProvider.storeVerificationDocuments.mockRejectedValue(new Error('provider unavailable'));
        repository.failProviderOperation.mockRejectedValue(new Error('ledger unavailable'));

        const rejected =
          call === 'linkOneId'
            ? service.linkOneId(owner, 'oneid-key-0001')
            : service.storeDocuments(owner, [pdfDocument()], 'document-key-0001');

        await expect(rejected).rejects.toBeInstanceOf(MarketplaceProviderUnavailableException);
      },
    );

    it('turns a refused provider operation record into the matching client error', async () => {
      const { identityProvider, repository, service } = fixture();
      repository.prepareProviderOperation.mockResolvedValue({ status: 'not_found' });

      await expect(service.linkOneId(owner, 'oneid-key-0001')).rejects.toBeInstanceOf(ResourceNotFoundException);
      expect(identityProvider.linkIdentity).not.toHaveBeenCalled();
    });
  });
});
