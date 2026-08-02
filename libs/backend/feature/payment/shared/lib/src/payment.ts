export const PaymentProviders = ['click', 'payme', 'bnpl'] as const;
export type PaymentProvider = (typeof PaymentProviders)[number];
export type PaymentState = 'created' | 'pending' | 'paid' | 'cancelled' | 'failed' | 'refunded';

export interface PaymentOwner {
  tenantId: string;
  userId: string;
}

export interface CreatePaymentDto {
  orderId: string;
  provider: PaymentProvider;
  returnUrl: string;
  idempotencyKey: string;
  locale: 'en' | 'ru' | 'uz';
}

export interface PaymentTransaction {
  id: string;
  tenantId: string;
  orderId: string;
  userId: string;
  provider: PaymentProvider;
  idempotencyKey: string;
  amountUzs: number;
  state: PaymentState;
  providerTransactionId?: string;
  providerCreatedAt?: Date;
  reason?: number;
  createdAt: Date;
  updatedAt: Date;
}

export type PaymentRepositoryResult =
  | { status: 'ok'; transaction: PaymentTransaction }
  | { status: 'not_found' | 'amount_mismatch' | 'invalid_state' | 'conflict' | 'forbidden' };

export const PaymentRepositoryInjectToken = Symbol('PaymentRepositoryInjectToken');

export interface PaymentRepository {
  createIntent(owner: PaymentOwner, input: CreatePaymentDto): Promise<PaymentRepositoryResult>;
  checkOrder(tenantId: string, orderId: string, amountUzs: number): Promise<PaymentRepositoryResult>;
  createProviderTransaction(input: {
    tenantId: string;
    provider: PaymentProvider;
    providerTransactionId: string;
    orderId: string;
    amountUzs: number;
    providerCreatedAt: Date;
  }): Promise<PaymentRepositoryResult>;
  performProviderTransaction(
    tenantId: string,
    provider: PaymentProvider,
    providerTransactionId: string,
  ): Promise<PaymentRepositoryResult>;
  cancelProviderTransaction(
    tenantId: string,
    provider: PaymentProvider,
    providerTransactionId: string,
    reason: number,
  ): Promise<PaymentRepositoryResult>;
  findProviderTransaction(
    tenantId: string,
    provider: PaymentProvider,
    providerTransactionId: string,
  ): Promise<PaymentRepositoryResult>;
  listProviderTransactions(
    tenantId: string,
    provider: PaymentProvider,
    from: Date,
    to: Date,
  ): Promise<PaymentTransaction[]>;
}
