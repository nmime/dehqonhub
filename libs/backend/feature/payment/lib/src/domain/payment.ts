export type PaymentProvider = 'click' | 'payme';
export type PaymentStatus = 'pending' | 'authorized' | 'captured' | 'failed' | 'refunded';

export interface PaymentIntent {
  id: string;
  orderId: string;
  amountUzs: number;
  provider: PaymentProvider;
  status: PaymentStatus;
  redirectUrl?: string;
  payload?: Record<string, unknown>;
  createdAt: Date;
}

export interface CreatePaymentDto {
  orderId: string;
  amountUzs: number;
  provider: PaymentProvider;
  successUrl: string;
  failUrl: string;
}

// Click API integration
export const CLICK_API = {
  base: 'https://api.click.uz',
  createPayment: async (dto: CreatePaymentDto): Promise<{ redirectUrl: string; clickOrderId: string }> => {
    // TODO: Real Click API integration
    // POST /rest/payment/en/ with merchant_id, amount, order_id, etc.
    return {
      redirectUrl: `https://checkout.click.uz/pay?order_id=${dto.orderId}`,
      clickOrderId: crypto.randomUUID(),
    };
  },
  callback: async (data: Record<string, unknown>): Promise<void> => {
    // Handle Click callback to verify payment
    console.log('[Click] Payment callback:', data);
  },
};

// Payme API integration
export const PAYME_API = {
  base: 'https://api.payme.uz',
  createPayment: async (dto: CreatePaymentDto): Promise<{ redirectUrl: string }> => {
    // TODO: Real Payme API integration
    // POST /v2/payments with amount, currency, description, etc.
    return {
      redirectUrl: `https://pay.me/api/v2/payments/${crypto.randomUUID()}/authorize`,
    };
  },
  callback: async (data: Record<string, unknown>): Promise<void> => {
    // Handle Payme callback
    console.log('[Payme] Payment callback:', data);
  },
};
