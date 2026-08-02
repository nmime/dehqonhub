import { Module } from '@nestjs/common';
import { CreatePaymentUseCase, HandlePaymentCallbackUseCase } from './application/payment.use-cases';
import { PaymentController } from './interfaces/http/payment.controller';

@Module({
  controllers: [PaymentController],
  providers: [CreatePaymentUseCase, HandlePaymentCallbackUseCase],
})
export class PaymentModule {}
