import { MikroOrmModule } from '@mikro-orm/nestjs';
import { Module } from '@nestjs/common';
import { FarmerEntitySchema, ProductEntitySchema, OrderEntitySchema } from './entities';
import { PostgresFarmerRepository, PostgresProductRepository, PostgresOrderRepository, PostgresProductQueryService } from './repositories';
import {
  FarmerRepositoryInjectToken,
  ProductRepositoryInjectToken,
  OrderRepositoryInjectToken,
  ProductQueryServiceInjectToken,
} from '@app/backend-feature-farmer-shared';

@Module({
  imports: [
    MikroOrmModule.forFeature([
      FarmerEntitySchema,
      ProductEntitySchema,
      OrderEntitySchema,
    ]),
  ],
  providers: [
    PostgresFarmerRepository,
    PostgresProductRepository,
    PostgresOrderRepository,
    PostgresProductQueryService,
    { provide: FarmerRepositoryInjectToken, useExisting: PostgresFarmerRepository },
    { provide: ProductRepositoryInjectToken, useExisting: PostgresProductRepository },
    { provide: OrderRepositoryInjectToken, useExisting: PostgresOrderRepository },
    { provide: ProductQueryServiceInjectToken, useExisting: PostgresProductQueryService },
  ],
  exports: [
    MikroOrmModule,
    PostgresFarmerRepository,
    PostgresProductRepository,
    PostgresOrderRepository,
    PostgresProductQueryService,
    FarmerRepositoryInjectToken,
    ProductRepositoryInjectToken,
    OrderRepositoryInjectToken,
    ProductQueryServiceInjectToken,
  ],
})
export class AgriTechPostgresModule {}
