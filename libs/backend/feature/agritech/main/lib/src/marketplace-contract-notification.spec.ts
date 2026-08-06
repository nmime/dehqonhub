// @requirements REQ-AGRITECH-INTEGRATION-013 REQ-AGRITECH-NOTIFICATION-022
/* eslint-disable no-await-in-loop -- table-driven cases mutate stateful mocks and must remain ordered */
import { describe, expect, it, vi } from 'vitest';
import type {
  MarketplaceContractNotificationClaim,
  MarketplaceContractNotificationProvider,
  MarketplaceContractNotificationProviderResult,
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

  it('covers receipt validation, aborts, scheduler fencing, reconciliation, and safe fallback rendering', async () => {
    const config = resolveMarketplaceProviderConfig({
      MARKETPLACE_NOTIFICATION_PROVIDER_MODE: 'mock',
      NODE_ENV: 'test',
    });
    const customConfig = {
      ...config,
      notificationDelivery: { ...config.notificationDelivery, providerName: 'custom-mock', timeoutMs: 1 },
    };
    const provider = createMarketplaceContractNotificationProvider(customConfig);
    const fallbackNameProvider = createMarketplaceContractNotificationProvider({
      ...config,
      notificationDelivery: { ...config.notificationDelivery, mode: 'mock', providerName: null },
    });
    await expect(
      fallbackNameProvider.deliver({
        idempotencyKey: `${claim.id}:${claim.channel}`,
        intent: claim,
        signal: new AbortController().signal,
      }),
    ).resolves.toMatchObject({ providerName: 'mock-notification-delivery' });
    const base = {
      completedAt: new Date(),
      providerMode: 'mock' as const,
      providerName: provider.name,
      providerReference: 'mock-notification:opaque',
      safeReceipt: { accepted: true },
      simulation: true,
    };
    const validate = (value: unknown) =>
      validateMarketplaceContractNotificationProviderResult(
        value as MarketplaceContractNotificationProviderResult,
        provider,
      );

    for (const [value, expected] of [
      [{ ...base, providerMode: 'live' as const }, 'provider_provenance_mismatch'],
      [{ ...base, simulation: false }, 'provider_provenance_mismatch'],
      [{ ...base, completedAt: 'invalid' as never }, 'provider_result_invalid'],
      [{ ...base, completedAt: new Date(Number.NaN) }, 'provider_result_invalid'],
      [{ ...base, providerReference: '   ' }, 'provider_result_invalid'],
      [{ ...base, providerReference: 'unsafe reference' }, 'provider_result_invalid'],
      [{ ...base, safeReceipt: { value: 'a'.repeat(2_049) } }, 'provider_receipt_invalid'],
      [{ ...base, safeReceipt: { value: Number.NaN } }, 'provider_receipt_unsafe'],
      [{ ...base, safeReceipt: { value: {} } }, 'provider_receipt_unsafe'],
      [{ ...base, safeReceipt: { value: 'a'.repeat(201) } }, 'provider_receipt_unsafe'],
      [{ ...base, safeReceipt: { value: 'Bearer opaque' } }, 'provider_receipt_unsafe'],
      [
        {
          ...base,
          safeReceipt: { value: `${'a'.repeat(16)}.${'b'.repeat(16)}.${'c'.repeat(16)}` },
        },
        'provider_receipt_unsafe',
      ],
    ] as const) {
      expect(validate(value)).toBe(expected);
    }
    const circular: Record<string, unknown> = {};
    circular['self'] = circular;
    expect(validate({ ...base, safeReceipt: circular })).toBe('provider_receipt_invalid');
    expect(
      validateMarketplaceContractNotificationProviderResult(
        { ...base, safeReceipt: { credentialAccepted: true, nil: null, count: 1, value: 'safe' } },
        provider,
      ),
    ).toBeUndefined();

    for (const reason of [new Error('aborted'), 'opaque abort']) {
      const controller = new AbortController();
      controller.abort(reason);
      await expect(
        provider.deliver({ idempotencyKey: 'wrong-key', intent: claim, signal: controller.signal }),
      ).rejects.toBeInstanceOf(Error);
    }
    const delivered = await provider.deliver({
      idempotencyKey: 'wrong-key',
      intent: claim,
      signal: new AbortController().signal,
    });
    expect(delivered).toMatchObject({
      providerName: 'custom-mock',
      safeReceipt: { idempotencyKeyAccepted: false },
    });
    const disabled = createMarketplaceContractNotificationProvider(
      resolveMarketplaceProviderConfig({ NODE_ENV: 'production' }),
    );
    await expect(
      disabled.deliver({ idempotencyKey: 'disabled', intent: claim, signal: new AbortController().signal }),
    ).rejects.toThrow('disabled');

    expect(renderMarketplaceContractNotification('untrusted-template', null)).toMatchObject({
      locale: 'en',
      message: 'Contract status updated',
    });
    const queryPersistence = repository();
    const { claimToken, ...intent } = claim;
    expect(claimToken).toBeDefined();
    vi.mocked(queryPersistence.listForRecipient).mockResolvedValue([{ ...intent, templateKey: 'untrusted-template' }]);
    vi.mocked(queryPersistence.listForAdmin).mockResolvedValue([{ ...intent, templateKey: 'untrusted-template' }]);
    const query = new MarketplaceContractNotificationQueryService(queryPersistence);
    await expect(query.listForRecipient({ tenantId: 'tenant', userId: 'user' })).resolves.toEqual([
      expect.objectContaining({ event: 'contract.updated' }),
    ]);
    await expect(query.listForAdmin('tenant')).resolves.toEqual([
      expect.objectContaining({ event: 'contract.updated' }),
    ]);

    let releaseClaims: ((claims: MarketplaceContractNotificationClaim[]) => void) | undefined;
    const runningPersistence = repository();
    vi.mocked(runningPersistence.claimPending).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          releaseClaims = resolve;
        }),
    );
    const runningDispatcher = new MarketplaceContractNotificationDispatcher(runningPersistence, provider, customConfig);
    const firstDispatch = runningDispatcher.dispatchOnce();
    await expect(runningDispatcher.dispatchOnce()).resolves.toBe(0);
    releaseClaims?.([]);
    await expect(firstDispatch).resolves.toBe(0);
    vi.mocked(runningPersistence.claimPending).mockResolvedValueOnce([]);
    await expect(runningDispatcher.dispatchScheduled()).resolves.toBeUndefined();

    const notBegunPersistence = repository();
    vi.mocked(notBegunPersistence.beginAttempt).mockResolvedValue(false);
    const notBegunDispatcher = new MarketplaceContractNotificationDispatcher(
      notBegunPersistence,
      provider,
      customConfig,
    );
    await expect(notBegunDispatcher.dispatchOnce()).resolves.toBe(0);
    expect(provider.deliver).toBeDefined();

    vi.useFakeTimers();
    try {
      const timeoutPersistence = repository();
      vi.mocked(timeoutPersistence.recordReconciliation).mockRejectedValueOnce(new Error('ledger unavailable'));
      const timeoutProvider: MarketplaceContractNotificationProvider = {
        mode: 'mock',
        name: 'timeout-provider',
        deliver: vi.fn(
          ({ signal }) =>
            new Promise<MarketplaceContractNotificationProviderResult>((_resolve, reject) => {
              signal.addEventListener('abort', () => {
                let error: Error;
                if (signal.reason instanceof Error) {
                  error = signal.reason;
                } else {
                  error = new Error('notification_provider_aborted');
                }
                reject(error);
              });
            }),
        ),
      };
      const timeoutDispatcher = new MarketplaceContractNotificationDispatcher(
        timeoutPersistence,
        timeoutProvider,
        customConfig,
      );
      const timeoutResult = timeoutDispatcher.dispatchOnce();
      await vi.advanceTimersByTimeAsync(2);
      await expect(timeoutResult).resolves.toBe(0);
      expect(timeoutPersistence.recordReconciliation).toHaveBeenCalledWith(
        claim.id,
        claim.claimToken,
        'notification_provider_timeout',
        expect.any(Date),
      );
    } finally {
      vi.useRealTimers();
    }

    const failurePersistence = repository();
    vi.mocked(failurePersistence.recordFailure).mockRejectedValueOnce(new Error('ledger unavailable'));
    const rejectedProvider: MarketplaceContractNotificationProvider = {
      mode: 'mock',
      name: 'rejected-provider',
      deliver: vi
        .fn()
        .mockRejectedValue(new MarketplaceContractNotificationProviderError('rejected', false, 'not_accepted')),
    };
    await expect(
      new MarketplaceContractNotificationDispatcher(failurePersistence, rejectedProvider, config).dispatchOnce(),
    ).resolves.toBe(0);

    const unknownPersistence = repository();
    const unknownProvider: MarketplaceContractNotificationProvider = {
      mode: 'mock',
      name: 'unknown-provider',
      deliver: vi.fn().mockRejectedValue(new MarketplaceContractNotificationProviderError('unknown', true, 'unknown')),
    };
    await expect(
      new MarketplaceContractNotificationDispatcher(unknownPersistence, unknownProvider, config).dispatchOnce(),
    ).resolves.toBe(0);
    expect(unknownPersistence.recordReconciliation).toHaveBeenCalledWith(
      claim.id,
      claim.claimToken,
      'unknown',
      expect.any(Date),
    );

    const rawFailurePersistence = repository();
    const rawFailureProvider: MarketplaceContractNotificationProvider = {
      mode: 'mock',
      name: 'raw-failure-provider',
      deliver: vi.fn().mockRejectedValue('opaque failure'),
    };
    await expect(
      new MarketplaceContractNotificationDispatcher(rawFailurePersistence, rawFailureProvider, config).dispatchOnce(),
    ).resolves.toBe(0);
    expect(rawFailurePersistence.recordReconciliation).toHaveBeenCalledWith(
      claim.id,
      claim.claimToken,
      'notification_provider_outcome_unknown',
      expect.any(Date),
    );

    const invalidPersistence = repository();
    const invalidProvider: MarketplaceContractNotificationProvider = {
      mode: 'mock',
      name: 'invalid-provider',
      deliver: vi.fn().mockResolvedValue({ ...base, providerName: 'wrong' }),
    };
    await expect(
      new MarketplaceContractNotificationDispatcher(invalidPersistence, invalidProvider, config).dispatchOnce(),
    ).resolves.toBe(0);
    expect(invalidPersistence.recordReconciliation).toHaveBeenCalledWith(
      claim.id,
      claim.claimToken,
      'provider_provenance_mismatch',
      expect.any(Date),
    );

    const notPersisted = repository();
    vi.mocked(notPersisted.completeAttempt).mockResolvedValue(false);
    await expect(
      new MarketplaceContractNotificationDispatcher(notPersisted, provider, customConfig).dispatchOnce(),
    ).resolves.toBe(0);
    expect(notPersisted.recordReconciliation).toHaveBeenCalledWith(
      claim.id,
      claim.claimToken,
      'delivery_completion_not_persisted',
      expect.any(Date),
    );
  });
});
