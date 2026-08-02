import { MikroOrmModule } from '@mikro-orm/nestjs';
import { Global, Module } from '@nestjs/common';
import { FarmerRepositoryInjectToken } from '@app/backend-feature-farmer-shared';
import { ProductRepositoryInjectToken } from '@app/backend-feature-product-shared';
import { OrderRepositoryInjectToken } from '@app/backend-feature-order-shared';
import { FarmerEntitySchema, OrderEntitySchema, ProductEntitySchema } from './entities';
import { PostgresFarmerRepository, PostgresOrderRepository, PostgresProductRepository } from './repositories';

const repositoryProviders = [
  PostgresFarmerRepository,
  PostgresProductRepository,
  PostgresOrderRepository,
  { provide: FarmerRepositoryInjectToken, useExisting: PostgresFarmerRepository },
  { provide: ProductRepositoryInjectToken, useExisting: PostgresProductRepository },
  { provide: OrderRepositoryInjectToken, useExisting: PostgresOrderRepository },
];

@Global()
@Module({
  imports: [MikroOrmModule.forFeature([FarmerEntitySchema, ProductEntitySchema, OrderEntitySchema])],
  providers: repositoryProviders,
  exports: repositoryProviders,
})
export class AgriTechPostgresModule {}
