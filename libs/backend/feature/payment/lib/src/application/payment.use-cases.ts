import { Injectable } from '@nestjs/common';
import { PaymentIntent, CreatePaymentDto, CLICK_API, PAYME_API } from '../domain/payment';

@Injectable()
export class CreatePaymentUseCase {
  async execute(dto: CreatePaymentDto): Promise<PaymentIntent & { redirectUrl: string }> {
    let redirectUrl: string;
    let payload: Record<string, unknown> = {};

    if (dto.provider === 'click') {
      const result = await CLICK_API.createPayment(dto);
      redirectUrl = result.redirectUrl;
      payload = { clickOrderId: result.clickOrderId };
    } else {
      const result = await PAYME_API.createPayment(dto);
      redirectUrl = result.redirectUrl;
    }

    const id = crypto.randomUUID();
    const intent: PaymentIntent = {
      id, orderId: dto.orderId, amountUzs: dto.amountUzs,
      provider: dto.provider, status: 'pending',
      redirectUrl, payload, createdAt: new Date(),
    };

    // TODO: Persist to database
    return { ...intent, redirectUrl };
  }
}

@Injectable()
export class HandlePaymentCallbackUseCase {
  async execute(provider: 'click' | 'payme', data: Record<string, unknown>): Promise<void> {
    if (provider === 'click') {
      await CLICK_API.callback(data);
    } else {
      await PAYME_API.callback(data);
    }
    // TODO: Update order status based on callback data
  }
}
