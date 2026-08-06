// @requirements REQ-AGRITECH-INTEGRATION-013 REQ-AGRITECH-STAGE2-017 REQ-AGRITECH-NOTIFICATION-022
import { createHash } from 'node:crypto';
import { Inject, Injectable, Logger, Module } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  MarketplaceContractNotificationProviderInjectToken,
  MarketplaceContractNotificationRepositoryInjectToken,
  type MarketplaceContractNotificationClaim,
  type MarketplaceContractNotificationProvider,
  type MarketplaceContractNotificationRepository,
} from '@app/backend-feature-agritech-shared';
import {
  MarketplaceProviderConfigInjectToken,
  resolveMarketplaceProviderConfig,
  type MarketplaceProviderConfig,
} from './marketplace-provider.config';
import { renderMarketplaceContractNotification } from './marketplace-contract-notification.service';

const unsafeReceiptKey = /(authorization|cookie|credential|password|secret|token|raw[_-]?key)/iu;
const safeProviderReference = /^[A-Za-z0-9:._/-]+$/u;
const bearerReceiptValue = /bearer\s/iu;
const jwtReceiptValue = /^[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}$/u;

type EnabledMarketplaceContractNotificationProvider = MarketplaceContractNotificationProvider & {
  mode: 'mock' | 'live';
};

function isEnabledProvider(
  provider: MarketplaceContractNotificationProvider,
): provider is EnabledMarketplaceContractNotificationProvider {
  return provider.mode !== 'disabled';
}

export class MarketplaceContractNotificationProviderError extends Error {
  constructor(
    readonly code: string,
    readonly retryable: boolean,
    readonly outcome: 'not_accepted' | 'unknown',
  ) {
    super(code);
  }
}

export function validateMarketplaceContractNotificationProviderResult(
  value: Awaited<ReturnType<MarketplaceContractNotificationProvider['deliver']>>,
  provider: MarketplaceContractNotificationProvider,
): string | undefined {
  if (
    value.providerMode !== provider.mode ||
    value.providerName !== provider.name ||
    value.simulation !== (value.providerMode === 'mock')
  ) {
    return 'provider_provenance_mismatch';
  }
  if (
    !(value.completedAt instanceof Date) ||
    !Number.isFinite(value.completedAt.getTime()) ||
    !value.providerReference.trim() ||
    value.providerReference.length > 300 ||
    !safeProviderReference.test(value.providerReference)
  ) {
    return 'provider_result_invalid';
  }
  let encoded: string;
  try {
    encoded = JSON.stringify(value.safeReceipt);
  } catch {
    return 'provider_receipt_invalid';
  }
  if (Buffer.byteLength(encoded, 'utf8') > 2048) {
    return 'provider_receipt_invalid';
  }
  for (const [key, receiptValue] of Object.entries(value.safeReceipt)) {
    if (unsafeReceiptKey.test(key) && !/accepted$/iu.test(key)) {
      return 'provider_receipt_unsafe';
    }
    if (
      receiptValue !== null &&
      typeof receiptValue !== 'boolean' &&
      (typeof receiptValue !== 'number' || !Number.isFinite(receiptValue)) &&
      (typeof receiptValue !== 'string' ||
        receiptValue.length > 200 ||
        bearerReceiptValue.test(receiptValue) ||
        jwtReceiptValue.test(receiptValue))
    ) {
      return 'provider_receipt_unsafe';
    }
  }
  return undefined;
}

export function createMarketplaceContractNotificationProvider(
  config: MarketplaceProviderConfig,
): MarketplaceContractNotificationProvider {
  const capability = config.notificationDelivery;
  if (capability.mode === 'mock') {
    return {
      mode: 'mock',
      name: capability.providerName ?? 'mock-notification-delivery',
      deliver({ idempotencyKey, intent, signal }) {
        if (signal.aborted) {
          return Promise.reject(
            signal.reason instanceof Error ? signal.reason : new Error('notification_provider_aborted'),
          );
        }
        const rendered = renderMarketplaceContractNotification(intent.templateKey, intent.recipientLocale);
        const providerReference = `mock-notification:${createHash('sha256')
          .update(`${intent.id}:${intent.channel}`)
          .digest('hex')
          .slice(0, 32)}`;
        return Promise.resolve({
          completedAt: new Date(),
          providerMode: 'mock',
          providerName: capability.providerName ?? 'mock-notification-delivery',
          providerReference,
          safeReceipt: {
            channel: intent.channel,
            idempotencyKeyAccepted: idempotencyKey === `${intent.id}:${intent.channel}`,
            locale: rendered.locale,
            messageFingerprint: createHash('sha256').update(rendered.message).digest('hex').slice(0, 32),
            simulation: true,
          },
          simulation: true,
        });
      },
    };
  }
  return {
    mode: 'disabled',
    name: 'disabled-notification-delivery',
    deliver() {
      return Promise.reject(new Error('Marketplace notification delivery provider is disabled.'));
    },
  };
}

@Injectable()
export class MarketplaceContractNotificationDispatcher {
  private readonly logger = new Logger(MarketplaceContractNotificationDispatcher.name);
  private running = false;

  constructor(
    @Inject(MarketplaceContractNotificationRepositoryInjectToken)
    private readonly repository: MarketplaceContractNotificationRepository,
    @Inject(MarketplaceContractNotificationProviderInjectToken)
    private readonly provider: MarketplaceContractNotificationProvider,
    @Inject(MarketplaceProviderConfigInjectToken)
    private readonly config: MarketplaceProviderConfig,
  ) {}

  @Cron(CronExpression.EVERY_30_SECONDS)
  async dispatchScheduled(): Promise<void> {
    await this.dispatchOnce();
  }

  async dispatchOnce(now = new Date()): Promise<number> {
    const provider = this.provider;
    if (this.running || !isEnabledProvider(provider)) {
      return 0;
    }
    this.running = true;
    try {
      const claims = await this.repository.claimPending(25, now);
      let completed = 0;
      for (const claim of claims) {
        // Sequential processing keeps attempt and lease ordering deterministic per scheduler replica.
        // eslint-disable-next-line no-await-in-loop
        if (await this.dispatchClaim(claim, provider)) {
          completed += 1;
        }
      }
      return completed;
    } finally {
      this.running = false;
    }
  }

  private async dispatchClaim(
    claim: MarketplaceContractNotificationClaim,
    provider: EnabledMarketplaceContractNotificationProvider,
  ): Promise<boolean> {
    const began = await this.repository.beginAttempt(
      claim.id,
      claim.claimToken,
      { mode: provider.mode, name: provider.name },
      new Date(),
    );
    if (!began) {
      return false;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort(new Error('notification_provider_timeout'));
    }, this.config.notificationDelivery.timeoutMs);
    let result: Awaited<ReturnType<MarketplaceContractNotificationProvider['deliver']>>;
    try {
      // Provider calls happen only after the commerce transaction committed and after the attempt was durably fenced.
      result = await provider.deliver({
        idempotencyKey: `${claim.id}:${claim.channel}`,
        intent: claim,
        signal: controller.signal,
      });
    } catch (error) {
      await this.persistProviderFailure(claim.id, claim.claimToken, error, controller.signal.aborted);
      return false;
    } finally {
      clearTimeout(timeout);
    }

    const validationError = validateMarketplaceContractNotificationProviderResult(result, provider);
    if (validationError) {
      await this.persistReconciliation(claim.id, claim.claimToken, validationError);
      return false;
    }
    return this.persistSuccessfulDelivery(claim.id, claim.claimToken, result);
  }

  private async persistProviderFailure(
    intentId: string,
    claimToken: string,
    error: unknown,
    aborted: boolean,
  ): Promise<void> {
    const knownFailure = error instanceof MarketplaceContractNotificationProviderError ? error : undefined;
    const errorCode = aborted
      ? 'notification_provider_timeout'
      : (knownFailure?.code ?? 'notification_provider_outcome_unknown');
    try {
      if (knownFailure?.outcome === 'not_accepted') {
        await this.repository.recordFailure(intentId, claimToken, errorCode, knownFailure.retryable, new Date());
      } else {
        // An untyped failure or timeout can mean the provider accepted the request; never ordinary-retry it.
        await this.repository.recordReconciliation(intentId, claimToken, errorCode, new Date());
      }
    } catch {
      // The still-owned started claim is intentionally left fenced; lease expiry quarantines it.
      this.logger.error({ errorCode, intentId }, 'Could not persist notification provider failure');
    }
    this.logger.warn({ errorCode, intentId }, 'Marketplace notification delivery attempt failed');
  }

  private async persistReconciliation(intentId: string, claimToken: string, errorCode: string): Promise<void> {
    try {
      await this.repository.recordReconciliation(intentId, claimToken, errorCode, new Date());
    } catch {
      this.logger.error({ errorCode, intentId }, 'Could not persist notification reconciliation');
    }
  }

  private async persistSuccessfulDelivery(
    intentId: string,
    claimToken: string,
    result: Awaited<ReturnType<MarketplaceContractNotificationProvider['deliver']>>,
  ): Promise<boolean> {
    try {
      const persisted = await this.repository.completeAttempt(intentId, claimToken, result);
      if (persisted) {
        return true;
      }
      await this.persistReconciliation(intentId, claimToken, 'delivery_completion_not_persisted');
    } catch {
      // A successful external effect must never become an ordinary retry.
      await this.persistReconciliation(intentId, claimToken, 'delivery_completion_persistence_failed');
    }
    return false;
  }
}

const marketplaceProviderConfig = {
  provide: MarketplaceProviderConfigInjectToken,
  useFactory: resolveMarketplaceProviderConfig,
};

const marketplaceContractNotificationProvider = {
  provide: MarketplaceContractNotificationProviderInjectToken,
  inject: [MarketplaceProviderConfigInjectToken],
  useFactory: createMarketplaceContractNotificationProvider,
};

@Module({
  providers: [
    marketplaceProviderConfig,
    marketplaceContractNotificationProvider,
    MarketplaceContractNotificationDispatcher,
  ],
  exports: [MarketplaceContractNotificationDispatcher],
})
export class MarketplaceContractNotificationDeliveryModule {}
