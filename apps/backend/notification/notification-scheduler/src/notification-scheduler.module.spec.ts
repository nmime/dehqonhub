// @requirements REQ-NOTIFY-LIFECYCLE-002 REQ-AGRITECH-NOTIFICATION-022
import { describe, it, expect } from 'vitest';
import { ScheduleModule } from '@nestjs/schedule';
import { NotificationSchedulerCapabilitiesModule } from './capabilities.generated';
import { NotificationSchedulerModule } from './notification-scheduler.module';
import { MarketplaceContractNotificationDeliveryModule } from '@app/backend-feature-agritech-main';
import {
  createMarketplaceContractNotificationProvider,
  resolveMarketplaceProviderConfig,
} from '@app/backend-feature-agritech-main';

describe('NotificationSchedulerModule', () => {
  it('owns the cron runtime and composes only selected notification capabilities', () => {
    expect(NotificationSchedulerModule).toBeDefined();
    const imports = Reflect.getMetadata('imports', NotificationSchedulerModule) as Array<{
      module?: unknown;
    } | null>;
    expect(imports).toContain(NotificationSchedulerCapabilitiesModule);
    expect(imports.some((entry) => entry?.module === ScheduleModule)).toBe(true);

    const capabilities = Reflect.getMetadata('imports', NotificationSchedulerCapabilitiesModule) as Array<{
      name?: string;
    }>;
    const capabilityNames = capabilities.map((module) => module.name);
    const hasAgriTechPersistence = capabilityNames.includes('AgriTechPostgresModule');
    expect(capabilityNames.includes(MarketplaceContractNotificationDeliveryModule.name)).toBe(hasAgriTechPersistence);
  });

  it('fails scheduler startup configuration before a production mock can be constructed', () => {
    expect(() =>
      resolveMarketplaceProviderConfig({
        MARKETPLACE_NOTIFICATION_PROVIDER_MODE: 'mock',
        NODE_ENV: 'production',
      }),
    ).toThrow('MARKETPLACE_NOTIFICATION_PROVIDER_MODE=mock');
    const disabled = resolveMarketplaceProviderConfig({ NODE_ENV: 'production' });
    expect(createMarketplaceContractNotificationProvider(disabled)).toMatchObject({
      mode: 'disabled',
      name: 'disabled-notification-delivery',
    });
  });
});
