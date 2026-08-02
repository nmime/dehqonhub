import { MikroOrmModule } from '@mikro-orm/nestjs';
import { Global, Module } from '@nestjs/common';
import { FarmerRepositoryInjectToken } from '@app/backend-feature-farmer-shared';
import { ProductRepositoryInjectToken } from '@app/backend-feature-product-shared';
import { OrderRepositoryInjectToken } from '@app/backend-feature-order-shared';
import { AgriTechOperationsRepositoryInjectToken } from '@app/backend-feature-agritech-shared';
import { PaymentRepositoryInjectToken } from '@app/backend-feature-payment-shared';
import {
  AdvisoryEntitySchema,
  AgriTechPartnerEntitySchema,
  DeliveryEntitySchema,
  FarmerEntitySchema,
  FieldVisitEntitySchema,
  IntegrationStateEntitySchema,
  OrderEntitySchema,
  PaymentTransactionEntitySchema,
  PilotCohortEntitySchema,
  ProduceListingEntitySchema,
  ProductEntitySchema,
} from './entities';
import {
  PostgresAgriTechOperationsRepository,
  PostgresFarmerRepository,
  PostgresPaymentRepository,
  PostgresOrderRepository,
  PostgresProductRepository,
} from './repositories';

const repositoryProviders = [
  PostgresFarmerRepository,
  PostgresProductRepository,
  PostgresOrderRepository,
  PostgresAgriTechOperationsRepository,
  PostgresPaymentRepository,
  { provide: FarmerRepositoryInjectToken, useExisting: PostgresFarmerRepository },
  { provide: ProductRepositoryInjectToken, useExisting: PostgresProductRepository },
  { provide: OrderRepositoryInjectToken, useExisting: PostgresOrderRepository },
  { provide: AgriTechOperationsRepositoryInjectToken, useExisting: PostgresAgriTechOperationsRepository },
  { provide: PaymentRepositoryInjectToken, useExisting: PostgresPaymentRepository },
];

@Global()
@Module({
  imports: [
    MikroOrmModule.forFeature([
      FarmerEntitySchema,
      ProductEntitySchema,
      OrderEntitySchema,
      AgriTechPartnerEntitySchema,
      ProduceListingEntitySchema,
      DeliveryEntitySchema,
      FieldVisitEntitySchema,
      AdvisoryEntitySchema,
      PilotCohortEntitySchema,
      IntegrationStateEntitySchema,
      PaymentTransactionEntitySchema,
    ]),
  ],
  providers: repositoryProviders,
  exports: repositoryProviders,
})
export class AgriTechPostgresModule {}
