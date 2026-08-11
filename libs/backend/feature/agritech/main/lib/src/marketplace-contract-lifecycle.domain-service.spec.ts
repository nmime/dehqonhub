// @requirements REQ-AGRITECH-ADMIN-025 REQ-AGRITECH-INTEGRATION-013 REQ-AGRITECH-LIFECYCLE-020 REQ-AGRITECH-STAGE2-017
/* eslint-disable no-await-in-loop -- table-driven cases mutate stateful mocks and must remain ordered */
import { describe, expect, it, vi } from 'vitest';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  ResourceNotFoundException,
} from '@app/backend-common-exception';
import {
  maximumMarketplaceDisputeEvidenceBytes,
  marketplaceContractTemplateVersion,
  marketplaceProviderFingerprint,
  type MarketplaceContractArtifactSnapshot,
  type MarketplaceContractArtifactStorageProvider,
  type MarketplaceContractLifecycleRepository,
  type MarketplaceDirectPaymentProvider,
  type MarketplaceDisputeEvidenceStorageProvider,
  type MarketplaceFactoringProvider,
  type MarketplaceProviderOperationRepository,
  type MarketplaceQualifiedSignatureProvider,
} from '@app/backend-feature-agritech-shared';
import {
  MarketplaceContractLifecycleDomainService,
  type MarketplaceContractProviderTimeouts,
} from './marketplace-contract-lifecycle.domain-service';
import { MarketplaceProviderUnavailableException } from './marketplace-verification.domain-service';

const buyer = { tenantId: 'buyer-tenant', userId: 'buyer-user' };
const seller = { tenantId: 'seller-tenant', userId: 'seller-user' };
const timestamp = new Date('2030-01-01T00:00:00.000Z');
const lifecycle = { contractId: 'contract-1', revision: 1 };
const artifact = { checksumSha256: 'a'.repeat(64), id: 'artifact-1', snapshotRevision: 1 };
const evidence = { id: 'evidence-1' };

const snapshot: MarketplaceContractArtifactSnapshot = {
  amountUzs: 1_000_000,
  buyer: {
    legalName: 'Buyer LLC',
    partnerId: 'buyer-partner',
    region: 'Samarkand',
    tenantId: buyer.tenantId,
    userId: buyer.userId,
  },
  contractCreatedAt: timestamp.toISOString(),
  contractId: 'contract-1',
  delivery: { terms: 'pickup' },
  lines: [
    {
      lineTotalUzs: 1_000_000,
      name: 'Corn seed',
      quantity: 1,
      sourceId: 'product-1',
      sourceKind: 'product',
      sourcePublicationId: 'listing-1',
      sourceRevision: 1,
      unit: 't',
      unitPriceUzs: 1_000_000,
    },
  ],
  seller: {
    legalName: 'Seller LLC',
    partnerId: 'seller-partner',
    region: 'Fergana',
    tenantId: seller.tenantId,
    userId: seller.userId,
  },
  settlementKind: 'direct_payment',
  snapshotRevision: 1,
  subject: 'Corn seed',
  templateVersion: marketplaceContractTemplateVersion,
};

const ok = <T>(value: T) => ({ status: 'ok' as const, value });

type ProviderMode = 'disabled' | 'mock' | 'live';

function fixture(
  input: {
    artifactMode?: ProviderMode;
    directPaymentMode?: ProviderMode;
    evidenceMode?: ProviderMode;
    factoringMode?: ProviderMode;
    signatureMode?: ProviderMode;
    timeouts?: MarketplaceContractProviderTimeouts;
  } = {},
) {
  const lifecycleRepository = {
    activateCommissionRatePolicy: vi.fn().mockResolvedValue(ok({ version: 'v1' })),
    completeArtifact: vi.fn().mockResolvedValue(ok(artifact)),
    completeDisputeEvidence: vi.fn().mockResolvedValue(ok(evidence)),
    completeSettlementProviderCommand: vi.fn().mockResolvedValue(ok(lifecycle)),
    completeSignature: vi.fn().mockResolvedValue(ok(lifecycle)),
    downloadArtifact: vi.fn().mockResolvedValue(ok({ artifact, content: Uint8Array.from([1]) })),
    findArtifact: vi.fn().mockResolvedValue(ok(artifact)),
    getLifecycle: vi.fn().mockResolvedValue(ok(lifecycle)),
    getLifecycleForAdmin: vi.fn().mockResolvedValue(ok(lifecycle)),
    listCommissionRatePolicies: vi.fn().mockResolvedValue([]),
    openDispute: vi.fn().mockResolvedValue(ok(lifecycle)),
    prepareArtifact: vi
      .fn()
      .mockResolvedValue(ok({ snapshot, snapshotFingerprint: marketplaceProviderFingerprint(snapshot) })),
    prepareDisputeEvidence: vi
      .fn()
      .mockResolvedValue(ok({ disputeId: 'dispute-1', disputeRevision: 2, party: 'buyer' as const })),
    prepareSettlementProviderCommand: vi.fn().mockResolvedValue(
      ok({
        amountUzs: 1_000_000,
        expectedRevision: 1,
        party: 'buyer' as const,
        settlement: { kind: 'direct_payment' },
      }),
    ),
    prepareSignature: vi.fn().mockResolvedValue(ok({ artifact, party: 'buyer' as const })),
    recordFactoringConsent: vi.fn().mockResolvedValue(ok(lifecycle)),
    resolveDispute: vi.fn().mockResolvedValue(ok(lifecycle)),
    transitionFulfillment: vi.fn().mockResolvedValue(ok(lifecycle)),
  };
  const providerOperations = {
    completeProviderOperation: vi.fn().mockResolvedValue(ok(undefined)),
    failProviderOperation: vi.fn().mockResolvedValue(ok(undefined)),
    prepareProviderOperation: vi.fn().mockResolvedValue(ok({ attempt: 1, execute: true, operationId: 'operation-1' })),
  };
  const artifactStorage = {
    mode: input.artifactMode ?? 'mock',
    name: 'artifact-provider',
    storeContractArtifact: vi.fn().mockResolvedValue({
      completedAt: timestamp,
      providerMode: 'mock',
      providerName: 'artifact-provider',
      providerReference: 'artifact-reference',
      safeReceipt: { stored: true },
      storageReference: 'storage-reference',
    }),
  };
  const qualifiedSignature = {
    mode: input.signatureMode ?? 'mock',
    name: 'signature-provider',
    qualifyContractSignature: vi.fn().mockResolvedValue({
      completedAt: timestamp,
      providerMode: 'mock',
      providerName: 'signature-provider',
      providerReference: 'signature-reference',
      safeReceipt: { signed: true },
    }),
  };
  const directPayment = {
    mode: input.directPaymentMode ?? 'mock',
    name: 'payment-provider',
    recordDirectPayment: vi.fn().mockResolvedValue({
      completedAt: timestamp,
      outcome: 'confirm_buyer_payment',
      providerEventId: 'payment-event',
      providerMode: 'mock',
      providerName: 'payment-provider',
      providerReference: 'payment-reference',
      safeReceipt: { paid: true },
    }),
  };
  const factoring = {
    mode: input.factoringMode ?? 'mock',
    name: 'factoring-provider',
    recordFactoring: vi.fn().mockResolvedValue({
      completedAt: timestamp,
      outcome: 'approved',
      providerEventId: 'factoring-event',
      providerMode: 'mock',
      providerName: 'factoring-provider',
      providerReference: 'factoring-reference',
      reconciliationReason: 'manual_review',
      safeReceipt: { approved: true },
    }),
  };
  const disputeEvidenceStorage = {
    mode: input.evidenceMode ?? 'mock',
    name: 'evidence-provider',
    storeDisputeEvidence: vi.fn().mockResolvedValue({
      completedAt: timestamp,
      providerMode: 'mock',
      providerName: 'evidence-provider',
      providerReference: 'evidence-reference',
      safeReceipt: { stored: true },
      storageReference: 'evidence-storage-reference',
    }),
  };
  const args = [
    lifecycleRepository as unknown as MarketplaceContractLifecycleRepository,
    providerOperations as unknown as MarketplaceProviderOperationRepository,
    artifactStorage as unknown as MarketplaceContractArtifactStorageProvider,
    qualifiedSignature as unknown as MarketplaceQualifiedSignatureProvider,
    directPayment as unknown as MarketplaceDirectPaymentProvider,
    factoring as unknown as MarketplaceFactoringProvider,
    disputeEvidenceStorage as unknown as MarketplaceDisputeEvidenceStorageProvider,
  ] as const;
  const service = input.timeouts
    ? new MarketplaceContractLifecycleDomainService(...args, input.timeouts)
    : new MarketplaceContractLifecycleDomainService(...args);
  return {
    artifactStorage,
    directPayment,
    disputeEvidenceStorage,
    factoring,
    lifecycleRepository,
    providerOperations,
    qualifiedSignature,
    service,
  };
}

describe('MarketplaceContractLifecycleDomainService', () => {
  it('covers the complete provider, lifecycle, evidence, idempotency, timeout, and safe failure boundary', async () => {
    const base = fixture();
    await expect(
      base.service.createArtifact(buyer, 'contract-1', 'direct_payment', 'artifact-create-key'),
    ).resolves.toEqual(artifact);
    expect(base.artifactStorage.storeContractArtifact).toHaveBeenCalledWith(
      expect.objectContaining({ contractId: 'contract-1', content: expect.any(Uint8Array) }),
    );
    await expect(base.service.sign(buyer, 'contract-1', 'signature-create-key')).resolves.toEqual(lifecycle);
    await expect(base.service.consentFactoring(buyer, 'contract-1', 'factoring-consent-key')).resolves.toEqual(
      lifecycle,
    );
    await expect(
      base.service.recordSettlementCommand(buyer, 'contract-1', 'confirm_buyer_payment', 'payment-command-key'),
    ).resolves.toEqual(lifecycle);
    await expect(
      base.service.transitionFulfillment(buyer, 'contract-1', 'start', 'fulfillment-command-key'),
    ).resolves.toEqual(lifecycle);
    await expect(base.service.openDispute(buyer, 'contract-1', 'quality_issue', 'dispute-open-key')).resolves.toEqual(
      lifecycle,
    );
    await expect(
      base.service.storeDisputeEvidence(
        buyer,
        'contract-1',
        {
          content: Uint8Array.from(Buffer.from('%PDF-proof')),
          fileName: ' proof.pdf ',
          mediaType: 'application/pdf',
        },
        'evidence-store-key',
      ),
    ).resolves.toEqual(evidence);
    await expect(
      base.service.resolveDispute(
        buyer,
        'contract-1',
        'dismissed',
        ['evidence-z', 'evidence-a'],
        2,
        ' accepted ',
        'dispute-resolve-key',
      ),
    ).resolves.toEqual(lifecycle);
    await expect(base.service.listCommissionRatePolicies()).resolves.toEqual([]);
    await expect(
      base.service.activateCommissionRatePolicy(
        buyer,
        'v1',
        { produce: 100, product: 200, request: 300 },
        'commission-policy-key',
      ),
    ).resolves.toMatchObject({ version: 'v1' });
    await expect(base.service.getLifecycle(buyer, 'contract-1')).resolves.toEqual(lifecycle);
    await expect(base.service.getLifecycleForAdmin(buyer.tenantId, 'contract-1')).resolves.toEqual(lifecycle);
    expect(base.lifecycleRepository.getLifecycleForAdmin).toHaveBeenCalledWith(buyer.tenantId, 'contract-1');
    await expect(base.service.getArtifact(buyer, 'contract-1')).resolves.toEqual(artifact);
    await expect(base.service.downloadArtifact(buyer, 'contract-1')).resolves.toMatchObject({ artifact });

    const replayArtifact = fixture();
    replayArtifact.lifecycleRepository.prepareArtifact.mockResolvedValueOnce(
      ok({ existingArtifact: artifact, snapshot, snapshotFingerprint: 'f'.repeat(64) }),
    );
    await expect(
      replayArtifact.service.createArtifact(buyer, 'contract-1', 'direct_payment', 'artifact-replay-key'),
    ).resolves.toEqual(artifact);
    expect(replayArtifact.providerOperations.prepareProviderOperation).not.toHaveBeenCalled();

    const noExecuteArtifact = fixture();
    noExecuteArtifact.providerOperations.prepareProviderOperation.mockResolvedValueOnce(
      ok({ attempt: 1, execute: false, operationId: 'artifact-replay-operation' }),
    );
    await noExecuteArtifact.service.createArtifact(seller, 'contract-1', 'direct_payment', 'artifact-no-execute-key');
    expect(noExecuteArtifact.artifactStorage.storeContractArtifact).not.toHaveBeenCalled();
    expect(noExecuteArtifact.providerOperations.prepareProviderOperation).toHaveBeenCalledWith(
      seller,
      expect.objectContaining({ actorType: 'contract_seller' }),
    );

    const existingSignature = fixture();
    existingSignature.lifecycleRepository.prepareSignature.mockResolvedValueOnce(
      ok({ artifact, existingSignature: { party: 'buyer' }, party: 'buyer' }),
    );
    await expect(existingSignature.service.sign(buyer, 'contract-1', 'signature-replay-key')).resolves.toEqual(
      lifecycle,
    );
    expect(existingSignature.qualifiedSignature.qualifyContractSignature).not.toHaveBeenCalled();

    const sellerSignature = fixture();
    sellerSignature.lifecycleRepository.prepareSignature.mockResolvedValueOnce(ok({ artifact, party: 'seller' }));
    sellerSignature.providerOperations.prepareProviderOperation.mockResolvedValueOnce(
      ok({ attempt: 1, execute: false, operationId: 'signature-replay-operation' }),
    );
    await sellerSignature.service.sign(seller, 'contract-1', 'signature-seller-key');
    expect(sellerSignature.providerOperations.prepareProviderOperation).toHaveBeenCalledWith(
      seller,
      expect.objectContaining({ actorType: 'contract_seller' }),
    );

    const factoringCommand = fixture();
    factoringCommand.lifecycleRepository.prepareSettlementProviderCommand.mockResolvedValueOnce(
      ok({ amountUzs: 1_000_000, expectedRevision: 2, party: 'seller', settlement: { kind: 'factoring' } }),
    );
    await factoringCommand.service.recordSettlementCommand(
      seller,
      'contract-1',
      'request_decision',
      'factoring-command-key',
    );
    expect(factoringCommand.factoring.recordFactoring).toHaveBeenCalled();
    expect(factoringCommand.providerOperations.prepareProviderOperation).toHaveBeenCalledWith(
      seller,
      expect.objectContaining({ actorType: 'contract_seller', capability: 'factoring' }),
    );

    const noExecuteSettlement = fixture();
    noExecuteSettlement.providerOperations.prepareProviderOperation.mockResolvedValueOnce(
      ok({ attempt: 1, execute: false, operationId: 'settlement-replay-operation' }),
    );
    await noExecuteSettlement.service.recordSettlementCommand(
      buyer,
      'contract-1',
      'confirm_buyer_payment',
      'settlement-no-execute-key',
    );
    expect(noExecuteSettlement.directPayment.recordDirectPayment).not.toHaveBeenCalled();

    const noReconciliationReason = fixture();
    noReconciliationReason.directPayment.recordDirectPayment.mockResolvedValueOnce({
      completedAt: timestamp,
      outcome: 'confirm_seller_receipt',
      providerMode: 'mock',
      providerName: 'payment-provider',
      providerReference: 'payment-reference',
      safeReceipt: {},
    });
    await noReconciliationReason.service.recordSettlementCommand(
      buyer,
      'contract-1',
      'confirm_seller_receipt',
      'settlement-no-reason-key',
    );

    const sellerEvidence = fixture();
    sellerEvidence.lifecycleRepository.prepareDisputeEvidence.mockResolvedValueOnce(
      ok({ disputeId: 'dispute-1', disputeRevision: 3, party: 'seller' }),
    );
    sellerEvidence.providerOperations.prepareProviderOperation.mockResolvedValueOnce(
      ok({ attempt: 1, execute: false, operationId: 'evidence-replay-operation' }),
    );
    await sellerEvidence.service.storeDisputeEvidence(
      seller,
      'contract-1',
      { content: Uint8Array.from([0xff, 0xd8, 0xff]), fileName: 'proof.jpg', mediaType: 'image/jpeg' },
      'evidence-seller-key',
    );
    expect(sellerEvidence.providerOperations.prepareProviderOperation).toHaveBeenCalledWith(
      seller,
      expect.objectContaining({ actorType: 'contract_seller' }),
    );
    await base.service.storeDisputeEvidence(
      buyer,
      'contract-1',
      {
        content: Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        fileName: 'proof.png',
        mediaType: 'image/png',
      },
      'evidence-png-key',
    );

    for (const invalidEvidence of [
      { content: new Uint8Array(), fileName: 'proof.pdf', mediaType: 'application/pdf' as const },
      {
        content: new Uint8Array(maximumMarketplaceDisputeEvidenceBytes + 1),
        fileName: 'proof.pdf',
        mediaType: 'application/pdf' as const,
      },
      { content: Uint8Array.from(Buffer.from('%PDF-')), fileName: ' ', mediaType: 'application/pdf' as const },
      {
        content: Uint8Array.from(Buffer.from('%PDF-')),
        fileName: 'x'.repeat(201),
        mediaType: 'application/pdf' as const,
      },
      {
        content: Uint8Array.from(Buffer.from('%PDF-')),
        fileName: 'bad/name.pdf',
        mediaType: 'application/pdf' as const,
      },
      {
        content: Uint8Array.from(Buffer.from('%PDF-')),
        fileName: 'bad\\name.pdf',
        mediaType: 'application/pdf' as const,
      },
      {
        content: Uint8Array.from(Buffer.from('%PDF-')),
        fileName: 'bad\u0001name.pdf',
        mediaType: 'application/pdf' as const,
      },
      {
        content: Uint8Array.from(Buffer.from('%PDF-')),
        fileName: 'bad\u007fname.pdf',
        mediaType: 'application/pdf' as const,
      },
      {
        content: Uint8Array.from(Buffer.from('%PDF-')),
        fileName: 'bad\u202aname.pdf',
        mediaType: 'application/pdf' as const,
      },
      {
        content: Uint8Array.from(Buffer.from('%PDF-')),
        fileName: 'bad\u2066name.pdf',
        mediaType: 'application/pdf' as const,
      },
      { content: Uint8Array.from(Buffer.from('wrong')), fileName: 'proof.pdf', mediaType: 'application/pdf' as const },
      { content: Uint8Array.from([0x00, 0xd8, 0xff]), fileName: 'proof.jpg', mediaType: 'image/jpeg' as const },
      { content: Uint8Array.from([0xff, 0x00, 0xff]), fileName: 'proof.jpg', mediaType: 'image/jpeg' as const },
      { content: Uint8Array.from([0xff, 0xd8, 0x00]), fileName: 'proof.jpg', mediaType: 'image/jpeg' as const },
      { content: Uint8Array.from([0x89]), fileName: 'proof.png', mediaType: 'image/png' as const },
      {
        content: Uint8Array.from([0x89, 0x50, 0x00, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        fileName: 'proof.png',
        mediaType: 'image/png' as const,
      },
    ]) {
      await expect(
        base.service.storeDisputeEvidence(
          buyer,
          'contract-1',
          invalidEvidence,
          `invalid-evidence-${invalidEvidence.fileName.length}-key`,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    }

    for (const [status, ErrorType] of [
      ['not_found', ResourceNotFoundException],
      ['forbidden', ForbiddenException],
      ['partner_unapproved', ForbiddenException],
      ['conflict', ConflictException],
      ['invalid_state', BadRequestException],
    ] as const) {
      const failed = fixture();
      failed.lifecycleRepository.getLifecycle.mockResolvedValueOnce({ status, field: 'state' });
      await expect(failed.service.getLifecycle(buyer, 'contract-1')).rejects.toBeInstanceOf(ErrorType);
    }

    for (const disabledFixture of [
      fixture({ artifactMode: 'disabled' }),
      fixture({ signatureMode: 'disabled' }),
      fixture({ directPaymentMode: 'disabled' }),
      fixture({ factoringMode: 'disabled' }),
      fixture({ evidenceMode: 'disabled' }),
    ]) {
      const service = disabledFixture.service;
      if (disabledFixture.artifactStorage.mode === 'disabled') {
        await expect(
          service.createArtifact(buyer, 'contract-1', 'direct_payment', 'disabled-artifact-key'),
        ).rejects.toBeInstanceOf(MarketplaceProviderUnavailableException);
      } else if (disabledFixture.qualifiedSignature.mode === 'disabled') {
        await expect(service.sign(buyer, 'contract-1', 'disabled-signature-key')).rejects.toBeInstanceOf(
          MarketplaceProviderUnavailableException,
        );
      } else if (disabledFixture.directPayment.mode === 'disabled') {
        await expect(
          service.recordSettlementCommand(buyer, 'contract-1', 'confirm_buyer_payment', 'disabled-payment-key'),
        ).rejects.toBeInstanceOf(MarketplaceProviderUnavailableException);
      } else if (disabledFixture.factoring.mode === 'disabled') {
        disabledFixture.lifecycleRepository.prepareSettlementProviderCommand.mockResolvedValueOnce(
          ok({ amountUzs: 1, expectedRevision: 1, party: 'buyer', settlement: { kind: 'factoring' } }),
        );
        await expect(
          service.recordSettlementCommand(buyer, 'contract-1', 'request_decision', 'disabled-factoring-key'),
        ).rejects.toBeInstanceOf(MarketplaceProviderUnavailableException);
      } else {
        await expect(
          service.storeDisputeEvidence(
            buyer,
            'contract-1',
            {
              content: Uint8Array.from(Buffer.from('%PDF-proof')),
              fileName: 'proof.pdf',
              mediaType: 'application/pdf',
            },
            'disabled-evidence-key',
          ),
        ).rejects.toBeInstanceOf(MarketplaceProviderUnavailableException);
      }
    }

    const foreignActor = fixture();
    await expect(
      foreignActor.service.createArtifact(
        { tenantId: buyer.tenantId, userId: 'other-user' },
        'contract-1',
        'direct_payment',
        'foreign-buyer-user-key',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      foreignActor.service.createArtifact(
        { tenantId: seller.tenantId, userId: 'other-user' },
        'contract-1',
        'direct_payment',
        'foreign-seller-user-key',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    for (const providerError of [
      new BadRequestException(),
      new ConflictException('provider'),
      new ForbiddenException('provider'),
      new Error('provider failed'),
      'opaque provider failure',
    ]) {
      const failedProvider = fixture();
      failedProvider.qualifiedSignature.qualifyContractSignature.mockRejectedValueOnce(providerError);
      failedProvider.providerOperations.failProviderOperation.mockRejectedValueOnce(new Error('failure ledger failed'));
      const result = failedProvider.service.sign(buyer, 'contract-1', `provider-error-${typeof providerError}-key`);
      if (
        providerError instanceof BadRequestException ||
        providerError instanceof ConflictException ||
        providerError instanceof ForbiddenException
      ) {
        await expect(result).rejects.toBe(providerError);
      } else {
        await expect(result).rejects.toBeInstanceOf(MarketplaceProviderUnavailableException);
      }
    }

    for (const completionError of [new Error('completion failed'), 'opaque completion failure']) {
      const failedCompletion = fixture();
      failedCompletion.providerOperations.completeProviderOperation.mockRejectedValueOnce(completionError);
      failedCompletion.providerOperations.failProviderOperation.mockRejectedValueOnce(
        new Error('failure ledger failed'),
      );
      await expect(
        failedCompletion.service.sign(buyer, 'contract-1', `completion-error-${typeof completionError}-key`),
      ).rejects.toBeInstanceOf(MarketplaceProviderUnavailableException);
    }

    vi.useFakeTimers();
    try {
      const timedOut = fixture({
        timeouts: {
          artifactStorageTimeoutMs: 1,
          directPaymentTimeoutMs: 1,
          disputeEvidenceStorageTimeoutMs: 1,
          factoringTimeoutMs: 1,
          qualifiedSignatureTimeoutMs: 1,
        },
      });
      timedOut.qualifiedSignature.qualifyContractSignature.mockImplementation(() => new Promise(() => undefined));
      const timeoutResult = timedOut.service.sign(buyer, 'contract-1', 'signature-timeout-key');
      const timeoutFailure = timeoutResult.catch((error: unknown) => error);
      await vi.advanceTimersByTimeAsync(2);
      await expect(timeoutFailure).resolves.toBeInstanceOf(MarketplaceProviderUnavailableException);
      expect(timedOut.providerOperations.failProviderOperation).toHaveBeenCalledWith(
        buyer,
        'operation-1',
        1,
        'qualified_signature_timeout',
        'provider_outcome_unknown',
      );
    } finally {
      vi.useRealTimers();
    }

    vi.stubGlobal(
      'setTimeout',
      vi.fn(() => undefined),
    );
    try {
      const noTimerHandle = fixture();
      await expect(noTimerHandle.service.sign(buyer, 'contract-1', 'signature-no-timer-key')).resolves.toEqual(
        lifecycle,
      );
    } finally {
      vi.unstubAllGlobals();
    }

    const codePointAt = vi.spyOn(String.prototype, 'codePointAt').mockReturnValue(undefined);
    try {
      await expect(
        base.service.storeDisputeEvidence(
          buyer,
          'contract-1',
          { content: Uint8Array.from(Buffer.from('%PDF-proof')), fileName: 'proof.pdf', mediaType: 'application/pdf' },
          'evidence-codepoint-fallback-key',
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    } finally {
      codePointAt.mockRestore();
    }
  }, 30_000);
});
