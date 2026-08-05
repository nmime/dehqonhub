// @requirements REQ-AGRITECH-INTEGRATION-013 REQ-AGRITECH-STAGE2-017 REQ-AGRITECH-NOTIFICATION-022
import { LockMode } from '@mikro-orm/core';
import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { defaultLocale, isSupportedLocale } from '@app/common-i18n-runtime';
import {
  isMarketplaceContractCriticalNotificationTemplate,
  marketplaceNotificationClaimLeaseMs,
  marketplaceNotificationMaxChannelAttempts,
  marketplaceNotificationMaxAttempts,
  marketplaceNotificationUnclaimedClaimId,
  type AgriTechOwner,
  type MarketplaceContractNotificationClaim,
  type MarketplaceContractNotificationIntentView,
  type MarketplaceContractNotificationLocale,
  type MarketplaceContractNotificationProviderResult,
  type MarketplaceContractNotificationRepository,
  type MarketplaceContractNotificationStatus,
  type MarketplaceContractParty,
} from '@app/backend-feature-agritech-shared';
import { MarketplaceContractNotificationIntentEntity } from '../entities/marketplace-contract-lifecycle.entity';

interface IntentRow {
  attempts: number;
  channel: 'telegram' | 'sms';
  channelAttempts: number;
  contractId: string;
  createdAt: Date;
  dispatchedAt: Date | null;
  id: string;
  lastAttemptAt: Date | null;
  lastErrorCode: string | null;
  nextAttemptAt: Date;
  providerMode: 'none' | 'mock' | 'live';
  providerName: string | null;
  recipientLocale: MarketplaceContractNotificationLocale;
  recipientParty: MarketplaceContractParty;
  simulation: boolean;
  status: MarketplaceContractNotificationStatus;
  templateKey: string;
  timelineEventId: string;
  updatedAt: Date;
}

function mapIntent(entity: IntentRow): MarketplaceContractNotificationIntentView {
  return {
    attempts: entity.attempts,
    channel: entity.channel,
    channelAttempts: entity.channelAttempts,
    contractId: entity.contractId,
    createdAt: entity.createdAt,
    ...(entity.dispatchedAt ? { dispatchedAt: entity.dispatchedAt } : {}),
    id: entity.id,
    ...(entity.lastAttemptAt ? { lastAttemptAt: entity.lastAttemptAt } : {}),
    ...(entity.lastErrorCode ? { lastErrorCode: entity.lastErrorCode } : {}),
    nextAttemptAt: entity.nextAttemptAt,
    providerMode: entity.providerMode,
    ...(entity.providerName ? { providerName: entity.providerName } : {}),
    recipientLocale: entity.recipientLocale,
    recipientParty: entity.recipientParty,
    simulation: entity.simulation,
    status: entity.status,
    templateKey: entity.templateKey,
    timelineEventId: entity.timelineEventId,
    updatedAt: entity.updatedAt,
  };
}

const selectIntentColumns = `
  intent."id", intent."contract_id" as "contractId", intent."timeline_event_id" as "timelineEventId",
  intent."recipient_party" as "recipientParty", intent."template_key" as "templateKey", intent."channel",
  intent."channel_attempts" as "channelAttempts",
  intent."status", intent."provider_mode" as "providerMode", intent."provider_name" as "providerName",
  intent."recipient_locale" as "recipientLocale", intent."simulation", intent."attempts",
  intent."next_attempt_at" as "nextAttemptAt",
  intent."last_attempt_at" as "lastAttemptAt",
  intent."last_error_code" as "lastErrorCode", intent."dispatched_at" as "dispatchedAt",
  intent."created_at" as "createdAt", intent."updated_at" as "updatedAt"
`;
const unsafeReceiptKey = /(authorization|cookie|credential|password|secret|token|raw[_-]?key)/iu;
const bearerReceiptValue = /bearer\s/iu;
const jwtReceiptValue = /^[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}$/u;

function resetClaim(entity: MarketplaceContractNotificationIntentEntity): void {
  entity.claimToken = marketplaceNotificationUnclaimedClaimId;
  entity.claimedAt = new Date(0);
}

async function resolveRecipientLocale(
  em: EntityManager,
  intent: MarketplaceContractNotificationIntentEntity,
): Promise<MarketplaceContractNotificationLocale> {
  const userColumn = intent.recipientParty === 'buyer' ? 'buyer_user_id' : 'seller_user_id';
  const tenantColumn = intent.recipientParty === 'buyer' ? 'tenant_id' : 'seller_tenant_id';
  const rows = await em.getConnection().execute<Array<{ locale: string | null }>>(
    `select account."locale"
       from "marketplace_contracts" contract
       join "auth_users" account
         on account."id"::text = contract."${userColumn}"
        and account."tenant_id"::text = contract."${tenantColumn}"
        and account."status" = 'active'
      where contract."id" = ?
      limit 1`,
    [intent.contractId],
  );
  const locale = rows[0]?.locale;
  return locale && isSupportedLocale(locale) ? locale : defaultLocale;
}

function retryAt(now: Date, attempts: number): Date {
  const delayMs = Math.min(30 * 60_000, 30_000 * 2 ** Math.max(0, attempts - 1));
  return new Date(now.getTime() + delayMs);
}

function providerResultIsSafe(result: MarketplaceContractNotificationProviderResult): boolean {
  if (
    !result.providerReference.trim() ||
    result.providerReference.length > 300 ||
    !/^[A-Za-z0-9:._/-]+$/u.test(result.providerReference)
  ) {
    return false;
  }
  let encoded: string;
  try {
    encoded = JSON.stringify(result.safeReceipt);
  } catch {
    return false;
  }
  if (Buffer.byteLength(encoded, 'utf8') > 2048) {
    return false;
  }
  return Object.entries(result.safeReceipt).every(([key, value]) => {
    if (unsafeReceiptKey.test(key) && !/accepted$/iu.test(key)) {
      return false;
    }
    return (
      value === null ||
      typeof value === 'boolean' ||
      (typeof value === 'number' && Number.isFinite(value)) ||
      (typeof value === 'string' &&
        value.length <= 200 &&
        !bearerReceiptValue.test(value) &&
        !jwtReceiptValue.test(value))
    );
  });
}

@Injectable()
export class PostgresMarketplaceContractNotificationRepository implements MarketplaceContractNotificationRepository {
  constructor(private readonly em: EntityManager) {}

  async listForRecipient(owner: AgriTechOwner, limit = 100): Promise<MarketplaceContractNotificationIntentView[]> {
    const rows = await this.em.getConnection().execute<IntentRow[]>(
      `select ${selectIntentColumns}
         from "marketplace_contract_notification_intents" intent
         join "marketplace_contracts" contract on contract."id" = intent."contract_id"
        where (
          intent."recipient_party" = 'buyer' and contract."tenant_id" = ? and contract."buyer_user_id" = ?
          and exists (select 1 from "marketplace_partner_memberships" membership
            where membership."tenant_id" = contract."tenant_id"
              and membership."partner_id" = contract."buyer_partner_id"
              and membership."user_id" = ? and membership."capability" = 'buyer' and membership."status" = 'active')
        ) or (
          intent."recipient_party" = 'seller' and contract."seller_tenant_id" = ? and contract."seller_user_id" = ?
          and exists (select 1 from "marketplace_partner_memberships" membership
            where membership."tenant_id" = contract."seller_tenant_id"
              and membership."partner_id" = contract."seller_partner_id"
              and membership."user_id" = ? and membership."capability" = 'seller' and membership."status" = 'active')
        )
        order by intent."created_at" desc, intent."id" desc limit ?`,
      [owner.tenantId, owner.userId, owner.userId, owner.tenantId, owner.userId, owner.userId, Math.min(200, limit)],
    );
    return rows.map(mapIntent);
  }

  async listForAdmin(tenantId: string, limit = 100): Promise<MarketplaceContractNotificationIntentView[]> {
    const rows = await this.em.getConnection().execute<IntentRow[]>(
      `select ${selectIntentColumns}
         from "marketplace_contract_notification_intents" intent
         join "marketplace_contracts" contract on contract."id" = intent."contract_id"
        where (intent."recipient_party" = 'buyer' and contract."tenant_id" = ?)
           or (intent."recipient_party" = 'seller' and contract."seller_tenant_id" = ?)
        order by intent."created_at" desc, intent."id" desc limit ?`,
      [tenantId, tenantId, Math.min(200, limit)],
    );
    return rows.map(mapIntent);
  }

  async claimPending(count: number, now: Date): Promise<MarketplaceContractNotificationClaim[]> {
    const claimableBefore = new Date(now.getTime() - marketplaceNotificationClaimLeaseMs);
    const claimToken = randomUUID();
    return this.em.transactional(async (em) => {
      // An expired claim after beginAttempt has an ambiguous external outcome. Quarantine it before
      // selecting retry work; only a claim that never started (attempts=0) may be lease-reclaimed.
      const ambiguous = await em.find(
        MarketplaceContractNotificationIntentEntity,
        {
          attempts: { $gt: 0 },
          claimedAt: { $lte: claimableBefore },
          claimToken: { $ne: marketplaceNotificationUnclaimedClaimId },
          status: 'pending',
        },
        {
          limit: Math.max(1, Math.min(100, count)),
          lockMode: LockMode.PESSIMISTIC_PARTIAL_WRITE,
          orderBy: { createdAt: 'ASC', id: 'ASC' },
        },
      );
      for (const intent of ambiguous) {
        intent.status = 'reconciliation_required';
        intent.lastErrorCode = 'delivery_outcome_unknown_after_lease';
        intent.updatedAt = now;
        resetClaim(intent);
      }
      await em.flush();
      const intents = await em.find(
        MarketplaceContractNotificationIntentEntity,
        {
          attempts: { $lt: marketplaceNotificationMaxAttempts },
          claimedAt: { $lte: claimableBefore },
          nextAttemptAt: { $lte: now },
          status: 'pending',
        },
        {
          limit: Math.max(1, Math.min(100, count)),
          lockMode: LockMode.PESSIMISTIC_PARTIAL_WRITE,
          orderBy: { createdAt: 'ASC', id: 'ASC' },
        },
      );
      for (const intent of intents) {
        // Recipient preference is resolved and persisted before provider ownership begins.
        // eslint-disable-next-line no-await-in-loop
        intent.recipientLocale = await resolveRecipientLocale(em, intent);
        intent.claimToken = claimToken;
        intent.claimedAt = now;
        intent.updatedAt = now;
      }
      await em.flush();
      return intents.map((intent) => ({ ...mapIntent(intent), claimToken }));
    });
  }

  async beginAttempt(
    intentId: string,
    claimToken: string,
    provider: { mode: 'mock' | 'live'; name: string },
    now: Date,
  ): Promise<boolean> {
    return this.em.transactional(async (em) => {
      const intent = await em.findOne(
        MarketplaceContractNotificationIntentEntity,
        {
          claimToken,
          claimedAt: { $gt: new Date(now.getTime() - marketplaceNotificationClaimLeaseMs) },
          id: intentId,
          status: 'pending',
        },
        { lockMode: LockMode.PESSIMISTIC_WRITE },
      );
      if (
        !intent ||
        intent.attempts >= marketplaceNotificationMaxAttempts ||
        intent.channelAttempts >= marketplaceNotificationMaxChannelAttempts ||
        (intent.providerMode !== 'none' &&
          (intent.providerMode !== provider.mode || intent.providerName !== provider.name))
      ) {
        return false;
      }
      intent.providerMode = provider.mode;
      intent.providerName = provider.name;
      intent.simulation = provider.mode === 'mock';
      intent.attempts += 1;
      intent.channelAttempts += 1;
      intent.lastAttemptAt = now;
      intent.lastErrorCode = null;
      intent.updatedAt = now;
      await em.flush();
      return true;
    });
  }

  async completeAttempt(
    intentId: string,
    claimToken: string,
    result: MarketplaceContractNotificationProviderResult,
  ): Promise<boolean> {
    return this.em.transactional(async (em) => {
      const intent = await em.findOne(
        MarketplaceContractNotificationIntentEntity,
        { claimToken, id: intentId, status: 'pending' },
        { lockMode: LockMode.PESSIMISTIC_WRITE },
      );
      if (!intent) {
        return false;
      }
      if (
        intent.providerMode !== result.providerMode ||
        intent.providerName !== result.providerName ||
        result.simulation !== (result.providerMode === 'mock') ||
        !providerResultIsSafe(result)
      ) {
        intent.status = 'reconciliation_required';
        intent.lastErrorCode = providerResultIsSafe(result) ? 'provider_provenance_mismatch' : 'provider_result_unsafe';
        intent.updatedAt = result.completedAt;
        resetClaim(intent);
        await em.flush();
        return false;
      }
      intent.status = result.providerMode === 'mock' ? 'simulated' : 'delivered';
      intent.providerReference = result.providerReference;
      intent.safeReceipt = result.safeReceipt;
      intent.dispatchedAt = result.completedAt;
      intent.lastErrorCode = null;
      intent.updatedAt = result.completedAt;
      resetClaim(intent);
      await em.flush();
      return true;
    });
  }

  async recordFailure(
    intentId: string,
    claimToken: string,
    errorCode: string,
    retryable: boolean,
    now: Date,
  ): Promise<boolean> {
    return this.em.transactional(async (em) => {
      const intent = await em.findOne(
        MarketplaceContractNotificationIntentEntity,
        { claimToken, id: intentId, status: 'pending' },
        { lockMode: LockMode.PESSIMISTIC_WRITE },
      );
      if (!intent) {
        return false;
      }
      const shouldRetry = retryable && intent.channelAttempts < marketplaceNotificationMaxChannelAttempts;
      const shouldFallbackToSms =
        !shouldRetry &&
        intent.channel === 'telegram' &&
        isMarketplaceContractCriticalNotificationTemplate(intent.templateKey);
      intent.status = shouldRetry || shouldFallbackToSms ? 'pending' : 'failed';
      if (shouldFallbackToSms) {
        intent.nextAttemptAt = now;
      } else if (shouldRetry) {
        intent.nextAttemptAt = retryAt(now, intent.channelAttempts);
      }
      if (shouldFallbackToSms) {
        intent.channel = 'sms';
        intent.channelAttempts = 0;
        intent.lastErrorCode = `telegram:${errorCode.slice(0, 48)}:sms_fallback`;
      } else {
        intent.lastErrorCode = errorCode.slice(0, 80);
      }
      intent.updatedAt = now;
      resetClaim(intent);
      await em.flush();
      return true;
    });
  }

  async recordReconciliation(intentId: string, claimToken: string, errorCode: string, now: Date): Promise<boolean> {
    return this.em.transactional(async (em) => {
      const intent = await em.findOne(
        MarketplaceContractNotificationIntentEntity,
        { claimToken, id: intentId, status: 'pending' },
        { lockMode: LockMode.PESSIMISTIC_WRITE },
      );
      if (!intent) {
        return false;
      }
      intent.status = 'reconciliation_required';
      intent.lastErrorCode = errorCode.slice(0, 80);
      intent.updatedAt = now;
      resetClaim(intent);
      await em.flush();
      return true;
    });
  }
}
