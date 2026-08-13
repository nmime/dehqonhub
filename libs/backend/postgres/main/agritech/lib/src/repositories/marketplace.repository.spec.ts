// @requirements REQ-AGRITECH-ORDER-003 REQ-AGRITECH-PARTNER-007 REQ-AGRITECH-MARKETPLACE-016 REQ-AGRITECH-INTEGRATION-013 REQ-AGRITECH-STAGE2-017
import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EntityManager } from '@mikro-orm/postgresql';
import type {
  MarketplaceProviderOperationPreparation,
  VerificationDocument,
} from '@app/backend-feature-agritech-shared';
import { marketplaceProviderFingerprint } from '@app/backend-feature-agritech-shared';
import { ProductEntity } from '../entities';
import { PostgresMarketplaceRepository } from './marketplace.repository';

const owner = { tenantId: 'tenant-1', userId: 'user-1' };
const buyerPartnerId = 'partner-buyer-1';
const sellerPartnerId = 'partner-seller-1';
const sellerOwnerUserId = 'seller-user-1';
const sellerTenantId = 'tenant-seller-1';
const now = new Date('2026-08-09T00:00:00Z');

function makeEm(overrides: Partial<Record<string, ReturnType<typeof vi.fn>>> = {}) {
  const execute = vi
    .fn()
    .mockImplementation((sql: string) =>
      Promise.resolve(sql.includes('insert into marketplace_provider_operations') ? [{ id: 'operation-created' }] : []),
    );
  const em = {
    findOne: vi.fn().mockResolvedValue(null),
    find: vi.fn().mockResolvedValue([]),
    count: vi.fn().mockResolvedValue(0),
    persist: vi.fn(),
    flush: vi.fn().mockResolvedValue(undefined),
    refresh: vi.fn().mockImplementation((entity: { version?: number }) => {
      entity.version = 1;
      return Promise.resolve(entity);
    }),
    nativeDelete: vi.fn().mockResolvedValue(1),
    execute,
    getTransactionContext: vi.fn().mockReturnValue(undefined),
    getConnection: vi.fn(() => ({ execute })),
    transactional: vi.fn(async (cb: (em: unknown) => unknown) => cb(em)),
    ...overrides,
  };
  return em as unknown as EntityManager & typeof em;
}

function verificationEntity(overrides: Record<string, unknown> = {}) {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    tenantId: 'tenant-1',
    userId: 'user-1',
    role: 'farmer',
    level: 'verified',
    status: 'pending',
    oneIdLinked: true,
    providerMode: 'legacy',
    identityAssurance: 'legacy_unknown',
    providerName: null,
    providerSubjectKey: null,
    providerReceiptId: null,
    oneIdLinkedAt: null,
    version: 0,
    caseRevision: 0,
    documents: [{ kind: 'id', fileName: 'p.jpg', storageKey: 'k1' }],
    reviewedBy: null,
    reviewedAt: null,
    rejectionReason: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function oneIdPreparation(
  resourceId: string,
  resourceRevision = 0,
  idempotencyKey = 'oneid-key-0001',
): MarketplaceProviderOperationPreparation {
  const requestDescriptor = {
    action: 'link-oneid' as const,
    resourceId,
    resourceRevision,
    resourceType: 'verification' as const,
  };
  return {
    actorType: 'verification_subject',
    capability: 'oneid_link',
    idempotencyKey,
    providerMode: 'mock',
    providerName: 'mock-oneid',
    requestDescriptor,
    requestFingerprint: marketplaceProviderFingerprint(requestDescriptor),
    resourceId,
    resourceRevision,
    resourceType: 'verification',
  };
}

function documentPreparation(
  resourceId: string,
  resourceRevision: number,
  idempotencyKey: string,
  document: Required<Pick<VerificationDocument, 'fileName' | 'kind' | 'mimeType' | 'sha256' | 'sizeBytes'>>,
): MarketplaceProviderOperationPreparation {
  const requestDescriptor = {
    action: 'store-verification-document' as const,
    document,
    resourceId,
    resourceRevision,
    resourceType: 'verification' as const,
  };
  return {
    actorType: 'verification_subject',
    capability: 'verification_documents',
    idempotencyKey,
    providerMode: 'mock',
    providerName: 'mock-document-storage',
    requestDescriptor,
    requestFingerprint: marketplaceProviderFingerprint(requestDescriptor),
    resourceId,
    resourceRevision,
    resourceType: 'verification',
  };
}

function directPaymentPreparation(
  resourceId = '33333333-3333-4333-8333-333333333333',
  idempotencyKey = 'direct-payment-key-0001',
): MarketplaceProviderOperationPreparation {
  const requestDescriptor = {
    action: 'record-direct-payment' as const,
    parametersFingerprint: 'c'.repeat(64),
    resourceId,
    resourceRevision: 2,
    resourceType: 'contract' as const,
  };
  return {
    actorType: 'contract_buyer',
    capability: 'direct_payment',
    idempotencyKey,
    providerMode: 'mock',
    providerName: 'mock-direct-payment',
    requestDescriptor,
    requestFingerprint: marketplaceProviderFingerprint(requestDescriptor),
    resourceId,
    resourceRevision: 2,
    resourceType: 'contract',
  };
}

function productEntity(overrides: Record<string, unknown> = {}) {
  return Object.assign(new ProductEntity(), {
    id: 'p-1',
    tenantId: 'tenant-1',
    name: 'Corn seed',
    category: 'seed',
    description: 'd',
    supplierId: sellerPartnerId,
    supplierName: 'Agro',
    priceUzs: 500000,
    unit: 'kg',
    stockQuantity: 100,
    region: 'Samarkand',
    status: 'active',
    images: [],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  });
}

function partnerEntity(overrides: Record<string, unknown> = {}) {
  return {
    id: sellerPartnerId,
    tenantId: 'tenant-1',
    ownerUserId: sellerOwnerUserId,
    kind: 'supplier',
    legalName: 'Agro Supply',
    region: 'Samarkand',
    status: 'approved',
    ...overrides,
  };
}

function commerceListingFixtures() {
  const listing = {
    id: 'listing-public-1',
    tenantId: sellerTenantId,
    ownerUserId: sellerOwnerUserId,
    sellerPublicId: 'seller-public-1',
    sellerRevisionId: 'seller-revision-1',
    sellerContentRevision: 1,
    productId: 'p-1',
    produceListingId: null,
    sourceKind: 'product',
    contentRevision: 1,
    moderationStatus: 'approved',
    status: 'published',
  };
  const sellerPublic = {
    id: listing.sellerPublicId,
    tenantId: sellerTenantId,
    ownerUserId: sellerOwnerUserId,
    partnerId: sellerPartnerId,
    status: 'published',
  };
  const sellerRevision = {
    id: listing.sellerRevisionId,
    sellerPublicId: listing.sellerPublicId,
    tenantId: sellerTenantId,
    contentRevision: 1,
    moderationStatus: 'approved',
  };
  return { listing, sellerPublic, sellerRevision };
}

function commercePartyLookup(entity: unknown, where: Record<string, unknown>): unknown {
  const name = String(entity);
  if (name.includes('MarketplaceCommerceOperation')) {
    return null;
  }
  if (name.includes('MarketplacePartnerMembership')) {
    return {
      capability: where.capability,
      partnerId: where.partnerId,
      status: 'active',
      tenantId: where.tenantId,
      userId: where.userId,
    };
  }
  if (name.includes('AgriTechPartner')) {
    return where.kind === 'buyer'
      ? partnerEntity({
          id: buyerPartnerId,
          kind: 'buyer',
          legalName: 'Buyer Cooperative',
          ownerUserId: owner.userId,
          tenantId: owner.tenantId,
        })
      : partnerEntity({ tenantId: sellerTenantId });
  }
  if (name.includes('Verification')) {
    return verificationEntity({
      role: where.role,
      status: 'verified',
      tenantId: where.tenantId,
      userId: where.userId,
    });
  }
  return undefined;
}

function commerceListingLookup(entity: unknown): unknown {
  const name = String(entity);
  const { listing, sellerPublic, sellerRevision } = commerceListingFixtures();
  if (name.includes('MarketplaceListingPublication')) {
    return listing;
  }
  if (name.includes('MarketplacePublicSellerRevision')) {
    return sellerRevision;
  }
  if (name.includes('MarketplacePublicSeller')) {
    return sellerPublic;
  }
  if (name.includes('Product')) {
    return productEntity({ supplierId: sellerPartnerId, tenantId: sellerTenantId });
  }
  return undefined;
}

describe('PostgresMarketplaceRepository — verification', () => {
  let em: ReturnType<typeof makeEm>;
  let repo: PostgresMarketplaceRepository;

  beforeEach(() => {
    em = makeEm();
    repo = new PostgresMarketplaceRepository(em as unknown as EntityManager);
  });

  it('returns undefined when no verification exists', async () => {
    em.findOne.mockResolvedValue(null);
    expect(await repo.getVerification(owner)).toBeUndefined();
  });

  it('reviews a pending verification to verified', async () => {
    const verification = verificationEntity();
    em.findOne.mockImplementation((entity: unknown) =>
      Promise.resolve(String(entity).includes('MarketplaceCommerceOperation') ? null : verification),
    );
    const result = await repo.reviewVerification(
      'tenant-1',
      verification.id,
      'verified',
      'admin-1',
      0,
      'verification-review-0001',
    );
    expect(em.flush).toHaveBeenCalled();
    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(result.value.status).toBe('verified');
      expect(result.value.reviewedBy).toBe('admin-1');
    }
  });

  it('creates a real persisted verification case in the editable none state', async () => {
    em.findOne.mockResolvedValue(null);

    const result = await repo.createVerification(owner, 'farmer', 0, 'verification-create-0001');

    expect(result).toMatchObject({ status: 'ok', value: { role: 'farmer', status: 'none' } });
    expect(em.persist).toHaveBeenCalledWith(
      expect.objectContaining({
        identityAssurance: 'none',
        oneIdLinked: false,
        providerMode: 'none',
        tenantId: owner.tenantId,
        userId: owner.userId,
      }),
    );
  });

  it('increments the case revision when a rejected verification is resumed', async () => {
    const rejected = verificationEntity({
      caseRevision: 2,
      rejectionReason: 'documents_unreadable',
      status: 'rejected',
    });
    em.findOne.mockImplementation((entity: unknown) =>
      Promise.resolve(String(entity).includes('MarketplaceCommerceOperation') ? null : rejected),
    );

    await expect(repo.createVerification(owner, 'farmer', 0, 'verification-create-0001')).resolves.toMatchObject({
      status: 'ok',
      value: { caseRevision: 3, status: 'none' },
    });
    expect(rejected.caseRevision).toBe(3);
  });

  it.each(['oneid_link', 'verification_documents'] as const)(
    'rejects an old %s key after a rejected case is resumed',
    async (capability) => {
      const resumed = verificationEntity({
        caseRevision: 1,
        documents: [],
        identityAssurance: 'none',
        oneIdLinked: false,
        providerMode: 'none',
        status: 'none',
      });
      const preparation =
        capability === 'oneid_link'
          ? oneIdPreparation(resumed.id, 0, `old-${capability}-key`)
          : documentPreparation(resumed.id, 0, `old-${capability}-key`, {
              fileName: 'old.pdf',
              kind: 'farm',
              mimeType: 'application/pdf',
              sha256: 'a'.repeat(64),
              sizeBytes: 10,
            });
      const oldOperation = {
        ...preparation,
        attempt: 1,
        id: `old-${capability}`,
        resultSnapshot: null,
        status: 'succeeded',
        tenantId: owner.tenantId,
        userId: owner.userId,
      };
      em.findOne.mockImplementation(async (entity: unknown) =>
        String(entity).includes('VerificationEntity') ? resumed : oldOperation,
      );

      await expect(
        repo.prepareProviderOperation(
          owner,
          capability === 'oneid_link'
            ? oneIdPreparation(resumed.id, resumed.caseRevision, oldOperation.idempotencyKey)
            : documentPreparation(resumed.id, resumed.caseRevision, oldOperation.idempotencyKey, {
                fileName: 'new.pdf',
                kind: 'farm',
                mimeType: 'application/pdf',
                sha256: 'b'.repeat(64),
                sizeBytes: 10,
              }),
        ),
      ).resolves.toEqual({ status: 'conflict', field: 'idempotencyKey' });
    },
  );

  it('persists an idempotent provider operation scoped to the real verification resource', async () => {
    const verification = verificationEntity({
      oneIdLinked: false,
      providerMode: 'none',
      identityAssurance: 'none',
      status: 'none',
    });
    em.findOne.mockImplementation(async (entity: unknown) =>
      String(entity).includes('VerificationEntity') ? verification : null,
    );

    const result = await repo.prepareProviderOperation(owner, oneIdPreparation(verification.id));

    expect(result).toMatchObject({ status: 'ok', value: { execute: true } });
    expect(em.getConnection().execute).toHaveBeenCalledWith(
      expect.stringContaining('insert into marketplace_provider_operations'),
      expect.arrayContaining([
        owner.tenantId,
        owner.userId,
        'verification_subject',
        'oneid_link',
        'verification',
        verification.id,
        0,
        'oneid-key-0001',
      ]),
    );
    expect(em.getConnection().execute).toHaveBeenCalledWith('select pg_advisory_xact_lock(hashtext(?))', [
      `marketplace-provider-operation:${owner.tenantId}:${owner.userId}:verification_subject:oneid_link:verification:${verification.id}:0:oneid-key-0001`,
    ]);
  });

  it('rejects a provider command whose resource is not the actor verification', async () => {
    em.findOne.mockResolvedValue(
      verificationEntity({ oneIdLinked: false, providerMode: 'none', identityAssurance: 'none', status: 'none' }),
    );

    await expect(
      repo.prepareProviderOperation(owner, oneIdPreparation('22222222-2222-4222-8222-222222222222')),
    ).resolves.toEqual({ status: 'not_found', field: 'resource' });
    expect(em.persist).not.toHaveBeenCalled();
  });

  it('replays the original persisted snapshot and rejects altered input for the same scoped key', async () => {
    const source = verificationEntity({
      oneIdLinked: true,
      providerMode: 'mock',
      identityAssurance: 'mock',
      status: 'pending',
    });
    const original = {
      ...source,
      createdAt: now.toISOString(),
      identityAssurance: 'mock',
      oneIdLinked: true,
      providerMode: 'mock',
      providerReceiptId: 'original-receipt',
      status: 'none',
      updatedAt: now.toISOString(),
    };
    const base = oneIdPreparation(source.id);
    const operation = {
      ...base,
      id: 'operation-1',
      attempt: 1,
      resultSnapshot: original,
      status: 'succeeded',
      tenantId: owner.tenantId,
      userId: owner.userId,
    };
    em.findOne.mockImplementation(async (entity: unknown) =>
      String(entity).includes('VerificationEntity') ? source : operation,
    );
    await expect(repo.prepareProviderOperation(owner, base)).resolves.toMatchObject({
      status: 'ok',
      value: {
        execute: false,
        replay: { providerReceiptId: 'original-receipt' },
      },
    });
    await expect(
      repo.prepareProviderOperation(owner, { ...base, providerName: 'different-provider' }),
    ).resolves.toEqual({
      status: 'conflict',
      field: 'idempotencyKey',
    });
  });

  it('does not execute a concurrent retry while its scoped provider operation is in progress', async () => {
    const source = verificationEntity({
      oneIdLinked: false,
      providerMode: 'none',
      identityAssurance: 'none',
      status: 'none',
    });
    const preparation = oneIdPreparation(source.id);
    const operation = {
      ...preparation,
      id: 'operation-in-progress',
      attempt: 1,
      capability: 'oneid_link',
      idempotencyKey: 'oneid-key-0001',
      providerMode: 'mock',
      providerName: 'mock-oneid',
      leaseExpiresAt: new Date(Date.now() + 60_000),
      status: 'started',
      tenantId: owner.tenantId,
      userId: owner.userId,
    };
    em.findOne.mockImplementation(async (entity: unknown) =>
      String(entity).includes('VerificationEntity') ? source : operation,
    );

    await expect(repo.prepareProviderOperation(owner, preparation)).resolves.toEqual({
      status: 'conflict',
      field: 'operationInProgress',
    });
  });

  it('prevents a different OneID operation from overwriting an established link', async () => {
    const preparation = oneIdPreparation(verificationEntity().id, 0, 'different-key');
    const operation = {
      ...preparation,
      id: 'operation-2',
      attempt: 1,
      capability: 'oneid_link',
      leaseExpiresAt: new Date(Date.now() + 60_000),
      status: 'started',
    };
    const linked = verificationEntity({
      identityAssurance: 'mock',
      oneIdLinked: true,
      providerMode: 'mock',
      providerName: 'mock-oneid',
      providerSubjectKey: 'a'.repeat(64),
    });
    em.findOne.mockImplementation(async (entity: unknown) =>
      String(entity).includes('MarketplaceProviderOperationEntity') ? operation : linked,
    );

    await expect(
      repo.completeIdentityLink(owner, operation.id, operation.attempt, {
        identityAssurance: 'mock',
        linkedAt: now,
        providerMode: 'mock',
        providerName: 'mock-oneid',
        receiptId: 'second-receipt',
        subjectKey: 'b'.repeat(64),
      }),
    ).resolves.toEqual({ status: 'conflict', field: 'status' });
    expect(linked.providerSubjectKey).toBe('a'.repeat(64));
    expect(em.flush).not.toHaveBeenCalled();
  });

  it.each([
    { receiptId: '', subjectKey: 'b'.repeat(64), identityAssurance: 'mock' as const },
    { receiptId: 'receipt', subjectKey: 'not-an-opaque-subject', identityAssurance: 'mock' as const },
    { receiptId: 'receipt', subjectKey: 'b'.repeat(64), identityAssurance: 'provider_verified' as const },
  ])('rejects malformed identity-provider provenance without mutating the case', async (providerFields) => {
    const preparation = oneIdPreparation(verificationEntity().id);
    const operation = {
      ...preparation,
      id: 'operation-invalid-provider-result',
      attempt: 1,
      capability: 'oneid_link',
      leaseExpiresAt: new Date(Date.now() + 60_000),
      status: 'started',
    };
    const pending = verificationEntity({
      identityAssurance: 'none',
      oneIdLinked: false,
      providerMode: 'none',
      status: 'none',
    });
    em.findOne.mockImplementation(async (entity: unknown) =>
      String(entity).includes('MarketplaceProviderOperationEntity') ? operation : pending,
    );

    await expect(
      repo.completeIdentityLink(owner, operation.id, operation.attempt, {
        ...providerFields,
        linkedAt: new Date(),
        providerMode: 'mock',
        providerName: 'mock-oneid',
      }),
    ).resolves.toEqual({ status: 'conflict', field: 'status' });
    expect(pending).toMatchObject({ identityAssurance: 'none', oneIdLinked: false, providerMode: 'none' });
    expect(em.flush).not.toHaveBeenCalled();
  });

  it('persists immutable safe document metadata and a server-verified checksum behind a private evidence reference', async () => {
    const content = Uint8Array.from(Buffer.from('%PDF-persisted-evidence'));
    const sha256 = createHash('sha256').update(content).digest('hex');
    const preparation = documentPreparation(verificationEntity().id, 0, 'document-key', {
      fileName: 'farm.pdf',
      kind: 'farm',
      mimeType: 'application/pdf',
      sha256,
      sizeBytes: content.byteLength,
    });
    const operation = {
      ...preparation,
      id: 'operation-3',
      attempt: 1,
      capability: 'verification_documents',
      leaseExpiresAt: new Date(Date.now() + 60_000),
      status: 'started',
    };
    const linked = verificationEntity({
      documents: [],
      identityAssurance: 'mock',
      oneIdLinked: true,
      providerMode: 'mock',
      providerName: 'mock-oneid',
      providerSubjectKey: 'a'.repeat(64),
      status: 'none',
    });
    em.findOne.mockImplementation(async (entity: unknown) =>
      String(entity).includes('MarketplaceProviderOperationEntity') ? operation : linked,
    );

    const result = await repo.completeVerificationDocuments(owner, operation.id, operation.attempt, {
      evidence: [
        {
          document: {
            fileName: 'farm.pdf',
            kind: 'farm',
            mimeType: 'application/pdf',
            optional: false,
            providerMode: 'mock',
            providerName: 'mock-document-storage',
            providerReceiptId: 'document-receipt',
            sha256,
            sizeBytes: content.byteLength,
            storedAt: now.toISOString(),
          },
        },
      ],
      providerMode: 'mock',
      providerName: 'mock-document-storage',
      receiptId: 'document-receipt',
      storedAt: now,
    });

    expect(result).toMatchObject({ status: 'ok', value: { documents: [{ kind: 'farm', sha256 }] } });
    expect(em.persist).toHaveBeenCalledWith(
      expect.objectContaining({
        caseRevision: 0,
        sha256,
        sizeBytes: content.byteLength,
        tenantId: owner.tenantId,
        userId: owner.userId,
        verificationId: linked.id,
      }),
    );
    expect(linked.documents[0]).toMatchObject({ evidenceId: expect.any(String) });
    expect(linked.documents[0]).not.toHaveProperty('storageKey');
  });

  it('rejects review of a non-pending verification', async () => {
    const verification = verificationEntity({ status: 'verified' });
    em.findOne.mockImplementation((entity: unknown) =>
      Promise.resolve(String(entity).includes('MarketplaceCommerceOperation') ? null : verification),
    );
    const result = await repo.reviewVerification(
      'tenant-1',
      'v-1',
      'verified',
      'admin-1',
      0,
      'verification-review-0001',
    );
    expect(result).toMatchObject({ status: 'conflict', field: 'status' });
  });

  it.each([
    ['rejected', undefined],
    ['verified', 'criteria_not_met'],
  ] as const)('rejects invalid verification reason provenance for %s', async (decision, reason) => {
    const result = await repo.reviewVerification(
      'tenant-1',
      'v-1',
      decision,
      'admin-1',
      0,
      'verification-review-0001',
      reason,
    );
    expect(result).toMatchObject({ status: 'invalid_state', field: 'reason' });
    expect(em.transactional).not.toHaveBeenCalled();
  });
});

describe('PostgresMarketplaceRepository — provider operations', () => {
  let em: ReturnType<typeof makeEm>;
  let repo: PostgresMarketplaceRepository;

  beforeEach(() => {
    em = makeEm();
    repo = new PostgresMarketplaceRepository(em as unknown as EntityManager);
  });

  it('anchors a prepared contract operation to the exact resolved buyer party', async () => {
    const preparation = directPaymentPreparation();
    em.execute.mockImplementation((sql: string) => {
      if (sql.includes('from marketplace_contracts')) {
        return Promise.resolve([{ id: preparation.resourceId }]);
      }
      if (sql.includes('insert into marketplace_provider_operations')) {
        return Promise.resolve([{ id: 'operation-created' }]);
      }
      return Promise.resolve([]);
    });

    await expect(repo.prepareProviderOperation(owner, preparation)).resolves.toMatchObject({
      status: 'ok',
      value: { attempt: 1, execute: true },
    });
    expect(em.execute).toHaveBeenCalledWith(expect.stringContaining("binding_status = 'resolved'"), [
      preparation.resourceId,
      owner.tenantId,
      owner.userId,
    ]);
    expect(em.execute).toHaveBeenCalledWith(
      expect.stringContaining('insert into marketplace_provider_operations'),
      expect.arrayContaining([
        owner.tenantId,
        owner.userId,
        'contract_buyer',
        'direct_payment',
        'contract',
        preparation.resourceId,
      ]),
    );
  });

  it('rejects an actor or capability descriptor mismatch before persistence', async () => {
    const preparation = directPaymentPreparation();

    await expect(
      repo.prepareProviderOperation(owner, { ...preparation, actorType: 'promotion_owner' }),
    ).resolves.toEqual({ status: 'invalid_state', field: 'requestDescriptor' });
    expect(em.transactional).not.toHaveBeenCalled();
  });

  it('stores only a safe receipt, immutable result fingerprint, and provider event for payment completion', async () => {
    const preparation = directPaymentPreparation();
    const operation = {
      ...preparation,
      attempt: 1,
      errorCode: null,
      id: 'operation-payment-1',
      leaseExpiresAt: new Date(Date.now() + 60_000),
      providerEventId: null,
      providerReference: null,
      receipt: null,
      reconciliationReason: null,
      reconciliationRequired: false,
      resultFingerprint: null,
      resultSnapshot: null,
      status: 'started',
      tenantId: owner.tenantId,
      userId: owner.userId,
    };
    em.findOne.mockResolvedValueOnce(operation).mockResolvedValueOnce(null);
    em.execute.mockImplementation((sql: string) =>
      Promise.resolve(sql.includes('from marketplace_contracts') ? [{ id: preparation.resourceId }] : []),
    );
    const resultDescriptor = {
      completedAt: new Date().toISOString(),
      outcome: 'authorized',
      resourceId: preparation.resourceId,
      resourceRevision: preparation.resourceRevision,
      resourceType: 'contract' as const,
    };

    await expect(
      repo.completeProviderOperation(owner, operation.id, operation.attempt, {
        providerEventId: 'payment-event-0001',
        providerMode: 'mock',
        providerName: 'mock-direct-payment',
        providerReference: 'payment-reference-0001',
        resultDescriptor,
        safeReceipt: { amountUzs: 1_000_000, currency: 'UZS', simulated: true },
      }),
    ).resolves.toMatchObject({
      status: 'ok',
      value: {
        providerEventId: 'payment-event-0001',
        reconciliationRequired: false,
        resultFingerprint: marketplaceProviderFingerprint(resultDescriptor),
      },
    });
    expect(operation).toMatchObject({
      leaseExpiresAt: null,
      providerEventId: 'payment-event-0001',
      receipt: { amountUzs: 1_000_000, currency: 'UZS', simulated: true },
      resultFingerprint: marketplaceProviderFingerprint(resultDescriptor),
      status: 'succeeded',
    });
  });

  it('rejects raw provider payloads and duplicate provider events without completing the operation', async () => {
    const preparation = directPaymentPreparation();
    const operation = {
      ...preparation,
      attempt: 1,
      id: 'operation-payment-2',
      leaseExpiresAt: new Date(Date.now() + 60_000),
      providerEventId: null,
      providerReference: null,
      receipt: null,
      reconciliationRequired: false,
      resultFingerprint: null,
      resultSnapshot: null,
      status: 'started',
      tenantId: owner.tenantId,
      userId: owner.userId,
    };
    const completion = {
      providerEventId: 'payment-event-0002',
      providerMode: 'mock' as const,
      providerName: 'mock-direct-payment',
      providerReference: 'payment-reference-0002',
      resultDescriptor: {
        completedAt: new Date().toISOString(),
        outcome: 'authorized',
        resourceId: preparation.resourceId,
        resourceRevision: preparation.resourceRevision,
        resourceType: 'contract' as const,
      },
      safeReceipt: { simulated: true },
    };

    em.findOne.mockResolvedValue(operation);
    await expect(
      repo.completeProviderOperation(owner, operation.id, operation.attempt, {
        ...completion,
        safeReceipt: { rawPayload: 'must-not-persist' },
      }),
    ).resolves.toEqual({ status: 'conflict', field: 'status' });
    expect(em.flush).not.toHaveBeenCalled();

    em.findOne.mockReset();
    em.findOne.mockResolvedValueOnce(operation).mockResolvedValueOnce({ id: 'earlier-operation' });
    em.execute.mockImplementation((sql: string) =>
      Promise.resolve(sql.includes('from marketplace_contracts') ? [{ id: preparation.resourceId }] : []),
    );
    await expect(repo.completeProviderOperation(owner, operation.id, operation.attempt, completion)).resolves.toEqual({
      status: 'conflict',
      field: 'providerEventId',
    });
    expect(operation.status).toBe('started');
  });
});

describe('PostgresMarketplaceRepository — cart', () => {
  let em: ReturnType<typeof makeEm>;
  let repo: PostgresMarketplaceRepository;

  beforeEach(() => {
    em = makeEm();
    repo = new PostgresMarketplaceRepository(em as unknown as EntityManager);
  });

  it('resolves an opaque publication and binds a new cart to exact cross-tenant parties', async () => {
    em.findOne.mockImplementation(async (entity: unknown, where: Record<string, unknown>) => {
      const party = commercePartyLookup(entity, where);
      if (party !== undefined) {
        return party;
      }
      const listing = commerceListingLookup(entity);
      if (listing !== undefined) {
        return listing;
      }
      return null;
    });

    const result = await repo.addToCart(
      owner,
      { actingPartnerId: buyerPartnerId, listingPublicationId: 'listing-public-1', quantity: 2 },
      'cart-add-unit-0001',
    );

    expect(result).toMatchObject({
      status: 'ok',
      value: {
        buyerPartnerId,
        buyerTenantId: owner.tenantId,
        buyerUserId: owner.userId,
        sellerPartnerId,
        sellerTenantId,
        sellerUserId: sellerOwnerUserId,
        items: [
          {
            listingPublicationId: 'listing-public-1',
            quantity: 2,
            sourceId: 'p-1',
            sourceKind: 'product',
          },
        ],
      },
    });
    expect(em.persist).toHaveBeenCalledWith(
      expect.objectContaining({
        bindingStatus: 'resolved',
        buyerPartnerId,
        sellerPartnerId,
        sellerTenantId,
      }),
    );
    expect(em.flush).toHaveBeenCalled();
  });

  it('rejects an invalid idempotency key before any organization or publication lookup', async () => {
    await expect(
      repo.addToCart(
        owner,
        { actingPartnerId: buyerPartnerId, listingPublicationId: 'listing-public-1', quantity: 1 },
        'short',
      ),
    ).resolves.toEqual({ status: 'invalid_state', field: 'idempotencyKey' });

    expect(em.findOne).not.toHaveBeenCalled();
    expect(em.persist).not.toHaveBeenCalled();
  });

  it('does not resolve a private source identifier as a public listing', async () => {
    em.findOne.mockImplementation(async (entity: unknown, where: Record<string, unknown>) => {
      const party = commercePartyLookup(entity, where);
      return party === undefined ? null : party;
    });

    await expect(
      repo.addToCart(
        owner,
        { actingPartnerId: buyerPartnerId, listingPublicationId: 'private-product-1', quantity: 1 },
        'cart-private-unit-0001',
      ),
    ).resolves.toEqual({ status: 'not_found', field: 'listingPublicationId' });
    expect(em.persist).not.toHaveBeenCalled();
  });

  it('freezes server-owned line and party snapshots when checking out a resolved cart', async () => {
    const cart = {
      bindingStatus: 'resolved',
      buyerPartnerId,
      createdAt: now,
      id: 'cart-cross-tenant-1',
      items: [
        {
          listingPublicationId: 'listing-public-1',
          quantity: 2,
          sourceId: 'p-1',
          sourceKind: 'product',
        },
      ],
      sellerId: sellerPartnerId,
      sellerPartnerId,
      sellerTenantId,
      sellerUserId: sellerOwnerUserId,
      status: 'open',
      tenantId: owner.tenantId,
      updatedAt: now,
      userId: owner.userId,
    };
    em.findOne.mockImplementation(async (entity: unknown, where: Record<string, unknown>) => {
      const name = String(entity);
      if (name.includes('Cart')) {
        return cart;
      }
      const party = commercePartyLookup(entity, where);
      if (party !== undefined) {
        return party;
      }
      const listing = commerceListingLookup(entity);
      return listing === undefined ? null : listing;
    });

    const result = await repo.checkoutCart(owner, cart.id, { deliveryTerms: 'pickup' }, 'checkout-unit-0001');

    expect(result).toMatchObject({ status: 'ok', value: { cartId: cart.id } });
    expect(cart.status).toBe('ordered');
    expect(em.persist).toHaveBeenCalledWith(
      expect.objectContaining({
        amountUzs: 1_000_000,
        bindingStatus: 'resolved',
        buyerPartnerId,
        buyerPartySnapshot: expect.objectContaining({
          partnerId: buyerPartnerId,
          tenantId: owner.tenantId,
          userId: owner.userId,
        }),
        lines: [
          expect.objectContaining({
            lineTotalUzs: 1_000_000,
            sourceId: 'p-1',
            sourcePublicationId: 'listing-public-1',
            sourceRevision: 1,
            unitPriceUzs: 500_000,
          }),
        ],
        sellerPartnerId,
        sellerPartySnapshot: expect.objectContaining({
          partnerId: sellerPartnerId,
          tenantId: sellerTenantId,
          userId: sellerOwnerUserId,
        }),
        sellerTenantId,
        sourceId: cart.id,
        sourceType: 'cart_checkout',
      }),
    );
  });

  it('fails checkout closed when the bound buyer membership is unavailable', async () => {
    const cart = {
      bindingStatus: 'resolved',
      buyerPartnerId,
      createdAt: now,
      id: 'cart-revoked-1',
      items: [{ listingPublicationId: 'listing-public-1', quantity: 1, sourceId: 'p-1', sourceKind: 'product' }],
      sellerId: sellerPartnerId,
      sellerPartnerId,
      sellerTenantId,
      sellerUserId: sellerOwnerUserId,
      status: 'open',
      tenantId: owner.tenantId,
      updatedAt: now,
      userId: owner.userId,
    };
    em.findOne.mockImplementation(async (entity: unknown, where: Record<string, unknown>) => {
      const name = String(entity);
      if (name.includes('Cart')) {
        return cart;
      }
      if (name.includes('MarketplaceCommerceOperation')) {
        return null;
      }
      if (name.includes('MarketplacePartnerMembership') && where.capability === 'buyer') {
        return null;
      }
      return commercePartyLookup(entity, where) ?? null;
    });

    await expect(
      repo.checkoutCart(owner, cart.id, { deliveryTerms: 'pickup' }, 'checkout-revoked-0001'),
    ).resolves.toEqual({ status: 'forbidden', field: 'organization' });
    expect(em.persist).not.toHaveBeenCalled();
  });
});

describe('PostgresMarketplaceRepository — requests and offers', () => {
  let em: ReturnType<typeof makeEm>;
  let repo: PostgresMarketplaceRepository;

  beforeEach(() => {
    em = makeEm();
    repo = new PostgresMarketplaceRepository(em as unknown as EntityManager);
  });

  it('creates a request only after locking the selected active buyer membership', async () => {
    em.findOne.mockImplementation(async (entity: unknown, where: Record<string, unknown>) => {
      return commercePartyLookup(entity, where) ?? null;
    });
    const input = {
      actingPartnerId: buyerPartnerId,
      budgetUzs: 5_000_000,
      deadline: '2026-08-20',
      product: 'corn',
      region: 'Samarkand',
      requirements: 'certified',
      title: 'Corn seeds',
      volume: '10 t',
    };

    const result = await repo.createRequest(owner, input, 'request-unit-0001');

    expect(result).toMatchObject({
      status: 'ok',
      value: { buyerPartnerId, buyerUserId: owner.userId, status: 'open' },
    });
    expect(em.persist).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          bindingStatus: 'review_required',
          buyerPartnerId,
          buyerUserId: owner.userId,
          tenantId: owner.tenantId,
        }),
        expect.objectContaining({
          buyerPartnerId,
          buyerUserId: owner.userId,
          tenantId: owner.tenantId,
        }),
      ]),
    );
  });

  it('fails request creation closed when the selected organization is not an active membership', async () => {
    em.findOne.mockResolvedValue(null);

    await expect(
      repo.createRequest(
        owner,
        { actingPartnerId: 'foreign-buyer-partner', region: 'Samarkand', title: 'Corn seeds' },
        'request-foreign-0001',
      ),
    ).resolves.toEqual({ status: 'forbidden', field: 'organization' });
    expect(em.persist).not.toHaveBeenCalled();
  });

  it('rejects invalid seller-authored monetary and delivery terms before persistence', async () => {
    const seller = { tenantId: sellerTenantId, userId: sellerOwnerUserId };

    await expect(
      repo.makeOffer(
        seller,
        'request-public-1',
        { actingPartnerId: sellerPartnerId, deliveryTerms: 'pickup', priceUzs: 0 },
        'offer-price-unit-0001',
      ),
    ).resolves.toEqual({ status: 'invalid_state', field: 'priceUzs' });
    await expect(
      repo.makeOffer(
        seller,
        'request-public-1',
        {
          actingPartnerId: sellerPartnerId,
          deliveryTerms: 'seller_delivery',
          priceUzs: 4_500_000,
        },
        'offer-delivery-unit-0001',
      ),
    ).resolves.toEqual({ status: 'invalid_state', field: 'deliveryPriceUzs' });
    expect(em.findOne).not.toHaveBeenCalled();
  });

  it('creates an offer only through an approved opaque request publication', async () => {
    const seller = { tenantId: sellerTenantId, userId: sellerOwnerUserId };
    const publication = {
      buyerPartnerId,
      buyerUserId: owner.userId,
      contentRevision: 1,
      id: 'request-public-1',
      moderationStatus: 'approved',
      requestId: 'request-private-1',
      status: 'published',
      tenantId: owner.tenantId,
    };
    const request = {
      bindingStatus: 'resolved',
      buyerPartnerId,
      buyerUserId: owner.userId,
      id: publication.requestId,
      region: 'Samarkand',
      status: 'open',
      tenantId: owner.tenantId,
      title: 'Corn seeds',
      updatedAt: now,
    };
    em.findOne.mockImplementation(async (entity: unknown, where: Record<string, unknown>) => {
      const name = String(entity);
      const party = commercePartyLookup(entity, where);
      if (party !== undefined) {
        return party;
      }
      if (name.includes('MarketplaceRequestPublication')) {
        return where.id === publication.id ? publication : null;
      }
      if (name.includes('BuyerRequest')) {
        return request;
      }
      if (name.includes('MarketplaceRequestOrganizationBinding')) {
        return { id: 'binding-1' };
      }
      return null;
    });

    await expect(
      repo.makeOffer(
        seller,
        request.id,
        { actingPartnerId: sellerPartnerId, deliveryTerms: 'pickup', priceUzs: 4_500_000 },
        'offer-private-unit-0001',
      ),
    ).resolves.toEqual({ status: 'not_found' });

    const result = await repo.makeOffer(
      seller,
      publication.id,
      {
        actingPartnerId: sellerPartnerId,
        deliveryDays: 5,
        deliveryPriceUzs: 250_000,
        deliveryTerms: 'seller_delivery',
        priceUzs: 4_500_000,
      },
      'offer-public-unit-0001',
    );
    expect(result).toMatchObject({
      status: 'ok',
      value: {
        buyerPartnerId,
        buyerTenantId: owner.tenantId,
        requestPublicId: publication.id,
        sellerPartnerId,
        sellerTenantId,
      },
    });
    expect(request.status).toBe('offering');
  });

  it('lists offers only through the owning approved publication', async () => {
    const publication = {
      buyerPartnerId,
      buyerUserId: owner.userId,
      id: 'request-public-1',
      moderationStatus: 'approved',
      requestId: 'request-private-1',
      status: 'published',
      tenantId: owner.tenantId,
    };
    const request = {
      bindingStatus: 'resolved',
      buyerPartnerId,
      buyerUserId: owner.userId,
      id: publication.requestId,
      tenantId: owner.tenantId,
    };
    em.findOne.mockImplementation(async (entity: unknown, where: Record<string, unknown>) => {
      const name = String(entity);
      if (name.includes('MarketplaceRequestPublication')) {
        return where.id === publication.id ? publication : null;
      }
      if (name.includes('BuyerRequest')) {
        return request;
      }
      return commercePartyLookup(entity, where) ?? null;
    });
    em.find.mockResolvedValue([]);

    await expect(repo.listOffers(owner, request.id)).resolves.toEqual({ status: 'not_found' });
    await expect(repo.listOffers(owner, publication.id)).resolves.toEqual({ status: 'ok', value: [] });
  });

  it('freezes request publication and exact parties when selecting an offer', async () => {
    const publication = {
      buyerPartnerId,
      buyerUserId: owner.userId,
      contentRevision: 3,
      id: 'request-public-1',
      moderationStatus: 'approved',
      requestId: 'request-private-1',
      status: 'published',
      tenantId: owner.tenantId,
    };
    const request = {
      bindingStatus: 'resolved',
      buyerPartnerId,
      buyerUserId: owner.userId,
      id: publication.requestId,
      region: 'Samarkand',
      status: 'offering',
      tenantId: owner.tenantId,
      title: 'Corn seeds',
      updatedAt: now,
      volume: '10 t',
    };
    const offer = {
      bindingStatus: 'resolved',
      buyerPartnerId,
      buyerUserId: owner.userId,
      createdAt: now,
      deliveryDays: null,
      deliveryNote: null,
      deliveryPriceUzs: 0,
      deliveryTerms: 'pickup',
      id: 'offer-1',
      priceUzs: 4_500_000,
      requestId: request.id,
      requestPublicId: publication.id,
      sellerPartnerId,
      sellerTenantId,
      sellerUserId: sellerOwnerUserId,
      status: 'pending',
      tenantId: owner.tenantId,
    };
    em.findOne.mockImplementation(async (entity: unknown, where: Record<string, unknown>) => {
      const name = String(entity);
      const party = commercePartyLookup(entity, where);
      if (party !== undefined) {
        return party;
      }
      if (name.includes('MarketplaceRequestPublication')) {
        return publication;
      }
      if (name.includes('BuyerRequest')) {
        return request;
      }
      if (name.includes('RequestOffer')) {
        return offer;
      }
      return null;
    });
    em.find.mockResolvedValue([offer]);

    const result = await repo.chooseOffer(owner, publication.id, offer.id, 'choose-unit-0001');

    expect(result).toMatchObject({
      status: 'ok',
      value: { offerId: offer.id, requestPublicId: publication.id, sellerUserId: sellerOwnerUserId },
    });
    expect(em.persist).toHaveBeenCalledWith(
      expect.objectContaining({
        buyerPartnerId,
        lines: [
          expect.objectContaining({
            sourceId: request.id,
            sourceKind: 'request',
            sourcePublicationId: publication.id,
            sourceRevision: 3,
            unitPriceUzs: 4_500_000,
          }),
        ],
        sellerPartnerId,
        sellerTenantId,
        sourceId: offer.id,
        sourceType: 'offer_selection',
      }),
    );
  });
});

describe('PostgresMarketplaceRepository — contracts, reviews, ai', () => {
  let em: ReturnType<typeof makeEm>;
  let repo: PostgresMarketplaceRepository;

  beforeEach(() => {
    em = makeEm();
    repo = new PostgresMarketplaceRepository(em as unknown as EntityManager);
  });

  it('lets the exact bound seller quote only an unsigned cart delivery contract while both parties remain authorized', async () => {
    const contract = {
      amountUzs: 1_000_000,
      bindingStatus: 'resolved',
      buyerPartnerId,
      buyerPartySnapshot: {},
      buyerSignedAt: null,
      buyerUserId: owner.userId,
      createdAt: now,
      deliveryDays: null,
      deliveryNote: null,
      deliveryPriceUzs: null,
      deliveryTerms: 'seller_delivery',
      factoringEnabled: false,
      id: 'contract-delivery-1',
      lines: [],
      sellerPartnerId,
      sellerPartySnapshot: {},
      sellerSignedAt: null,
      sellerTenantId,
      sellerUserId: sellerOwnerUserId,
      signedAt: null,
      sourceId: 'cart-1',
      sourceType: 'cart_checkout',
      status: 'draft',
      subject: 'Corn seed',
      tenantId: owner.tenantId,
      updatedAt: now,
      version: 0,
    };
    em.findOne.mockImplementation(async (entity: unknown, where: Record<string, unknown>) => {
      if (String(entity).includes('Contract')) {
        return contract;
      }
      return commercePartyLookup(entity, where) ?? null;
    });

    const result = await repo.updateContractDeliveryQuote(
      { tenantId: sellerTenantId, userId: sellerOwnerUserId },
      contract.id,
      { deliveryDays: 2, deliveryNote: 'Farm gate', deliveryPriceUzs: 250_000, expectedRevision: 0 },
      'delivery-quote-0001',
    );

    expect(result).toMatchObject({
      status: 'ok',
      value: { deliveryDays: 2, deliveryPriceUzs: 250_000, sellerPartnerId, sellerTenantId },
    });
    expect(contract.deliveryPriceUzs).toBe(250_000);
    expect(em.flush).toHaveBeenCalledTimes(2);
  });

  it('fails a seller delivery quote closed when the bound buyer membership is revoked', async () => {
    const contract = {
      bindingStatus: 'resolved',
      buyerPartnerId,
      buyerSignedAt: null,
      buyerUserId: owner.userId,
      deliveryPriceUzs: null,
      deliveryTerms: 'seller_delivery',
      id: 'contract-revoked-buyer',
      sellerPartnerId,
      sellerSignedAt: null,
      sellerTenantId,
      sellerUserId: sellerOwnerUserId,
      sourceType: 'cart_checkout',
      status: 'draft',
      tenantId: owner.tenantId,
      version: 0,
    };
    em.findOne.mockImplementation(async (entity: unknown, where: Record<string, unknown>) => {
      const name = String(entity);
      if (name.includes('Contract')) {
        return contract;
      }
      if (name.includes('MarketplacePartnerMembership') && where.capability === 'buyer') {
        return null;
      }
      return commercePartyLookup(entity, where) ?? null;
    });

    await expect(
      repo.updateContractDeliveryQuote(
        { tenantId: sellerTenantId, userId: sellerOwnerUserId },
        contract.id,
        {
          deliveryPriceUzs: 250_000,
          expectedRevision: 0,
        },
        'delivery-quote-0001',
      ),
    ).resolves.toEqual({ status: 'forbidden', field: 'organization' });
    expect(em.flush).not.toHaveBeenCalled();
  });

  it('does not expose the removed internal contract-signing bypass', () => {
    expect('signContract' in repo).toBe(false);
  });
});
