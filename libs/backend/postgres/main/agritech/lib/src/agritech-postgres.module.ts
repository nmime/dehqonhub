import { MikroOrmModule } from '@mikro-orm/nestjs';
import { Global, Module } from '@nestjs/common';
import { FarmerRepositoryInjectToken } from '@app/backend-feature-farmer-shared';
import { ProductRepositoryInjectToken } from '@app/backend-feature-product-shared';
import { OrderRepositoryInjectToken } from '@app/backend-feature-order-shared';
import { AgriTechOperationsRepositoryInjectToken } from '@app/backend-feature-agritech-shared';
import { MarketplaceRepositoryInjectToken } from '@app/backend-feature-agritech-shared';
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
  AiConsultationEntitySchema,
  BuyerRequestEntitySchema,
  CartEntitySchema,
  ContractEntitySchema,
  FavoriteEntitySchema,
  RequestOfferEntitySchema,
  ReviewEntitySchema,
  SampleRequestEntitySchema,
  VerificationEntitySchema,
} from './entities';
import {
  PostgresAgriTechOperationsRepository,
  PostgresFarmerRepository,
  PostgresMarketplaceRepository,
  PostgresPaymentRepository,
  PostgresOrderRepository,
  PostgresProductRepository,
} from './repositories';

const repositoryProviders = [
  PostgresFarmerRepository,
  PostgresProductRepository,
  PostgresOrderRepository,
  PostgresAgriTechOperationsRepository,
  PostgresMarketplaceRepository,
  PostgresPaymentRepository,
  { provide: FarmerRepositoryInjectToken, useExisting: PostgresFarmerRepository },
  { provide: ProductRepositoryInjectToken, useExisting: PostgresProductRepository },
  { provide: OrderRepositoryInjectToken, useExisting: PostgresOrderRepository },
  { provide: AgriTechOperationsRepositoryInjectToken, useExisting: PostgresAgriTechOperationsRepository },
  { provide: MarketplaceRepositoryInjectToken, useExisting: PostgresMarketplaceRepository },
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
      VerificationEntitySchema,
      CartEntitySchema,
      SampleRequestEntitySchema,
      FavoriteEntitySchema,
      ReviewEntitySchema,
      BuyerRequestEntitySchema,
      RequestOfferEntitySchema,
      ContractEntitySchema,
      AiConsultationEntitySchema,
    ]),
  ],
  providers: repositoryProviders,
  exports: repositoryProviders,
})
export class AgriTechPostgresModule {}
