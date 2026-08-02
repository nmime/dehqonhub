import { Module } from '@nestjs/common';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { BaseHealthController, HealthPrivateNetworkIpGuard } from '@app/backend-common-health';
import { UserMainModule } from '@app/backend-feature-user-main';
import { FarmerMainModule } from '@app/backend-feature-farmer-main';
import { ProductMainModule } from '@app/backend-feature-product-main';
import { OrderMainModule } from '@app/backend-feature-order-main';
import { AgriTechPostgresModule } from '@app/backend-postgres-main-agritech';
import { PaymentModule } from '@app/backend-feature-payment';
import { UserAppHealthServiceProvider } from './health.config';
import { UserAppApiCapabilitiesModule } from './capabilities.generated';
import { UserDatabaseSessionAccessGuard } from './user-database-session-access.guard';

@Module({
  imports: [UserMainModule, FarmerMainModule, ProductMainModule, OrderMainModule, AgriTechPostgresModule, PaymentModule, UserAppApiCapabilitiesModule],
  controllers: [BaseHealthController],
  providers: [
    UserAppHealthServiceProvider,
    HealthPrivateNetworkIpGuard,
    Reflector,
    UserDatabaseSessionAccessGuard,
    { provide: APP_GUARD, useExisting: UserDatabaseSessionAccessGuard },
  ],
})
export class UserAppApiModule {}
