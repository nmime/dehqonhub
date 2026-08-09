import { Injectable, Optional } from '@nestjs/common';
import {
  NotificationChannel,
  NotificationDeliveryProvider,
  NotificationTargetType,
  type NotificationData,
  type NotificationTemplateChannelContent,
} from '@app/common-notifications';
import { NotificationService } from '@app/backend-feature-notification-shared';
import type { Advisory, AssignedFarmer, Delivery, Partner } from '@app/backend-feature-agritech-shared';

type AgriTechTemplateCode =
  | 'agritech.partner-status'
  | 'agritech.farmer-assigned'
  | 'agritech.advisory-published'
  | 'agritech.delivery-scheduled'
  | 'agritech.produce-reserved';

const botRoute = {
  channel: NotificationChannel.Bot,
  provider: NotificationDeliveryProvider.TelegramBot,
} as const;

const templates: Record<AgriTechTemplateCode, NotificationTemplateChannelContent> = {
  'agritech.partner-status': {
    body: {
      en: '{legalName}: partner status changed to {status}.',
      ru: '{legalName}: статус партнера изменен на {status}.',
      uz: '{legalName}: hamkor holati {status} holatiga o\u2018zgartirildi.',
    },
  },
  'agritech.farmer-assigned': {
    body: {
      en: 'Farmer {farmerName} was assigned to you for field support.',
      ru: 'Фермер {farmerName} назначен вам для полевого сопровождения.',
      uz: 'Fermer {farmerName} dala yordami uchun sizga biriktirildi.',
    },
  },
  'agritech.advisory-published': {
    body: {
      en: '{kind} advisory: {summary}. Source: {source}.',
      ru: 'Рекомендация ({kind}): {summary}. Источник: {source}.',
      uz: '{kind} tavsiyasi: {summary}. Manba: {source}.',
    },
  },
  'agritech.delivery-scheduled': {
    body: {
      en: 'Delivery {deliveryId} is scheduled for {scheduledAt}.',
      ru: 'Доставка {deliveryId} запланирована на {scheduledAt}.',
      uz: '{deliveryId} yetkazib berish {scheduledAt} vaqtiga rejalashtirildi.',
    },
  },
  'agritech.produce-reserved': {
    body: {
      en: 'Produce reservation order {orderId} was created successfully.',
      ru: 'Заказ {orderId} на партию продукции успешно создан.',
      uz: 'Mahsulotni band qilish uchun {orderId} buyurtmasi muvaffaqiyatli yaratildi.',
    },
  },
};

/** Creates durable, localized notification intents for AgriTech state changes. */
@Injectable()
export class AgriTechNotificationPublisher {
  constructor(@Optional() private readonly notifications?: NotificationService) {}

  partnerStatus(partner: Partner): Promise<void> {
    return this.publish(partner.ownerUserId, 'agritech.partner-status', {
      legalName: partner.legalName,
      status: partner.status,
    });
  }

  farmerAssigned(farmer: AssignedFarmer, agentUserId: string): Promise<void> {
    return this.publish(agentUserId, 'agritech.farmer-assigned', {
      farmerName: `${farmer.firstName} ${farmer.lastName}`.trim(),
    });
  }

  advisoryPublished(advisory: Advisory, farmerUserId: string): Promise<void> {
    return this.publish(farmerUserId, 'agritech.advisory-published', {
      kind: advisory.kind,
      summary: advisory.summary,
      source: advisory.source,
    });
  }

  deliveryScheduled(delivery: Delivery): Promise<void> {
    if (!delivery.agentUserId) {
      return Promise.resolve();
    }
    return this.publish(delivery.agentUserId, 'agritech.delivery-scheduled', {
      deliveryId: delivery.id,
      scheduledAt: delivery.scheduledAt.toISOString(),
    });
  }

  produceReserved(orderId: string, buyerUserId: string): Promise<void> {
    return this.publish(buyerUserId, 'agritech.produce-reserved', { orderId });
  }

  private async publish(targetId: string, templateCode: AgriTechTemplateCode, data: NotificationData): Promise<void> {
    // Notification is an explicitly selectable capability. Keeping this adapter
    // optional lets the feature library remain independently testable.
    if (!this.notifications) {
      return;
    }

    await this.notifications.upsertTemplate({
      code: templateCode,
      description: `AgriTech event notification: ${templateCode}.`,
      channels: [
        { channel: NotificationChannel.Bot, content: templates[templateCode] },
        { channel: NotificationChannel.InApp, content: templates[templateCode] },
      ],
    });
    await this.notifications.createTemplateNotification({
      targetType: NotificationTargetType.User,
      targetId,
      templateCode,
      deliveries: [botRoute],
      inAppVisible: true,
      data,
    });
  }
}
