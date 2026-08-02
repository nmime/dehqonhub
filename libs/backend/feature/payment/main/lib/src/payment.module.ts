import { Module } from '@nestjs/common';
import { CreatePaymentUseCase } from './application/payment.use-cases';
import { PaymentController } from './interfaces/http/payment.controller';

@Module({ controllers: [PaymentController], providers: [CreatePaymentUseCase] })
export class PaymentModule {}
