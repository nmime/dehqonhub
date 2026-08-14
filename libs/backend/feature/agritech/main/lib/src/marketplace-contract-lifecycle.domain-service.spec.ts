// @requirements REQ-AGRITECH-INTEGRATION-013 REQ-AGRITECH-STAGE2-017 REQ-AGRITECH-LIFECYCLE-020
import { describe, expect, it, vi } from 'vitest';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  ResourceNotFoundException,
} from '@app/backend-common-exception';
import {
  marketplaceContractTemplateVersion,
  maximumMarketplaceDisputeEvidenceBytes,
  type MarketplaceContractArtifactSnapshot,
} from '@app/backend-feature-agritech-shared';
import { MarketplaceContractLifecycleDomainService } from './marketplace-contract-lifecycle.domain-service';
import { MarketplaceProviderUnavailableException } from './marketplace-verification.domain-service';

const buyer = { tenantId: 'buyer-tenant', userId: 'buyer-user' };
const seller = { tenantId: 'seller-tenant', userId: 'seller-user' };
const admin = { tenantId: 'buyer-tenant', userId: 'admin-user' };
const contractId = '44444444-4444-4444-8444-444444444444';
const completedAt = new Date('2026-08-10T09:00:00.000Z');

const snapshot: MarketplaceContractArtifactSnapshot = {
  amountUzs: 40_800_000,
  buyer: {
    legalName: 'Bahor Savdo MChJ',
    partnerId: '22222222-2222-4222-8222-222222222222',
    region: 'Samarqand',
    tenantId: buyer.tenantId,
    userId: buyer.userId,
  },
  contractCreatedAt: '2026-08-10T08:00:00.000Z',
  contractId,
  delivery: { days: 8, note: 'Samarqand warehouse', priceUzs: 800_000, terms: 'seller_delivery' },
  lines: [
    {
      lineTotalUzs: 40_000_000,
      name: 'Corn seed, F1 hybrid',
      quantity: 10,
      sourceId: '11111111-1111-4111-8111-111111111111',
      sourceKind: 'product',
      sourcePublicationId: '33333333-3333-4333-8333-333333333333',
      sourceRevision: 3,
      unit: 'ton',
      unitPriceUzs: 4_000_000,
    },
  ],
  seller: {
    legalName: 'Zamin Agro MChJ',
    partnerId: '55555555-5555-4555-8555-555555555555',
    region: 'Samarqand',
    tenantId: seller.tenantId,
    userId: seller.userId,
  },
  settlementKind: 'factoring',
  snapshotRevision: 1,
  subject: 'Corn seed, 10 tons',
  templateVersion: marketplaceContractTemplateVersion,
};

const artifact = { checksumSha256: 'a'.repeat(64), id: 'artifact-1', snapshotRevision: 1 };
const lifecycle = { contractId, status: 'signed' };
const ok = <T>(value: T) => ({ status: 'ok' as const, value });

const pdfMagic = () => Uint8Array.from([...Buffer.from('%PDF-'), 0x0a]);
const jpegMagic = () => Uint8Array.from([0xff, 0xd8, 0xff, 0xe0]);
const pngMagic = () => Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Every provider answers with the safe receipt shape the ledger persists. */
const providerResult = {
  completedAt,
  outcome: 'stored' as const,
  providerEventId: 'event-1',
  providerMode: 'mock' as const,
  providerName: 'mock-provider',
  providerReference: 'reference-1',
  safeReceipt: { reference: 'reference-1' },
};

function fixture(overrides: { mode?: 'mock' | 'live' | 'disabled' } = {}) {
  const mode = overrides.mode ?? 'mock';
  const lifecycleRepository = {
    activateCommissionRatePolicy: vi.fn().mockResolvedValue(ok({ version: 'v2' })),
    completeArtifact: vi.fn().mockResolvedValue(ok(artifact)),
    completeDisputeEvidence: vi.fn().mockResolvedValue(ok({ id: 'evidence-1' })),
    completeSignature: vi.fn().mockResolvedValue(ok(lifecycle)),
    completeSettlementProviderCommand: vi.fn().mockResolvedValue(ok(lifecycle)),
    downloadArtifact: vi.fn().mockResolvedValue(ok({ content: pdfMagic() })),
    findArtifact: vi.fn().mockResolvedValue(ok(artifact)),
    getLifecycle: vi.fn().mockResolvedValue(ok(lifecycle)),
    getLifecycleForAdmin: vi.fn().mockResolvedValue(ok(lifecycle)),
    listCommissionRatePolicies: vi.fn().mockResolvedValue([{ version: 'v1' }]),
    openDispute: vi.fn().mockResolvedValue(ok(lifecycle)),
    prepareArtifact: vi.fn().mockResolvedValue(ok({ snapshot, snapshotFingerprint: 'snapshot-fingerprint' })),
    prepareDisputeEvidence: vi
      .fn()
      .mockResolvedValue(ok({ disputeId: 'dispute-1', disputeRevision: 2, party: 'buyer' })),
    prepareSettlementProviderCommand: vi.fn().mockResolvedValue(
      ok({
        amountUzs: 40_800_000,
        command: 'confirm_buyer_payment',
        expectedRevision: 3,
        party: 'buyer',
        settlement: { kind: 'direct_payment' },
      }),
    ),
    prepareSignature: vi.fn().mockResolvedValue(ok({ artifact, party: 'buyer', settlement: { kind: 'factoring' } })),
    recordFactoringConsent: vi.fn().mockResolvedValue(ok(lifecycle)),
    resolveDispute: vi.fn().mockResolvedValue(ok(lifecycle)),
    transitionFulfillment: vi.fn().mockResolvedValue(ok(lifecycle)),
  };
  const providerOperations = {
    completeProviderOperation: vi.fn().mockResolvedValue(ok(undefined)),
    failProviderOperation: vi.fn().mockResolvedValue(ok(undefined)),
    prepareProviderOperation: vi.fn().mockResolvedValue(ok({ attempt: 1, execute: true, operationId: 'operation-1' })),
  };
  const artifactStorage = { mode, name: 'mock-artifact-storage', storeContractArtifact: vi.fn() };
  const qualifiedSignature = { mode, name: 'mock-signature', qualifyContractSignature: vi.fn() };
  const directPayment = { mode, name: 'mock-payment', recordDirectPayment: vi.fn() };
  const factoring = { mode, name: 'mock-factoring', recordFactoring: vi.fn() };
  const disputeEvidenceStorage = { mode, name: 'mock-evidence-storage', storeDisputeEvidence: vi.fn() };

  artifactStorage.storeContractArtifact.mockResolvedValue(providerResult);
  qualifiedSignature.qualifyContractSignature.mockResolvedValue({ ...providerResult, outcome: 'signature_recorded' });
  directPayment.recordDirectPayment.mockResolvedValue({ ...providerResult, outcome: 'payment_confirmed' });
  factoring.recordFactoring.mockResolvedValue({ ...providerResult, outcome: 'decision_requested' });
  disputeEvidenceStorage.storeDisputeEvidence.mockResolvedValue(providerResult);

  return {
    artifactStorage,
    directPayment,
    disputeEvidenceStorage,
    factoring,
    lifecycleRepository,
    providerOperations,
    qualifiedSignature,
    service: new MarketplaceContractLifecycleDomainService(
      lifecycleRepository as never,
      providerOperations as never,
      artifactStorage as never,
      qualifiedSignature as never,
      directPayment as never,
      factoring as never,
      disputeEvidenceStorage as never,
      {
        artifactStorageTimeoutMs: 50,
        directPaymentTimeoutMs: 50,
        disputeEvidenceStorageTimeoutMs: 50,
        factoringTimeoutMs: 50,
        qualifiedSignatureTimeoutMs: 50,
      },
    ),
  };
}

describe('MarketplaceContractLifecycleDomainService artifacts', () => {
  it('renders the snapshot, files the provider operation, and returns the completed artifact', async () => {
    const { artifactStorage, lifecycleRepository, providerOperations, service } = fixture();

    await expect(service.createArtifact(buyer, contractId, 'factoring', 'artifact-key-1')).resolves.toBe(artifact);

    expect(lifecycleRepository.prepareArtifact).toHaveBeenCalledWith(
      buyer,
      contractId,
      'factoring',
      'artifact-key-1',
      expect.any(String),
    );
    expect(providerOperations.prepareProviderOperation).toHaveBeenCalledWith(
      buyer,
      expect.objectContaining({
        actorType: 'contract_buyer',
        capability: 'contract_artifact_storage',
        idempotencyKey: 'artifact-key-1',
        resourceRevision: 1,
      }),
    );
    const stored = artifactStorage.storeContractArtifact.mock.calls[0]?.[0];
    expect(stored).toMatchObject({ contractId, operationAttempt: 1, snapshotRevision: 1 });
    expect(Buffer.from(stored.content.subarray(0, 5)).toString('ascii')).toBe('%PDF-');
    expect(providerOperations.completeProviderOperation).toHaveBeenCalledWith(
      buyer,
      'operation-1',
      1,
      expect.objectContaining({
        resultDescriptor: expect.objectContaining({ outcome: 'stored', resourceId: contractId }),
      }),
    );
  });

  it('returns an already-stored artifact without rendering or calling the provider again', async () => {
    const { artifactStorage, lifecycleRepository, providerOperations, service } = fixture();
    lifecycleRepository.prepareArtifact.mockResolvedValue(
      ok({ existingArtifact: artifact, snapshot, snapshotFingerprint: 'snapshot-fingerprint' }),
    );

    await expect(service.createArtifact(buyer, contractId, 'factoring', 'artifact-key-1')).resolves.toBe(artifact);
    expect(providerOperations.prepareProviderOperation).not.toHaveBeenCalled();
    expect(artifactStorage.storeContractArtifact).not.toHaveBeenCalled();
  });

  it('skips the provider call when the ledger already holds a succeeded attempt', async () => {
    const { artifactStorage, providerOperations, service } = fixture();
    providerOperations.prepareProviderOperation.mockResolvedValue(
      ok({ attempt: 2, execute: false, operationId: 'operation-1' }),
    );

    await expect(service.createArtifact(buyer, contractId, 'factoring', 'artifact-key-1')).resolves.toBe(artifact);
    expect(artifactStorage.storeContractArtifact).not.toHaveBeenCalled();
    expect(providerOperations.completeProviderOperation).not.toHaveBeenCalled();
  });

  it('names the seller as the acting party and refuses an account that is neither', async () => {
    const asSeller = fixture();
    await asSeller.service.createArtifact(seller, contractId, 'factoring', 'artifact-key-1');
    expect(asSeller.providerOperations.prepareProviderOperation).toHaveBeenCalledWith(
      seller,
      expect.objectContaining({ actorType: 'contract_seller' }),
    );

    const asStranger = fixture();
    await expect(
      asStranger.service.createArtifact({ tenantId: 'other', userId: 'other' }, contractId, 'factoring', 'key'),
    ).rejects.toThrow(ForbiddenException);
  });

  it('refuses to start when the artifact storage capability is switched off', async () => {
    const { lifecycleRepository, service } = fixture({ mode: 'disabled' });

    await expect(service.createArtifact(buyer, contractId, 'factoring', 'artifact-key-1')).rejects.toThrow(
      MarketplaceProviderUnavailableException,
    );
    expect(lifecycleRepository.prepareArtifact).not.toHaveBeenCalled();
  });
});

describe('MarketplaceContractLifecycleDomainService signatures and settlement', () => {
  it('qualifies a signature and completes it against the recorded operation', async () => {
    const { qualifiedSignature, providerOperations, service } = fixture();

    await expect(service.sign(buyer, contractId, 'sign-key-1')).resolves.toBe(lifecycle);
    expect(qualifiedSignature.qualifyContractSignature).toHaveBeenCalledWith(
      expect.objectContaining({ artifactChecksum: artifact.checksumSha256, contractId, party: 'buyer' }),
    );
    expect(providerOperations.prepareProviderOperation).toHaveBeenCalledWith(
      buyer,
      expect.objectContaining({ actorType: 'contract_buyer', capability: 'qualified_signature' }),
    );
  });

  it('reads back the lifecycle instead of signing twice', async () => {
    const { lifecycleRepository, qualifiedSignature, service } = fixture();
    lifecycleRepository.prepareSignature.mockResolvedValue(
      ok({ artifact, existingSignature: { id: 'signature-1' }, party: 'buyer', settlement: { kind: 'factoring' } }),
    );

    await expect(service.sign(buyer, contractId, 'sign-key-1')).resolves.toBe(lifecycle);
    expect(lifecycleRepository.getLifecycle).toHaveBeenCalledWith(buyer, contractId);
    expect(qualifiedSignature.qualifyContractSignature).not.toHaveBeenCalled();
  });

  it('completes a replayed signature without calling the signature provider again', async () => {
    const { providerOperations, qualifiedSignature, service } = fixture();
    providerOperations.prepareProviderOperation.mockResolvedValue(
      ok({ attempt: 3, execute: false, operationId: 'operation-1' }),
    );

    await expect(service.sign(buyer, contractId, 'sign-key-1')).resolves.toBe(lifecycle);
    expect(qualifiedSignature.qualifyContractSignature).not.toHaveBeenCalled();
    expect(providerOperations.completeProviderOperation).not.toHaveBeenCalled();
    expect(providerOperations.failProviderOperation).not.toHaveBeenCalled();
  });

  it('files an adapter that throws synchronously as an unavailable provider, not a timeout', async () => {
    const { providerOperations, qualifiedSignature, service } = fixture();
    // A misbehaving adapter can throw before it ever returns a promise. The
    // provider race must still fail the attempt and leave no timer behind.
    qualifiedSignature.qualifyContractSignature.mockImplementation(() => {
      throw new Error('adapter threw before returning');
    });

    await expect(service.sign(buyer, contractId, 'sign-key-1')).rejects.toThrow(
      MarketplaceProviderUnavailableException,
    );
    expect(providerOperations.failProviderOperation).toHaveBeenCalledWith(
      buyer,
      'operation-1',
      1,
      'qualified_signature_failed',
      undefined,
    );
  });

  it('reads a tenant-scoped lifecycle for an administrator without an owning account', async () => {
    const { lifecycleRepository, service } = fixture();

    await expect(service.getLifecycleForAdmin('buyer-tenant', contractId)).resolves.toBe(lifecycle);
    expect(lifecycleRepository.getLifecycleForAdmin).toHaveBeenCalledWith('buyer-tenant', contractId);
    expect(lifecycleRepository.getLifecycle).not.toHaveBeenCalled();
  });

  it('files the seller side of a signature against the seller actor type', async () => {
    const { lifecycleRepository, providerOperations, service } = fixture();
    lifecycleRepository.prepareSignature.mockResolvedValue(
      ok({ artifact, party: 'seller', settlement: { kind: 'direct_payment' } }),
    );

    await service.sign(seller, contractId, 'sign-key-2');
    expect(providerOperations.prepareProviderOperation).toHaveBeenCalledWith(
      seller,
      expect.objectContaining({ actorType: 'contract_seller' }),
    );
  });

  it('routes a direct-payment command to the payment provider', async () => {
    const { directPayment, factoring, providerOperations, service } = fixture();

    await expect(
      service.recordSettlementCommand(buyer, contractId, 'confirm_buyer_payment', 'settle-key-1'),
    ).resolves.toBe(lifecycle);
    expect(directPayment.recordDirectPayment).toHaveBeenCalledWith(
      expect.objectContaining({ amountUzs: 40_800_000, command: 'confirm_buyer_payment', party: 'buyer' }),
    );
    expect(factoring.recordFactoring).not.toHaveBeenCalled();
    expect(providerOperations.prepareProviderOperation).toHaveBeenCalledWith(
      buyer,
      expect.objectContaining({ actorType: 'contract_buyer', capability: 'direct_payment' }),
    );
  });

  it('routes a factoring command to the factoring provider and carries a reconciliation reason through', async () => {
    const { directPayment, factoring, lifecycleRepository, providerOperations, service } = fixture();
    lifecycleRepository.prepareSettlementProviderCommand.mockResolvedValue(
      ok({
        amountUzs: 40_800_000,
        command: 'request_decision',
        expectedRevision: 4,
        party: 'seller',
        settlement: { kind: 'factoring' },
      }),
    );
    factoring.recordFactoring.mockResolvedValue({
      ...providerResult,
      outcome: 'decision_requested',
      reconciliationReason: 'provider_outcome_unknown',
    });

    await expect(service.recordSettlementCommand(seller, contractId, 'request_decision', 'settle-key-2')).resolves.toBe(
      lifecycle,
    );
    expect(factoring.recordFactoring).toHaveBeenCalledWith(
      expect.objectContaining({ command: 'request_decision', party: 'seller' }),
    );
    expect(directPayment.recordDirectPayment).not.toHaveBeenCalled();
    expect(providerOperations.prepareProviderOperation).toHaveBeenCalledWith(
      seller,
      expect.objectContaining({ actorType: 'contract_seller', capability: 'factoring' }),
    );
    // An unknown provider outcome has to survive into the ledger, otherwise the
    // reconciliation job has nothing to look for.
    expect(providerOperations.completeProviderOperation).toHaveBeenCalledWith(
      seller,
      'operation-1',
      1,
      expect.objectContaining({ reconciliationReason: 'provider_outcome_unknown' }),
    );
  });

  it('skips the settlement provider when the ledger already holds a succeeded attempt', async () => {
    const { directPayment, providerOperations, service } = fixture();
    providerOperations.prepareProviderOperation.mockResolvedValue(
      ok({ attempt: 2, execute: false, operationId: 'operation-1' }),
    );

    await service.recordSettlementCommand(buyer, contractId, 'confirm_buyer_payment', 'settle-key-3');
    expect(directPayment.recordDirectPayment).not.toHaveBeenCalled();
  });

  it('refuses a settlement command whose capability provider is switched off', async () => {
    const { service } = fixture({ mode: 'disabled' });

    await expect(
      service.recordSettlementCommand(buyer, contractId, 'confirm_buyer_payment', 'settle-key-4'),
    ).rejects.toThrow(MarketplaceProviderUnavailableException);
  });

  it('refuses to sign when the qualified signature provider is switched off', async () => {
    const { lifecycleRepository, service } = fixture({ mode: 'disabled' });

    await expect(service.sign(buyer, contractId, 'sign-key-3')).rejects.toThrow(
      MarketplaceProviderUnavailableException,
    );
    expect(lifecycleRepository.prepareSignature).not.toHaveBeenCalled();
  });
});

describe('MarketplaceContractLifecycleDomainService dispute evidence', () => {
  it('accepts a PDF, a JPEG, and a PNG whose bytes match the declared media type', async () => {
    for (const [mediaType, content] of [
      ['application/pdf', pdfMagic()],
      ['image/jpeg', jpegMagic()],
      ['image/png', pngMagic()],
    ] as const) {
      const { disputeEvidenceStorage, lifecycleRepository, service } = fixture();

      await expect(
        service.storeDisputeEvidence(buyer, contractId, { content, fileName: ' proof.bin ', mediaType }, 'ev-key-1'),
      ).resolves.toEqual({ id: 'evidence-1' });
      expect(disputeEvidenceStorage.storeDisputeEvidence).toHaveBeenCalledWith(
        expect.objectContaining({ disputeId: 'dispute-1', fileName: 'proof.bin', mediaType }),
      );
      expect(lifecycleRepository.completeDisputeEvidence).toHaveBeenCalledWith(
        buyer,
        'operation-1',
        expect.objectContaining({ byteSize: content.byteLength, fileName: 'proof.bin', mediaType }),
      );
    }
  });

  it('rejects evidence whose bytes contradict the declared media type', async () => {
    const { service } = fixture();

    for (const [mediaType, content] of [
      ['application/pdf', jpegMagic()],
      ['image/jpeg', pdfMagic()],
      ['image/png', jpegMagic()],
      ['application/pdf', Uint8Array.from([0x25])],
    ] as const) {
      await expect(
        service.storeDisputeEvidence(buyer, contractId, { content, fileName: 'proof.bin', mediaType }, 'ev-key-1'),
      ).rejects.toThrow(BadRequestException);
    }
  });

  it('rejects an empty upload, an oversized upload, and an unusable file name', async () => {
    const { service } = fixture();
    const evidence = (content: Uint8Array, fileName: string) => ({
      content,
      fileName,
      mediaType: 'application/pdf' as const,
    });
    const oversized = new Uint8Array(maximumMarketplaceDisputeEvidenceBytes + 1);
    oversized.set(pdfMagic());

    for (const input of [
      evidence(new Uint8Array(0), 'proof.pdf'),
      evidence(oversized, 'proof.pdf'),
      evidence(pdfMagic(), '   '),
      evidence(pdfMagic(), `${'p'.repeat(201)}.pdf`),
      // Path separators would let an upload escape its storage prefix, and control or
      // bidi-override characters would let a file present itself as another type.
      evidence(pdfMagic(), 'nested/proof.pdf'),
      evidence(pdfMagic(), 'nested\\proof.pdf'),
      evidence(pdfMagic(), 'proof\u0001.pdf'),
      evidence(pdfMagic(), 'proof\u007f.pdf'),
      evidence(pdfMagic(), 'proof\u202egnp.fdp'),
      evidence(pdfMagic(), 'proof\u2066.pdf'),
    ]) {
      await expect(service.storeDisputeEvidence(buyer, contractId, input, 'ev-key-1')).rejects.toThrow(
        BadRequestException,
      );
    }

    // An ordinary name with spaces and non-Latin letters is not suspicious.
    await expect(
      service.storeDisputeEvidence(buyer, contractId, evidence(pdfMagic(), 'yuk xati — 2026.pdf'), 'ev-key-2'),
    ).resolves.toEqual({ id: 'evidence-1' });
  });

  it('files seller-side evidence against the seller actor type', async () => {
    const { lifecycleRepository, providerOperations, service } = fixture();
    lifecycleRepository.prepareDisputeEvidence.mockResolvedValue(
      ok({ disputeId: 'dispute-1', disputeRevision: 2, party: 'seller' }),
    );

    await service.storeDisputeEvidence(
      seller,
      contractId,
      { content: pdfMagic(), fileName: 'proof.pdf', mediaType: 'application/pdf' },
      'ev-key-2',
    );
    expect(providerOperations.prepareProviderOperation).toHaveBeenCalledWith(
      seller,
      expect.objectContaining({ actorType: 'contract_seller', capability: 'dispute_evidence_storage' }),
    );
  });

  it('skips storage when the ledger already holds a succeeded attempt', async () => {
    const { disputeEvidenceStorage, providerOperations, service } = fixture();
    providerOperations.prepareProviderOperation.mockResolvedValue(
      ok({ attempt: 3, execute: false, operationId: 'operation-1' }),
    );

    await service.storeDisputeEvidence(
      buyer,
      contractId,
      { content: pdfMagic(), fileName: 'proof.pdf', mediaType: 'application/pdf' },
      'ev-key-3',
    );
    expect(disputeEvidenceStorage.storeDisputeEvidence).not.toHaveBeenCalled();
  });

  it('refuses to start when evidence storage is switched off', async () => {
    const { service } = fixture({ mode: 'disabled' });

    await expect(
      service.storeDisputeEvidence(
        buyer,
        contractId,
        { content: pdfMagic(), fileName: 'proof.pdf', mediaType: 'application/pdf' },
        'ev-key-4',
      ),
    ).rejects.toThrow(MarketplaceProviderUnavailableException);
  });
});

describe('MarketplaceContractLifecycleDomainService provider failures', () => {
  it('reports a provider timeout as retryable and marks the attempt outcome unknown', async () => {
    const { artifactStorage, providerOperations, service } = fixture();
    artifactStorage.storeContractArtifact.mockImplementation(
      () =>
        new Promise((resolve) =>
          setTimeout(() => {
            resolve(providerResult);
          }, 500),
        ),
    );

    await expect(service.createArtifact(buyer, contractId, 'factoring', 'artifact-key-1')).rejects.toThrow(
      MarketplaceProviderUnavailableException,
    );
    expect(providerOperations.failProviderOperation).toHaveBeenCalledWith(
      buyer,
      'operation-1',
      1,
      'contract_artifact_storage_timeout',
      'provider_outcome_unknown',
    );
  });

  it('records a plain provider crash without claiming the outcome is unknown', async () => {
    const { artifactStorage, providerOperations, service } = fixture();
    artifactStorage.storeContractArtifact.mockRejectedValue(new Error('socket hang up'));

    await expect(service.createArtifact(buyer, contractId, 'factoring', 'artifact-key-1')).rejects.toThrow(
      MarketplaceProviderUnavailableException,
    );
    expect(providerOperations.failProviderOperation).toHaveBeenCalledWith(
      buyer,
      'operation-1',
      1,
      'contract_artifact_storage_failed',
      undefined,
    );
  });

  it('passes a client-side provider rejection through unchanged', async () => {
    for (const error of [
      new BadRequestException({ meta: { field: 'content' } }),
      new ConflictException('contract'),
      new ForbiddenException('contract'),
    ]) {
      const { artifactStorage, service } = fixture();
      artifactStorage.storeContractArtifact.mockRejectedValue(error);

      await expect(service.createArtifact(buyer, contractId, 'factoring', 'artifact-key-1')).rejects.toBe(error);
    }
    // Three sequential artifact renders are compute-bound; the default 5s budget
    // is not enough when the whole instrumented suite competes for the same cores.
  }, 30_000);

  it('survives a failure ledger write that itself fails', async () => {
    const { artifactStorage, providerOperations, service } = fixture();
    artifactStorage.storeContractArtifact.mockRejectedValue('not an Error');
    providerOperations.failProviderOperation.mockRejectedValue(new Error('ledger offline'));

    await expect(service.createArtifact(buyer, contractId, 'factoring', 'artifact-key-1')).rejects.toThrow(
      MarketplaceProviderUnavailableException,
    );
  });

  it('demands reconciliation when the provider succeeded but the completion write did not', async () => {
    const { providerOperations, service } = fixture();
    providerOperations.completeProviderOperation.mockResolvedValue({ status: 'conflict' });

    await expect(service.createArtifact(buyer, contractId, 'factoring', 'artifact-key-1')).rejects.toThrow(
      MarketplaceProviderUnavailableException,
    );
    expect(providerOperations.failProviderOperation).toHaveBeenCalledWith(
      buyer,
      'operation-1',
      1,
      'contract_artifact_storage_completion_persist_failed',
      'provider_outcome_unknown',
    );
  });

  it('still demands reconciliation when the completion write throws a bare value', async () => {
    const { providerOperations, service } = fixture();
    providerOperations.completeProviderOperation.mockRejectedValue('database gone');
    providerOperations.failProviderOperation.mockRejectedValue(new Error('ledger offline'));

    await expect(service.createArtifact(buyer, contractId, 'factoring', 'artifact-key-1')).rejects.toThrow(
      MarketplaceProviderUnavailableException,
    );
  });
});

describe('MarketplaceContractLifecycleDomainService repository delegation', () => {
  it('forwards every command that needs no provider call', async () => {
    const { lifecycleRepository, service } = fixture();

    await expect(service.consentFactoring(buyer, contractId, 'consent-1')).resolves.toBe(lifecycle);
    await expect(service.transitionFulfillment(seller, contractId, 'start', 'ship-1')).resolves.toBe(lifecycle);
    await expect(service.openDispute(buyer, contractId, 'quality_issue', 'dispute-1')).resolves.toBe(lifecycle);
    await expect(
      service.resolveDispute(admin, contractId, 'dismissed', ['evidence-b', 'evidence-a'], 2, '  settled  ', 'res-1'),
    ).resolves.toBe(lifecycle);
    await expect(service.getLifecycle(buyer, contractId)).resolves.toBe(lifecycle);
    await expect(service.getArtifact(buyer, contractId)).resolves.toBe(artifact);
    await expect(service.downloadArtifact(buyer, contractId)).resolves.toMatchObject({ content: expect.anything() });
    await expect(service.listCommissionRatePolicies()).resolves.toEqual([{ version: 'v1' }]);
    await expect(
      service.activateCommissionRatePolicy(admin, 'v2', { buyerRate: 0.01, sellerRate: 0.02 } as never, 'policy-1'),
    ).resolves.toEqual({ version: 'v2' });

    expect(lifecycleRepository.recordFactoringConsent).toHaveBeenCalledWith(
      buyer,
      contractId,
      'consent-1',
      expect.any(String),
    );
    // Evidence ids are fingerprinted in a stable order so two admins selecting the
    // same evidence in a different order replay onto one decision.
    const [firstFingerprint] = lifecycleRepository.resolveDispute.mock.calls[0]?.slice(-1) ?? [];
    await service.resolveDispute(admin, contractId, 'dismissed', ['evidence-a', 'evidence-b'], 2, 'settled', 'res-1');
    expect(lifecycleRepository.resolveDispute.mock.calls[1]?.at(-1)).toBe(firstFingerprint);
  });

  it('maps every repository refusal onto its canonical HTTP failure', async () => {
    const cases = [
      [{ status: 'not_found' }, ResourceNotFoundException],
      [{ status: 'forbidden' }, ForbiddenException],
      [{ status: 'partner_unapproved' }, ForbiddenException],
      [{ status: 'conflict' }, ConflictException],
      [{ status: 'invalid', field: 'command' }, BadRequestException],
    ] as const;

    for (const [result, expected] of cases) {
      const { lifecycleRepository, service } = fixture();
      lifecycleRepository.getLifecycle.mockResolvedValue(result);

      await expect(service.getLifecycle(buyer, contractId)).rejects.toThrow(expected);
    }
  });
});
