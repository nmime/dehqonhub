import { Module } from '@nestjs/common';
import { AgriTechCoreModule } from '@app/backend-feature-agritech-main';
import { AgriTechAdminController } from './agritech-admin.controller';

@Module({ imports: [AgriTechCoreModule], controllers: [AgriTechAdminController] })
export class AgriTechAdminModule {}
