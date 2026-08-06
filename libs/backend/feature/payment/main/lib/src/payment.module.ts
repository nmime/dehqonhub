import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import {
  CreatePaymentUseCase,
  PaymentCallbackService,
  PaymentConfigurationService,
} from './application/payment.use-cases';
import { PaymentController } from './interfaces/http/payment.controller';

@Module({
  imports: [ConfigModule],
  controllers: [PaymentController],
  providers: [CreatePaymentUseCase, PaymentCallbackService, PaymentConfigurationService],
  exports: [PaymentConfigurationService],
})
export class PaymentModule {}
