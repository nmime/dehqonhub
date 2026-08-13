import { Module } from '@nestjs/common';
import { AgriTechCoreModule } from '@app/backend-feature-agritech-main';
import { AgriTechAdminController } from './agritech-admin.controller';
import { MarketplaceContractNotificationAdminController } from './marketplace-contract-notification-admin.controller';
import { MarketplaceContractLifecycleAdminController } from './marketplace-contract-lifecycle-admin.controller';
import { MarketplaceEngagementAdminController } from './marketplace-engagement-admin.controller';

@Module({
  imports: [AgriTechCoreModule],
  controllers: [
    AgriTechAdminController,
    MarketplaceContractLifecycleAdminController,
    MarketplaceContractNotificationAdminController,
    MarketplaceEngagementAdminController,
  ],
})
export class AgriTechAdminModule {}
