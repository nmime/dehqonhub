// @requirements REQ-AGRITECH-INTEGRATION-013 REQ-AGRITECH-NOTIFICATION-022
import { Logger } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  MarketplaceContractNotificationClaim,
  MarketplaceContractNotificationProvider,
  MarketplaceContractNotificationProviderResult,
  MarketplaceContractNotificationRepository,
  MarketplaceProviderSafeReceipt,
} from '@app/backend-feature-agritech-shared';
import {
  createMarketplaceContractNotificationProvider,
  MarketplaceContractNotificationDispatcher,
  MarketplaceContractNotificationProviderError,
  validateMarketplaceContractNotificationProviderResult,
} from './marketplace-contract-notification.delivery';
import { resolveMarketplaceProviderConfig, type MarketplaceProviderConfig } from './marketplace-provider.config';

const claim: MarketplaceContractNotificationClaim = {
  attempts: 0,
  channel: 'telegram',
  channelAttempts: 0,
  claimToken: 'test-claim-delivery-coverage',
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

function mockConfig(
  overrides: Partial<MarketplaceProviderConfig['notificationDelivery']> = {},
): MarketplaceProviderConfig {
  const config = resolveMarketplaceProviderConfig({
    MARKETPLACE_NOTIFICATION_PROVIDER_MODE: 'mock',
    NODE_ENV: 'test',
  });

  return { ...config, notificationDelivery: { ...config.notificationDelivery, ...overrides } };
}

function deliveryInput(signal = new AbortController().signal) {
  return { idempotencyKey: `${claim.id}:${claim.channel}`, intent: claim, signal };
}

function stubProvider(deliver: MarketplaceContractNotificationProvider['deliver']) {
  return { deliver, mode: 'mock', name: 'mock-notification-delivery' } as const;
}

beforeEach(() => {
  vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('marketplace contract notification provider result validation', () => {
  const provider = createMarketplaceContractNotificationProvider(mockConfig());
  const resultWith = (safeReceipt: MarketplaceProviderSafeReceipt): MarketplaceContractNotificationProviderResult => ({
    completedAt: new Date('2030-01-01T00:00:00.000Z'),
    providerMode: 'mock',
    providerName: provider.name,
    providerReference: 'mock-notification:opaque',
    safeReceipt,
    simulation: true,
  });
  const verdictFor = (safeReceipt: MarketplaceProviderSafeReceipt) =>
    validateMarketplaceContractNotificationProviderResult(resultWith(safeReceipt), provider);

  it('refuses a receipt it cannot encode or cannot bound', () => {
    // A provider adapter is untrusted: it may hand back an object whose own
    // serialization throws, which must fail the attempt rather than the process.
    const unserializable = Object.defineProperty({}, 'boom', {
      enumerable: true,
      get: () => {
        throw new Error('receipt getter blew up');
      },
    }) as MarketplaceProviderSafeReceipt;

    expect(verdictFor(unserializable)).toBe('provider_receipt_invalid');
    expect(verdictFor({ note: 'a'.repeat(3000) })).toBe('provider_receipt_invalid');
  });

  it('accepts only bounded primitive receipt values', () => {
    expect(verdictFor({ attempted: true, code: null, latencyMs: 42, reference: 'short' })).toBeUndefined();
    // `tokenAccepted` states an outcome about a secret, not the secret itself.
    expect(verdictFor({ tokenAccepted: true })).toBeUndefined();

    expect(verdictFor({ token: 'must-not-persist' })).toBe('provider_receipt_unsafe');
    expect(verdictFor({ latencyMs: Number.NaN })).toBe('provider_receipt_unsafe');
    expect(verdictFor({ note: 'a'.repeat(201) })).toBe('provider_receipt_unsafe');
    expect(verdictFor({ note: 'Bearer abcdef' })).toBe('provider_receipt_unsafe');
    expect(
      verdictFor({
        note: `${'a'.repeat(20)}.${'b'.repeat(20)}.${'c'.repeat(20)}`,
      }),
    ).toBe('provider_receipt_unsafe');
    expect(verdictFor({ nested: {} } as unknown as MarketplaceProviderSafeReceipt)).toBe('provider_receipt_unsafe');
  });
});

describe('marketplace contract notification provider factory', () => {
  it('honours an abort before the mock provider renders anything', async () => {
    const provider = createMarketplaceContractNotificationProvider(mockConfig());
    const withReason = new AbortController();
    const reason = new Error('caller_went_away');
    withReason.abort(reason);
    const withoutReason = new AbortController();
    withoutReason.abort('not-an-error');

    await expect(provider.deliver(deliveryInput(withReason.signal))).rejects.toBe(reason);
    await expect(provider.deliver(deliveryInput(withoutReason.signal))).rejects.toThrow(
      'notification_provider_aborted',
    );
  });

  it('names the mock provider even when the capability leaves the name unset', async () => {
    const provider = createMarketplaceContractNotificationProvider(mockConfig({ providerName: null }));

    expect(provider.name).toBe('mock-notification-delivery');
    await expect(provider.deliver(deliveryInput())).resolves.toMatchObject({
      providerName: 'mock-notification-delivery',
    });
  });

  it('rejects every delivery while the capability is disabled', async () => {
    const provider = createMarketplaceContractNotificationProvider(resolveMarketplaceProviderConfig({}));

    expect(provider.mode).toBe('disabled');
    await expect(provider.deliver(deliveryInput())).rejects.toThrow(
      'Marketplace notification delivery provider is disabled.',
    );
  });
});

describe('marketplace contract notification dispatcher', () => {
  it('sweeps the queue once per scheduled tick', async () => {
    const persistence = repository();
    const config = mockConfig();
    const dispatcher = new MarketplaceContractNotificationDispatcher(
      persistence,
      createMarketplaceContractNotificationProvider(config),
      config,
    );

    await dispatcher.dispatchScheduled();

    expect(persistence.claimPending).toHaveBeenCalledTimes(1);
    expect(persistence.completeAttempt).toHaveBeenCalledTimes(1);
  });

  it('leaves a lost fence to lease expiry instead of calling the provider', async () => {
    const persistence = repository();
    vi.mocked(persistence.beginAttempt).mockResolvedValue(false);
    const config = mockConfig();
    const provider = createMarketplaceContractNotificationProvider(config);
    const deliver = vi.spyOn(provider, 'deliver');

    await expect(
      new MarketplaceContractNotificationDispatcher(persistence, provider, config).dispatchOnce(),
    ).resolves.toBe(0);
    expect(deliver).not.toHaveBeenCalled();
    expect(persistence.recordFailure).not.toHaveBeenCalled();
    expect(persistence.recordReconciliation).not.toHaveBeenCalled();
  });

  it('reconciles instead of retrying when the provider result fails validation', async () => {
    const persistence = repository();
    const config = mockConfig();
    const provider = stubProvider(() =>
      Promise.resolve({
        completedAt: new Date('2030-01-01T00:00:00.000Z'),
        providerMode: 'mock',
        providerName: 'someone-elses-provider',
        providerReference: 'mock-notification:opaque',
        safeReceipt: { simulation: true },
        simulation: true,
      }),
    );

    await expect(
      new MarketplaceContractNotificationDispatcher(persistence, provider, config).dispatchOnce(),
    ).resolves.toBe(0);
    expect(persistence.completeAttempt).not.toHaveBeenCalled();
    expect(persistence.recordFailure).not.toHaveBeenCalled();
    expect(persistence.recordReconciliation).toHaveBeenCalledWith(
      claim.id,
      claim.claimToken,
      'provider_provenance_mismatch',
      expect.any(Date),
    );
  });

  it('treats a provider timeout as an outcome it cannot know', async () => {
    const persistence = repository();
    const config = mockConfig({ timeoutMs: 100 });
    const provider = stubProvider(
      ({ signal }) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => {
            reject(signal.reason instanceof Error ? signal.reason : new Error('aborted'));
          });
        }),
    );

    await expect(
      new MarketplaceContractNotificationDispatcher(persistence, provider, config).dispatchOnce(),
    ).resolves.toBe(0);
    expect(persistence.recordFailure).not.toHaveBeenCalled();
    expect(persistence.recordReconciliation).toHaveBeenCalledWith(
      claim.id,
      claim.claimToken,
      'notification_provider_timeout',
      expect.any(Date),
    );
  });

  it('reconciles an untyped provider failure and keeps a failed reconciliation write fenced', async () => {
    const persistence = repository();
    vi.mocked(persistence.recordReconciliation).mockRejectedValue(new Error('database unavailable'));
    const config = mockConfig();
    const provider = stubProvider(() => Promise.reject(new Error('handler blew up')));

    await expect(
      new MarketplaceContractNotificationDispatcher(persistence, provider, config).dispatchOnce(),
    ).resolves.toBe(0);
    expect(persistence.recordFailure).not.toHaveBeenCalled();
    expect(persistence.recordReconciliation).toHaveBeenCalledWith(
      claim.id,
      claim.claimToken,
      'notification_provider_outcome_unknown',
      expect.any(Date),
    );
    expect(Logger.prototype.error).toHaveBeenCalled();
  });

  it('separates a declined delivery from one whose completion the repository refused', async () => {
    const declining = repository();
    const declinedConfig = mockConfig();
    const declined = new MarketplaceContractNotificationDispatcher(
      declining,
      stubProvider(() =>
        Promise.reject(new MarketplaceContractNotificationProviderError('recipient_blocked', false, 'not_accepted')),
      ),
      declinedConfig,
    );

    await expect(declined.dispatchOnce()).resolves.toBe(0);
    expect(declining.recordFailure).toHaveBeenCalledWith(
      claim.id,
      claim.claimToken,
      'recipient_blocked',
      false,
      expect.any(Date),
    );

    const unpersisted = repository();
    vi.mocked(unpersisted.completeAttempt).mockResolvedValue(false);
    const config = mockConfig();

    await expect(
      new MarketplaceContractNotificationDispatcher(
        unpersisted,
        createMarketplaceContractNotificationProvider(config),
        config,
      ).dispatchOnce(),
    ).resolves.toBe(0);
    expect(unpersisted.recordReconciliation).toHaveBeenCalledWith(
      claim.id,
      claim.claimToken,
      'delivery_completion_not_persisted',
      expect.any(Date),
    );
  });
});
