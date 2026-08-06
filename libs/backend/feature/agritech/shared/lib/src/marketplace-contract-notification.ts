// @requirements REQ-AGRITECH-INTEGRATION-013 REQ-AGRITECH-STAGE2-017 REQ-AGRITECH-NOTIFICATION-022
import type { AgriTechOwner } from './agritech.types';
import type { MarketplaceContractParty } from './marketplace-contract-lifecycle';
import type { MarketplaceProviderSafeReceipt } from './marketplace-provider-operation';
import { defaultLocale, type Locale } from '@app/common-i18n-runtime';

export const MarketplaceContractNotificationRepositoryInjectToken = Symbol(
  'MarketplaceContractNotificationRepositoryInjectToken',
);
export const MarketplaceContractNotificationProviderInjectToken = Symbol(
  'MarketplaceContractNotificationProviderInjectToken',
);

export const marketplaceNotificationUnclaimedClaimId = '00000000-0000-0000-0000-000000000000' as const;
export const marketplaceNotificationClaimLeaseMs = 60_000;
export const marketplaceNotificationMaxChannelAttempts = 5;
export const marketplaceNotificationMaxAttempts = marketplaceNotificationMaxChannelAttempts * 2;
export const marketplaceContractCriticalNotificationTemplateKeys = [
  'marketplace.contract.artifact.stored',
  'marketplace.contract.factoring.requested',
  'marketplace.contract.factoring.approved',
  'marketplace.contract.factoring.rejected',
  'marketplace.contract.dispute.opened',
  'marketplace.contract.dispute.resolved',
] as const;

export function isMarketplaceContractCriticalNotificationTemplate(templateKey: string): boolean {
  return (marketplaceContractCriticalNotificationTemplateKeys as readonly string[]).includes(templateKey);
}

export type MarketplaceContractNotificationStatus =
  'pending' | 'simulated' | 'delivered' | 'failed' | 'reconciliation_required';
export type MarketplaceContractNotificationLocale = Locale;
export const marketplaceContractNotificationDefaultLocale: MarketplaceContractNotificationLocale = defaultLocale;

export interface MarketplaceContractNotificationIntentView {
  attempts: number;
  channel: 'telegram' | 'sms';
  channelAttempts: number;
  contractId: string;
  createdAt: Date;
  dispatchedAt?: Date;
  id: string;
  lastAttemptAt?: Date;
  lastErrorCode?: string;
  nextAttemptAt: Date;
  providerMode: 'none' | 'mock' | 'live';
  providerName?: string;
  recipientLocale: MarketplaceContractNotificationLocale;
  recipientParty: MarketplaceContractParty;
  simulation: boolean;
  status: MarketplaceContractNotificationStatus;
  templateKey: string;
  timelineEventId: string;
  updatedAt: Date;
}

export interface MarketplaceContractNotificationClaim extends MarketplaceContractNotificationIntentView {
  claimToken: string;
}

export interface MarketplaceContractNotificationProviderIdentity {
  mode: 'disabled' | 'mock' | 'live';
  name: string;
}

export interface MarketplaceContractNotificationProviderResult {
  completedAt: Date;
  providerMode: 'mock' | 'live';
  providerName: string;
  providerReference: string;
  safeReceipt: MarketplaceProviderSafeReceipt;
  simulation: boolean;
}

export interface MarketplaceContractNotificationProvider extends MarketplaceContractNotificationProviderIdentity {
  deliver(input: {
    idempotencyKey: string;
    intent: MarketplaceContractNotificationIntentView;
    signal: AbortSignal;
  }): Promise<MarketplaceContractNotificationProviderResult>;
}

export interface MarketplaceContractNotificationRepository {
  beginAttempt(
    intentId: string,
    claimToken: string,
    provider: { mode: 'mock' | 'live'; name: string },
    now: Date,
  ): Promise<boolean>;
  claimPending(count: number, now: Date): Promise<MarketplaceContractNotificationClaim[]>;
  completeAttempt(
    intentId: string,
    claimToken: string,
    result: MarketplaceContractNotificationProviderResult,
  ): Promise<boolean>;
  listForAdmin(tenantId: string, limit?: number): Promise<MarketplaceContractNotificationIntentView[]>;
  listForRecipient(owner: AgriTechOwner, limit?: number): Promise<MarketplaceContractNotificationIntentView[]>;
  recordFailure(
    intentId: string,
    claimToken: string,
    errorCode: string,
    retryable: boolean,
    now: Date,
  ): Promise<boolean>;
  recordReconciliation(intentId: string, claimToken: string, errorCode: string, now: Date): Promise<boolean>;
}
