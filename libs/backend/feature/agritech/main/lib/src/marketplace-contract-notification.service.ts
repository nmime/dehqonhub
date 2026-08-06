// @requirements REQ-AGRITECH-INTEGRATION-013 REQ-AGRITECH-STAGE2-017 REQ-AGRITECH-NOTIFICATION-022
import { Inject, Injectable } from '@nestjs/common';
import { normalizeLocale, translate, type TranslationKey } from '@app/backend-common-i18n';
import {
  MarketplaceContractNotificationRepositoryInjectToken,
  type AgriTechOwner,
  type MarketplaceContractNotificationIntentView,
  type MarketplaceContractNotificationLocale,
  type MarketplaceContractNotificationRepository,
} from '@app/backend-feature-agritech-shared';

const eventTranslationKeys = {
  'artifact.stored': 'marketplace.contract.notification.artifactStored',
  'signature.recorded': 'marketplace.contract.notification.signatureRecorded',
  'buyer.consented': 'marketplace.contract.notification.buyerConsented',
  'seller.consented': 'marketplace.contract.notification.sellerConsented',
  'buyer.payment.confirmed': 'marketplace.contract.notification.buyerPaymentConfirmed',
  'seller.receipt.confirmed': 'marketplace.contract.notification.sellerReceiptConfirmed',
  'factoring.requested': 'marketplace.contract.notification.factoringRequested',
  'factoring.approved': 'marketplace.contract.notification.factoringApproved',
  'factoring.rejected': 'marketplace.contract.notification.factoringRejected',
  'seller.paid': 'marketplace.contract.notification.sellerPaid',
  'buyer.repaid': 'marketplace.contract.notification.buyerRepaid',
  'factoring.closed': 'marketplace.contract.notification.factoringClosed',
  'fulfillment.ready': 'marketplace.contract.notification.fulfillmentReady',
  'fulfillment.started': 'marketplace.contract.notification.fulfillmentStarted',
  'fulfillment.delivered': 'marketplace.contract.notification.fulfillmentDelivered',
  'contract.completed': 'marketplace.contract.notification.contractCompleted',
  'dispute.opened': 'marketplace.contract.notification.disputeOpened',
  'dispute.resolved': 'marketplace.contract.notification.disputeResolved',
} as const satisfies Record<string, TranslationKey>;

const genericTranslationKey = 'marketplace.contract.notification.updated' satisfies TranslationKey;
type SafeNotificationEvent = keyof typeof eventTranslationKeys;

export interface MarketplaceContractNotificationAdminView extends Omit<
  MarketplaceContractNotificationIntentView,
  'channel'
> {
  deliveryChannel: MarketplaceContractNotificationIntentView['channel'];
  event: string;
  locale: MarketplaceContractNotificationLocale;
  message: string;
  surface: 'in-app';
}

export interface MarketplaceContractNotificationRecipientView {
  attempts: number;
  attemptedAt?: Date;
  contractId: string;
  contractPath: string;
  deliveryChannel: MarketplaceContractNotificationIntentView['channel'];
  event: string;
  id: string;
  locale: MarketplaceContractNotificationLocale;
  message: string;
  occurredAt: Date;
  recipientParty: MarketplaceContractNotificationIntentView['recipientParty'];
  simulation: boolean;
  status: MarketplaceContractNotificationIntentView['status'];
  surface: 'in-app';
}

export function renderMarketplaceContractNotification(
  templateKey: string,
  localeInput?: string | null,
): { locale: MarketplaceContractNotificationLocale; message: string } {
  const locale = normalizeLocale(localeInput) ?? 'en';
  const eventKey = templateKey.startsWith('marketplace.contract.')
    ? templateKey.slice('marketplace.contract.'.length)
    : '';
  const translationKey = Object.hasOwn(eventTranslationKeys, eventKey)
    ? eventTranslationKeys[eventKey as SafeNotificationEvent]
    : genericTranslationKey;
  return { locale, message: translate(translationKey, { locale }) };
}

function safeEvent(templateKey: string): string {
  const eventKey = templateKey.startsWith('marketplace.contract.')
    ? templateKey.slice('marketplace.contract.'.length)
    : '';
  return Object.hasOwn(eventTranslationKeys, eventKey) ? eventKey : 'contract.updated';
}

function renderAdmin(
  intent: MarketplaceContractNotificationIntentView,
  locale?: string | null,
): MarketplaceContractNotificationAdminView {
  const { channel, ...internal } = intent;
  return {
    ...internal,
    deliveryChannel: channel,
    event: safeEvent(intent.templateKey),
    ...renderMarketplaceContractNotification(intent.templateKey, locale),
    surface: 'in-app',
  };
}

function renderRecipient(
  intent: MarketplaceContractNotificationIntentView,
  locale?: string | null,
): MarketplaceContractNotificationRecipientView {
  return {
    attempts: intent.attempts,
    ...(intent.lastAttemptAt ? { attemptedAt: intent.lastAttemptAt } : {}),
    contractId: intent.contractId,
    contractPath: `/marketplace/contracts/${intent.contractId}`,
    deliveryChannel: intent.channel,
    event: safeEvent(intent.templateKey),
    id: intent.id,
    ...renderMarketplaceContractNotification(intent.templateKey, locale),
    occurredAt: intent.createdAt,
    recipientParty: intent.recipientParty,
    simulation: intent.simulation,
    status: intent.status,
    surface: 'in-app',
  };
}

@Injectable()
export class MarketplaceContractNotificationQueryService {
  constructor(
    @Inject(MarketplaceContractNotificationRepositoryInjectToken)
    private readonly repository: MarketplaceContractNotificationRepository,
  ) {}

  async listForRecipient(
    owner: AgriTechOwner,
    locale?: string | null,
  ): Promise<MarketplaceContractNotificationRecipientView[]> {
    return (await this.repository.listForRecipient(owner)).map((intent) => renderRecipient(intent, locale));
  }

  async listForAdmin(tenantId: string, locale?: string | null): Promise<MarketplaceContractNotificationAdminView[]> {
    return (await this.repository.listForAdmin(tenantId)).map((intent) => renderAdmin(intent, locale));
  }
}
