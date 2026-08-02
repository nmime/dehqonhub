import { Body, Controller, Post } from '@nestjs/common';
import { ApiProperty, ApiTags } from '@nestjs/swagger';
import { IsIn, IsString, IsUrl } from 'class-validator';
import { ApiExceptions, ApiSessionCookieAuth } from '@app/backend-common-swagger';
import { CreatePaymentUseCase } from '../../application/payment.use-cases';
import { PaymentProviders, type PaymentProvider } from '../../domain/payment';

class CreatePaymentDto {
  @ApiProperty({ format: 'uuid' }) @IsString() orderId!: string;
  @ApiProperty({ enum: PaymentProviders }) @IsIn(PaymentProviders) provider!: PaymentProvider;
  @ApiProperty({ format: 'uri' }) @IsUrl({ protocols: ['https'], require_protocol: true }) returnUrl!: string;
}

@ApiTags('agritech-payments')
@ApiExceptions(400, 401, 503)
@ApiSessionCookieAuth()
@Controller('agritech/payments')
export class PaymentController {
  constructor(private readonly createPayment: CreatePaymentUseCase) {}

  @Post()
  create(@Body() input: CreatePaymentDto): never {
    return this.createPayment.execute(input);
  }
}
