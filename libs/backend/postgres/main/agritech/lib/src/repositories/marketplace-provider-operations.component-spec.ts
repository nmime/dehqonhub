// @requirements REQ-AGRITECH-INTEGRATION-013 REQ-AGRITECH-LIFECYCLE-020 REQ-AGRITECH-STAGE2-017
import { randomUUID } from 'node:crypto';
import { MikroORM, type EntityManager } from '@mikro-orm/core';
import { Migrator } from '@mikro-orm/migrations';
import type { PostgreSqlDriver } from '@mikro-orm/postgresql';
import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  createPostgresContainerMikroOrmOptions,
  hasDockerRuntime,
  startPostgresContainer,
  stopPostgresContainer,
} from '@app/backend-common-component-test';
import type { AgriTechOwner, MarketplaceProviderOperationPreparation } from '@app/backend-feature-agritech-shared';
import { marketplaceProviderFingerprint } from '@app/backend-feature-agritech-shared';
import { MarketplaceProviderOperationEntitySchema, VerificationEntitySchema } from '../entities';
import { agritechMigrationOptions } from '../migrations';
import { PostgresMarketplaceRepository } from './marketplace.repository';

const providerMigration = 'Migration20260810133000GeneralizeMarketplaceProviderOperations';

describe('AgriTech marketplace provider-operation PostgreSQL boundary', () => {
  let container: StartedPostgreSqlContainer | undefined;
  let orm: MikroORM<PostgreSqlDriver> | undefined;
  let contractFixture: ContractFixture | undefined;

  beforeAll(async () => {
    if (!hasDockerRuntime()) {
      throw new Error(
        'Marketplace provider-operation PostgreSQL evidence requires an available Docker runtime; skipping is forbidden.',
      );
    }
    container = await startPostgresContainer();
    orm = await MikroORM.init<PostgreSqlDriver>(
      createPostgresContainerMikroOrmOptions(
        container,
        [MarketplaceProviderOperationEntitySchema, VerificationEntitySchema],
        {
          extensions: [Migrator],
          migrations: agritechMigrationOptions,
        },
      ),
    );
    await orm.migrator.up();
  });

  afterAll(async () => {
    await orm?.close(true);
    await stopPostgresContainer(container);
  });

  beforeEach(async () => {
    if (orm) {
      await orm.em.getConnection().execute('delete from marketplace_provider_operations');
    }
  });

  it('applies down and up on a real PostgreSQL database before generalized traffic', async () => {
    const database = requireOrm(orm);
    await database.migrator.down({ migrations: [providerMigration] });
    expect(
      await rows<{ columnName: string }>(
        database.em,
        `select column_name as "columnName"
           from information_schema.columns
          where table_schema = 'public' and table_name = 'marketplace_provider_operations'
            and column_name = 'actor_type'`,
      ),
    ).toEqual([]);

    await database.migrator.up({ migrations: [providerMigration] });
    expect(
      await rows<{ constraintName: string }>(
        database.em,
        `select conname as "constraintName"
           from pg_constraint
          where conname in ('ck__marketplace_provider_ops__scope', 'ck__marketplace_provider_ops__safe_receipt')
          order by conname`,
      ),
    ).toEqual([
      { constraintName: 'ck__marketplace_provider_ops__safe_receipt' },
      { constraintName: 'ck__marketplace_provider_ops__scope' },
    ]);
  });

  it('serializes an exact contract command and leaves no residue for foreign or review-required actors', async () => {
    const database = requireOrm(orm);
    const fixture = await ensureContractFixture(database, contractFixture);
    contractFixture = fixture;
    const preparation = directPaymentPreparation(fixture.contractId, 'payment-concurrent-key-0001');
    const attempts = await Promise.all([
      repository(database).prepareProviderOperation(fixture.buyer, preparation),
      repository(database).prepareProviderOperation(fixture.buyer, preparation),
    ]);

    expect(attempts.filter((result) => result.status === 'ok')).toHaveLength(1);
    expect(attempts.filter((result) => result.status === 'conflict')).toEqual([
      { field: 'operationInProgress', status: 'conflict' },
    ]);
    expect(
      await rows<{ count: number }>(
        database.em,
        `select count(*)::int as count
           from marketplace_provider_operations
          where resource_id = ? and idempotency_key = ?`,
        [fixture.contractId, preparation.idempotencyKey],
      ),
    ).toEqual([{ count: 1 }]);
    const prepared = attempts.find((result) => result.status === 'ok');
    if (!prepared) {
      throw new Error('Expected one provider command claim.');
    }
    await repository(database).failProviderOperation(
      fixture.buyer,
      prepared.value.operationId,
      prepared.value.attempt,
      'known_failure',
    );
    const differentKeys = await Promise.all([
      repository(database).prepareProviderOperation(
        fixture.buyer,
        directPaymentPreparation(fixture.contractId, 'payment-different-key-0001'),
      ),
      repository(database).prepareProviderOperation(
        fixture.buyer,
        directPaymentPreparation(fixture.contractId, 'payment-different-key-0002'),
      ),
    ]);
    expect(differentKeys.filter((result) => result.status === 'ok')).toHaveLength(1);
    expect(differentKeys.filter((result) => result.status === 'conflict')).toHaveLength(1);

    await expect(
      repository(database).prepareProviderOperation(
        { tenantId: 'foreign-tenant', userId: fixture.buyer.userId },
        directPaymentPreparation(fixture.contractId, 'payment-foreign-key-0001'),
      ),
    ).resolves.toEqual({ field: 'resource', status: 'not_found' });
    await expect(
      repository(database).prepareProviderOperation(
        fixture.buyer,
        directPaymentPreparation(fixture.reviewRequiredContractId, 'payment-review-key-0001'),
      ),
    ).resolves.toEqual({ field: 'resource', status: 'not_found' });
    expect(
      await rows<{ count: number }>(
        database.em,
        `select count(*)::int as count
           from marketplace_provider_operations
          where idempotency_key in ('payment-foreign-key-0001', 'payment-review-key-0001')`,
      ),
    ).toEqual([{ count: 0 }]);
  });

  it('reclaims an expired lease with a new attempt and fences the stale attempt', async () => {
    const database = requireOrm(orm);
    const fixture = await ensureContractFixture(database, contractFixture);
    contractFixture = fixture;
    const preparation = directPaymentPreparation(fixture.contractId, 'payment-expired-lease-key-0001');
    const operationId = randomUUID();
    await database.em.getConnection().execute(
      `insert into marketplace_provider_operations
        (id, tenant_id, user_id, actor_type, capability, resource_type, resource_id,
         resource_revision, idempotency_key, request_fingerprint, request_descriptor,
         provider_mode, provider_name, status, attempt, lease_expires_at, created_at, updated_at)
       values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?::jsonb, ?, ?, 'started', 1,
               now() + interval '100 milliseconds', now(), now())`,
      [
        operationId,
        fixture.buyer.tenantId,
        fixture.buyer.userId,
        preparation.actorType,
        preparation.capability,
        preparation.resourceType,
        preparation.resourceId,
        preparation.resourceRevision,
        preparation.idempotencyKey,
        preparation.requestFingerprint,
        JSON.stringify(preparation.requestDescriptor),
        preparation.providerMode,
        preparation.providerName,
      ],
    );
    await database.em.getConnection().execute(`select pg_sleep(0.15)`);

    const takeover = preparedValue(await repository(database).prepareProviderOperation(fixture.buyer, preparation));
    expect(takeover).toMatchObject({ attempt: 2, execute: true, operationId });
    const completion = {
      providerEventId: 'provider-payment-event-expired-lease',
      providerMode: 'mock' as const,
      providerName: 'mock-direct-payment',
      providerReference: 'provider-payment-reference-expired-lease',
      resultDescriptor: providerResultDescriptor(fixture.contractId, 'authorized'),
      safeReceipt: { amountUzs: 4_200_000, currency: 'UZS', simulated: true },
    };
    await expect(
      repository(database).completeProviderOperation(fixture.buyer, operationId, 1, completion),
    ).resolves.toEqual({ field: 'operationAttempt', status: 'conflict' });
    await expect(
      repository(database).completeProviderOperation(fixture.buyer, operationId, 2, completion),
    ).resolves.toMatchObject({
      status: 'ok',
      value: { attempt: 2, providerEventId: 'provider-payment-event-expired-lease' },
    });
  });

  it('claims artifact globally and qualified signature per exact party across different keys', async () => {
    const database = requireOrm(orm);
    const fixture = await ensureContractFixture(database, contractFixture);
    contractFixture = fixture;
    const artifacts = await Promise.all([
      repository(database).prepareProviderOperation(
        fixture.buyer,
        contractArtifactPreparation(fixture.contractId, 'artifact-buyer-key-0001', 'contract_buyer'),
      ),
      repository(database).prepareProviderOperation(
        fixture.seller,
        contractArtifactPreparation(fixture.contractId, 'artifact-seller-key-0001', 'contract_seller'),
      ),
    ]);
    expect(artifacts.filter((result) => result.status === 'ok')).toHaveLength(1);
    expect(artifacts.filter((result) => result.status === 'conflict')).toHaveLength(1);

    await database.em.getConnection().execute('delete from marketplace_provider_operations');
    const signatures = await Promise.all([
      repository(database).prepareProviderOperation(
        fixture.buyer,
        qualifiedSignaturePreparation(fixture.contractId, 'qes-buyer-key-0001', 'contract_buyer'),
      ),
      repository(database).prepareProviderOperation(
        fixture.buyer,
        qualifiedSignaturePreparation(fixture.contractId, 'qes-buyer-key-0002', 'contract_buyer'),
      ),
      repository(database).prepareProviderOperation(
        fixture.seller,
        qualifiedSignaturePreparation(fixture.contractId, 'qes-seller-key-0001', 'contract_seller'),
      ),
    ]);
    expect(signatures.filter((result) => result.status === 'ok')).toHaveLength(2);
    expect(signatures.filter((result) => result.status === 'conflict')).toHaveLength(1);
  });

  it('quarantines reconciliation-required outcomes across exact and changed keys', async () => {
    const database = requireOrm(orm);
    const fixture = await ensureContractFixture(database, contractFixture);
    contractFixture = fixture;
    const preparation = directPaymentPreparation(fixture.contractId, 'payment-reconcile-key-0001');
    const prepared = preparedValue(await repository(database).prepareProviderOperation(fixture.buyer, preparation));
    await repository(database).failProviderOperation(
      fixture.buyer,
      prepared.operationId,
      prepared.attempt,
      'direct_payment_completion_persist_failed',
      'provider_outcome_unknown',
    );
    await expect(repository(database).prepareProviderOperation(fixture.buyer, preparation)).resolves.toEqual({
      field: 'reconciliationRequired',
      status: 'conflict',
    });
    await expect(
      repository(database).prepareProviderOperation(
        fixture.buyer,
        directPaymentPreparation(fixture.contractId, 'payment-reconcile-key-0002'),
      ),
    ).resolves.toEqual({ field: 'reconciliationRequired', status: 'conflict' });
  });

  it('allows distinct verification documents but claims identical evidence across changed keys', async () => {
    const database = requireOrm(orm);
    const fixture = await ensureVerificationFixture(database.em);
    const idDocument = verificationDocumentPreparation(
      fixture.verificationId,
      fixture.caseRevision,
      'verification-id-key-0001',
      'id',
      'a',
    );
    const landDocument = verificationDocumentPreparation(
      fixture.verificationId,
      fixture.caseRevision,
      'verification-land-key-0001',
      'land',
      'b',
    );
    const [idResult, landResult] = await Promise.all([
      repository(database).prepareProviderOperation(fixture.owner, idDocument),
      repository(database).prepareProviderOperation(fixture.owner, landDocument),
    ]);
    expect(idResult.status).toBe('ok');
    expect(landResult.status).toBe('ok');
    await expect(
      repository(database).prepareProviderOperation(fixture.owner, {
        ...idDocument,
        idempotencyKey: 'verification-id-key-0002',
      }),
    ).resolves.toEqual({ field: 'operationInProgress', status: 'conflict' });
  });

  it('fences attempts, stores a safe result fingerprint, and makes provider events unique', async () => {
    const database = requireOrm(orm);
    const fixture = await ensureContractFixture(database, contractFixture);
    contractFixture = fixture;
    const buyerPreparation = directPaymentPreparation(fixture.contractId, 'payment-complete-key-0001');
    const sellerPreparation = {
      ...directPaymentPreparation(fixture.contractId, 'payment-complete-key-0002', 1),
      actorType: 'contract_seller' as const,
    };
    const buyerPrepared = preparedValue(
      await repository(database).prepareProviderOperation(fixture.buyer, buyerPreparation),
    );
    const sellerPrepared = preparedValue(
      await repository(database).prepareProviderOperation(fixture.seller, sellerPreparation),
    );
    const resultDescriptor = providerResultDescriptor(fixture.contractId, 'authorized');
    const sellerResultDescriptor = providerResultDescriptor(fixture.contractId, 'authorized', 1);

    await expect(
      repository(database).completeProviderOperation(fixture.buyer, buyerPrepared.operationId, 2, {
        providerEventId: 'provider-payment-event-0001',
        providerMode: 'mock',
        providerName: 'mock-direct-payment',
        providerReference: 'provider-payment-reference-0001',
        resultDescriptor,
        safeReceipt: { amountUzs: 4_200_000, currency: 'UZS', simulated: true },
      }),
    ).resolves.toEqual({ field: 'operationAttempt', status: 'conflict' });
    await expect(
      repository(database).completeProviderOperation(fixture.buyer, buyerPrepared.operationId, buyerPrepared.attempt, {
        providerEventId: 'provider-payment-event-0001',
        providerMode: 'mock',
        providerName: 'mock-direct-payment',
        providerReference: 'provider-payment-reference-0001',
        resultDescriptor,
        safeReceipt: { amountUzs: 4_200_000, currency: 'UZS', simulated: true },
      }),
    ).resolves.toMatchObject({
      status: 'ok',
      value: {
        providerEventId: 'provider-payment-event-0001',
        resultFingerprint: marketplaceProviderFingerprint(resultDescriptor),
      },
    });
    await expect(
      repository(database).completeProviderOperation(
        fixture.seller,
        sellerPrepared.operationId,
        sellerPrepared.attempt,
        {
          providerEventId: 'provider-payment-event-0001',
          providerMode: 'mock',
          providerName: 'mock-direct-payment',
          providerReference: 'provider-payment-reference-0002',
          resultDescriptor: sellerResultDescriptor,
          safeReceipt: { amountUzs: 4_200_000, currency: 'UZS', simulated: true },
        },
      ),
    ).resolves.toEqual({ field: 'providerEventId', status: 'conflict' });

    const replay = await repository(database).prepareProviderOperation(fixture.buyer, buyerPreparation);
    expect(replay).toMatchObject({
      status: 'ok',
      value: { execute: false, providerReplay: { providerEventId: 'provider-payment-event-0001' } },
    });
    await expect(
      database.em
        .getConnection()
        .execute(`update marketplace_provider_operations set request_fingerprint = repeat('e', 64) where id = ?`, [
          buyerPrepared.operationId,
        ]),
    ).rejects.toThrow(/marketplace provider operation identity is immutable/u);
    await expect(
      database.em
        .getConnection()
        .execute(`update marketplace_provider_operations set result_fingerprint = repeat('e', 64) where id = ?`, [
          buyerPrepared.operationId,
        ]),
    ).rejects.toThrow(/marketplace provider operation transition is invalid/u);
  });

  it('rejects raw receipts at both repository and database boundaries and records reconciliation explicitly', async () => {
    const database = requireOrm(orm);
    const fixture = await ensureContractFixture(database, contractFixture);
    contractFixture = fixture;
    const unsafePrepared = preparedValue(
      await repository(database).prepareProviderOperation(
        fixture.buyer,
        directPaymentPreparation(fixture.contractId, 'payment-unsafe-key-0001'),
      ),
    );
    const resultDescriptor = providerResultDescriptor(fixture.contractId, 'authorized');

    await expect(
      repository(database).completeProviderOperation(
        fixture.buyer,
        unsafePrepared.operationId,
        unsafePrepared.attempt,
        {
          providerEventId: 'provider-payment-event-unsafe',
          providerMode: 'mock',
          providerName: 'mock-direct-payment',
          providerReference: 'provider-payment-reference-unsafe',
          resultDescriptor,
          safeReceipt: { rawPayload: 'must-not-persist' },
        },
      ),
    ).resolves.toEqual({ field: 'status', status: 'conflict' });
    await expect(
      database.em.getConnection().execute(
        `update marketplace_provider_operations
            set status = 'succeeded', lease_expires_at = null,
                provider_reference = 'direct-write-reference',
                provider_event_id = 'direct-write-event', receipt = ?::jsonb,
                result_snapshot = ?::jsonb, result_fingerprint = repeat('d', 64),
                updated_at = updated_at + interval '1 second'
          where id = ?`,
        [
          JSON.stringify({ privateKey: 'must-not-persist' }),
          JSON.stringify(resultDescriptor),
          unsafePrepared.operationId,
        ],
      ),
    ).rejects.toThrow(/ck__marketplace_provider_ops__safe_receipt/u);
    await expect(
      database.em.getConnection().execute(
        `update marketplace_provider_operations
            set status = 'succeeded', lease_expires_at = null,
                provider_reference = 'direct-write-reference',
                provider_event_id = 'direct-write-incomplete-event', receipt = ?::jsonb,
                result_snapshot = ?::jsonb, result_fingerprint = repeat('d', 64),
                updated_at = updated_at + interval '1 second'
          where id = ?`,
        [
          JSON.stringify({ simulated: true }),
          JSON.stringify({
            completedAt: new Date().toISOString(),
            resourceId: fixture.contractId,
            resourceRevision: 0,
            resourceType: 'contract',
          }),
          unsafePrepared.operationId,
        ],
      ),
    ).rejects.toThrow(/ck__marketplace_provider_ops__result_descriptor/u);

    const artifactPreparation = contractArtifactPreparation(fixture.contractId, 'artifact-reconcile-key-0001');
    const artifactPrepared = preparedValue(
      await repository(database).prepareProviderOperation(fixture.buyer, artifactPreparation),
    );
    await expect(
      repository(database).completeProviderOperation(
        fixture.buyer,
        artifactPrepared.operationId,
        artifactPrepared.attempt,
        {
          providerMode: 'mock',
          providerName: 'mock-contract-artifact-storage',
          providerReference: 'artifact-reference-0001',
          reconciliationReason: 'provider_status_unknown',
          resultDescriptor: providerResultDescriptor(fixture.contractId, 'stored'),
          safeReceipt: { mediaType: 'application/pdf', simulated: true },
        },
      ),
    ).resolves.toMatchObject({ status: 'ok', value: { reconciliationRequired: true } });
    expect(
      await rows<{ reconciliationReason: string; reconciliationRequired: boolean }>(
        database.em,
        `select reconciliation_reason as "reconciliationReason",
                reconciliation_required as "reconciliationRequired"
           from marketplace_provider_operations where id = ?`,
        [artifactPrepared.operationId],
      ),
    ).toEqual([{ reconciliationReason: 'provider_status_unknown', reconciliationRequired: true }]);
  });

  it('allows unanchored promotion expiry but fences identity mutation after a provider operation is anchored', async () => {
    const database = requireOrm(orm);
    const promotion = await insertPromotionFixture(database.em);
    await database.em.getConnection().execute(`select pg_sleep(0.15)`);

    await expect(
      database.em.getConnection().execute(
        `update marketplace_listing_promotions
            set status = 'expired', revision = revision + 1, updated_at = now()
          where id = ?`,
        [promotion.id],
      ),
    ).resolves.toBeDefined();
    const prepared = preparedValue(
      await repository(database).prepareProviderOperation(
        promotion.actor,
        promotionBillingPreparation(promotion.id, 'promotion-billing-key-0001'),
      ),
    );
    expect(prepared.execute).toBe(true);
    await expect(
      database.em
        .getConnection()
        .execute(`update marketplace_listing_promotions set actor_user_id = 'attacker' where id = ?`, [promotion.id]),
    ).rejects.toThrow(/marketplace provider operation resource anchor is immutable/u);
  });
});

interface ContractFixture {
  buyer: AgriTechOwner;
  contractId: string;
  reviewRequiredContractId: string;
  seller: AgriTechOwner;
}

interface VerificationFixture {
  caseRevision: number;
  owner: AgriTechOwner;
  verificationId: string;
}

function requireOrm(orm: MikroORM<PostgreSqlDriver> | undefined): MikroORM<PostgreSqlDriver> {
  if (!orm) {
    throw new Error('Marketplace provider-operation PostgreSQL database was not initialized.');
  }
  return orm;
}

function repository(database: MikroORM<PostgreSqlDriver>): PostgresMarketplaceRepository {
  return new PostgresMarketplaceRepository(database.em.fork());
}

function preparedValue(result: Awaited<ReturnType<PostgresMarketplaceRepository['prepareProviderOperation']>>) {
  if (result.status !== 'ok') {
    throw new Error(`Expected a prepared provider operation, received ${JSON.stringify(result)}.`);
  }
  return result.value;
}

function providerResultDescriptor(resourceId: string, outcome: string, resourceRevision = 0) {
  return {
    completedAt: new Date().toISOString(),
    outcome,
    resourceId,
    resourceRevision,
    resourceType: 'contract' as const,
  };
}

function directPaymentPreparation(
  resourceId: string,
  idempotencyKey: string,
  resourceRevision = 0,
): MarketplaceProviderOperationPreparation {
  return genericPreparation({
    action: 'record-direct-payment',
    actorType: 'contract_buyer',
    capability: 'direct_payment',
    idempotencyKey,
    providerName: 'mock-direct-payment',
    resourceId,
    resourceRevision,
    resourceType: 'contract',
  });
}

function contractArtifactPreparation(
  resourceId: string,
  idempotencyKey: string,
  actorType: 'contract_buyer' | 'contract_seller' = 'contract_buyer',
): MarketplaceProviderOperationPreparation {
  return genericPreparation({
    action: 'store-contract-artifact',
    actorType,
    capability: 'contract_artifact_storage',
    idempotencyKey,
    providerName: 'mock-contract-artifact-storage',
    resourceId,
    resourceType: 'contract',
  });
}

function qualifiedSignaturePreparation(
  resourceId: string,
  idempotencyKey: string,
  actorType: 'contract_buyer' | 'contract_seller',
): MarketplaceProviderOperationPreparation {
  return genericPreparation({
    action: 'qualify-contract-signature',
    actorType,
    capability: 'qualified_signature',
    idempotencyKey,
    providerName: 'mock-qualified-signature',
    resourceId,
    resourceType: 'contract',
  });
}

function verificationDocumentPreparation(
  resourceId: string,
  resourceRevision: number,
  idempotencyKey: string,
  kind: 'id' | 'land',
  checksumSeed: string,
): MarketplaceProviderOperationPreparation {
  const requestDescriptor = {
    action: 'store-verification-document' as const,
    document: {
      fileName: `${kind}-evidence.pdf`,
      kind,
      mimeType: 'application/pdf' as const,
      sha256: checksumSeed.repeat(64),
      sizeBytes: 128,
    },
    resourceId,
    resourceRevision,
    resourceType: 'verification' as const,
  };
  return {
    actorType: 'verification_subject',
    capability: 'verification_documents',
    idempotencyKey,
    providerMode: 'mock',
    providerName: 'mock-verification-document-storage',
    requestDescriptor,
    requestFingerprint: marketplaceProviderFingerprint(requestDescriptor),
    resourceId,
    resourceRevision,
    resourceType: 'verification',
  };
}

function promotionBillingPreparation(
  resourceId: string,
  idempotencyKey: string,
): MarketplaceProviderOperationPreparation {
  return genericPreparation({
    action: 'bill-listing-promotion',
    actorType: 'promotion_owner',
    capability: 'promotion_billing',
    idempotencyKey,
    providerName: 'mock-promotion-billing',
    resourceId,
    resourceType: 'promotion',
  });
}

function genericPreparation(input: {
  action: 'bill-listing-promotion' | 'qualify-contract-signature' | 'record-direct-payment' | 'store-contract-artifact';
  actorType: 'contract_buyer' | 'contract_seller' | 'promotion_owner';
  capability: 'contract_artifact_storage' | 'direct_payment' | 'promotion_billing' | 'qualified_signature';
  idempotencyKey: string;
  providerName: string;
  resourceId: string;
  resourceRevision?: number;
  resourceType: 'contract' | 'promotion';
}): MarketplaceProviderOperationPreparation {
  const requestDescriptor = {
    action: input.action,
    parametersFingerprint: marketplaceProviderFingerprint({ version: 1 }),
    resourceId: input.resourceId,
    resourceRevision: input.resourceRevision ?? 0,
    resourceType: input.resourceType,
  };
  return {
    actorType: input.actorType,
    capability: input.capability,
    idempotencyKey: input.idempotencyKey,
    providerMode: 'mock',
    providerName: input.providerName,
    requestDescriptor,
    requestFingerprint: marketplaceProviderFingerprint(requestDescriptor),
    resourceId: input.resourceId,
    resourceRevision: input.resourceRevision ?? 0,
    resourceType: input.resourceType,
  };
}

async function ensureContractFixture(
  database: MikroORM<PostgreSqlDriver>,
  existing: ContractFixture | undefined,
): Promise<ContractFixture> {
  if (existing) {
    return existing;
  }
  const buyer = { tenantId: 'tenant-provider-buyer', userId: 'provider-buyer' };
  const seller = { tenantId: 'tenant-provider-seller', userId: 'provider-seller' };
  const buyerPartnerId = randomUUID();
  const sellerPartnerId = randomUUID();
  await insertParty(database.em, buyer, buyerPartnerId, 'buyer');
  await insertParty(database.em, seller, sellerPartnerId, 'supplier');
  const contractId = randomUUID();
  const line = {
    lineTotalUzs: 4_200_000,
    name: 'Provider boundary corn seed',
    quantity: 1,
    sourceId: randomUUID(),
    sourceKind: 'product',
    sourcePublicationId: randomUUID(),
    sourceRevision: 1,
    unit: 't',
    unitPriceUzs: 4_200_000,
  };
  await database.em.getConnection().execute(
    `insert into marketplace_contracts
      (id, tenant_id, buyer_user_id, buyer_partner_id, seller_tenant_id, seller_user_id,
       seller_partner_id, buyer_party_snapshot, seller_party_snapshot, binding_status,
       subject, amount_uzs, lines, delivery_terms, delivery_price_uzs, factoring_enabled,
       status, created_at, updated_at)
     values (?, ?, ?, ?, ?, ?, ?, ?::jsonb, ?::jsonb, 'resolved',
             'Provider boundary contract', 4200000, ?::jsonb, 'pickup', 0, false,
             'draft', now(), now())`,
    [
      contractId,
      buyer.tenantId,
      buyer.userId,
      buyerPartnerId,
      seller.tenantId,
      seller.userId,
      sellerPartnerId,
      JSON.stringify(partySnapshot(buyer, buyerPartnerId, 'Provider Buyer')),
      JSON.stringify(partySnapshot(seller, sellerPartnerId, 'Provider Seller')),
      JSON.stringify([line]),
    ],
  );
  const reviewRequiredContractId = randomUUID();
  await database.em.getConnection().execute(
    `insert into marketplace_contracts
      (id, tenant_id, buyer_user_id, seller_user_id, binding_status, subject, amount_uzs,
       lines, delivery_terms, delivery_price_uzs, factoring_enabled, status, legacy_status,
       created_at, updated_at)
     values (?, ?, ?, ?, 'review_required', 'Legacy review contract', 1, '[]'::jsonb,
             'pickup', 0, false, 'legacy_review_required', 'draft', now(), now())`,
    [reviewRequiredContractId, buyer.tenantId, buyer.userId, seller.userId],
  );
  return { buyer, contractId, reviewRequiredContractId, seller };
}

async function ensureVerificationFixture(em: EntityManager): Promise<VerificationFixture> {
  const owner = {
    tenantId: `tenant-provider-verification-${randomUUID()}`,
    userId: `provider-verification-${randomUUID()}`,
  };
  const verificationId = randomUUID();
  const caseRevision = 0;
  await em.getConnection().execute(
    `insert into marketplace_verifications
      (id, tenant_id, user_id, role, level, status, one_id_linked, provider_mode,
       identity_assurance, version, case_revision, documents, created_at, updated_at)
     values (?, ?, ?, 'buyer', 'basic', 'none', false, 'none', 'none', 0, ?, '[]'::jsonb, now(), now())`,
    [verificationId, owner.tenantId, owner.userId, caseRevision],
  );
  return { caseRevision, owner, verificationId };
}

async function insertParty(
  em: EntityManager,
  actor: AgriTechOwner,
  partnerId: string,
  kind: 'buyer' | 'supplier',
): Promise<void> {
  await em.getConnection().execute(
    `insert into agritech_partners
      (id, tenant_id, owner_user_id, kind, legal_name, tax_id, phone, region, status, created_at, updated_at)
     values (?, ?, ?, ?, ?, ?, '+998900000000', 'Samarkand', 'approved', now(), now())`,
    [partnerId, actor.tenantId, actor.userId, kind, `Provider ${kind}`, partnerId.replaceAll('-', '').slice(0, 20)],
  );
  await em.getConnection().execute(
    `insert into marketplace_verifications
      (id, tenant_id, user_id, role, level, status, one_id_linked, provider_mode,
       identity_assurance, documents, created_at, updated_at)
     values (?, ?, ?, ?, 'verified', 'verified', true, 'legacy', 'legacy_unknown',
             '[]'::jsonb, now(), now())`,
    [randomUUID(), actor.tenantId, actor.userId, kind === 'buyer' ? 'buyer' : 'seller'],
  );
}

function partySnapshot(actor: AgriTechOwner, partnerId: string, legalName: string) {
  return { legalName, partnerId, region: 'Samarkand', tenantId: actor.tenantId, userId: actor.userId };
}

async function insertPromotionFixture(em: EntityManager): Promise<{ actor: AgriTechOwner; id: string }> {
  const actor = { tenantId: 'tenant-provider-promotion', userId: 'provider-promoter' };
  const partnerId = randomUUID();
  await insertParty(em, actor, partnerId, 'supplier');
  const productId = randomUUID();
  await em.getConnection().execute(
    `insert into products
      (id, tenant_id, name, name_ru, name_uz, name_uz_cyrl, category, description,
       supplier_id, supplier_name, price_uzs, unit, stock_quantity, region, status, images,
       created_at, updated_at)
     values (?, ?, 'Provider promotion seed', null, null, null, 'seed', 'Certified source',
             ?, 'Provider supplier', 500000, 'kg', 100, 'Samarkand', 'active', '[]'::jsonb, now(), now())`,
    [productId, actor.tenantId, partnerId],
  );
  const sellerPublicId = randomUUID();
  const sellerRevisionId = randomUUID();
  await em.getConnection().execute(
    `insert into marketplace_public_sellers
      (id, tenant_id, partner_id, partner_kind, owner_user_id, content_revision, status, created_at, updated_at)
     values (?, ?, ?, 'supplier', ?, 1, 'published', now(), now())`,
    [sellerPublicId, actor.tenantId, partnerId, actor.userId],
  );
  await em.getConnection().execute(
    `insert into marketplace_public_seller_revisions
      (id, seller_public_id, tenant_id, content_revision, content_fingerprint, display_name,
       region, moderation_status, moderated_by, moderated_at, created_at, updated_at)
     values (?, ?, ?, 1, repeat('a', 64), 'Provider supplier', 'Samarkand',
             'approved', 'provider-reviewer', now(), now(), now())`,
    [sellerRevisionId, sellerPublicId, actor.tenantId],
  );
  const listingPublicationId = randomUUID();
  await em.getConnection().execute(
    `insert into marketplace_listing_publications
      (id, tenant_id, owner_user_id, seller_public_id, seller_revision_id, seller_content_revision,
       product_id, source_kind, section, public_title, public_category, public_unit, public_region,
       public_images, content_fingerprint, content_revision, status, moderation_status,
       moderated_by, moderated_at, idempotency_key, request_fingerprint, revision,
       published_at, created_at, updated_at)
     values (?, ?, ?, ?, ?, 1, ?, 'product', 'seeds', 'Provider promotion seed', 'seed',
             'kg', 'Samarkand', '[]'::jsonb, repeat('b', 64), 1, 'published', 'approved',
             'provider-reviewer', now(), 'provider-listing-key-0001', repeat('c', 64), 0,
             now(), now(), now())`,
    [listingPublicationId, actor.tenantId, actor.userId, sellerPublicId, sellerRevisionId, productId],
  );
  const id = randomUUID();
  await em.getConnection().execute(
    `insert into marketplace_listing_promotions
      (id, tenant_id, actor_user_id, seller_partner_id, seller_public_id, listing_publication_id,
       plan_code, status, starts_at, ends_at, price_uzs, currency, idempotency_key,
       request_fingerprint, activation_reference, activated_at, revision, created_at, updated_at)
     values (?, ?, ?, ?, ?, ?, 'catalog_7d', 'active',
             now() - interval '7 days' + interval '100 milliseconds',
             now() + interval '100 milliseconds', 150000, 'UZS', 'provider-promotion-key-0001', repeat('d', 64),
             ?, now() - interval '7 days' + interval '100 milliseconds', 0,
             now() - interval '7 days' + interval '100 milliseconds',
             now() - interval '7 days' + interval '100 milliseconds')`,
    [id, actor.tenantId, actor.userId, partnerId, sellerPublicId, listingPublicationId, `promotion:${id}`],
  );
  return { actor, id };
}

async function rows<T>(em: EntityManager, sql: string, parameters: unknown[] = []): Promise<T[]> {
  return (await em.getConnection().execute(sql, parameters)) as T[];
}
