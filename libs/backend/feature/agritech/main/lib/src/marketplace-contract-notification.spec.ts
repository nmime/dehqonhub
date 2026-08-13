// @requirements REQ-AGRITECH-INTEGRATION-013 REQ-AGRITECH-NOTIFICATION-022
import { describe, expect, it, vi } from 'vitest';
import type {
  MarketplaceContractNotificationClaim,
  MarketplaceContractNotificationProvider,
  MarketplaceContractNotificationProviderResult,
  MarketplaceContractNotificationRepository,
} from '@app/backend-feature-agritech-shared';
import {
  resolveMarketplaceProviderConfig,
  type MarketplaceProviderCapabilityConfig,
  type MarketplaceProviderConfig,
} from './marketplace-provider.config';
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

/**
 * The environment resolver always names a mock adapter after its capability and
 * never goes below the 100 ms floor, so a hand-built capability is the only way to
 * reach the unnamed-adapter fallback and to time an attempt out inside a test.
 */
function mockConfig(
  overrides: Partial<Pick<MarketplaceProviderCapabilityConfig, 'providerName' | 'timeoutMs'>> = {},
): MarketplaceProviderConfig {
  const config = resolveMarketplaceProviderConfig({
    MARKETPLACE_NOTIFICATION_PROVIDER_MODE: 'mock',
    NODE_ENV: 'test',
  });
  return { ...config, notificationDelivery: { ...config.notificationDelivery, ...overrides } };
}

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

  it.each([
    { label: 'an unsupported locale', locale: 'fr-FR' },
    { label: 'a missing locale', locale: null },
  ])('falls back to English copy for $label', ({ locale }) => {
    expect(renderMarketplaceContractNotification('marketplace.contract.contract.completed', locale)).toEqual({
      locale: 'en',
      message: 'Contract completed',
    });
  });

  it('ignores a template key from outside the contract namespace', () => {
    expect(renderMarketplaceContractNotification('promo.blast.buy-now', 'en')).toEqual(
      renderMarketplaceContractNotification('marketplace.contract.unknown-event', 'en'),
    );
  });

  it('reports a foreign template key as a generic contract update in both projections', async () => {
    const persistence = repository();
    const { claimToken, ...intentView } = claim;
    expect(claimToken).toBe('test-claim-dispatch');
    const internal = { ...intentView, templateKey: 'promo.blast.buy-now' };
    vi.mocked(persistence.listForRecipient).mockResolvedValue([internal]);
    vi.mocked(persistence.listForAdmin).mockResolvedValue([internal]);
    const query = new MarketplaceContractNotificationQueryService(persistence);

    const [recipient] = await query.listForRecipient({ tenantId: 'tenant-a', userId: 'user-a' }, 'uz');
    const [admin] = await query.listForAdmin('tenant-a', 'uz');

    expect(recipient).toMatchObject({ event: 'contract.updated', locale: 'uz' });
    expect(recipient).not.toHaveProperty('attemptedAt');
    expect(admin).toMatchObject({ event: 'contract.updated', templateKey: 'promo.blast.buy-now' });
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

  it('refuses to deliver anything while the provider is disabled', async () => {
    const provider = createMarketplaceContractNotificationProvider(
      resolveMarketplaceProviderConfig({ NODE_ENV: 'production' }),
    );

    expect(provider).toMatchObject({ mode: 'disabled', name: 'disabled-notification-delivery' });
    await expect(
      provider.deliver({
        idempotencyKey: `${claim.id}:${claim.channel}`,
        intent: claim,
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow('Marketplace notification delivery provider is disabled.');
  });

  it.each([
    {
      label: 'an Error reason',
      message: 'notification_provider_timeout',
      reason: new Error('notification_provider_timeout'),
    },
    { label: 'an opaque reason', message: 'notification_provider_aborted', reason: 'stop' },
  ])('never contacts a provider on an already aborted attempt with $label', async ({ message, reason }) => {
    const provider = createMarketplaceContractNotificationProvider(mockConfig());
    const controller = new AbortController();
    controller.abort(reason);

    await expect(
      provider.deliver({
        idempotencyKey: `${claim.id}:${claim.channel}`,
        intent: claim,
        signal: controller.signal,
      }),
    ).rejects.toThrow(message);
  });

  it('names an unnamed mock notification adapter after its capability', async () => {
    const provider = createMarketplaceContractNotificationProvider(mockConfig({ providerName: null }));

    await expect(
      provider.deliver({
        idempotencyKey: `${claim.id}:${claim.channel}`,
        intent: claim,
        signal: new AbortController().signal,
      }),
    ).resolves.toMatchObject({ providerName: 'mock-notification-delivery' });
    expect(provider.name).toBe('mock-notification-delivery');
  });

  it('runs the scheduled sweep through the same fenced dispatch path', async () => {
    const persistence = repository();
    const config = mockConfig();
    const dispatcher = new MarketplaceContractNotificationDispatcher(
      persistence,
      createMarketplaceContractNotificationProvider(config),
      config,
    );

    await expect(dispatcher.dispatchScheduled()).resolves.toBeUndefined();
    expect(persistence.completeAttempt).toHaveBeenCalledTimes(1);
  });

  it('skips a claim another replica already fenced', async () => {
    const persistence = repository();
    vi.mocked(persistence.beginAttempt).mockResolvedValue(false);
    const config = mockConfig();
    const provider = createMarketplaceContractNotificationProvider(config);
    const deliver = vi.spyOn(provider, 'deliver');
    const dispatcher = new MarketplaceContractNotificationDispatcher(persistence, provider, config);

    await expect(dispatcher.dispatchOnce()).resolves.toBe(0);
    expect(deliver).not.toHaveBeenCalled();
    expect(persistence.recordFailure).not.toHaveBeenCalled();
    expect(persistence.recordReconciliation).not.toHaveBeenCalled();
  });

  it('quarantines a delivery whose receipt fails validation instead of completing it', async () => {
    const persistence = repository();
    const config = mockConfig();
    const provider: MarketplaceContractNotificationProvider = {
      mode: 'mock',
      name: 'mock-notification-delivery',
      deliver: vi.fn().mockResolvedValue({
        completedAt: new Date('2030-01-01T00:00:00.000Z'),
        providerMode: 'mock',
        providerName: 'somebody-else',
        providerReference: 'mock-notification:opaque',
        safeReceipt: { simulation: true },
        simulation: true,
      }),
    };
    const dispatcher = new MarketplaceContractNotificationDispatcher(persistence, provider, config);

    await expect(dispatcher.dispatchOnce()).resolves.toBe(0);
    expect(persistence.completeAttempt).not.toHaveBeenCalled();
    expect(persistence.recordReconciliation).toHaveBeenCalledWith(
      claim.id,
      claim.claimToken,
      'provider_provenance_mismatch',
      expect.any(Date),
    );
  });

  it('reconciles instead of retrying when the provider attempt runs out of time', async () => {
    const persistence = repository();
    const config = mockConfig({ timeoutMs: 100 });
    const provider: MarketplaceContractNotificationProvider = {
      mode: 'mock',
      name: 'mock-notification-delivery',
      deliver: ({ signal }) =>
        new Promise((_resolve, reject) => {
          // A provider that only ever settles when the dispatcher gives up on it is what a
          // real network timeout looks like from here, abort reason included.
          signal.addEventListener('abort', () => {
            reject(signal.reason instanceof Error ? signal.reason : new Error('provider aborted'));
          });
        }),
    };
    const dispatcher = new MarketplaceContractNotificationDispatcher(persistence, provider, config);

    await expect(dispatcher.dispatchOnce()).resolves.toBe(0);
    expect(persistence.recordFailure).not.toHaveBeenCalled();
    expect(persistence.recordReconciliation).toHaveBeenCalledWith(
      claim.id,
      claim.claimToken,
      'notification_provider_timeout',
      expect.any(Date),
    );
  });

  it.each([
    { label: 'an untyped crash', error: new Error('socket hang up') },
    {
      label: 'a provider that cannot say whether it accepted',
      error: new MarketplaceContractNotificationProviderError('provider_ambiguous', true, 'unknown'),
    },
  ])('reconciles $label rather than resending the message', async ({ error }) => {
    const persistence = repository();
    const config = mockConfig();
    const provider: MarketplaceContractNotificationProvider = {
      mode: 'mock',
      name: 'mock-notification-delivery',
      deliver: vi.fn().mockRejectedValue(error),
    };
    const dispatcher = new MarketplaceContractNotificationDispatcher(persistence, provider, config);

    await expect(dispatcher.dispatchOnce()).resolves.toBe(0);
    expect(persistence.recordFailure).not.toHaveBeenCalled();
    expect(persistence.recordReconciliation).toHaveBeenCalledWith(
      claim.id,
      claim.claimToken,
      error instanceof MarketplaceContractNotificationProviderError
        ? 'provider_ambiguous'
        : 'notification_provider_outcome_unknown',
      expect.any(Date),
    );
  });

  it('leaves the claim fenced when even the failure record cannot be written', async () => {
    const persistence = repository();
    vi.mocked(persistence.recordFailure).mockRejectedValue(new Error('database unavailable'));
    const config = mockConfig();
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
    expect(persistence.recordFailure).toHaveBeenCalledTimes(1);
  });

  it('reconciles a delivered message whose completion write was rejected by the fence', async () => {
    const persistence = repository();
    vi.mocked(persistence.completeAttempt).mockResolvedValue(false);
    const config = mockConfig();
    const dispatcher = new MarketplaceContractNotificationDispatcher(
      persistence,
      createMarketplaceContractNotificationProvider(config),
      config,
    );

    await expect(dispatcher.dispatchOnce()).resolves.toBe(0);
    expect(persistence.recordReconciliation).toHaveBeenCalledWith(
      claim.id,
      claim.claimToken,
      'delivery_completion_not_persisted',
      expect.any(Date),
    );
  });

  describe('provider result validation', () => {
    const provider = createMarketplaceContractNotificationProvider(mockConfig());
    const base = {
      completedAt: new Date('2030-01-01T00:00:00.000Z'),
      providerMode: 'mock' as const,
      providerName: 'mock-notification-delivery',
      providerReference: 'mock-notification:opaque',
      safeReceipt: { simulation: true },
      simulation: true,
    };
    const jwtShaped = `${'a'.repeat(20)}.${'b'.repeat(20)}.${'c'.repeat(20)}`;
    // The table is typed as partial results so a case that only overrides one field
    // does not leave the other fields of the union optional-undefined.
    const cases: readonly {
      expected: ReturnType<typeof validateMarketplaceContractNotificationProviderResult>;
      label: string;
      overrides: Partial<MarketplaceContractNotificationProviderResult>;
    }[] = [
      {
        expected: undefined,
        label: 'a receipt of every allowed primitive',
        overrides: { safeReceipt: { attempts: 2, note: 'queued', simulation: true, threadId: null } },
      },
      {
        expected: undefined,
        label: 'a secret-shaped key that only records acceptance',
        overrides: { safeReceipt: { idempotencyKeyAccepted: true } },
      },
      {
        expected: 'provider_provenance_mismatch',
        label: 'a mock delivery that claims to be real',
        overrides: { simulation: false },
      },
      {
        expected: 'provider_result_invalid',
        label: 'a non-Date completion stamp',
        overrides: { completedAt: '2030-01-01T00:00:00.000Z' as unknown as Date },
      },
      {
        expected: 'provider_result_invalid',
        label: 'an unparsable completion stamp',
        overrides: { completedAt: new Date('not-a-date') },
      },
      {
        expected: 'provider_result_invalid',
        label: 'a blank provider reference',
        overrides: { providerReference: '   ' },
      },
      {
        expected: 'provider_result_invalid',
        label: 'a provider reference with unsafe characters',
        overrides: { providerReference: 'mock notification <script>' },
      },
      {
        expected: 'provider_receipt_unsafe',
        label: 'a secret-shaped receipt key',
        overrides: { safeReceipt: { rawKey: 'must-not-persist' } },
      },
      {
        expected: 'provider_receipt_unsafe',
        label: 'an overlong receipt string',
        overrides: { safeReceipt: { note: 'a'.repeat(201) } },
      },
      {
        expected: 'provider_receipt_unsafe',
        label: 'a bearer token hidden in a receipt value',
        overrides: { safeReceipt: { note: 'Bearer opaque-value' } },
      },
      {
        expected: 'provider_receipt_unsafe',
        label: 'a JWT hidden in a receipt value',
        overrides: { safeReceipt: { note: jwtShaped } },
      },
      {
        expected: 'provider_receipt_unsafe',
        label: 'a receipt number that is not finite',
        overrides: { safeReceipt: { attempts: Number.NaN } },
      },
      {
        expected: 'provider_receipt_invalid',
        label: 'a receipt larger than the audit budget',
        overrides: {
          safeReceipt: Object.fromEntries(Array.from({ length: 60 }, (_, index) => [`note${index}`, 'a'.repeat(40)])),
        },
      },
    ];

    it.each(cases)('reports $label as $expected', ({ expected, overrides }) => {
      expect(validateMarketplaceContractNotificationProviderResult({ ...base, ...overrides }, provider)).toBe(expected);
    });

    it('reports an unserializable receipt as invalid rather than crashing the dispatcher', () => {
      /**
       * The receipt type forbids nested values, so only a live adapter that lies
       * about its own contract can get here — which is exactly what this boundary
       * check exists to survive.
       */
      const circular: Record<string, unknown> = { simulation: true };
      circular.self = circular;

      expect(
        validateMarketplaceContractNotificationProviderResult({ ...base, safeReceipt: circular as never }, provider),
      ).toBe('provider_receipt_invalid');
    });
  });
});
