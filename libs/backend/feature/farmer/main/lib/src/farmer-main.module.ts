import { Module } from '@nestjs/common';
import { CreateFarmerUseCase, GetFarmerProfileUseCase, UpdateFarmerUseCase } from '@app/backend-feature-farmer-shared';
import { FarmerController } from './interfaces/http';

@Module({
  controllers: [FarmerController],
  providers: [CreateFarmerUseCase, GetFarmerProfileUseCase, UpdateFarmerUseCase],
})
export class FarmerMainModule {}
