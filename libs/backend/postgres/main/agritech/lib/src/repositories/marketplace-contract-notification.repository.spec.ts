// @requirements REQ-AGRITECH-INTEGRATION-013 REQ-AGRITECH-NOTIFICATION-022
import { LockMode } from '@mikro-orm/core';
import type { EntityManager } from '@mikro-orm/postgresql';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  marketplaceNotificationClaimLeaseMs,
  marketplaceNotificationUnclaimedClaimId,
} from '@app/backend-feature-agritech-shared';
import { MarketplaceContractNotificationIntentEntity } from '../entities/marketplace-contract-lifecycle.entity';
import { PostgresMarketplaceContractNotificationRepository } from './marketplace-contract-notification.repository';

function intent(): MarketplaceContractNotificationIntentEntity {
  const value = new MarketplaceContractNotificationIntentEntity();
  value.id = '11111111-1111-4111-8111-111111111111';
  value.contractId = '22222222-2222-4222-8222-222222222222';
  value.timelineEventId = '33333333-3333-4333-8333-333333333333';
  value.recipientParty = 'buyer';
  value.templateKey = 'marketplace.contract.contract.completed';
  value.createdAt = new Date('2030-01-01T00:00:00.000Z');
  value.nextAttemptAt = new Date('2030-01-01T00:00:00.000Z');
  value.updatedAt = value.createdAt;
  return value;
}

function fakeEntityManager(row: MarketplaceContractNotificationIntentEntity) {
  const execute = vi.fn().mockResolvedValue([]);
  const find = vi.fn(async (_entity, criteria, options) => {
    if ('claimToken' in criteria) {
      return row.status === 'pending' &&
        row.attempts > 0 &&
        row.claimToken !== marketplaceNotificationUnclaimedClaimId &&
        row.claimedAt <= criteria.claimedAt.$lte
        ? [row]
        : [];
    }
    const due = criteria.nextAttemptAt.$lte as Date;
    const claimable = criteria.claimedAt.$lte as Date;
    if (
      row.status !== criteria.status ||
      row.attempts >= criteria.attempts.$lt ||
      row.nextAttemptAt > due ||
      row.claimedAt > claimable
    ) {
      return [];
    }
    return [row];
  });
  const findOne = vi.fn(async (_entity, criteria) => {
    if (row.id !== criteria.id || row.status !== criteria.status || row.claimToken !== criteria.claimToken) {
      return null;
    }
    if (criteria.claimedAt?.$gt && row.claimedAt <= criteria.claimedAt.$gt) {
      return null;
    }
    return row;
  });
  const em = {
    find,
    findOne,
    flush: vi.fn().mockResolvedValue(undefined),
    getConnection: () => ({ execute }),
    transactional: async (work: (nested: unknown) => unknown) => work(em),
  };
  return { em: em as unknown as EntityManager, execute, find, findOne };
}

describe('PostgresMarketplaceContractNotificationRepository', () => {
  let row: MarketplaceContractNotificationIntentEntity;

  beforeEach(() => {
    row = intent();
  });

  it('claims due work under SKIP LOCKED, fences stale tokens, and reclaims only after lease expiry', async () => {
    const fake = fakeEntityManager(row);
    const repository = new PostgresMarketplaceContractNotificationRepository(fake.em);
    const now = new Date('2030-01-02T00:00:00.000Z');

    const first = await repository.claimPending(10, now);
    const blocked = await repository.claimPending(10, now);
    const reclaimed = await repository.claimPending(
      10,
      new Date(now.getTime() + marketplaceNotificationClaimLeaseMs + 1),
    );

    expect(first).toHaveLength(1);
    expect(blocked).toEqual([]);
    expect(reclaimed).toHaveLength(1);
    expect(reclaimed[0]?.claimToken).not.toBe(first[0]?.claimToken);
    expect(fake.find.mock.calls[1]?.[2]).toMatchObject({ lockMode: LockMode.PESSIMISTIC_PARTIAL_WRITE });
    await expect(
      repository.beginAttempt(
        row.id,
        first[0]?.claimToken ?? '',
        { mode: 'mock', name: 'mock-notification-delivery' },
        now,
      ),
    ).resolves.toBe(false);
    await expect(
      repository.beginAttempt(
        row.id,
        reclaimed[0]?.claimToken ?? '',
        { mode: 'mock', name: 'mock-notification-delivery' },
        now,
      ),
    ).resolves.toBe(true);
    expect(row).toMatchObject({ attempts: 1, channelAttempts: 1, providerMode: 'mock', simulation: true });
  });

  it('quarantines an expired started attempt before it can be re-claimed or sent again', async () => {
    const fake = fakeEntityManager(row);
    const repository = new PostgresMarketplaceContractNotificationRepository(fake.em);
    const startedAt = new Date('2030-01-02T00:00:00.000Z');
    row.claimToken = 'test-claim-expired';
    row.claimedAt = startedAt;
    row.providerMode = 'mock';
    row.providerName = 'mock-notification-delivery';
    row.simulation = true;
    row.attempts = 1;
    row.channelAttempts = 1;
    row.lastAttemptAt = startedAt;

    await expect(
      repository.claimPending(10, new Date(startedAt.getTime() + marketplaceNotificationClaimLeaseMs + 1)),
    ).resolves.toEqual([]);
    expect(row).toMatchObject({
      claimToken: marketplaceNotificationUnclaimedClaimId,
      lastErrorCode: 'delivery_outcome_unknown_after_lease',
      status: 'reconciliation_required',
    });
  });

  it('releases a failed claim for exponential retry and terminally fails at the attempt bound', async () => {
    const fake = fakeEntityManager(row);
    const repository = new PostgresMarketplaceContractNotificationRepository(fake.em);
    const now = new Date('2030-01-02T00:00:00.000Z');
    row.claimToken = 'test-claim-retry';
    row.claimedAt = now;
    row.providerMode = 'mock';
    row.providerName = 'mock-notification-delivery';
    row.simulation = true;
    row.attempts = 1;
    row.channelAttempts = 1;

    await expect(repository.recordFailure(row.id, row.claimToken, 'provider_unavailable', true, now)).resolves.toBe(
      true,
    );
    expect(row).toMatchObject({
      claimToken: marketplaceNotificationUnclaimedClaimId,
      lastErrorCode: 'provider_unavailable',
      status: 'pending',
    });
    expect(row.nextAttemptAt.getTime()).toBe(now.getTime() + 30_000);

    row.claimToken = 'test-claim-terminal';
    row.claimedAt = now;
    row.attempts = 5;
    row.channelAttempts = 5;
    await expect(repository.recordFailure(row.id, row.claimToken, 'provider_unavailable', true, now)).resolves.toBe(
      true,
    );
    expect(row.status).toBe('failed');
    expect(row.claimToken).toBe(marketplaceNotificationUnclaimedClaimId);
  });

  it('falls back a critical notification from Telegram to SMS only after a definite terminal failure', async () => {
    const fake = fakeEntityManager(row);
    const repository = new PostgresMarketplaceContractNotificationRepository(fake.em);
    const now = new Date('2030-01-02T00:00:00.000Z');
    row.templateKey = 'marketplace.contract.dispute.opened';
    row.claimToken = 'test-claim-telegram';
    row.claimedAt = now;
    row.providerMode = 'mock';
    row.providerName = 'mock-notification-delivery';
    row.simulation = true;
    row.attempts = 1;
    row.channelAttempts = 1;

    await expect(repository.recordFailure(row.id, row.claimToken, 'provider_rejected', false, now)).resolves.toBe(true);
    expect(row).toMatchObject({
      attempts: 1,
      channel: 'sms',
      channelAttempts: 0,
      claimToken: marketplaceNotificationUnclaimedClaimId,
      lastErrorCode: 'telegram:provider_rejected:sms_fallback',
      status: 'pending',
    });

    const fallbackClaim = (await repository.claimPending(1, now))[0];
    expect(fallbackClaim).toMatchObject({ channel: 'sms', channelAttempts: 0, recipientLocale: 'en' });
    await expect(
      repository.beginAttempt(
        row.id,
        fallbackClaim?.claimToken ?? '',
        { mode: 'mock', name: 'mock-notification-delivery' },
        now,
      ),
    ).resolves.toBe(true);
    expect(row).toMatchObject({ attempts: 2, channel: 'sms', channelAttempts: 1 });
  });

  it('persists explicit simulation success and quarantines provider provenance mismatch for reconciliation', async () => {
    const fake = fakeEntityManager(row);
    const repository = new PostgresMarketplaceContractNotificationRepository(fake.em);
    const completedAt = new Date('2030-01-02T00:00:00.000Z');
    row.claimToken = 'test-claim-simulated';
    row.claimedAt = completedAt;
    row.providerMode = 'mock';
    row.providerName = 'mock-notification-delivery';
    row.simulation = true;
    row.attempts = 1;

    await expect(
      repository.completeAttempt(row.id, row.claimToken, {
        completedAt,
        providerMode: 'mock',
        providerName: 'mock-notification-delivery',
        providerReference: 'mock-notification:opaque',
        safeReceipt: { simulation: true },
        simulation: true,
      }),
    ).resolves.toBe(true);
    expect(row).toMatchObject({
      claimToken: marketplaceNotificationUnclaimedClaimId,
      dispatchedAt: completedAt,
      providerReference: 'mock-notification:opaque',
      simulation: true,
      status: 'simulated',
    });

    row = intent();
    const mismatchFake = fakeEntityManager(row);
    const mismatchRepository = new PostgresMarketplaceContractNotificationRepository(mismatchFake.em);
    row.claimToken = 'test-claim-mismatch';
    row.claimedAt = completedAt;
    row.providerMode = 'mock';
    row.providerName = 'mock-notification-delivery';
    row.simulation = true;
    row.attempts = 1;
    await expect(
      mismatchRepository.completeAttempt(row.id, row.claimToken, {
        completedAt,
        providerMode: 'live',
        providerName: 'unexpected-live-provider',
        providerReference: 'provider:opaque',
        safeReceipt: {},
        simulation: false,
      }),
    ).resolves.toBe(false);
    expect(row).toMatchObject({
      lastErrorCode: 'provider_provenance_mismatch',
      status: 'reconciliation_required',
    });
  });

  it('rejects secret-shaped safe receipts again at the persistence boundary', async () => {
    const fake = fakeEntityManager(row);
    const repository = new PostgresMarketplaceContractNotificationRepository(fake.em);
    const completedAt = new Date('2030-01-02T00:00:00.000Z');
    row.claimToken = 'test-unsafe-claim';
    row.claimedAt = completedAt;
    row.providerMode = 'mock';
    row.providerName = 'mock-notification-delivery';
    row.simulation = true;
    row.attempts = 1;

    await expect(
      repository.completeAttempt(row.id, row.claimToken, {
        completedAt,
        providerMode: 'mock',
        providerName: 'mock-notification-delivery',
        providerReference: 'mock-notification:opaque',
        safeReceipt: { accessToken: 'must-not-persist' },
        simulation: true,
      }),
    ).resolves.toBe(false);
    expect(row).toMatchObject({ lastErrorCode: 'provider_result_unsafe', status: 'reconciliation_required' });
    expect(row.safeReceipt).toBeNull();
  });

  it('queries recipient rows only through active exact-party membership and scopes admin rows to target tenant', async () => {
    const fake = fakeEntityManager(row);
    const repository = new PostgresMarketplaceContractNotificationRepository(fake.em);

    await repository.listForRecipient({ tenantId: 'tenant-a', userId: 'user-a' });
    await repository.listForAdmin('tenant-a');

    const recipientSql = String(fake.execute.mock.calls[0]?.[0]);
    const adminSql = String(fake.execute.mock.calls[1]?.[0]);
    expect(recipientSql).toContain('"marketplace_partner_memberships" membership');
    expect(recipientSql).toContain('membership."status" = \'active\'');
    expect(recipientSql).toContain('membership."capability" = \'buyer\'');
    expect(recipientSql).toContain('membership."capability" = \'seller\'');
    expect(adminSql).toContain('intent."recipient_party" = \'buyer\' and contract."tenant_id" = ?');
    expect(adminSql).toContain('intent."recipient_party" = \'seller\' and contract."seller_tenant_id" = ?');
  });
});
