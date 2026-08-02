export const PaymentProviders = ['click', 'payme'] as const;
export type PaymentProvider = (typeof PaymentProviders)[number];

export interface CreatePaymentDto {
  orderId: string;
  provider: PaymentProvider;
  returnUrl: string;
}
