// @requirements REQ-AGRITECH-ADMIN-025 REQ-AGRITECH-LIFECYCLE-020
import { createHash, randomUUID } from 'node:crypto';
import { MikroORM, type EntityManager } from '@mikro-orm/core';
import { Migrator } from '@mikro-orm/migrations';
import type { PostgreSqlDriver } from '@mikro-orm/postgresql';
import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createPostgresContainerMikroOrmOptions,
  hasDockerRuntime,
  startPostgresContainer,
  stopPostgresContainer,
} from '@app/backend-common-component-test';
import {
  marketplaceContractTemplateVersion,
  marketplaceMockContractWatermark,
  marketplaceProviderFingerprint,
  type AgriTechOwner,
  type MarketplaceContractArtifact,
  type MarketplaceContractParty,
  type PreparedMarketplaceContractArtifact,
} from '@app/backend-feature-agritech-shared';
import {
  AgriTechPartnerEntitySchema,
  ContractEntitySchema,
  MarketplaceCommissionRatePolicyEntitySchema,
  MarketplaceContractArtifactEntitySchema,
  MarketplaceContractCommissionEntitySchema,
  MarketplaceContractDisputeEntitySchema,
  MarketplaceContractDisputeEvidenceEntitySchema,
  MarketplaceContractDisputeResolutionEvidenceEntitySchema,
  MarketplaceContractFulfillmentEntitySchema,
  MarketplaceContractLifecycleEventEntitySchema,
  MarketplaceContractNotificationIntentEntitySchema,
  MarketplaceContractReputationSignalEntitySchema,
  MarketplaceContractReviewEligibilityEntitySchema,
  MarketplaceContractSettlementEntitySchema,
  MarketplaceContractSignatureEntitySchema,
  MarketplaceListingPublicationEntitySchema,
  MarketplacePartnerMembershipEntitySchema,
  MarketplaceProviderOperationEntitySchema,
  MarketplacePublicSellerEntitySchema,
  MarketplacePublicSellerRevisionEntitySchema,
  ProductEntitySchema,
  ProduceListingEntitySchema,
  VerificationEntitySchema,
} from '../entities';
import { agritechMigrationOptions } from '../migrations';
import { PostgresMarketplaceContractLifecycleRepository } from './marketplace-contract-lifecycle.repository';
import { PostgresMarketplaceRepository } from './marketplace.repository';

describe('marketplace contract lifecycle PostgreSQL authority', { sequential: true }, () => {
  let container: StartedPostgreSqlContainer | undefined;
  let orm: MikroORM<PostgreSqlDriver> | undefined;

  beforeAll(async () => {
    if (!hasDockerRuntime()) {
      throw new Error('Marketplace contract lifecycle PostgreSQL evidence requires Docker; skipping is forbidden.');
    }
    container = await startPostgresContainer();
    orm = await MikroORM.init<PostgreSqlDriver>(
      createPostgresContainerMikroOrmOptions(container, lifecycleEntities, {
        extensions: [Migrator],
        migrations: agritechMigrationOptions,
      }),
    );
    await orm.migrator.up();
  }, 120_000);

  afterAll(async () => {
    await orm?.close(true);
    await stopPostgresContainer(container);
  });

  it('shares one immutable artifact across buyer and seller keys and activates inventory exactly once', async () => {
    const database = requireOrm(orm);
    const fixture = await seedSigningContract(database.em);
    const selectionFingerprint = marketplaceProviderFingerprint({
      contractId: fixture.contractId,
      settlementKind: 'direct_payment',
    });
    const buyerArtifactKey = 'artifact-buyer-key-0001';
    const sellerArtifactKey = 'artifact-seller-key-0001';
    const preparedArtifact = operationValue(
      await lifecycleRepository(database).prepareArtifact(
        fixture.buyer,
        fixture.contractId,
        'direct_payment',
        buyerArtifactKey,
        selectionFingerprint,
      ),
    );
    expect(preparedArtifact.existingArtifact).toBeUndefined();

    await expect(
      lifecycleRepository(database).prepareArtifact(
        fixture.seller,
        fixture.contractId,
        'direct_payment',
        sellerArtifactKey,
        selectionFingerprint,
      ),
    ).resolves.toEqual({ field: 'idempotencyKey', status: 'conflict' });

    const artifact = await completePreparedArtifact(
      database,
      fixture.buyer,
      fixture.contractId,
      buyerArtifactKey,
      preparedArtifact,
    );
    const buyerSignatureOperationId = await prepareSucceededSignatureOperation(
      database,
      fixture.buyer,
      fixture.contractId,
      'signature-buyer-key-0001',
    );
    await expect(
      lifecycleRepository(database).completeSignature(fixture.buyer, buyerSignatureOperationId),
    ).resolves.toMatchObject({ status: 'ok', value: { signatures: [{ party: 'buyer' }] } });
    expect(
      await rows<{ signatureCount: number; status: string; stock: number }>(
        database.em,
        `select contract.status,
                (select count(*)::int from marketplace_contract_signatures where contract_id = contract.id)
                  as "signatureCount",
                (select stock_quantity from products where id = ?) as stock
           from marketplace_contracts contract
          where contract.id = ?`,
        [fixture.productId, fixture.contractId],
      ),
    ).toEqual([{ signatureCount: 1, status: 'signed', stock: 10 }]);

    const [sellerReplay, buyerReplay] = await Promise.all([
      lifecycleRepository(database).prepareArtifact(
        fixture.seller,
        fixture.contractId,
        'direct_payment',
        sellerArtifactKey,
        selectionFingerprint,
      ),
      lifecycleRepository(database).prepareArtifact(
        fixture.buyer,
        fixture.contractId,
        'direct_payment',
        'artifact-buyer-replay-0002',
        selectionFingerprint,
      ),
    ]);
    expect(operationValue(sellerReplay).existingArtifact).toEqual(artifact);
    expect(operationValue(buyerReplay).existingArtifact).toEqual(artifact);

    await expect(
      lifecycleRepository(database).prepareArtifact(
        fixture.seller,
        fixture.contractId,
        'factoring',
        'artifact-seller-kind-0002',
        marketplaceProviderFingerprint({ contractId: fixture.contractId, settlementKind: 'factoring' }),
      ),
    ).resolves.toEqual({ field: 'idempotencyKey', status: 'conflict' });
    await expect(
      lifecycleRepository(database).prepareArtifact(
        fixture.seller,
        fixture.contractId,
        'direct_payment',
        'artifact-seller-input-0003',
        marketplaceProviderFingerprint({ contractId: fixture.contractId, settlementKind: 'direct_payment', v: 2 }),
      ),
    ).resolves.toEqual({ field: 'idempotencyKey', status: 'conflict' });
    await expect(
      lifecycleRepository(database).prepareArtifact(
        { tenantId: fixture.seller.tenantId, userId: 'foreign-seller' },
        fixture.contractId,
        'direct_payment',
        'artifact-foreign-key-0001',
        selectionFingerprint,
      ),
    ).resolves.toEqual({ status: 'not_found' });

    const sellerSignatureOperationId = await prepareSucceededSignatureOperation(
      database,
      fixture.seller,
      fixture.contractId,
      'signature-seller-key-0001',
    );
    const concurrentActivations = await Promise.all([
      lifecycleRepository(database).completeSignature(fixture.seller, sellerSignatureOperationId),
      lifecycleRepository(database).completeSignature(fixture.seller, sellerSignatureOperationId),
    ]);
    expect(concurrentActivations).toHaveLength(2);
    for (const activation of concurrentActivations) {
      expect(operationValue(activation).signatures.map((signature) => signature.party)).toEqual(['buyer', 'seller']);
    }
    await expect(
      lifecycleRepository(database).completeSignature(fixture.seller, sellerSignatureOperationId),
    ).resolves.toMatchObject({ status: 'ok', value: { signatures: [{ party: 'buyer' }, { party: 'seller' }] } });

    expect(
      await rows<{
        artifactCount: number;
        artifactOperationCount: number;
        signatureCount: number;
        signatureEventCount: number;
        signatureOperationCount: number;
        status: string;
        stock: number;
      }>(
        database.em,
        `select contract.status,
                (select stock_quantity from products where id = ?) as stock,
                (select count(*)::int from marketplace_contract_artifacts where contract_id = contract.id)
                  as "artifactCount",
                (select count(*)::int from marketplace_contract_signatures where contract_id = contract.id)
                  as "signatureCount",
                (select count(*)::int from marketplace_contract_lifecycle_events
                  where contract_id = contract.id and event_type = 'signature_recorded') as "signatureEventCount",
                (select count(*)::int from marketplace_provider_operations
                  where resource_id = contract.id and capability = 'contract_artifact_storage')
                  as "artifactOperationCount",
                (select count(*)::int from marketplace_provider_operations
                  where resource_id = contract.id and capability = 'qualified_signature')
                  as "signatureOperationCount"
           from marketplace_contracts contract
          where contract.id = ?`,
        [fixture.productId, fixture.contractId],
      ),
    ).toEqual([
      {
        artifactCount: 1,
        artifactOperationCount: 1,
        signatureCount: 2,
        signatureEventCount: 2,
        signatureOperationCount: 2,
        status: 'active',
        stock: 8,
      },
    ]);
  }, 120_000);

  it('rejects a stored artifact whose immutable snapshot no longer matches the contract', async () => {
    const database = requireOrm(orm);
    const fixture = await seedSigningContract(database.em);
    const selectionFingerprint = marketplaceProviderFingerprint({
      contractId: fixture.contractId,
      settlementKind: 'direct_payment',
    });
    const preparedArtifact = operationValue(
      await lifecycleRepository(database).prepareArtifact(
        fixture.buyer,
        fixture.contractId,
        'direct_payment',
        'artifact-snapshot-owner-0001',
        selectionFingerprint,
      ),
    );
    const operation = await prepareSucceededArtifactOperation(
      database,
      fixture.buyer,
      fixture.contractId,
      'artifact-snapshot-owner-0001',
      preparedArtifact,
    );
    const mismatchedSnapshotFingerprint =
      preparedArtifact.snapshotFingerprint === 'e'.repeat(64) ? 'f'.repeat(64) : 'e'.repeat(64);
    await database.em.getConnection().execute(
      `insert into marketplace_contract_artifacts
        (id, contract_id, provider_operation_id, snapshot_revision, template_version,
         snapshot_fingerprint, checksum_sha256, media_type, byte_size, storage_reference,
         provider_mode, provider_name, watermark, content, created_at)
       values (?, ?, ?, 1, ?, ?, ?, 'application/pdf', ?, ?,
               'mock', 'mock-contract-artifact-storage', ?, ?, now())`,
      [
        randomUUID(),
        fixture.contractId,
        operation.operationId,
        marketplaceContractTemplateVersion,
        mismatchedSnapshotFingerprint,
        operation.checksumSha256,
        operation.content.byteLength,
        operation.storageReference,
        marketplaceMockContractWatermark,
        operation.content,
      ],
    );

    await expect(
      lifecycleRepository(database).prepareArtifact(
        fixture.seller,
        fixture.contractId,
        'direct_payment',
        'artifact-snapshot-seller-0002',
        selectionFingerprint,
      ),
    ).resolves.toEqual({ field: 'snapshot', status: 'conflict' });
  }, 120_000);

  it('heals a succeeded evidence crash gap, moderates by revision, and completes commission and review eligibility once', async () => {
    const database = requireOrm(orm);
    const fixture = await seedLifecycleContract(database.em);
    const lifecycle = new PostgresMarketplaceContractLifecycleRepository(database.em.fork());
    const providerOperations = new PostgresMarketplaceRepository(database.em.fork());

    await expect(
      lifecycle.transitionFulfillment(
        { tenantId: fixture.seller.tenantId, userId: 'revoked-seller' },
        fixture.contractId,
        'start',
        'lifecycle-revoked-start',
        '1'.repeat(64),
      ),
    ).resolves.toEqual({ status: 'not_found' });
    expect(
      await rows<{ revision: number; status: string }>(
        database.em,
        'select revision, status from marketplace_contract_fulfillments where contract_id = ?',
        [fixture.contractId],
      ),
    ).toEqual([{ revision: 1, status: 'ready' }]);
    await expect(
      lifecycle.transitionFulfillment(fixture.seller, fixture.contractId, 'start', 'lifecycle-start', '2'.repeat(64)),
    ).resolves.toMatchObject({ status: 'ok', value: { fulfillment: { status: 'in_progress' } } });
    await expect(
      lifecycle.openDispute(
        fixture.buyer,
        fixture.contractId,
        'quality_issue',
        'lifecycle-dispute-open',
        '3'.repeat(64),
      ),
    ).resolves.toMatchObject({ status: 'ok', value: { dispute: { status: 'open' } } });

    const content = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.from('bounded dispute evidence')]);
    const metadata = {
      byteSize: content.byteLength,
      checksumSha256: createHash('sha256').update(content).digest('hex'),
      fileName: 'quality-evidence.pdf',
      mediaType: 'application/pdf' as const,
    };
    const parametersFingerprint = marketplaceProviderFingerprint(metadata);
    const requestDescriptor = {
      action: 'store-dispute-evidence' as const,
      parametersFingerprint,
      resourceId: fixture.contractId,
      resourceRevision: 0,
      resourceType: 'contract' as const,
    };
    const preparation = {
      actorType: 'contract_buyer' as const,
      capability: 'dispute_evidence_storage' as const,
      idempotencyKey: 'lifecycle-evidence-key-0001',
      providerMode: 'mock' as const,
      providerName: 'mock-dispute-evidence-storage',
      requestDescriptor,
      requestFingerprint: marketplaceProviderFingerprint(requestDescriptor),
      resourceId: fixture.contractId,
      resourceRevision: 0,
      resourceType: 'contract' as const,
    };
    const prepared = operationValue(await providerOperations.prepareProviderOperation(fixture.buyer, preparation));
    let providerCalls = 0;
    providerCalls += 1;
    const completedAt = new Date(Date.now() - 1_000);
    const storageReference = `mock-dispute-evidence:${fixture.contractId}:${metadata.checksumSha256}`;
    await expect(
      providerOperations.completeProviderOperation(fixture.buyer, prepared.operationId, prepared.attempt, {
        providerMode: 'mock',
        providerName: 'mock-dispute-evidence-storage',
        providerReference: `mock-dispute-evidence-receipt:${prepared.operationId}`,
        resultDescriptor: {
          completedAt: completedAt.toISOString(),
          outcome: 'stored',
          resourceId: fixture.contractId,
          resourceRevision: 0,
          resourceType: 'contract',
        },
        safeReceipt: {
          byteSize: metadata.byteSize,
          checksumSha256: metadata.checksumSha256,
          fileName: metadata.fileName,
          mediaType: metadata.mediaType,
          simulated: true,
          storageReference,
        },
      }),
    ).resolves.toMatchObject({ status: 'ok' });
    expect(
      await rows<{ count: number }>(
        database.em,
        'select count(*)::int as count from marketplace_contract_dispute_evidence',
      ),
    ).toEqual([{ count: 0 }]);

    const replay = operationValue(await providerOperations.prepareProviderOperation(fixture.buyer, preparation));
    expect(replay).toMatchObject({ execute: false, operationId: prepared.operationId });
    expect(providerCalls).toBe(1);
    await expect(
      providerOperations.prepareProviderOperation(fixture.buyer, {
        ...preparation,
        idempotencyKey: 'lifecycle-evidence-key-0002',
      }),
    ).resolves.toMatchObject({ status: 'conflict' });

    const evidence = operationValue(
      await lifecycle.completeDisputeEvidence(fixture.buyer, prepared.operationId, metadata),
    );
    const healedReplay = operationValue(
      await lifecycle.completeDisputeEvidence(fixture.buyer, prepared.operationId, metadata),
    );
    expect(healedReplay.id).toBe(evidence.id);
    expect(providerCalls).toBe(1);
    expect(
      await rows<{ byteSize: number; providerOperationId: string; storageReference: string }>(
        database.em,
        `select byte_size as "byteSize", provider_operation_id as "providerOperationId",
                storage_reference as "storageReference"
           from marketplace_contract_dispute_evidence`,
      ),
    ).toEqual([{ byteSize: metadata.byteSize, providerOperationId: prepared.operationId, storageReference }]);

    await expect(lifecycle.getLifecycleForAdmin('foreign-tenant', fixture.contractId)).resolves.toEqual({
      status: 'not_found',
    });
    await expect(lifecycle.getLifecycleForAdmin(fixture.buyer.tenantId, fixture.contractId)).resolves.toMatchObject({
      status: 'ok',
      value: {
        contractId: fixture.contractId,
        dispute: { status: 'open' },
        disputeEvidence: [{ id: evidence.id, revision: 1 }],
      },
    });
    await expect(
      lifecycle.resolveDispute(
        { tenantId: 'foreign-tenant', userId: 'foreign-moderator' },
        fixture.contractId,
        'dismissed',
        [evidence.id],
        1,
        'Foreign tenant must not decide this case.',
        'lifecycle-dispute-foreign',
        '3'.repeat(64),
      ),
    ).resolves.toEqual({ status: 'not_found' });

    await expect(
      lifecycle.resolveDispute(
        { tenantId: fixture.buyer.tenantId, userId: 'moderator-1' },
        fixture.contractId,
        'dismissed',
        [evidence.id],
        1,
        'Evidence confirms delivery may continue.',
        'lifecycle-dispute-resolve',
        '4'.repeat(64),
      ),
    ).resolves.toMatchObject({
      status: 'ok',
      value: {
        dispute: { decision: 'dismissed', evidenceRevision: 1, status: 'resolved' },
        fulfillment: { status: 'in_progress' },
        reputationSignals: [{ outcome: 'dispute_dismissed', subjectParty: 'buyer' }],
      },
    });
    await expect(
      lifecycle.resolveDispute(
        { tenantId: fixture.buyer.tenantId, userId: 'moderator-1' },
        fixture.contractId,
        'upheld_cancelled',
        [evidence.id],
        0,
        'Stale opposite decision.',
        'lifecycle-dispute-opposite',
        '5'.repeat(64),
      ),
    ).resolves.toEqual({ field: 'idempotencyKey', status: 'conflict' });

    await expect(
      lifecycle.transitionFulfillment(
        fixture.seller,
        fixture.contractId,
        'mark_delivered',
        'lifecycle-delivered',
        '6'.repeat(64),
      ),
    ).resolves.toMatchObject({ status: 'ok', value: { fulfillment: { status: 'delivered' } } });
    const completed = operationValue(
      await lifecycle.transitionFulfillment(
        fixture.buyer,
        fixture.contractId,
        'accept_delivery',
        'lifecycle-complete',
        '7'.repeat(64),
      ),
    );
    expect(completed).toMatchObject({
      commission: {
        amountUzs: 4_000,
        baseAmountUzs: 4_000_000,
        rateVersion: 'dehqonhub-default-v1',
      },
      fulfillment: { status: 'completed' },
      reviewEligibilities: [
        {
          buyerPartnerId: fixture.buyerPartnerId,
          sellerPartnerId: fixture.sellerPartnerId,
          sourceId: fixture.productId,
          sourceKind: 'product',
          sourcePublicationId: fixture.publicationId,
        },
      ],
    });
    const exactReplay = operationValue(
      await lifecycle.transitionFulfillment(
        fixture.buyer,
        fixture.contractId,
        'accept_delivery',
        'lifecycle-complete',
        '7'.repeat(64),
      ),
    );
    expect(exactReplay.commission?.id).toBe(completed.commission?.id);
    expect(exactReplay.reviewEligibilities[0]?.id).toBe(completed.reviewEligibilities[0]?.id);
    expect(
      await rows<{
        commissionCount: number;
        eligibilityCount: number;
        eventCount: number;
        intentCount: number;
        stock: number;
      }>(
        database.em,
        `select
           (select count(*)::int from marketplace_contract_commissions where contract_id = ?) as "commissionCount",
           (select count(*)::int from marketplace_contract_review_eligibilities where contract_id = ?) as "eligibilityCount",
           (select count(*)::int from marketplace_contract_lifecycle_events where contract_id = ?) as "eventCount",
           (select count(*)::int from marketplace_contract_notification_intents where contract_id = ?) as "intentCount",
           (select stock_quantity from products where id = ?) as stock`,
        [fixture.contractId, fixture.contractId, fixture.contractId, fixture.contractId, fixture.productId],
      ),
    ).toEqual([{ commissionCount: 1, eligibilityCount: 1, eventCount: 6, intentCount: 12, stock: 10 }]);
  }, 120_000);
});

const lifecycleEntities = [
  AgriTechPartnerEntitySchema,
  VerificationEntitySchema,
  MarketplacePartnerMembershipEntitySchema,
  MarketplaceProviderOperationEntitySchema,
  ProductEntitySchema,
  ProduceListingEntitySchema,
  MarketplacePublicSellerEntitySchema,
  MarketplacePublicSellerRevisionEntitySchema,
  MarketplaceListingPublicationEntitySchema,
  ContractEntitySchema,
  MarketplaceContractArtifactEntitySchema,
  MarketplaceContractSignatureEntitySchema,
  MarketplaceContractSettlementEntitySchema,
  MarketplaceContractLifecycleEventEntitySchema,
  MarketplaceContractFulfillmentEntitySchema,
  MarketplaceContractDisputeEntitySchema,
  MarketplaceContractDisputeEvidenceEntitySchema,
  MarketplaceContractDisputeResolutionEvidenceEntitySchema,
  MarketplaceContractReputationSignalEntitySchema,
  MarketplaceCommissionRatePolicyEntitySchema,
  MarketplaceContractCommissionEntitySchema,
  MarketplaceContractNotificationIntentEntitySchema,
  MarketplaceContractReviewEligibilityEntitySchema,
];

interface LifecycleFixture {
  buyer: AgriTechOwner;
  buyerPartnerId: string;
  contractId: string;
  productId: string;
  publicationId: string;
  seller: AgriTechOwner;
  sellerPartnerId: string;
}

function lifecycleRepository(database: MikroORM<PostgreSqlDriver>): PostgresMarketplaceContractLifecycleRepository {
  return new PostgresMarketplaceContractLifecycleRepository(database.em.fork());
}

function providerOperationRepository(database: MikroORM<PostgreSqlDriver>): PostgresMarketplaceRepository {
  return new PostgresMarketplaceRepository(database.em.fork());
}

async function completePreparedArtifact(
  database: MikroORM<PostgreSqlDriver>,
  owner: AgriTechOwner,
  contractId: string,
  idempotencyKey: string,
  preparedArtifact: PreparedMarketplaceContractArtifact,
): Promise<MarketplaceContractArtifact> {
  const operation = await prepareSucceededArtifactOperation(
    database,
    owner,
    contractId,
    idempotencyKey,
    preparedArtifact,
  );
  return operationValue(
    await lifecycleRepository(database).completeArtifact(owner, operation.operationId, operation.content),
  );
}

async function prepareSucceededArtifactOperation(
  database: MikroORM<PostgreSqlDriver>,
  owner: AgriTechOwner,
  contractId: string,
  idempotencyKey: string,
  preparedArtifact: PreparedMarketplaceContractArtifact,
) {
  const content = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(128, 0x41)]);
  const checksumSha256 = createHash('sha256').update(content).digest('hex');
  const parametersFingerprint = marketplaceProviderFingerprint({
    artifactChecksum: checksumSha256,
    byteSize: content.byteLength,
    snapshotFingerprint: preparedArtifact.snapshotFingerprint,
    snapshotRevision: preparedArtifact.snapshot.snapshotRevision,
  });
  const requestDescriptor = {
    action: 'store-contract-artifact' as const,
    parametersFingerprint,
    resourceId: contractId,
    resourceRevision: preparedArtifact.snapshot.snapshotRevision,
    resourceType: 'contract' as const,
  };
  const providerOperations = providerOperationRepository(database);
  const preparedOperation = operationValue(
    await providerOperations.prepareProviderOperation(owner, {
      actorType: actorTypeForOwner(preparedArtifact, owner),
      capability: 'contract_artifact_storage',
      idempotencyKey,
      providerMode: 'mock',
      providerName: 'mock-contract-artifact-storage',
      requestDescriptor,
      requestFingerprint: marketplaceProviderFingerprint(requestDescriptor),
      resourceId: contractId,
      resourceRevision: preparedArtifact.snapshot.snapshotRevision,
      resourceType: 'contract',
    }),
  );
  expect(preparedOperation.execute).toBe(true);
  const completedAt = new Date();
  const storageReference = `mock-artifact:${contractId}:${checksumSha256}`;
  await expect(
    providerOperations.completeProviderOperation(owner, preparedOperation.operationId, preparedOperation.attempt, {
      providerMode: 'mock',
      providerName: 'mock-contract-artifact-storage',
      providerReference: `mock-artifact-receipt:${preparedOperation.operationId}`,
      resultDescriptor: {
        completedAt: completedAt.toISOString(),
        outcome: 'stored',
        resourceId: contractId,
        resourceRevision: preparedArtifact.snapshot.snapshotRevision,
        resourceType: 'contract',
      },
      safeReceipt: {
        byteSize: content.byteLength,
        checksumSha256,
        simulated: true,
        storageReference,
      },
    }),
  ).resolves.toMatchObject({ status: 'ok' });
  return { checksumSha256, content, operationId: preparedOperation.operationId, storageReference };
}

async function prepareSucceededSignatureOperation(
  database: MikroORM<PostgreSqlDriver>,
  owner: AgriTechOwner,
  contractId: string,
  idempotencyKey: string,
): Promise<string> {
  const preparedSignature = operationValue(await lifecycleRepository(database).prepareSignature(owner, contractId));
  const parametersFingerprint = marketplaceProviderFingerprint({
    artifactChecksum: preparedSignature.artifact.checksumSha256,
    party: preparedSignature.party,
    snapshotRevision: preparedSignature.artifact.snapshotRevision,
  });
  const requestDescriptor = {
    action: 'qualify-contract-signature' as const,
    parametersFingerprint,
    resourceId: contractId,
    resourceRevision: preparedSignature.artifact.snapshotRevision,
    resourceType: 'contract' as const,
  };
  const providerOperations = providerOperationRepository(database);
  const preparedOperation = operationValue(
    await providerOperations.prepareProviderOperation(owner, {
      actorType: preparedSignature.party === 'buyer' ? 'contract_buyer' : 'contract_seller',
      capability: 'qualified_signature',
      idempotencyKey,
      providerMode: 'mock',
      providerName: 'mock-qualified-signature',
      requestDescriptor,
      requestFingerprint: marketplaceProviderFingerprint(requestDescriptor),
      resourceId: contractId,
      resourceRevision: preparedSignature.artifact.snapshotRevision,
      resourceType: 'contract',
    }),
  );
  expect(preparedOperation.execute).toBe(true);
  const completedAt = new Date();
  await expect(
    providerOperations.completeProviderOperation(owner, preparedOperation.operationId, preparedOperation.attempt, {
      providerMode: 'mock',
      providerName: 'mock-qualified-signature',
      providerReference: `mock-qes:${preparedOperation.operationId}:${preparedSignature.party}`,
      resultDescriptor: {
        completedAt: completedAt.toISOString(),
        outcome: 'signature_recorded',
        resourceId: contractId,
        resourceRevision: preparedSignature.artifact.snapshotRevision,
        resourceType: 'contract',
      },
      safeReceipt: {
        artifactChecksum: preparedSignature.artifact.checksumSha256,
        party: preparedSignature.party,
        signedAt: completedAt.toISOString(),
        simulated: true,
        snapshotRevision: preparedSignature.artifact.snapshotRevision,
      },
    }),
  ).resolves.toMatchObject({ status: 'ok' });
  return preparedOperation.operationId;
}

function actorTypeForOwner(
  preparedArtifact: PreparedMarketplaceContractArtifact,
  owner: AgriTechOwner,
): `contract_${MarketplaceContractParty}` {
  if (
    preparedArtifact.snapshot.buyer.tenantId === owner.tenantId &&
    preparedArtifact.snapshot.buyer.userId === owner.userId
  ) {
    return 'contract_buyer';
  }
  return 'contract_seller';
}

async function seedSigningContract(em: EntityManager): Promise<LifecycleFixture> {
  return seedLifecycleContract(em, { signing: true });
}

async function seedLifecycleContract(
  em: EntityManager,
  options: { signing?: boolean } = {},
): Promise<LifecycleFixture> {
  const signing = options.signing === true;
  const buyer = { tenantId: `tenant-lifecycle-buyer-${randomUUID()}`, userId: `buyer-${randomUUID()}` };
  const seller = { tenantId: `tenant-lifecycle-seller-${randomUUID()}`, userId: `seller-${randomUUID()}` };
  const buyerPartnerId = randomUUID();
  const sellerPartnerId = randomUUID();
  await insertParty(em, buyer, buyerPartnerId, 'buyer');
  await insertParty(em, seller, sellerPartnerId, 'supplier');
  const productId = randomUUID();
  await em.getConnection().execute(
    `insert into products
      (id, tenant_id, name, name_ru, name_uz, name_uz_cyrl, category, description,
       supplier_id, supplier_name, price_uzs, unit, stock_quantity,
       region, status, images, created_at, updated_at)
     values (?, ?, 'Lifecycle corn seed', null, null, null, 'seed', 'Certified source',
             ?, 'Lifecycle seller', 2000000, 't', 10,
             'Samarkand', 'active', '[]'::jsonb, now(), now())`,
    [productId, seller.tenantId, sellerPartnerId],
  );
  const sellerPublicId = randomUUID();
  const sellerRevisionId = randomUUID();
  await em.getConnection().execute(
    `insert into marketplace_public_sellers
      (id, tenant_id, partner_id, partner_kind, owner_user_id, content_revision, status, created_at, updated_at)
     values (?, ?, ?, 'supplier', ?, 1, 'published', now(), now())`,
    [sellerPublicId, seller.tenantId, sellerPartnerId, seller.userId],
  );
  await em.getConnection().execute(
    `insert into marketplace_public_seller_revisions
      (id, seller_public_id, tenant_id, content_revision, content_fingerprint, display_name,
       region, moderation_status, moderated_by, moderated_at, created_at, updated_at)
     values (?, ?, ?, 1, repeat('a', 64), 'Lifecycle seller', 'Samarkand',
             'approved', 'moderator', now(), now(), now())`,
    [sellerRevisionId, sellerPublicId, seller.tenantId],
  );
  const publicationId = randomUUID();
  await em.getConnection().execute(
    `insert into marketplace_listing_publications
      (id, tenant_id, owner_user_id, seller_public_id, seller_revision_id, seller_content_revision,
       product_id, source_kind, section, public_title, public_category, public_unit, public_region,
       public_images, content_fingerprint, content_revision, status, moderation_status,
       moderated_by, moderated_at, idempotency_key, request_fingerprint, revision,
       published_at, created_at, updated_at)
     values (?, ?, ?, ?, ?, 1, ?, 'product', 'seeds', 'Lifecycle corn seed', 'seed',
             't', 'Samarkand', '[]'::jsonb, repeat('b', 64), 1, 'published', 'approved',
             'moderator', now(), 'lifecycle-publication-key', repeat('c', 64), 0, now(), now(), now())`,
    [publicationId, seller.tenantId, seller.userId, sellerPublicId, sellerRevisionId, productId],
  );
  const contractId = randomUUID();
  const line = {
    lineTotalUzs: 4_000_000,
    name: 'Lifecycle corn seed',
    quantity: 2,
    sourceId: productId,
    sourceKind: 'product',
    sourcePublicationId: publicationId,
    sourceRevision: 1,
    unit: 't',
    unitPriceUzs: 2_000_000,
  };
  const signedAt = signing ? null : new Date();
  await em.getConnection().execute(
    `insert into marketplace_contracts
      (id, tenant_id, buyer_user_id, buyer_partner_id, seller_tenant_id, seller_user_id, seller_partner_id,
       buyer_party_snapshot, seller_party_snapshot, binding_status, source_type, source_id,
       subject, amount_uzs, lines, delivery_terms, delivery_price_uzs, factoring_enabled,
       status, buyer_signed_at, seller_signed_at, signed_at, created_at, updated_at)
     values (?, ?, ?, ?, ?, ?, ?, ?::jsonb, ?::jsonb, 'resolved', ?, ?,
             'Lifecycle corn contract', 4000000, ?::jsonb, 'pickup', 0, false,
             ?, ?, ?, ?, now(), now())`,
    [
      contractId,
      buyer.tenantId,
      buyer.userId,
      buyerPartnerId,
      seller.tenantId,
      seller.userId,
      sellerPartnerId,
      JSON.stringify(partySnapshot(buyer, buyerPartnerId, 'Lifecycle buyer')),
      JSON.stringify(partySnapshot(seller, sellerPartnerId, 'Lifecycle seller')),
      signing ? 'cart_checkout' : 'offer_selection',
      randomUUID(),
      JSON.stringify([line]),
      signing ? 'draft' : 'active',
      signedAt,
      signedAt,
      signedAt,
    ],
  );
  if (signing) {
    return { buyer, buyerPartnerId, contractId, productId, publicationId, seller, sellerPartnerId };
  }
  await em.getConnection().execute(
    `insert into marketplace_contract_settlements
      (id, contract_id, kind, status, amount_uzs, currency, selected_by_tenant_id, selected_by_user_id,
       selection_idempotency_key, selection_request_fingerprint, latest_provider_mode,
       reconciliation_state, revision, created_at, updated_at)
     values (?, ?, 'direct_payment', 'awaiting_buyer_confirmation', 4000000, 'UZS', ?, ?,
             'lifecycle-settlement', repeat('d', 64), 'none', 'clear', 0, now(), now())`,
    [randomUUID(), contractId, buyer.tenantId, buyer.userId],
  );
  await em.getConnection().execute(
    `update marketplace_contract_settlements set status = 'buyer_confirmed', revision = 1 where contract_id = ?;
     update marketplace_contract_settlements set status = 'seller_received', revision = 2 where contract_id = ?`,
    [contractId, contractId],
  );
  await em.getConnection().execute(
    `insert into marketplace_contract_fulfillments
      (id, contract_id, status, revision, created_at, updated_at)
     values (?, ?, 'awaiting_settlement', 0, now(), now())`,
    [randomUUID(), contractId],
  );
  await em
    .getConnection()
    .execute(`update marketplace_contract_fulfillments set status = 'ready', revision = 1 where contract_id = ?`, [
      contractId,
    ]);
  return { buyer, buyerPartnerId, contractId, productId, publicationId, seller, sellerPartnerId };
}

async function insertParty(
  em: EntityManager,
  owner: AgriTechOwner,
  partnerId: string,
  kind: 'buyer' | 'supplier',
): Promise<void> {
  await em.getConnection().execute(
    `insert into agritech_partners
      (id, tenant_id, owner_user_id, kind, legal_name, tax_id, phone, region, status, created_at, updated_at)
     values (?, ?, ?, ?, 'Lifecycle organization', ?, '+998900000000', 'Samarkand', 'approved', now(), now())`,
    [partnerId, owner.tenantId, owner.userId, kind, partnerId.replaceAll('-', '').slice(0, 20)],
  );
  const capability = kind === 'buyer' ? 'buyer' : 'seller';
  await em.getConnection().execute(
    `insert into marketplace_verifications
      (id, tenant_id, user_id, role, level, status, one_id_linked, provider_mode,
       identity_assurance, documents, created_at, updated_at)
     values (?, ?, ?, ?, 'verified', 'verified', true, 'legacy', 'legacy_unknown', '[]'::jsonb, now(), now())`,
    [randomUUID(), owner.tenantId, owner.userId, capability],
  );
}

function partySnapshot(owner: AgriTechOwner, partnerId: string, legalName: string) {
  return { legalName, partnerId, region: 'Samarkand', tenantId: owner.tenantId, userId: owner.userId };
}

function operationValue<T>(result: { status: string; value?: T }): T {
  if (result.status !== 'ok' || result.value === undefined) {
    throw new Error(`Expected ok operation, received ${result.status}.`);
  }
  return result.value;
}

function requireOrm(value: MikroORM<PostgreSqlDriver> | undefined): MikroORM<PostgreSqlDriver> {
  if (!value) {
    throw new Error('PostgreSQL lifecycle fixture is not initialized.');
  }
  return value;
}

async function rows<T>(em: EntityManager, sql: string, parameters: unknown[] = []): Promise<T[]> {
  return (await em.getConnection().execute(sql, parameters)) as T[];
}
