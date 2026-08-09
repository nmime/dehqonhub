import { Module } from '@nestjs/common';
import { AgriTechOperationsController } from './agritech.controller';
import { AgriTechNotificationPublisher } from './agritech-notification.publisher';
import { AgriTechOperationsService } from './agritech.service';
import { MarketplaceController } from './marketplace.controller';
import { MarketplaceService } from './marketplace.service';

@Module({
  providers: [AgriTechNotificationPublisher, AgriTechOperationsService, MarketplaceService],
  exports: [AgriTechOperationsService, MarketplaceService],
})
export class AgriTechCoreModule {}

@Module({
  imports: [AgriTechCoreModule],
  controllers: [AgriTechOperationsController, MarketplaceController],
  exports: [AgriTechCoreModule],
})
export class AgriTechMainModule {}
