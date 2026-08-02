import { Module } from '@nestjs/common';
import { CreateFarmerUseCase, GetFarmerProfileUseCase, ListFarmersUseCase } from '@app/backend-feature-farmer-shared';
import { FarmerController } from './interfaces/http';

@Module({
  controllers: [FarmerController],
  providers: [CreateFarmerUseCase, GetFarmerProfileUseCase, ListFarmersUseCase],
})
export class FarmerMainModule {}
