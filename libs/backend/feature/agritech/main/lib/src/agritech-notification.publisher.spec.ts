// @requirements REQ-AGRITECH-TELEGRAM-005
import { describe, expect, it, vi } from 'vitest';
import { NotificationDeliveryProvider, NotificationTargetType } from '@app/common-notifications';
import type { NotificationService } from '@app/backend-feature-notification-shared';
import { AgriTechNotificationPublisher } from './agritech-notification.publisher';

describe('AgriTech notification publisher', () => {
  it('persists a localized Telegram intent for the linked partner owner', async () => {
    const notifications = {
      upsertTemplate: vi.fn().mockResolvedValue({}),
      createTemplateNotification: vi.fn().mockResolvedValue({}),
    } as unknown as NotificationService;
    const publisher = new AgriTechNotificationPublisher(notifications);

    await publisher.partnerStatus({
      id: 'partner-1',
      tenantId: 'tenant-1',
      ownerUserId: 'user-1',
      kind: 'supplier',
      legalName: 'Fermer Servis',
      taxId: '123456789',
      phone: '+998901234567',
      region: 'Fergana',
      status: 'approved',
      createdAt: new Date('2026-08-02T00:00:00Z'),
      updatedAt: new Date('2026-08-02T00:00:00Z'),
    });

    expect(notifications.upsertTemplate).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'agritech.partner-status',
        channels: [
          expect.objectContaining({
            content: expect.objectContaining({
              body: expect.objectContaining({ en: expect.any(String), ru: expect.any(String), uz: expect.any(String) }),
            }),
          }),
        ],
      }),
    );
    expect(notifications.createTemplateNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        targetType: NotificationTargetType.User,
        targetId: 'user-1',
        deliveries: [expect.objectContaining({ provider: NotificationDeliveryProvider.TelegramBot })],
      }),
    );
  });

  it('does not fail standalone feature tests when notifications are not selected', async () => {
    await expect(new AgriTechNotificationPublisher().produceReserved('order-1', 'user-1')).resolves.toBeUndefined();
  });

  it('publishes every localized operational event and skips unassigned deliveries', async () => {
    const notifications = {
      upsertTemplate: vi.fn().mockResolvedValue({}),
      createTemplateNotification: vi.fn().mockResolvedValue({}),
    } as unknown as NotificationService;
    const publisher = new AgriTechNotificationPublisher(notifications);
    const now = new Date('2026-08-02T00:00:00Z');

    await publisher.farmerAssigned(
      {
        id: 'farmer-1',
        userId: 'farmer-user-1',
        firstName: 'Ali',
        lastName: '',
        phone: '+998901234567',
        region: 'Fergana',
        crops: ['cotton'],
        status: 'active',
      },
      'agent-1',
    );
    await publisher.advisoryPublished(
      {
        id: 'advisory-1',
        tenantId: 'tenant-1',
        farmerId: 'farmer-1',
        kind: 'weather',
        source: 'hydromet',
        summary: 'Rain expected',
        observedAt: now,
        expiresAt: new Date('2026-08-03T00:00:00Z'),
        createdAt: now,
        stale: false,
      },
      'farmer-user-1',
    );
    await publisher.deliveryScheduled({
      id: 'delivery-1',
      tenantId: 'tenant-1',
      orderId: 'order-1',
      agentUserId: 'agent-1',
      status: 'scheduled',
      scheduledAt: now,
      history: [],
      createdAt: now,
      updatedAt: now,
    });
    await publisher.produceReserved('order-1', 'buyer-1');
    await publisher.deliveryScheduled({
      id: 'delivery-unassigned',
      tenantId: 'tenant-1',
      orderId: 'order-2',
      status: 'scheduled',
      scheduledAt: now,
      history: [],
      createdAt: now,
      updatedAt: now,
    });

    expect(notifications.upsertTemplate).toHaveBeenCalledTimes(4);
    expect(notifications.createTemplateNotification).toHaveBeenCalledTimes(4);
    expect(notifications.createTemplateNotification).toHaveBeenCalledWith(
      expect.objectContaining({ targetId: 'agent-1', data: { farmerName: 'Ali' } }),
    );
  });
});
