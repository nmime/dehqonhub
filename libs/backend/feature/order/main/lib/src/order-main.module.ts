import { Module } from '@nestjs/common';
import { CreateOrderUseCase, GetOrderUseCase, ListFarmerOrdersUseCase } from '@app/backend-feature-order-shared';
import { OrderController } from './interfaces/http';

@Module({
  controllers: [OrderController],
  providers: [CreateOrderUseCase, GetOrderUseCase, ListFarmerOrdersUseCase],
})
export class OrderMainModule {}
