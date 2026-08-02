import { Module } from '@nestjs/common';
import { AgriTechOperationsController } from './agritech.controller';
import { AgriTechNotificationPublisher } from './agritech-notification.publisher';
import { AgriTechOperationsService } from './agritech.service';

@Module({
  providers: [AgriTechNotificationPublisher, AgriTechOperationsService],
  exports: [AgriTechOperationsService],
})
export class AgriTechCoreModule {}

@Module({
  imports: [AgriTechCoreModule],
  controllers: [AgriTechOperationsController],
  exports: [AgriTechCoreModule],
})
export class AgriTechMainModule {}
