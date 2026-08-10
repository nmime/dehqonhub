// @requirements REQ-AGRITECH-INTEGRATION-013 REQ-AGRITECH-STAGE2-017 REQ-AGRITECH-NOTIFICATION-022
import { randomUUID } from 'node:crypto';
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
import { marketplaceNotificationClaimLeaseMs } from '@app/backend-feature-agritech-shared';
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
import { PostgresMarketplaceContractNotificationRepository } from './marketplace-contract-notification.repository';

describe('marketplace contract notification PostgreSQL delivery boundary', { sequential: true }, () => {
  let container: StartedPostgreSqlContainer | undefined;
  let orm: MikroORM<PostgreSqlDriver> | undefined;
  const buyer = { tenantId: 'tenant-notification-buyer', userId: 'buyer-notification-user' };
  const seller = { tenantId: 'tenant-notification-seller', userId: 'seller-notification-user' };
  const atomicBuyer = { tenantId: 'tenant-atomic-buyer', userId: 'buyer-atomic-user' };
  const atomicSeller = { tenantId: 'tenant-atomic-seller', userId: 'seller-atomic-user' };
  const buyerPartnerId = randomUUID();
  const sellerPartnerId = randomUUID();
  const atomicBuyerPartnerId = randomUUID();
  const atomicSellerPartnerId = randomUUID();
  const contractId = randomUUID();
  const atomicContractId = randomUUID();
  const timelineEventId = randomUUID();

  beforeAll(async () => {
    if (!hasDockerRuntime()) {
      throw new Error('Marketplace notification PostgreSQL evidence requires Docker; skipping is forbidden.');
    }
    container = await startPostgresContainer();
    orm = await MikroORM.init<PostgreSqlDriver>(
      createPostgresContainerMikroOrmOptions(container, notificationEntities, {
        extensions: [Migrator],
        migrations: agritechMigrationOptions,
      }),
    );
    await orm.migrator.up();
    await seedRecipientLocales(requireOrm(orm).em, buyer, seller);
    await seedLifecycleIntent(requireOrm(orm).em);
    await insertParty(requireOrm(orm).em, atomicBuyerPartnerId, atomicBuyer, 'buyer');
    await insertParty(requireOrm(orm).em, atomicSellerPartnerId, atomicSeller, 'supplier');
    await insertVerification(requireOrm(orm).em, atomicBuyer, 'buyer');
    await insertVerification(requireOrm(orm).em, atomicSeller, 'seller');
    await seedAtomicLifecycleContract(requireOrm(orm).em, {
      buyer: atomicBuyer,
      buyerPartnerId: atomicBuyerPartnerId,
      contractId: atomicContractId,
      seller: atomicSeller,
      sellerPartnerId: atomicSellerPartnerId,
    });
  }, 120_000);

  afterAll(async () => {
    await orm?.close(true);
    await stopPostgresContainer(container);
  });

  it('applies the additive delivery migration down and up before delivery traffic', async () => {
    const database = requireOrm(orm);
    const migration = 'Migration20260810136000AddContractNotificationDelivery';
    await database.migrator.down({ migrations: [migration] });
    expect(
      await rows<{ columnName: string }>(
        database.em,
        `select column_name as "columnName" from information_schema.columns
          where table_schema = 'public' and table_name = 'marketplace_contract_notification_intents'
            and column_name = 'claim_token'`,
      ),
    ).toEqual([]);

    await database.migrator.up({ migrations: [migration] });
    expect(
      await rows<{ columnName: string }>(
        database.em,
        `select column_name as "columnName" from information_schema.columns
          where table_schema = 'public' and table_name = 'marketplace_contract_notification_intents'
            and column_name in ('claim_token', 'provider_mode', 'recipient_locale', 'simulation') order by column_name`,
      ),
    ).toEqual([
      { columnName: 'claim_token' },
      { columnName: 'provider_mode' },
      { columnName: 'recipient_locale' },
      { columnName: 'simulation' },
    ]);
  });

  it('claims each intent once across replicas and preserves recipient/admin party boundaries', async () => {
    const database = requireOrm(orm);
    const now = new Date('2030-01-02T00:00:00.000Z');
    const repositoryA = new PostgresMarketplaceContractNotificationRepository(database.em.fork());
    const repositoryB = new PostgresMarketplaceContractNotificationRepository(database.em.fork());
    const [claimA, claimB] = await Promise.all([repositoryA.claimPending(2, now), repositoryB.claimPending(2, now)]);
    const claims = [...claimA, ...claimB];

    expect(claims).toHaveLength(2);
    expect(new Set(claims.map((claim) => claim.id)).size).toBe(2);
    expect(Object.fromEntries(claims.map((claim) => [claim.recipientParty, claim.recipientLocale]))).toEqual({
      buyer: 'uz-cyrl',
      seller: 'ru',
    });
    expect(await repositoryA.listForRecipient(buyer)).toHaveLength(1);
    expect(await repositoryA.listForRecipient(seller)).toHaveLength(1);
    expect(await repositoryA.listForRecipient({ ...buyer, userId: 'foreign-user' })).toEqual([]);
    expect((await repositoryA.listForAdmin(buyer.tenantId)).map((intent) => intent.recipientParty)).toEqual(['buyer']);
    expect((await repositoryA.listForAdmin(seller.tenantId)).map((intent) => intent.recipientParty)).toEqual([
      'seller',
    ]);
  });

  it('quarantines a crash-gap attempt after lease expiry without another claim or commerce mutation', async () => {
    const database = requireOrm(orm);
    const repository = new PostgresMarketplaceContractNotificationRepository(database.em.fork());
    const buyerIntent = (await repository.listForRecipient(buyer))[0];
    if (!buyerIntent) {
      throw new Error('Buyer notification intent was not seeded.');
    }
    const before = await authoritativeState(database.em, contractId);
    const claimed = await rows<{ claimToken: string }>(
      database.em,
      `select claim_token as "claimToken" from marketplace_contract_notification_intents where id = ?`,
      [buyerIntent.id],
    );
    const claimToken = claimed[0]?.claimToken;
    if (!claimToken) {
      throw new Error('Buyer intent was not claimed.');
    }
    const startedAt = new Date('2030-01-02T00:00:01.000Z');
    await database.em.getConnection().execute(
      `update marketplace_contract_notification_intents set next_attempt_at = '2040-01-01T00:00:00Z'
        where contract_id = ? and recipient_party = 'seller'`,
      [contractId],
    );
    await expect(
      repository.beginAttempt(
        buyerIntent.id,
        claimToken,
        { mode: 'mock', name: 'mock-notification-delivery' },
        startedAt,
      ),
    ).resolves.toBe(true);

    await expect(
      repository.claimPending(10, new Date(startedAt.getTime() + marketplaceNotificationClaimLeaseMs + 1)),
    ).resolves.toEqual([]);
    expect(
      await rows<{ lastErrorCode: string; status: string }>(
        database.em,
        `select last_error_code as "lastErrorCode", status from marketplace_contract_notification_intents where id = ?`,
        [buyerIntent.id],
      ),
    ).toEqual([{ lastErrorCode: 'delivery_outcome_unknown_after_lease', status: 'reconciliation_required' }]);
    expect(await authoritativeState(database.em, contractId)).toEqual(before);
  });

  it('persists an explicit simulated terminal result and revoked membership immediately removes recipient access', async () => {
    const database = requireOrm(orm);
    const repository = new PostgresMarketplaceContractNotificationRepository(database.em.fork());
    const sellerIntent = (await repository.listForRecipient(seller))[0];
    if (!sellerIntent) {
      throw new Error('Seller notification intent was not seeded.');
    }
    const completedAt = new Date('2030-01-02T00:02:05.000Z');
    await database.em
      .getConnection()
      .execute(`update marketplace_contract_notification_intents set next_attempt_at = ? where id = ?`, [
        completedAt,
        sellerIntent.id,
      ]);
    const sellerClaim = (await repository.claimPending(10, completedAt)).find((claim) => claim.id === sellerIntent.id);
    const claimToken = sellerClaim?.claimToken;
    if (!claimToken) {
      throw new Error('Seller intent was not claimed.');
    }
    await repository.beginAttempt(
      sellerIntent.id,
      claimToken,
      { mode: 'mock', name: 'mock-notification-delivery' },
      completedAt,
    );
    await expect(
      repository.completeAttempt(sellerIntent.id, claimToken, {
        completedAt,
        providerMode: 'mock',
        providerName: 'mock-notification-delivery',
        providerReference: 'mock-notification:opaque-seller',
        safeReceipt: { simulation: true },
        simulation: true,
      }),
    ).resolves.toBe(true);
    expect(await repository.listForRecipient(seller)).toEqual([
      expect.objectContaining({ providerMode: 'mock', simulation: true, status: 'simulated' }),
    ]);

    await database.em.getConnection().execute(
      `update marketplace_partner_memberships
          set status = 'revoked', revision = revision + 1, revoked_at = now(), updated_at = now()
        where tenant_id = ? and user_id = ? and capability = 'seller'`,
      [seller.tenantId, seller.userId],
    );
    await expect(repository.listForRecipient(seller)).resolves.toEqual([]);
  });

  it('persists a deterministic critical-event Telegram to SMS fallback without mutating commerce state', async () => {
    const database = requireOrm(orm);
    const repository = new PostgresMarketplaceContractNotificationRepository(database.em.fork());
    const fallbackEventId = randomUUID();
    await database.em.getConnection().execute(
      `insert into marketplace_contract_lifecycle_events
        (id, contract_id, sequence, category, event_type, actor_party, actor_tenant_id, actor_user_id, provider_mode)
       values (?, ?, 2, 'dispute', 'dispute_opened', 'buyer', ?, ?, 'none')`,
      [fallbackEventId, contractId, buyer.tenantId, buyer.userId],
    );
    await database.em.getConnection().execute(
      `insert into marketplace_contract_notification_intents
        (id, contract_id, timeline_event_id, recipient_party, template_key, created_at)
       values (?, ?, ?, 'buyer', 'marketplace.contract.dispute.opened', now()),
              (?, ?, ?, 'seller', 'marketplace.contract.dispute.opened', now())`,
      [randomUUID(), contractId, fallbackEventId, randomUUID(), contractId, fallbackEventId],
    );
    const before = await authoritativeState(database.em, contractId);
    const startedAt = new Date('2031-01-01T00:00:00.000Z');
    const telegramClaim = (await repository.claimPending(10, startedAt)).find(
      (candidate) =>
        candidate.recipientParty === 'buyer' && candidate.templateKey === 'marketplace.contract.dispute.opened',
    );
    if (!telegramClaim) {
      throw new Error('Critical Telegram claim was not created.');
    }
    await expect(
      repository.beginAttempt(
        telegramClaim.id,
        telegramClaim.claimToken,
        { mode: 'mock', name: 'mock-notification-delivery' },
        startedAt,
      ),
    ).resolves.toBe(true);
    await expect(
      repository.recordFailure(telegramClaim.id, telegramClaim.claimToken, 'provider_rejected', false, startedAt),
    ).resolves.toBe(true);

    const fallbackClaim = (await repository.claimPending(10, startedAt)).find(
      (candidate) => candidate.id === telegramClaim.id,
    );
    expect(fallbackClaim).toMatchObject({ attempts: 1, channel: 'sms', channelAttempts: 0 });
    expect(await authoritativeState(database.em, contractId)).toEqual(before);
  });

  it('commits lifecycle events and both intents atomically and rolls all three back on intent failure', async () => {
    const database = requireOrm(orm);
    const lifecycle = new PostgresMarketplaceContractLifecycleRepository(database.em.fork());
    await expect(
      lifecycle.transitionFulfillment(
        atomicSeller,
        atomicContractId,
        'start',
        'notification-atomic-start',
        'a'.repeat(64),
      ),
    ).resolves.toMatchObject({ status: 'ok' });

    const committed = await notificationAtomicState(database.em, atomicContractId);
    expect(committed).toEqual([{ eventCount: 1, fulfillmentStatus: 'in_progress', intentCount: 2 }]);

    await database.em.getConnection().execute(`
      create function "test_fail_second_contract_notification_intent"() returns trigger as $$
      begin
        if new."recipient_party" = 'seller' then
          raise exception 'forced notification intent failure';
        end if;
        return new;
      end;
      $$ language plpgsql;
      create trigger "test_fail_second_contract_notification_intent"
        before insert on "marketplace_contract_notification_intents"
        for each row execute function "test_fail_second_contract_notification_intent"();
    `);
    try {
      await expect(
        lifecycle.transitionFulfillment(
          atomicSeller,
          atomicContractId,
          'mark_delivered',
          'notification-atomic-delivered',
          'b'.repeat(64),
        ),
      ).rejects.toThrow('forced notification intent failure');
    } finally {
      await database.em.getConnection().execute(`
        drop trigger "test_fail_second_contract_notification_intent"
          on "marketplace_contract_notification_intents";
        drop function "test_fail_second_contract_notification_intent"();
      `);
    }

    expect(await notificationAtomicState(database.em, atomicContractId)).toEqual(committed);
  });

  async function seedLifecycleIntent(em: EntityManager): Promise<void> {
    await insertParty(em, buyerPartnerId, buyer, 'buyer');
    await insertParty(em, sellerPartnerId, seller, 'supplier');
    await insertVerification(em, buyer, 'buyer');
    await insertVerification(em, seller, 'seller');
    const lines = JSON.stringify([
      {
        lineTotalUzs: 10_000,
        name: 'Corn seed',
        quantity: 10,
        sourceId: randomUUID(),
        sourceKind: 'product',
        sourcePublicationId: randomUUID(),
        sourceRevision: 1,
        unit: 'kg',
        unitPriceUzs: 1_000,
      },
    ]);
    const buyerSnapshot = JSON.stringify({
      legalName: 'Buyer organization',
      partnerId: buyerPartnerId,
      region: 'Samarkand',
      tenantId: buyer.tenantId,
      userId: buyer.userId,
    });
    const sellerSnapshot = JSON.stringify({
      legalName: 'Seller organization',
      partnerId: sellerPartnerId,
      region: 'Samarkand',
      tenantId: seller.tenantId,
      userId: seller.userId,
    });
    await em.getConnection().execute(
      `insert into marketplace_contracts
        (id, tenant_id, buyer_user_id, buyer_partner_id, seller_tenant_id, seller_user_id, seller_partner_id,
         buyer_party_snapshot, seller_party_snapshot, binding_status, subject, amount_uzs, lines,
         delivery_terms, delivery_price_uzs, factoring_enabled, status, created_at, updated_at)
       values (?, ?, ?, ?, ?, ?, ?, ?::jsonb, ?::jsonb, 'resolved', 'Notification contract', 10000,
               ?::jsonb, 'pickup', 0, false, 'draft', now(), now())`,
      [
        contractId,
        buyer.tenantId,
        buyer.userId,
        buyerPartnerId,
        seller.tenantId,
        seller.userId,
        sellerPartnerId,
        buyerSnapshot,
        sellerSnapshot,
        lines,
      ],
    );
    await em.getConnection().execute(
      `insert into marketplace_contract_lifecycle_events
        (id, contract_id, sequence, category, event_type, actor_party, actor_tenant_id, actor_user_id, provider_mode)
       values (?, ?, 1, 'completion', 'contract_completed', 'buyer', ?, ?, 'none')`,
      [timelineEventId, contractId, buyer.tenantId, buyer.userId],
    );
    await em.getConnection().execute(
      `insert into marketplace_contract_notification_intents
        (id, contract_id, timeline_event_id, recipient_party, template_key, created_at)
       values (?, ?, ?, 'buyer', 'marketplace.contract.contract.completed', now()),
              (?, ?, ?, 'seller', 'marketplace.contract.contract.completed', now())`,
      [randomUUID(), contractId, timelineEventId, randomUUID(), contractId, timelineEventId],
    );
  }
});

const notificationEntities = [
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

async function seedRecipientLocales(
  em: EntityManager,
  buyer: { tenantId: string; userId: string },
  seller: { tenantId: string; userId: string },
): Promise<void> {
  await em.getConnection().execute(`
    create table "auth_users" (
      "id" varchar(100) primary key,
      "tenant_id" varchar(100) not null,
      "status" varchar(32) not null,
      "locale" varchar(16) not null
    )
  `);
  await em.getConnection().execute(
    `insert into "auth_users" ("id", "tenant_id", "status", "locale")
     values (?, ?, 'active', 'uz-cyrl'), (?, ?, 'active', 'ru')`,
    [buyer.userId, buyer.tenantId, seller.userId, seller.tenantId],
  );
}

async function insertParty(
  em: EntityManager,
  id: string,
  owner: { tenantId: string; userId: string },
  kind: 'buyer' | 'supplier',
): Promise<void> {
  await em.getConnection().execute(
    `insert into agritech_partners
      (id, tenant_id, owner_user_id, kind, legal_name, tax_id, phone, region, status, created_at, updated_at)
     values (?, ?, ?, ?, 'Notification organization', ?, '+998900000000', 'Samarkand', 'approved', now(), now())`,
    [id, owner.tenantId, owner.userId, kind, id.replaceAll('-', '').slice(0, 20)],
  );
}

async function seedAtomicLifecycleContract(
  em: EntityManager,
  input: {
    buyer: { tenantId: string; userId: string };
    buyerPartnerId: string;
    contractId: string;
    seller: { tenantId: string; userId: string };
    sellerPartnerId: string;
  },
): Promise<void> {
  const sourceId = randomUUID();
  const lines = JSON.stringify([
    {
      lineTotalUzs: 10_000,
      name: 'Atomic corn seed',
      quantity: 10,
      sourceId,
      sourceKind: 'product',
      sourcePublicationId: randomUUID(),
      sourceRevision: 1,
      unit: 'kg',
      unitPriceUzs: 1_000,
    },
  ]);
  const buyerSnapshot = JSON.stringify({
    legalName: 'Buyer organization',
    partnerId: input.buyerPartnerId,
    region: 'Samarkand',
    tenantId: input.buyer.tenantId,
    userId: input.buyer.userId,
  });
  const sellerSnapshot = JSON.stringify({
    legalName: 'Seller organization',
    partnerId: input.sellerPartnerId,
    region: 'Samarkand',
    tenantId: input.seller.tenantId,
    userId: input.seller.userId,
  });
  await em.getConnection().execute(
    `insert into marketplace_contracts
      (id, tenant_id, buyer_user_id, buyer_partner_id, seller_tenant_id, seller_user_id, seller_partner_id,
       buyer_party_snapshot, seller_party_snapshot, binding_status, subject, amount_uzs, lines,
       delivery_terms, delivery_price_uzs, factoring_enabled, status, buyer_signed_at, seller_signed_at,
       signed_at, created_at, updated_at)
     values (?, ?, ?, ?, ?, ?, ?, ?::jsonb, ?::jsonb, 'resolved', 'Atomic notification contract', 10000,
             ?::jsonb, 'pickup', 0, false, 'active', now(), now(), now(), now(), now())`,
    [
      input.contractId,
      input.buyer.tenantId,
      input.buyer.userId,
      input.buyerPartnerId,
      input.seller.tenantId,
      input.seller.userId,
      input.sellerPartnerId,
      buyerSnapshot,
      sellerSnapshot,
      lines,
    ],
  );
  await em.getConnection().execute(
    `insert into marketplace_contract_settlements
      (id, contract_id, kind, status, amount_uzs, currency, selected_by_tenant_id, selected_by_user_id,
       selection_idempotency_key, selection_request_fingerprint, latest_provider_mode,
       reconciliation_state, revision, created_at, updated_at)
     values (?, ?, 'direct_payment', 'awaiting_buyer_confirmation', 10000, 'UZS', ?, ?,
             'notification-atomic-settlement', ?, 'none', 'clear', 0, now(), now())`,
    [randomUUID(), input.contractId, input.buyer.tenantId, input.buyer.userId, 'c'.repeat(64)],
  );
  await em.getConnection().execute(
    `update marketplace_contract_settlements
        set status = 'buyer_confirmed', revision = 1, updated_at = now()
      where contract_id = ?`,
    [input.contractId],
  );
  await em.getConnection().execute(
    `update marketplace_contract_settlements
        set status = 'seller_received', revision = 2, updated_at = now()
      where contract_id = ?`,
    [input.contractId],
  );
  await em.getConnection().execute(
    `insert into marketplace_contract_fulfillments
      (id, contract_id, status, revision, created_at, updated_at)
     values (?, ?, 'awaiting_settlement', 0, now(), now())`,
    [randomUUID(), input.contractId],
  );
  await em.getConnection().execute(
    `update marketplace_contract_fulfillments
        set status = 'ready', revision = 1, updated_at = now()
      where contract_id = ?`,
    [input.contractId],
  );
}

async function insertVerification(
  em: EntityManager,
  owner: { tenantId: string; userId: string },
  role: 'buyer' | 'seller',
): Promise<void> {
  await em.getConnection().execute(
    `insert into marketplace_verifications
      (id, tenant_id, user_id, role, level, status, one_id_linked, provider_mode,
       identity_assurance, documents, created_at, updated_at)
     values (?, ?, ?, ?, 'verified', 'verified', true, 'legacy', 'legacy_unknown', '[]'::jsonb, now(), now())`,
    [randomUUID(), owner.tenantId, owner.userId, role],
  );
}

async function authoritativeState(em: EntityManager, targetContractId: string) {
  return rows<{ contractStatus: string; eventCount: number }>(
    em,
    `select contract.status as "contractStatus",
            (select count(*)::int from marketplace_contract_lifecycle_events event where event.contract_id = contract.id) as "eventCount"
       from marketplace_contracts contract where contract.id = ?`,
    [targetContractId],
  );
}

async function notificationAtomicState(em: EntityManager, targetContractId: string) {
  return rows<{ eventCount: number; fulfillmentStatus: string; intentCount: number }>(
    em,
    `select fulfillment.status as "fulfillmentStatus",
            (select count(*)::int from marketplace_contract_lifecycle_events event
              where event.contract_id = fulfillment.contract_id) as "eventCount",
            (select count(*)::int from marketplace_contract_notification_intents intent
              where intent.contract_id = fulfillment.contract_id) as "intentCount"
       from marketplace_contract_fulfillments fulfillment where fulfillment.contract_id = ?`,
    [targetContractId],
  );
}

function requireOrm(value: MikroORM<PostgreSqlDriver> | undefined): MikroORM<PostgreSqlDriver> {
  if (!value) {
    throw new Error('PostgreSQL component fixture is not initialized.');
  }
  return value;
}

async function rows<T>(em: EntityManager, sql: string, parameters: unknown[] = []): Promise<T[]> {
  return (await em.getConnection().execute(sql, parameters)) as T[];
}
