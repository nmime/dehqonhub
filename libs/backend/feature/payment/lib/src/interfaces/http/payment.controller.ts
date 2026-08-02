import { Controller, Post, Body } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { CreatePaymentUseCase, HandlePaymentCallbackUseCase } from '@app/backend-feature-payment';

@ApiTags('payments')
@Controller('api/v1/payments')
export class PaymentController {
  constructor(
    private readonly createPayment: CreatePaymentUseCase,
    private readonly handleCallback: HandlePaymentCallbackUseCase,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create payment intent for an order' })
  async create(@Body() dto: { orderId: string; amountUzs: number; provider: 'click' | 'payme'; successUrl: string; failUrl: string }) {
    return this.createPayment.execute(dto);
  }

  @Post('callback/click')
  @ApiOperation({ summary: 'Click payment callback' })
  async clickCallback(@Body() data: Record<string, unknown>) {
    await this.handleCallback.execute('click', data);
    return { received: true };
  }

  @Post('callback/payme')
  @ApiOperation({ summary: 'Payme payment callback' })
  async paymeCallback(@Body() data: Record<string, unknown>) {
    await this.handleCallback.execute('payme', data);
    return { received: true };
  }
}
