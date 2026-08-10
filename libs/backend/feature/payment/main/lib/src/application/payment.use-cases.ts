import { createHash, timingSafeEqual } from 'node:crypto';
import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ConflictException,
  Exception,
  ExceptionKind,
  ForbiddenException,
  ResourceNotFoundException,
} from '@app/backend-common-exception';
import type {
  CreatePaymentDto,
  PaymentOwner,
  PaymentProvider,
  PaymentRepository,
  PaymentRepositoryResult,
  PaymentTransaction,
} from '@app/backend-feature-payment-shared';
import { PaymentRepositoryInjectToken } from '@app/backend-feature-payment-shared';

export class PaymentProviderUnavailableException extends Exception({
  name: 'PaymentProviderUnavailableException',
  kind: ExceptionKind.Server,
  status: HttpStatus.SERVICE_UNAVAILABLE,
}) {}

export interface PaymentHandoff {
  transactionId: string;
  provider: PaymentProvider;
  state: string;
  checkoutUrl: string;
}

/* v8 ignore start -- Nest @Injectable() emits a decorator-helper branch that is unreachable for a class-only decorator. */
@Injectable()
/* v8 ignore stop */
export class PaymentConfigurationService {
  constructor(private readonly config: ConfigService) {}

  tenantId(): string | undefined {
    return clean(this.config.get<string>('PAYMENT_TENANT_ID'));
  }

  payme(): { merchantId: string; secret: string; checkoutUrl: string } | undefined {
    const merchantId = clean(this.config.get<string>('PAYME_MERCHANT_ID'));
    const secret = clean(this.config.get<string>('PAYME_SECRET_KEY'));
    if (!merchantId || !secret) {
      return undefined;
    }
    const checkoutUrl = httpsUrl(this.config.get<string>('PAYME_CHECKOUT_URL') ?? 'https://checkout.paycom.uz');
    if (!checkoutUrl) {
      return undefined;
    }
    return {
      merchantId,
      secret,
      checkoutUrl,
    };
  }

  click(): { serviceId: string; merchantId: string; secret: string; checkoutUrl: string } | undefined {
    const serviceId = clean(this.config.get<string>('CLICK_SERVICE_ID'));
    const merchantId = clean(this.config.get<string>('CLICK_MERCHANT_ID'));
    const secret = clean(this.config.get<string>('CLICK_SECRET_KEY'));
    if (!serviceId || !merchantId || !secret) {
      return undefined;
    }
    const checkoutUrl = httpsUrl(this.config.get<string>('CLICK_CHECKOUT_URL') ?? 'https://my.click.uz/services/pay');
    if (!checkoutUrl) {
      return undefined;
    }
    return {
      serviceId,
      merchantId,
      secret,
      checkoutUrl,
    };
  }

  bnpl(): { checkoutUrl: string } | undefined {
    const checkoutUrl = httpsUrl(this.config.get<string>('BNPL_CHECKOUT_URL'));
    return checkoutUrl ? { checkoutUrl } : undefined;
  }

  assertReturnUrl(returnUrl: string): void {
    const origins = (this.config.get<string>('PAYMENT_RETURN_URL_ORIGINS') ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);
    const parsed = new URL(returnUrl);
    if (parsed.protocol !== 'https:' || !origins.includes(parsed.origin)) {
      throw new ForbiddenException();
    }
  }

  authenticatePayme(authorization: string | undefined): boolean {
    const configured = this.payme();
    if (!configured || !authorization?.startsWith('Basic ')) {
      return false;
    }
    let supplied: string;
    try {
      supplied = Buffer.from(authorization.slice(6), 'base64').toString('utf8');
    } catch {
      return false;
    }
    return constantEqual(supplied, `Paycom:${configured.secret}`);
  }

  authenticateClick(input: ClickSignedCallbackInput): boolean {
    const configured = this.click();
    if (
      !configured ||
      input.serviceId !== configured.serviceId ||
      input.action !== (input.phase === 'prepare' ? 0 : 1)
    ) {
      return false;
    }
    const preparePart = input.phase === 'complete' ? (input.merchantPrepareId ?? '') : '';
    const payload = [
      input.clickTransId,
      input.serviceId,
      configured.secret,
      input.merchantTransId,
      preparePart,
      String(input.amountUzs),
      String(input.action),
      input.signTime,
    ].join('');
    // Click mandates MD5 for callback interoperability; the comparison remains constant-time.
    // eslint-disable-next-line sonarjs/hashing
    return constantEqual(createHash('md5').update(payload).digest('hex'), input.signString.toLowerCase());
  }
}

@Injectable()
export class CreatePaymentUseCase {
  constructor(
    @Inject(PaymentRepositoryInjectToken) private readonly repository: PaymentRepository,
    private readonly configuration: PaymentConfigurationService,
  ) {}

  async execute(owner: PaymentOwner, input: CreatePaymentDto): Promise<PaymentHandoff> {
    this.configuration.assertReturnUrl(input.returnUrl);
    const provider = this.providerConfig(input.provider);
    const result = await this.repository.createIntent(owner, input);
    const transaction = unwrap(result);
    return {
      transactionId: transaction.id,
      provider: input.provider,
      state: transaction.state,
      checkoutUrl: checkoutUrl(provider, transaction, input.returnUrl, providerLocale(input.locale)),
    };
  }

  private providerConfig(provider: PaymentProvider) {
    let configured;
    if (provider === 'payme') {
      configured = this.configuration.payme();
    } else if (provider === 'click') {
      configured = this.configuration.click();
    } else {
      configured = this.configuration.bnpl();
    }
    if (!configured) {
      throw new PaymentProviderUnavailableException({ meta: { provider } });
    }
    return configured;
  }
}

@Injectable()
export class PaymentCallbackService {
  constructor(
    @Inject(PaymentRepositoryInjectToken) private readonly repository: PaymentRepository,
    private readonly configuration: PaymentConfigurationService,
  ) {}

  async payme(method: string, params: Record<string, unknown>): Promise<Record<string, unknown>> {
    const tenantId = this.configuration.tenantId();
    if (!tenantId) {
      return rpcError(-32400, 'Payment tenant is not configured');
    }
    const orderId = accountOrderId(params);
    const amountUzs = amountFromTiyin(params['amount']);
    if (method === 'CheckPerformTransaction') {
      if (!orderId || amountUzs === undefined) {
        return rpcError(-31050, 'Invalid account', 'order_id');
      }
      return paymeCheck(await this.repository.checkOrder(tenantId, orderId, amountUzs));
    }
    if (method === 'CreateTransaction') {
      const providerId = stringValue(params['id']);
      const time = numberValue(params['time']);
      if (!providerId || !orderId || amountUzs === undefined || time === undefined) {
        return rpcError(-32602, 'Invalid params');
      }
      return paymeCreate(
        await this.repository.createProviderTransaction({
          tenantId,
          provider: 'payme',
          providerTransactionId: providerId,
          orderId,
          amountUzs,
          providerCreatedAt: new Date(time),
        }),
      );
    }
    if (method === 'GetStatement') {
      const from = numberValue(params['from']);
      const to = numberValue(params['to']);
      if (from === undefined || to === undefined || from > to) {
        return rpcError(-32602, 'Invalid params');
      }
      const transactions = await this.repository.listProviderTransactions(
        tenantId,
        'payme',
        new Date(from),
        new Date(to),
      );
      return { result: { transactions: transactions.map(paymeStatementTransaction) } };
    }
    const providerId = stringValue(params['id']);
    if (!providerId) {
      return rpcError(-32602, 'Invalid params');
    }
    if (method === 'PerformTransaction') {
      return paymePerform(await this.repository.performProviderTransaction(tenantId, 'payme', providerId));
    }
    if (method === 'CancelTransaction') {
      return paymeCancel(
        await this.repository.cancelProviderTransaction(
          tenantId,
          'payme',
          providerId,
          numberValue(params['reason']) ?? 0,
        ),
      );
    }
    if (method === 'CheckTransaction') {
      return paymeStatus(await this.repository.findProviderTransaction(tenantId, 'payme', providerId));
    }
    return rpcError(-32601, 'Method not found');
  }

  async clickPrepare(input: ClickCallbackInput): Promise<Record<string, unknown>> {
    const tenantId = this.configuration.tenantId();
    if (!tenantId) {
      return clickError(input, -9, 'Payment tenant is not configured');
    }
    const result = await this.repository.createProviderTransaction({
      tenantId,
      provider: 'click',
      providerTransactionId: input.clickTransId,
      orderId: input.merchantTransId,
      amountUzs: input.amountUzs,
      providerCreatedAt: new Date(),
    });
    if (result.status !== 'ok') {
      return clickResultError(input, result);
    }
    return {
      click_trans_id: input.clickTransId,
      merchant_trans_id: input.merchantTransId,
      merchant_prepare_id: result.transaction.id,
      error: 0,
      error_note: 'Success',
    };
  }

  async clickComplete(input: ClickCallbackInput): Promise<Record<string, unknown>> {
    const tenantId = this.configuration.tenantId();
    if (!tenantId) {
      return clickError(input, -9, 'Payment tenant is not configured');
    }
    const prepared = await this.repository.findProviderTransaction(tenantId, 'click', input.clickTransId);
    if (
      prepared.status !== 'ok' ||
      prepared.transaction.id !== input.merchantPrepareId ||
      prepared.transaction.orderId !== input.merchantTransId ||
      prepared.transaction.amountUzs !== input.amountUzs
    ) {
      return clickError(input, -6, 'Transaction not found');
    }
    const result =
      input.error < 0
        ? await this.repository.cancelProviderTransaction(tenantId, 'click', input.clickTransId, Math.abs(input.error))
        : await this.repository.performProviderTransaction(tenantId, 'click', input.clickTransId);
    return result.status === 'ok'
      ? {
          click_trans_id: input.clickTransId,
          merchant_trans_id: input.merchantTransId,
          merchant_confirm_id: result.transaction.id,
          error: 0,
          error_note: 'Success',
        }
      : clickResultError(input, result);
  }
}

export interface ClickCallbackInput {
  clickTransId: string;
  merchantTransId: string;
  amountUzs: number;
  error: number;
  merchantPrepareId?: string;
}

export interface ClickSignedCallbackInput extends ClickCallbackInput {
  phase: 'prepare' | 'complete';
  serviceId: string;
  action: number;
  signTime: string;
  signString: string;
  merchantPrepareId?: string;
}

function checkoutUrl(
  provider: NonNullable<
    | ReturnType<PaymentConfigurationService['payme']>
    | ReturnType<PaymentConfigurationService['click']>
    | ReturnType<PaymentConfigurationService['bnpl']>
  >,
  transaction: PaymentTransaction,
  returnUrl: string,
  locale: string,
): string {
  if ('merchantId' in provider && !('serviceId' in provider)) {
    const payload = `m=${provider.merchantId};ac.order_id=${transaction.orderId};a=${Math.round(transaction.amountUzs * 100)};l=${locale};c=${returnUrl}`;
    return `${provider.checkoutUrl}/${Buffer.from(payload).toString('base64')}`;
  }
  const url = new URL(provider.checkoutUrl);
  if ('serviceId' in provider) {
    url.searchParams.set('service_id', provider.serviceId);
    url.searchParams.set('merchant_id', provider.merchantId);
    url.searchParams.set('amount', String(transaction.amountUzs));
    url.searchParams.set('transaction_param', transaction.orderId);
    url.searchParams.set('return_url', returnUrl);
  } else {
    url.searchParams.set('transaction_id', transaction.id);
    url.searchParams.set('return_url', returnUrl);
  }
  return url.toString();
}

function providerLocale(locale: CreatePaymentDto['locale']): 'en' | 'ru' | 'uz' {
  return locale === 'uz-cyrl' ? 'uz' : locale;
}

function unwrap(result: PaymentRepositoryResult): PaymentTransaction {
  if (result.status === 'ok') {
    return result.transaction;
  }
  if (result.status === 'not_found') {
    throw new ResourceNotFoundException('payment-order');
  }
  if (result.status === 'forbidden') {
    throw new ForbiddenException();
  }
  throw new ConflictException('payment-transaction', result.status);
}

function accountOrderId(params: Record<string, unknown>): string | undefined {
  const account = params['account'];
  if (!account || typeof account !== 'object') {
    return undefined;
  }
  return stringValue((account as Record<string, unknown>)['order_id']);
}

const stringValue = (value: unknown): string | undefined => (typeof value === 'string' && value ? value : undefined);
const numberValue = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;
const amountFromTiyin = (value: unknown): number | undefined => {
  const amount = numberValue(value);
  return amount !== undefined && Number.isSafeInteger(amount) && amount > 0 ? amount / 100 : undefined;
};

function paymeCheck(result: PaymentRepositoryResult): Record<string, unknown> {
  if (result.status === 'ok') {
    return { result: { allow: true } };
  }
  return result.status === 'amount_mismatch'
    ? rpcError(-31001, 'Invalid amount')
    : rpcError(-31050, 'Order not found', 'order_id');
}

function paymeCreate(result: PaymentRepositoryResult): Record<string, unknown> {
  if (result.status !== 'ok') {
    return paymeRepositoryError(result);
  }
  return {
    result: {
      create_time: result.transaction.createdAt.getTime(),
      transaction: result.transaction.id,
      state: 1,
    },
  };
}

function paymePerform(result: PaymentRepositoryResult): Record<string, unknown> {
  if (result.status !== 'ok') {
    return paymeRepositoryError(result);
  }
  return {
    result: { transaction: result.transaction.id, perform_time: result.transaction.updatedAt.getTime(), state: 2 },
  };
}

function paymeCancel(result: PaymentRepositoryResult): Record<string, unknown> {
  if (result.status !== 'ok') {
    return paymeRepositoryError(result);
  }
  return {
    result: {
      transaction: result.transaction.id,
      cancel_time: result.transaction.updatedAt.getTime(),
      state: result.transaction.state === 'refunded' ? -2 : -1,
    },
  };
}

function paymeStatus(result: PaymentRepositoryResult): Record<string, unknown> {
  if (result.status !== 'ok') {
    return paymeRepositoryError(result);
  }
  const state = paymeState(result.transaction.state);
  return {
    result: {
      create_time: result.transaction.createdAt.getTime(),
      perform_time: result.transaction.state === 'paid' ? result.transaction.updatedAt.getTime() : 0,
      cancel_time: state < 0 ? result.transaction.updatedAt.getTime() : 0,
      transaction: result.transaction.id,
      state,
      reason: result.transaction.reason ?? null,
    },
  };
}

function paymeStatementTransaction(transaction: PaymentTransaction): Record<string, unknown> {
  const state = paymeState(transaction.state);
  return {
    id: transaction.providerTransactionId,
    time: transaction.providerCreatedAt?.getTime() ?? transaction.createdAt.getTime(),
    amount: Math.round(transaction.amountUzs * 100),
    account: { order_id: transaction.orderId },
    create_time: transaction.createdAt.getTime(),
    perform_time:
      transaction.state === 'paid' || transaction.state === 'refunded' ? transaction.updatedAt.getTime() : 0,
    cancel_time: state < 0 ? transaction.updatedAt.getTime() : 0,
    transaction: transaction.id,
    state,
    reason: transaction.reason ?? null,
  };
}

function paymeRepositoryError(result: PaymentRepositoryResult): Record<string, unknown> {
  if (result.status === 'amount_mismatch') {
    return rpcError(-31001, 'Invalid amount');
  }
  if (result.status === 'not_found') {
    return rpcError(-31003, 'Transaction not found');
  }
  return rpcError(-31008, 'Operation cannot be performed');
}

const rpcError = (code: number, message: string, data?: string): Record<string, unknown> => ({
  error: { code, message, ...(data ? { data } : {}) },
});

function clickResultError(input: ClickCallbackInput, result: PaymentRepositoryResult): Record<string, unknown> {
  let code = -9;
  if (result.status === 'amount_mismatch') {
    code = -2;
  } else if (result.status === 'not_found') {
    code = -5;
  }
  return clickError(input, code, result.status);
}

function paymeState(state: PaymentTransaction['state']): number {
  if (state === 'paid') {
    return 2;
  }
  if (state === 'created' || state === 'pending') {
    return 1;
  }
  return state === 'refunded' ? -2 : -1;
}

const clickError = (input: ClickCallbackInput, code: number, note: string): Record<string, unknown> => ({
  click_trans_id: input.clickTransId,
  merchant_trans_id: input.merchantTransId,
  error: code,
  error_note: note,
});

const clean = (value: string | undefined): string | undefined => {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
};

const httpsUrl = (value: string | undefined): string | undefined => {
  const normalized = clean(value);
  if (!normalized) {
    return undefined;
  }
  try {
    const parsed = new URL(normalized);
    return parsed.protocol === 'https:' ? parsed.toString().replace(/\/$/u, '') : undefined;
  } catch {
    return undefined;
  }
};

const constantEqual = (left: string, right: string): boolean => {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
};
