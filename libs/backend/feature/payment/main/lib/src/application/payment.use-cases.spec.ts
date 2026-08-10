// @requirements REQ-AGRITECH-PAYMENT-004 REQ-AGRITECH-I18N-012
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import type { ConfigService } from '@nestjs/config';
import { ConflictException, ForbiddenException, ResourceNotFoundException } from '@app/backend-common-exception';
import type { PaymentRepository, PaymentTransaction } from '@app/backend-feature-payment-shared';
import {
  CreatePaymentUseCase,
  PaymentCallbackService,
  PaymentConfigurationService,
  PaymentProviderUnavailableException,
} from './payment.use-cases';

const transaction: PaymentTransaction = {
  id: 'payment-1',
  tenantId: 'tenant-1',
  userId: 'user-1',
  orderId: 'order-1',
  provider: 'payme',
  idempotencyKey: 'request-1234',
  amountUzs: 5000,
  state: 'created',
  createdAt: new Date('2026-08-02T00:00:00Z'),
  updatedAt: new Date('2026-08-02T00:00:00Z'),
};

const repository = (overrides: Partial<PaymentRepository> = {}): PaymentRepository => ({
  createIntent: vi.fn().mockResolvedValue({ status: 'ok', transaction }),
  checkOrder: vi.fn().mockResolvedValue({ status: 'ok', transaction }),
  createProviderTransaction: vi
    .fn()
    .mockResolvedValue({ status: 'ok', transaction: { ...transaction, state: 'pending' } }),
  performProviderTransaction: vi
    .fn()
    .mockResolvedValue({ status: 'ok', transaction: { ...transaction, state: 'paid' } }),
  cancelProviderTransaction: vi
    .fn()
    .mockResolvedValue({ status: 'ok', transaction: { ...transaction, state: 'cancelled' } }),
  findProviderTransaction: vi.fn().mockResolvedValue({ status: 'ok', transaction }),
  listProviderTransactions: vi.fn().mockResolvedValue([]),
  ...overrides,
});

const configuration = (values: Record<string, string> = {}) =>
  new PaymentConfigurationService({ get: (key: string) => values[key] } as ConfigService);

describe('payment state machine', () => {
  it('fails closed without verified merchant configuration', async () => {
    const useCase = new CreatePaymentUseCase(
      repository(),
      configuration({ PAYMENT_RETURN_URL_ORIGINS: 'https://app.test' }),
    );
    await expect(
      useCase.execute(
        { tenantId: 'tenant-1', userId: 'user-1' },
        {
          orderId: 'order-1',
          provider: 'payme',
          returnUrl: 'https://app.test/orders',
          idempotencyKey: 'request-1234',
          locale: 'uz',
        },
      ),
    ).rejects.toBeInstanceOf(PaymentProviderUnavailableException);
  });

  it('creates an exact Payme checkout handoff from a persisted intent', async () => {
    const useCase = new CreatePaymentUseCase(
      repository(),
      configuration({
        PAYMENT_RETURN_URL_ORIGINS: 'https://app.test',
        PAYME_MERCHANT_ID: 'merchant-1',
        PAYME_SECRET_KEY: 'secret',
      }),
    );
    const result = await useCase.execute(
      { tenantId: 'tenant-1', userId: 'user-1' },
      {
        orderId: 'order-1',
        provider: 'payme',
        returnUrl: 'https://app.test/orders',
        idempotencyKey: 'request-1234',
        locale: 'uz-cyrl',
      },
    );
    expect(result.checkoutUrl).toMatch(/^https:\/\/checkout\.paycom\.uz\//u);
    const payload = Buffer.from(result.checkoutUrl.split('/').at(-1) ?? '', 'base64url').toString('utf8');
    expect(payload).toContain('ac.order_id=order-1');
    expect(payload).toContain('a=500000');
    expect(payload).toContain('l=uz');
    expect(payload).not.toContain('l=uz-cyrl');
  });

  it('authenticates Payme and returns an idempotent transaction result', async () => {
    const repo = repository();
    const config = configuration({
      PAYMENT_TENANT_ID: 'tenant-1',
      PAYME_MERCHANT_ID: 'merchant-1',
      PAYME_SECRET_KEY: 'secret',
    });
    expect(config.authenticatePayme(`Basic ${Buffer.from('Paycom:secret').toString('base64')}`)).toBe(true);
    const callback = new PaymentCallbackService(repo, config);
    const result = await callback.payme('PerformTransaction', { id: 'provider-1' });
    expect(result).toMatchObject({ result: { state: 2 } });
    expect(repo.performProviderTransaction).toHaveBeenCalledWith('tenant-1', 'payme', 'provider-1');
  });

  it('rejects callback amount mismatches without a state mutation', async () => {
    const repo = repository({ checkOrder: vi.fn().mockResolvedValue({ status: 'amount_mismatch' }) });
    const callback = new PaymentCallbackService(
      repo,
      configuration({ PAYMENT_TENANT_ID: 'tenant-1', PAYME_MERCHANT_ID: 'merchant-1', PAYME_SECRET_KEY: 'secret' }),
    );
    expect(
      await callback.payme('CheckPerformTransaction', { amount: 500000, account: { order_id: 'order-1' } }),
    ).toMatchObject({ error: { code: -31001 } });
    expect(repo.performProviderTransaction).not.toHaveBeenCalled();
  });

  it('rejects a browser return outside the HTTPS allowlist', async () => {
    const useCase = new CreatePaymentUseCase(
      repository(),
      configuration({
        PAYMENT_RETURN_URL_ORIGINS: 'https://app.test',
        PAYME_MERCHANT_ID: 'merchant-1',
        PAYME_SECRET_KEY: 'secret',
      }),
    );
    await expect(
      useCase.execute(
        { tenantId: 'tenant-1', userId: 'user-1' },
        {
          orderId: 'order-1',
          provider: 'payme',
          returnUrl: 'https://attacker.test/return',
          idempotencyKey: 'request-1234',
          locale: 'en',
        },
      ),
    ).rejects.toBeDefined();
  });

  it('renders the bounded Payme statement from persisted transactions', async () => {
    const persisted = {
      ...transaction,
      providerTransactionId: 'provider-1',
      providerCreatedAt: new Date('2026-08-02T01:00:00Z'),
      state: 'paid' as const,
    };
    const repo = repository({ listProviderTransactions: vi.fn().mockResolvedValue([persisted]) });
    const callback = new PaymentCallbackService(
      repo,
      configuration({ PAYMENT_TENANT_ID: 'tenant-1', PAYME_MERCHANT_ID: 'merchant-1', PAYME_SECRET_KEY: 'secret' }),
    );
    const from = new Date('2026-08-02T00:00:00Z').getTime();
    const to = new Date('2026-08-03T00:00:00Z').getTime();
    const result = await callback.payme('GetStatement', { from, to });
    expect(result).toMatchObject({
      result: {
        transactions: [{ id: 'provider-1', amount: 500000, state: 2, account: { order_id: 'order-1' } }],
      },
    });
    expect(repo.listProviderTransactions).toHaveBeenCalledWith('tenant-1', 'payme', new Date(from), new Date(to));
  });

  it('binds Click completion to the prepare identifier, order, and amount', async () => {
    const repo = repository({
      findProviderTransaction: vi.fn().mockResolvedValue({
        status: 'ok',
        transaction: { ...transaction, provider: 'click', providerTransactionId: 'click-1' },
      }),
    });
    const callback = new PaymentCallbackService(
      repo,
      configuration({
        PAYMENT_TENANT_ID: 'tenant-1',
        CLICK_SERVICE_ID: 'service-1',
        CLICK_MERCHANT_ID: 'merchant-1',
        CLICK_SECRET_KEY: 'secret',
      }),
    );
    const result = await callback.clickComplete({
      clickTransId: 'click-1',
      merchantTransId: 'order-1',
      merchantPrepareId: 'wrong-prepare-id',
      amountUzs: 5000,
      error: 0,
    });
    expect(result).toMatchObject({ error: -6 });
    expect(repo.performProviderTransaction).not.toHaveBeenCalled();
  });

  it('authenticates Click prepare callbacks with the documented field order', () => {
    const config = configuration({
      CLICK_SERVICE_ID: 'service-1',
      CLICK_MERCHANT_ID: 'merchant-1',
      CLICK_SECRET_KEY: 'secret',
    });
    const payload = 'click-1service-1secretorder-1500002026-08-02 12:00:00';
    expect(
      config.authenticateClick({
        phase: 'prepare',
        clickTransId: 'click-1',
        merchantTransId: 'order-1',
        amountUzs: 5000,
        error: 0,
        serviceId: 'service-1',
        action: 0,
        signTime: '2026-08-02 12:00:00',
        // eslint-disable-next-line sonarjs/hashing -- Fixture must match Click's mandated signature algorithm.
        signString: createHash('md5').update(payload).digest('hex'),
      }),
    ).toBe(true);
  });

  it('validates and normalizes every payment provider configuration', () => {
    expect(configuration().tenantId()).toBeUndefined();
    expect(configuration({ PAYMENT_TENANT_ID: ' tenant-1 ' }).tenantId()).toBe('tenant-1');
    expect(configuration({ PAYME_MERCHANT_ID: 'm' }).payme()).toBeUndefined();
    expect(configuration({ PAYME_SECRET_KEY: 's' }).payme()).toBeUndefined();
    expect(
      configuration({ PAYME_MERCHANT_ID: 'm', PAYME_SECRET_KEY: 's', PAYME_CHECKOUT_URL: 'http://payme.test' }).payme(),
    ).toBeUndefined();
    expect(configuration({ PAYME_MERCHANT_ID: 'm', PAYME_SECRET_KEY: 's' }).payme()).toEqual({
      merchantId: 'm',
      secret: 's',
      checkoutUrl: 'https://checkout.paycom.uz',
    });
    expect(configuration({ CLICK_SERVICE_ID: 'service' }).click()).toBeUndefined();
    expect(configuration({ CLICK_SERVICE_ID: 'service', CLICK_MERCHANT_ID: 'merchant' }).click()).toBeUndefined();
    expect(configuration({ CLICK_MERCHANT_ID: 'merchant', CLICK_SECRET_KEY: 'secret' }).click()).toBeUndefined();
    expect(
      configuration({
        CLICK_SERVICE_ID: 'service',
        CLICK_MERCHANT_ID: 'merchant',
        CLICK_SECRET_KEY: 'secret',
        CLICK_CHECKOUT_URL: 'not a URL',
      }).click(),
    ).toBeUndefined();
    expect(
      configuration({ CLICK_SERVICE_ID: 'service', CLICK_MERCHANT_ID: 'merchant', CLICK_SECRET_KEY: 'secret' }).click(),
    ).toEqual({
      serviceId: 'service',
      merchantId: 'merchant',
      secret: 'secret',
      checkoutUrl: 'https://my.click.uz/services/pay',
    });
    expect(configuration().bnpl()).toBeUndefined();
    expect(configuration({ BNPL_CHECKOUT_URL: 'http://bnpl.test' }).bnpl()).toBeUndefined();
    expect(configuration({ BNPL_CHECKOUT_URL: 'https://bnpl.test/' }).bnpl()).toEqual({
      checkoutUrl: 'https://bnpl.test',
    });
    expect(() => {
      configuration().assertReturnUrl('https://app.test/orders');
    }).toThrow(ForbiddenException);
  });

  it('authenticates provider callbacks fail-closed for missing, malformed, or mismatched credentials', () => {
    const payme = configuration({ PAYME_MERCHANT_ID: 'merchant', PAYME_SECRET_KEY: 'secret' });
    expect(configuration().authenticatePayme(undefined)).toBe(false);
    expect(payme.authenticatePayme(undefined)).toBe(false);
    expect(payme.authenticatePayme('Bearer token')).toBe(false);
    expect(payme.authenticatePayme(`Basic ${Buffer.from('Paycom:wrong').toString('base64')}`)).toBe(false);
    expect(payme.authenticatePayme(`Basic ${Buffer.from('x').toString('base64')}`)).toBe(false);
    const from = vi.spyOn(Buffer, 'from').mockImplementationOnce(() => {
      throw new Error('bad base64');
    });
    expect(payme.authenticatePayme('Basic invalid')).toBe(false);
    from.mockRestore();

    const click = configuration({
      CLICK_SERVICE_ID: 'service-1',
      CLICK_MERCHANT_ID: 'merchant-1',
      CLICK_SECRET_KEY: 'secret',
    });
    const base = {
      phase: 'prepare' as const,
      clickTransId: 'click-1',
      merchantTransId: 'order-1',
      amountUzs: 5000,
      error: 0,
      serviceId: 'service-1',
      action: 0,
      signTime: '2026-08-02 12:00:00',
      signString: 'invalid',
    };
    expect(configuration().authenticateClick(base)).toBe(false);
    expect(click.authenticateClick({ ...base, serviceId: 'wrong' })).toBe(false);
    expect(click.authenticateClick({ ...base, action: 1 })).toBe(false);
    expect(click.authenticateClick(base)).toBe(false);

    const completePayload = 'click-1service-1secretorder-1payment-1500012026-08-02 12:00:00';
    expect(
      click.authenticateClick({
        ...base,
        phase: 'complete',
        action: 1,
        merchantPrepareId: 'payment-1',
        // eslint-disable-next-line sonarjs/hashing -- Fixture must match Click's mandated signature algorithm.
        signString: createHash('md5').update(completePayload).digest('hex').toUpperCase(),
      }),
    ).toBe(true);
    const completeWithoutPreparePayload = 'click-1service-1secretorder-1500012026-08-02 12:00:00';
    expect(
      click.authenticateClick({
        ...base,
        phase: 'complete',
        action: 1,
        // eslint-disable-next-line sonarjs/hashing -- Fixture must match Click's mandated signature algorithm.
        signString: createHash('md5').update(completeWithoutPreparePayload).digest('hex'),
      }),
    ).toBe(true);
  });

  it('creates Click and BNPL checkout handoffs with exact tenant-owned transaction parameters', async () => {
    const config = configuration({
      PAYMENT_RETURN_URL_ORIGINS: 'https://app.test',
      CLICK_SERVICE_ID: 'service-1',
      CLICK_MERCHANT_ID: 'merchant-1',
      CLICK_SECRET_KEY: 'secret',
      BNPL_CHECKOUT_URL: 'https://bnpl.test/checkout',
    });
    const useCase = new CreatePaymentUseCase(repository(), config);
    const click = await useCase.execute(owner(), input('click'));
    expect(click.checkoutUrl).toContain('service_id=service-1');
    expect(click.checkoutUrl).toContain('transaction_param=order-1');
    const bnpl = await useCase.execute(owner(), input('bnpl'));
    expect(bnpl.checkoutUrl).toContain('transaction_id=payment-1');
    expect(bnpl.checkoutUrl).toContain('return_url=https%3A%2F%2Fapp.test%2Forders');
  });

  it.each([
    [{ status: 'not_found' } as const, ResourceNotFoundException],
    [{ status: 'forbidden' } as const, ForbiddenException],
    [{ status: 'conflict' } as const, ConflictException],
    [{ status: 'amount_mismatch' } as const, ConflictException],
  ])('maps create-intent repository result %o to its public exception', async (result, exceptionType) => {
    const useCase = new CreatePaymentUseCase(
      repository({ createIntent: vi.fn().mockResolvedValue(result) }),
      configuration({
        PAYMENT_RETURN_URL_ORIGINS: 'https://app.test',
        PAYME_MERCHANT_ID: 'merchant-1',
        PAYME_SECRET_KEY: 'secret',
      }),
    );
    await expect(useCase.execute(owner(), input('payme'))).rejects.toBeInstanceOf(exceptionType);
  });

  it.each(['click', 'bnpl'] as const)('fails closed when %s is selected without configuration', async (provider) => {
    const useCase = new CreatePaymentUseCase(
      repository(),
      configuration({ PAYMENT_RETURN_URL_ORIGINS: 'https://app.test' }),
    );
    await expect(useCase.execute(owner(), input(provider))).rejects.toBeInstanceOf(PaymentProviderUnavailableException);
  });

  /* eslint-disable no-await-in-loop -- provider callback cases mutate transaction state and must execute in order. */
  it('validates Payme requests, dispatches every method, and maps repository errors', async () => {
    const paid = { ...transaction, state: 'paid' as const, reason: 7 };
    const refunded = { ...transaction, state: 'refunded' as const };
    const pending = { ...transaction, state: 'pending' as const };
    const cancelled = { ...transaction, state: 'cancelled' as const };
    const repo = repository({
      listProviderTransactions: vi.fn().mockResolvedValue([
        { ...transaction, providerTransactionId: 'created' },
        { ...pending, providerTransactionId: 'pending', providerCreatedAt: now() },
        { ...paid, providerTransactionId: 'paid' },
        { ...refunded, providerTransactionId: 'refunded' },
        { ...cancelled, providerTransactionId: 'cancelled' },
      ]),
    });
    const callback = new PaymentCallbackService(repo, paymentConfiguration());

    expect(
      await new PaymentCallbackService(repo, configuration()).payme('CheckTransaction', { id: 'x' }),
    ).toMatchObject({
      error: { code: -32400 },
    });
    expect(await callback.payme('CheckPerformTransaction', {})).toMatchObject({ error: { code: -31050 } });
    expect(
      await callback.payme('CheckPerformTransaction', { amount: -1, account: { order_id: 'order-1' } }),
    ).toMatchObject({ error: { code: -31050 } });
    expect(
      await new PaymentCallbackService(
        repository({ checkOrder: vi.fn().mockResolvedValue({ status: 'not_found' }) }),
        paymentConfiguration(),
      ).payme('CheckPerformTransaction', { amount: 500000, account: { order_id: 'order-1' } }),
    ).toMatchObject({ error: { code: -31050 } });
    expect(await callback.payme('CheckPerformTransaction', validPaymeParams())).toMatchObject({
      result: { allow: true },
    });

    for (const params of [
      {},
      { id: 'provider-1' },
      { id: 'provider-1', account: { order_id: 'order-1' }, amount: 500000 },
      { id: 'provider-1', time: now().getTime(), amount: 500000 },
    ]) {
      expect(await callback.payme('CreateTransaction', params)).toMatchObject({ error: { code: -32602 } });
    }
    expect(
      await callback.payme('CreateTransaction', {
        id: 'provider-1',
        time: now().getTime(),
        ...validPaymeParams(),
      }),
    ).toMatchObject({ result: { state: 1 } });

    expect(await callback.payme('GetStatement', {})).toMatchObject({ error: { code: -32602 } });
    expect(await callback.payme('GetStatement', { from: now().getTime() })).toMatchObject({ error: { code: -32602 } });
    expect(await callback.payme('GetStatement', { from: 2, to: 1 })).toMatchObject({ error: { code: -32602 } });
    const statement = await callback.payme('GetStatement', { from: 1, to: 2 });
    expect(statement).toMatchObject({
      result: { transactions: expect.arrayContaining([expect.objectContaining({ state: -2 })]) },
    });

    expect(await callback.payme('PerformTransaction', {})).toMatchObject({ error: { code: -32602 } });
    expect(await callback.payme('PerformTransaction', { id: 'provider-1' })).toMatchObject({ result: { state: 2 } });
    expect(await callback.payme('CancelTransaction', { id: 'provider-1' })).toMatchObject({ result: { state: -1 } });
    expect(await callback.payme('CheckTransaction', { id: 'provider-1' })).toMatchObject({ result: { state: 1 } });
    expect(await callback.payme('Unknown', { id: 'provider-1' })).toMatchObject({ error: { code: -32601 } });

    const refundedCallback = new PaymentCallbackService(
      repository({ cancelProviderTransaction: vi.fn().mockResolvedValue({ status: 'ok', transaction: refunded }) }),
      paymentConfiguration(),
    );
    expect(await refundedCallback.payme('CancelTransaction', { id: 'provider-1', reason: 5 })).toMatchObject({
      result: { state: -2 },
    });

    for (const state of ['paid', 'cancelled', 'refunded'] as const) {
      const statusCallback = new PaymentCallbackService(
        repository({
          findProviderTransaction: vi.fn().mockResolvedValue({
            status: 'ok',
            transaction: { ...transaction, state, reason: state === 'cancelled' ? 4 : undefined },
          }),
        }),
        paymentConfiguration(),
      );
      expect(await statusCallback.payme('CheckTransaction', { id: 'provider-1' })).toHaveProperty('result');
    }

    for (const status of ['amount_mismatch', 'not_found', 'forbidden', 'conflict'] as const) {
      const failing = repository({
        createProviderTransaction: vi.fn().mockResolvedValue({ status }),
        performProviderTransaction: vi.fn().mockResolvedValue({ status }),
        cancelProviderTransaction: vi.fn().mockResolvedValue({ status }),
        findProviderTransaction: vi.fn().mockResolvedValue({ status }),
      });
      const service = new PaymentCallbackService(failing, paymentConfiguration());
      expect(
        await service.payme('CreateTransaction', {
          id: 'provider-1',
          time: now().getTime(),
          ...validPaymeParams(),
        }),
      ).toHaveProperty('error');
      expect(await service.payme('PerformTransaction', { id: 'provider-1' })).toHaveProperty('error');
      expect(await service.payme('CancelTransaction', { id: 'provider-1' })).toHaveProperty('error');
      expect(await service.payme('CheckTransaction', { id: 'provider-1' })).toHaveProperty('error');
    }
  });

  it('prepares and completes Click payments across success, cancellation, and error paths', async () => {
    const clickInput = {
      clickTransId: 'click-1',
      merchantTransId: 'order-1',
      amountUzs: 5000,
      error: 0,
    };
    const config = paymentConfiguration();
    expect(await new PaymentCallbackService(repository(), configuration()).clickPrepare(clickInput)).toMatchObject({
      error: -9,
    });
    expect(await new PaymentCallbackService(repository(), configuration()).clickComplete(clickInput)).toMatchObject({
      error: -9,
    });
    expect(await new PaymentCallbackService(repository(), config).clickPrepare(clickInput)).toMatchObject({
      merchant_prepare_id: 'payment-1',
      error: 0,
    });

    for (const status of ['amount_mismatch', 'not_found', 'forbidden', 'conflict'] as const) {
      expect(
        await new PaymentCallbackService(
          repository({ createProviderTransaction: vi.fn().mockResolvedValue({ status }) }),
          config,
        ).clickPrepare(clickInput),
      ).toHaveProperty('error');
    }

    const prepared = { ...transaction, provider: 'click' as const, providerTransactionId: 'click-1' };
    for (const found of [
      { status: 'not_found' } as const,
      { status: 'ok', transaction: { ...prepared, id: 'wrong' } } as const,
      { status: 'ok', transaction: { ...prepared, orderId: 'wrong' } } as const,
      { status: 'ok', transaction: { ...prepared, amountUzs: 1 } } as const,
    ]) {
      expect(
        await new PaymentCallbackService(
          repository({ findProviderTransaction: vi.fn().mockResolvedValue(found) }),
          config,
        ).clickComplete({ ...clickInput, merchantPrepareId: 'payment-1' }),
      ).toMatchObject({ error: -6 });
    }

    const service = new PaymentCallbackService(
      repository({ findProviderTransaction: vi.fn().mockResolvedValue({ status: 'ok', transaction: prepared }) }),
      config,
    );
    expect(await service.clickComplete({ ...clickInput, merchantPrepareId: 'payment-1' })).toMatchObject({ error: 0 });
    expect(await service.clickComplete({ ...clickInput, merchantPrepareId: 'payment-1', error: -4 })).toMatchObject({
      error: 0,
    });

    for (const status of ['amount_mismatch', 'not_found', 'forbidden', 'conflict'] as const) {
      const failing = repository({
        findProviderTransaction: vi.fn().mockResolvedValue({ status: 'ok', transaction: prepared }),
        performProviderTransaction: vi.fn().mockResolvedValue({ status }),
        cancelProviderTransaction: vi.fn().mockResolvedValue({ status }),
      });
      expect(
        await new PaymentCallbackService(failing, config).clickComplete({
          ...clickInput,
          merchantPrepareId: 'payment-1',
        }),
      ).toHaveProperty('error');
      expect(
        await new PaymentCallbackService(failing, config).clickComplete({
          ...clickInput,
          merchantPrepareId: 'payment-1',
          error: -1,
        }),
      ).toHaveProperty('error');
    }
  });
  /* eslint-enable no-await-in-loop */
});

const owner = () => ({ tenantId: 'tenant-1', userId: 'user-1' });
const input = (provider: 'payme' | 'click' | 'bnpl') => ({
  orderId: 'order-1',
  provider,
  returnUrl: 'https://app.test/orders',
  idempotencyKey: 'request-1234',
  locale: 'uz' as const,
});
const now = () => new Date('2026-08-02T00:00:00Z');
const validPaymeParams = () => ({ amount: 500000, account: { order_id: 'order-1' } });
const paymentConfiguration = () =>
  configuration({
    PAYMENT_TENANT_ID: 'tenant-1',
    PAYME_MERCHANT_ID: 'merchant-1',
    PAYME_SECRET_KEY: 'secret',
    CLICK_SERVICE_ID: 'service-1',
    CLICK_MERCHANT_ID: 'merchant-1',
    CLICK_SECRET_KEY: 'secret',
  });
