// @requirements REQ-AGRITECH-INTEGRATION-013 REQ-AGRITECH-NOTIFICATION-022
import { describe, expect, it, vi } from 'vitest';
import type {
  MarketplaceContractNotificationClaim,
  MarketplaceContractNotificationProvider,
  MarketplaceContractNotificationRepository,
} from '@app/backend-feature-agritech-shared';
import { resolveMarketplaceProviderConfig } from './marketplace-provider.config';
import {
  createMarketplaceContractNotificationProvider,
  MarketplaceContractNotificationDispatcher,
  MarketplaceContractNotificationProviderError,
  validateMarketplaceContractNotificationProviderResult,
} from './marketplace-contract-notification.delivery';
import {
  MarketplaceContractNotificationQueryService,
  renderMarketplaceContractNotification,
} from './marketplace-contract-notification.service';

const claim: MarketplaceContractNotificationClaim = {
  attempts: 0,
  channel: 'telegram',
  channelAttempts: 0,
  claimToken: 'test-claim-dispatch',
  contractId: '22222222-2222-4222-8222-222222222222',
  createdAt: new Date('2030-01-01T00:00:00.000Z'),
  id: '33333333-3333-4333-8333-333333333333',
  nextAttemptAt: new Date('2030-01-01T00:00:00.000Z'),
  providerMode: 'none',
  recipientLocale: 'uz-cyrl',
  recipientParty: 'buyer',
  simulation: false,
  status: 'pending',
  templateKey: 'marketplace.contract.contract.completed',
  timelineEventId: '44444444-4444-4444-8444-444444444444',
  updatedAt: new Date('2030-01-01T00:00:00.000Z'),
};

function repository(): MarketplaceContractNotificationRepository {
  return {
    beginAttempt: vi.fn().mockResolvedValue(true),
    claimPending: vi.fn().mockResolvedValue([claim]),
    completeAttempt: vi.fn().mockResolvedValue(true),
    listForAdmin: vi.fn().mockResolvedValue([]),
    listForRecipient: vi.fn().mockResolvedValue([]),
    recordFailure: vi.fn().mockResolvedValue(true),
    recordReconciliation: vi.fn().mockResolvedValue(true),
  };
}

describe('marketplace contract lifecycle notification delivery', () => {
  it.each([
    ['en', 'Contract completed'],
    ['ru', 'Договор завершён'],
    ['uz', 'Shartnoma yakunlandi'],
    ['uz-cyrl', 'Шартнома якунланди'],
  ] as const)('renders the approved template safely in %s', (locale, message) => {
    expect(renderMarketplaceContractNotification('marketplace.contract.contract.completed', locale)).toEqual({
      locale,
      message,
    });
  });

  it('uses localized generic copy without echoing an untrusted template key', () => {
    const value = renderMarketplaceContractNotification('marketplace.contract.<script>alert(1)</script>', 'ru');
    expect(value.message).toBe('Статус договора обновлён');
    expect(value.message).not.toContain('script');
  });

  it('keeps recipient DTOs safe while retaining provider diagnostics only for tenant administrators', async () => {
    const persistence = repository();
    const { claimToken, ...intentView } = claim;
    expect(claimToken).toBe('test-claim-dispatch');
    const internal = {
      ...intentView,
      lastAttemptAt: new Date('2030-01-01T00:01:00.000Z'),
      lastErrorCode: 'provider_unavailable',
      providerMode: 'mock' as const,
      providerName: 'mock-notification-delivery',
      simulation: true,
    };
    vi.mocked(persistence.listForRecipient).mockResolvedValue([internal]);
    vi.mocked(persistence.listForAdmin).mockResolvedValue([internal]);
    const query = new MarketplaceContractNotificationQueryService(persistence);

    const [recipient] = await query.listForRecipient({ tenantId: 'tenant-a', userId: 'user-a' }, 'uz-cyrl');
    const [admin] = await query.listForAdmin('tenant-a', 'uz-cyrl');

    expect(recipient).toMatchObject({
      attemptedAt: internal.lastAttemptAt,
      contractPath: `/marketplace/contracts/${claim.contractId}`,
      deliveryChannel: 'telegram',
      event: 'contract.completed',
      locale: 'uz-cyrl',
      simulation: true,
      surface: 'in-app',
    });
    expect(recipient).not.toHaveProperty('timelineEventId');
    expect(recipient).not.toHaveProperty('templateKey');
    expect(recipient).not.toHaveProperty('providerName');
    expect(recipient).not.toHaveProperty('lastErrorCode');
    expect(admin).toMatchObject({
      lastErrorCode: 'provider_unavailable',
      providerName: 'mock-notification-delivery',
      templateKey: claim.templateKey,
      timelineEventId: claim.timelineEventId,
    });
  });

  it('makes mock delivery explicit, deterministic, idempotent, and simulation-only', async () => {
    const config = resolveMarketplaceProviderConfig({
      MARKETPLACE_NOTIFICATION_PROVIDER_MODE: 'mock',
      NODE_ENV: 'test',
    });
    const provider = createMarketplaceContractNotificationProvider(config);
    const input = {
      idempotencyKey: `${claim.id}:${claim.channel}`,
      intent: claim,
      signal: new AbortController().signal,
    };

    const first = await provider.deliver(input);
    const retried = await provider.deliver(input);

    expect(first).toMatchObject({
      providerMode: 'mock',
      providerName: 'mock-notification-delivery',
      safeReceipt: {
        channel: 'telegram',
        idempotencyKeyAccepted: true,
        locale: 'uz-cyrl',
        messageFingerprint: expect.stringMatching(/^[a-f0-9]{32}$/u),
        simulation: true,
      },
      simulation: true,
    });
    expect(retried.providerReference).toBe(first.providerReference);
    expect(first.providerReference).not.toContain(claim.contractId);
  });

  it('uses a distinct idempotent no-network mock delivery for the SMS fallback channel', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    try {
      const config = resolveMarketplaceProviderConfig({
        MARKETPLACE_NOTIFICATION_PROVIDER_MODE: 'mock',
        NODE_ENV: 'test',
      });
      const provider = createMarketplaceContractNotificationProvider(config);
      const smsClaim: MarketplaceContractNotificationClaim = {
        ...claim,
        attempts: 1,
        channel: 'sms',
        channelAttempts: 0,
        templateKey: 'marketplace.contract.dispute.opened',
      };
      const input = {
        idempotencyKey: `${smsClaim.id}:${smsClaim.channel}`,
        intent: smsClaim,
        signal: new AbortController().signal,
      };

      const first = await provider.deliver(input);
      const retried = await provider.deliver(input);
      const telegram = await provider.deliver({
        ...input,
        idempotencyKey: `${claim.id}:${claim.channel}`,
        intent: claim,
      });

      expect(first).toMatchObject({
        providerMode: 'mock',
        safeReceipt: { channel: 'sms', idempotencyKeyAccepted: true, locale: 'uz-cyrl', simulation: true },
        simulation: true,
      });
      expect(retried.providerReference).toBe(first.providerReference);
      expect(telegram.providerReference).not.toBe(first.providerReference);
      expect(fetch).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('begins a fenced attempt before calling the provider and persists a terminal result', async () => {
    const persistence = repository();
    const config = resolveMarketplaceProviderConfig({
      MARKETPLACE_NOTIFICATION_PROVIDER_MODE: 'mock',
      NODE_ENV: 'test',
    });
    const provider = createMarketplaceContractNotificationProvider(config);
    const dispatcher = new MarketplaceContractNotificationDispatcher(persistence, provider, config);

    await expect(dispatcher.dispatchOnce(new Date('2030-01-01T00:00:00.000Z'))).resolves.toBe(1);
    expect(persistence.beginAttempt).toHaveBeenCalledWith(
      claim.id,
      claim.claimToken,
      { mode: 'mock', name: 'mock-notification-delivery' },
      expect.any(Date),
    );
    expect(persistence.completeAttempt).toHaveBeenCalledWith(
      claim.id,
      claim.claimToken,
      expect.objectContaining({ providerMode: 'mock', simulation: true }),
    );
    expect(persistence.recordFailure).not.toHaveBeenCalled();
  });

  it('records a bounded retry without letting provider failure escape the scheduler', async () => {
    const persistence = repository();
    const config = resolveMarketplaceProviderConfig({
      MARKETPLACE_NOTIFICATION_PROVIDER_MODE: 'mock',
      NODE_ENV: 'test',
    });
    const provider: MarketplaceContractNotificationProvider = {
      mode: 'mock',
      name: 'mock-notification-delivery',
      deliver: vi
        .fn()
        .mockRejectedValue(
          new MarketplaceContractNotificationProviderError('provider_unavailable', true, 'not_accepted'),
        ),
    };
    const dispatcher = new MarketplaceContractNotificationDispatcher(persistence, provider, config);

    await expect(dispatcher.dispatchOnce()).resolves.toBe(0);
    expect(persistence.recordFailure).toHaveBeenCalledWith(
      claim.id,
      claim.claimToken,
      'provider_unavailable',
      true,
      expect.any(Date),
    );
  });

  it('never ordinary-retries after external success when completion persistence fails', async () => {
    const persistence = repository();
    vi.mocked(persistence.completeAttempt).mockRejectedValueOnce(new Error('database unavailable'));
    vi.mocked(persistence.recordReconciliation).mockRejectedValueOnce(new Error('database unavailable'));
    vi.mocked(persistence.claimPending).mockResolvedValueOnce([claim]).mockResolvedValueOnce([]);
    const config = resolveMarketplaceProviderConfig({
      MARKETPLACE_NOTIFICATION_PROVIDER_MODE: 'mock',
      NODE_ENV: 'test',
    });
    const provider = createMarketplaceContractNotificationProvider(config);
    const deliver = vi.spyOn(provider, 'deliver');
    const dispatcher = new MarketplaceContractNotificationDispatcher(persistence, provider, config);

    await expect(dispatcher.dispatchOnce()).resolves.toBe(0);
    await expect(dispatcher.dispatchOnce()).resolves.toBe(0);
    expect(deliver).toHaveBeenCalledTimes(1);
    expect(persistence.recordFailure).not.toHaveBeenCalled();
    expect(persistence.recordReconciliation).toHaveBeenCalledWith(
      claim.id,
      claim.claimToken,
      'delivery_completion_persistence_failed',
      expect.any(Date),
    );
  });

  it('rejects mismatched provenance, oversized references, and secret-shaped receipt data', () => {
    const config = resolveMarketplaceProviderConfig({
      MARKETPLACE_NOTIFICATION_PROVIDER_MODE: 'mock',
      NODE_ENV: 'test',
    });
    const provider = createMarketplaceContractNotificationProvider(config);
    const base = {
      completedAt: new Date(),
      providerMode: 'mock' as const,
      providerName: provider.name,
      providerReference: 'mock-notification:opaque',
      safeReceipt: { simulation: true },
      simulation: true,
    };

    expect(validateMarketplaceContractNotificationProviderResult(base, provider)).toBeUndefined();
    expect(
      validateMarketplaceContractNotificationProviderResult({ ...base, providerName: 'different-provider' }, provider),
    ).toBe('provider_provenance_mismatch');
    expect(
      validateMarketplaceContractNotificationProviderResult(
        { ...base, providerReference: `mock:${'a'.repeat(301)}` },
        provider,
      ),
    ).toBe('provider_result_invalid');
    expect(
      validateMarketplaceContractNotificationProviderResult(
        { ...base, safeReceipt: { accessToken: 'must-not-persist' } },
        provider,
      ),
    ).toBe('provider_receipt_unsafe');
  });

  it('does not claim intents while the provider is disabled', async () => {
    const persistence = repository();
    const config = resolveMarketplaceProviderConfig({ NODE_ENV: 'production' });
    const dispatcher = new MarketplaceContractNotificationDispatcher(
      persistence,
      createMarketplaceContractNotificationProvider(config),
      config,
    );

    await expect(dispatcher.dispatchOnce()).resolves.toBe(0);
    expect(persistence.claimPending).not.toHaveBeenCalled();
  });
});
