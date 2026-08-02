// @requirements REQ-AGRITECH-PAYMENT-004
import { describe, expect, it } from 'vitest';
import { CreatePaymentUseCase, PaymentProviderUnavailableException } from './payment.use-cases';

describe('CreatePaymentUseCase', () => {
  it('fails closed without verified merchant configuration', () => {
    expect(() =>
      new CreatePaymentUseCase().execute({
        orderId: 'order-1',
        provider: 'payme',
        returnUrl: 'https://example.test/orders',
      }),
    ).toThrow(PaymentProviderUnavailableException);
  });
});
