// @requirements REQ-AGRITECH-PAYMENT-004
import { LockMode } from '@mikro-orm/core';
import type { EntityManager } from '@mikro-orm/core';
import type { CreatePaymentDto, PaymentProvider } from '@app/backend-feature-payment-shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OrderEntity } from '../entities/order.entity';
import type { OrderItemData, OrderKind, OrderStatus } from '../entities/order.entity';
import { PaymentTransactionEntity, ProduceListingEntity } from '../entities/operations.entity';
import type { PaymentState } from '../entities/operations.entity';
import { ProductEntity } from '../entities/product.entity';
import { PostgresPaymentRepository } from './payment.repository';

type FindOneOptions = { lockMode?: LockMode; orderBy?: Record<string, 'ASC' | 'DESC'> };

function createEntityManagerMock() {
  const persist = vi.fn(() => undefined);
  const flush = vi.fn(() => Promise.resolve());
  const find = vi.fn(() => Promise.resolve<unknown[]>([]));
  const findOne = vi.fn((_entity: unknown, _where: unknown, _options?: FindOneOptions) =>
    Promise.resolve(null as unknown),
  );
  const entityManager = { persist, flush, find, findOne } as unknown as EntityManager;
  const transactional = vi.fn(async (handler: (manager: EntityManager) => Promise<unknown>) =>
    handler(entityManager),
  );
  Object.assign(entityManager, { transactional });

  return { persist, flush, find, findOne, transactional, entityManager };
}

const tenantId = 'tenant-1';
const userId = 'user-1';
const owner = { tenantId, userId };
const now = new Date('2026-08-05T12:00:00Z');

const orderItems: OrderItemData[] = [
  { productId: 'product-1', productName: 'Fertilizer', quantity: 2, unitPriceUzs: 25_000, totalUzs: 50_000 },
];

function createOrder(overrides: Partial<OrderEntity> = {}): OrderEntity {
  return {
    id: 'order-1',
    tenantId,
    userId,
    farmerId: 'farmer-1',
    kind: 'input' as OrderKind,
    buyerPartnerId: null,
    produceListingId: null,
    items: orderItems,
    totalAmountUzs: 50_000,
    status: 'pending' as OrderStatus,
    deliveryAddress: 'Fergana, street 1',
    region: 'Fergana',
    notes: null,
    history: [],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  } as OrderEntity;
}

function createTransaction(overrides: Partial<PaymentTransactionEntity> = {}): PaymentTransactionEntity {
  return {
    id: 'tx-1',
    tenantId,
    orderId: 'order-1',
    userId,
    provider: 'payme' as PaymentProvider,
    idempotencyKey: 'idem-1',
    amountUzs: 50_000,
    state: 'created' as PaymentState,
    providerTransactionId: null,
    providerCreatedAt: null,
    reason: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  } as PaymentTransactionEntity;
}

function createInput(overrides: Partial<CreatePaymentDto> = {}): CreatePaymentDto {
  return {
    orderId: 'order-1',
    provider: 'payme',
    returnUrl: 'https://app.example.uz/payments/return',
    idempotencyKey: 'idem-1',
    locale: 'uz',
    ...overrides,
  };
}

function createProviderInput(overrides: Partial<Parameters<PostgresPaymentRepository['createProviderTransaction']>[0]> = {}) {
  return {
    tenantId,
    provider: 'payme' as PaymentProvider,
    providerTransactionId: 'provider-tx-1',
    orderId: 'order-1',
    amountUzs: 50_000,
    providerCreatedAt: now,
    ...overrides,
  };
}

describe('PostgresPaymentRepository', () => {
  let repository: PostgresPaymentRepository;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createIntent', () => {
    it('persists a new payment transaction inside a transaction', async () => {
      const { persist, flush, findOne, transactional, entityManager } = createEntityManagerMock();
      repository = new PostgresPaymentRepository(entityManager);
      const order = createOrder();
      findOne.mockResolvedValueOnce(null).mockResolvedValueOnce(order);

      const result = await repository.createIntent(owner, createInput());

      expect(transactional).toHaveBeenCalledTimes(1);
      expect(findOne).toHaveBeenNthCalledWith(1, PaymentTransactionEntity, {
        tenantId,
        provider: 'payme',
        idempotencyKey: 'idem-1',
      });
      expect(findOne).toHaveBeenNthCalledWith(2, OrderEntity, {
        tenantId,
        id: 'order-1',
        userId,
      });
      expect(persist).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId,
          orderId: 'order-1',
          userId,
          provider: 'payme',
          idempotencyKey: 'idem-1',
          amountUzs: 50_000,
          state: 'created',
        }),
      );
      expect(flush).toHaveBeenCalledTimes(1);
      expect(result).toMatchObject({
        status: 'ok',
        transaction: {
          orderId: 'order-1',
          userId,
          provider: 'payme',
          idempotencyKey: 'idem-1',
          amountUzs: 50_000,
          state: 'created',
        },
      });
    });

    it('returns the existing transaction for an idempotent retry', async () => {
      const { persist, findOne, entityManager } = createEntityManagerMock();
      repository = new PostgresPaymentRepository(entityManager);
      const existing = createTransaction();
      findOne.mockResolvedValueOnce(existing);

      const result = await repository.createIntent(owner, createInput());

      expect(result).toEqual({ status: 'ok', transaction: expect.objectContaining({ id: 'tx-1' }) });
      expect(persist).not.toHaveBeenCalled();
      expect(findOne).toHaveBeenCalledTimes(1);
    });

    it('rejects an idempotency key reused for another order', async () => {
      const { persist, findOne, entityManager } = createEntityManagerMock();
      repository = new PostgresPaymentRepository(entityManager);
      findOne.mockResolvedValueOnce(createTransaction());

      const result = await repository.createIntent(owner, createInput({ orderId: 'order-2' }));

      expect(result).toEqual({ status: 'conflict' });
      expect(persist).not.toHaveBeenCalled();
    });

    it('rejects an idempotency key reused by another user', async () => {
      const { persist, findOne, entityManager } = createEntityManagerMock();
      repository = new PostgresPaymentRepository(entityManager);
      findOne.mockResolvedValueOnce(createTransaction({ userId: 'user-2' }));

      const result = await repository.createIntent(owner, createInput());

      expect(result).toEqual({ status: 'conflict' });
      expect(persist).not.toHaveBeenCalled();
    });

    it('returns not_found when the order does not belong to the tenant or user', async () => {
      const { persist, findOne, entityManager } = createEntityManagerMock();
      repository = new PostgresPaymentRepository(entityManager);
      findOne.mockResolvedValueOnce(null).mockResolvedValueOnce(null);

      const result = await repository.createIntent({ tenantId: 'tenant-2', userId: 'user-2' }, createInput());

      expect(result).toEqual({ status: 'not_found' });
      expect(persist).not.toHaveBeenCalled();
    });

    it.each(['cancelled', 'delivered'] as OrderStatus[])(
      'rejects payment initiation for a %s order',
      async (status) => {
        const { persist, findOne, entityManager } = createEntityManagerMock();
        repository = new PostgresPaymentRepository(entityManager);
        findOne.mockResolvedValueOnce(null).mockResolvedValueOnce(createOrder({ status }));

        const result = await repository.createIntent(owner, createInput());

        expect(result).toEqual({ status: 'invalid_state' });
        expect(persist).not.toHaveBeenCalled();
      },
    );
  });

  describe('checkOrder', () => {
    it('returns not_found for an order outside the tenant', async () => {
      const { findOne, entityManager } = createEntityManagerMock();
      repository = new PostgresPaymentRepository(entityManager);

      const result = await repository.checkOrder('tenant-2', 'order-1', 50_000);

      expect(result).toEqual({ status: 'not_found' });
      expect(findOne).toHaveBeenCalledWith(OrderEntity, { tenantId: 'tenant-2', id: 'order-1' });
    });

    it('verifies the amount against the order total', async () => {
      const { findOne, entityManager } = createEntityManagerMock();
      repository = new PostgresPaymentRepository(entityManager);
      findOne.mockResolvedValueOnce(createOrder());

      const result = await repository.checkOrder(tenantId, 'order-1', 49_999);

      expect(result).toEqual({ status: 'amount_mismatch' });
    });

    it.each(['cancelled', 'delivered'] as OrderStatus[])('rejects a %s order', async (status) => {
      const { findOne, entityManager } = createEntityManagerMock();
      repository = new PostgresPaymentRepository(entityManager);
      findOne.mockResolvedValueOnce(createOrder({ status }));

      const result = await repository.checkOrder(tenantId, 'order-1', 50_000);

      expect(result).toEqual({ status: 'invalid_state' });
    });

    it('returns not_found when no payment intent exists for the order', async () => {
      const { findOne, entityManager } = createEntityManagerMock();
      repository = new PostgresPaymentRepository(entityManager);
      findOne.mockResolvedValueOnce(createOrder()).mockResolvedValueOnce(null);

      const result = await repository.checkOrder(tenantId, 'order-1', 50_000);

      expect(result).toEqual({ status: 'not_found' });
    });

    it('returns the latest payment intent for the order', async () => {
      const { findOne, entityManager } = createEntityManagerMock();
      repository = new PostgresPaymentRepository(entityManager);
      const intent = createTransaction({ state: 'pending' });
      findOne.mockResolvedValueOnce(createOrder()).mockResolvedValueOnce(intent);

      const result = await repository.checkOrder(tenantId, 'order-1', 50_000);

      expect(findOne).toHaveBeenNthCalledWith(
        2,
        PaymentTransactionEntity,
        { tenantId, orderId: 'order-1' },
        { orderBy: { createdAt: 'DESC' } },
      );
      expect(result).toEqual({ status: 'ok', transaction: expect.objectContaining({ id: 'tx-1' }) });
    });
  });

  describe('createProviderTransaction', () => {
    it('replays a callback for the same provider transaction id', async () => {
      const { flush, findOne, entityManager } = createEntityManagerMock();
      repository = new PostgresPaymentRepository(entityManager);
      const replay = createTransaction({
        state: 'pending',
        providerTransactionId: 'provider-tx-1',
        providerCreatedAt: now,
      });
      findOne.mockResolvedValueOnce(replay);

      const result = await repository.createProviderTransaction(createProviderInput());

      expect(result).toEqual({ status: 'ok', transaction: expect.objectContaining({ id: 'tx-1' }) });
      expect(findOne).toHaveBeenCalledTimes(1);
      expect(flush).not.toHaveBeenCalled();
    });

    it('rejects a replay with a mismatched order', async () => {
      const { findOne, entityManager } = createEntityManagerMock();
      repository = new PostgresPaymentRepository(entityManager);
      findOne.mockResolvedValueOnce(createTransaction({ providerTransactionId: 'provider-tx-1' }));

      const result = await repository.createProviderTransaction(createProviderInput({ orderId: 'order-2' }));

      expect(result).toEqual({ status: 'conflict' });
    });

    it('rejects a replay with a mismatched amount', async () => {
      const { findOne, entityManager } = createEntityManagerMock();
      repository = new PostgresPaymentRepository(entityManager);
      findOne.mockResolvedValueOnce(createTransaction({ providerTransactionId: 'provider-tx-1' }));

      const result = await repository.createProviderTransaction(createProviderInput({ amountUzs: 40_000 }));

      expect(result).toEqual({ status: 'conflict' });
    });

    it('returns not_found when the order is missing', async () => {
      const { findOne, entityManager } = createEntityManagerMock();
      repository = new PostgresPaymentRepository(entityManager);
      findOne.mockResolvedValueOnce(null).mockResolvedValueOnce(null);

      const result = await repository.createProviderTransaction(createProviderInput());

      expect(result).toEqual({ status: 'not_found' });
      expect(findOne).toHaveBeenNthCalledWith(
        2,
        OrderEntity,
        { tenantId, id: 'order-1' },
        { lockMode: LockMode.PESSIMISTIC_WRITE },
      );
    });

    it('verifies the callback amount against the order total', async () => {
      const { findOne, entityManager } = createEntityManagerMock();
      repository = new PostgresPaymentRepository(entityManager);
      findOne.mockResolvedValueOnce(null).mockResolvedValueOnce(createOrder());

      const result = await repository.createProviderTransaction(createProviderInput({ amountUzs: 60_000 }));

      expect(result).toEqual({ status: 'amount_mismatch' });
    });

    it.each(['cancelled', 'delivered'] as OrderStatus[])(
      'rejects a callback for a %s order',
      async (status) => {
        const { findOne, entityManager } = createEntityManagerMock();
        repository = new PostgresPaymentRepository(entityManager);
        findOne.mockResolvedValueOnce(null).mockResolvedValueOnce(createOrder({ status }));

        const result = await repository.createProviderTransaction(createProviderInput());

        expect(result).toEqual({ status: 'invalid_state' });
      },
    );

    it('returns not_found when the order has no created payment intent', async () => {
      const { flush, findOne, entityManager } = createEntityManagerMock();
      repository = new PostgresPaymentRepository(entityManager);
      findOne.mockResolvedValueOnce(null).mockResolvedValueOnce(createOrder()).mockResolvedValueOnce(null);

      const result = await repository.createProviderTransaction(createProviderInput());

      expect(result).toEqual({ status: 'not_found' });
      expect(findOne).toHaveBeenNthCalledWith(
        3,
        PaymentTransactionEntity,
        { tenantId, orderId: 'order-1', provider: 'payme', state: 'created' },
        { orderBy: { createdAt: 'DESC' }, lockMode: LockMode.PESSIMISTIC_WRITE },
      );
      expect(flush).not.toHaveBeenCalled();
    });

    it('links the provider transaction and confirms the order', async () => {
      const { flush, findOne, entityManager } = createEntityManagerMock();
      repository = new PostgresPaymentRepository(entityManager);
      const order = createOrder();
      const intent = createTransaction();
      findOne.mockResolvedValueOnce(null).mockResolvedValueOnce(order).mockResolvedValueOnce(intent);

      const result = await repository.createProviderTransaction(createProviderInput());

      expect(intent.providerTransactionId).toBe('provider-tx-1');
      expect(intent.providerCreatedAt).toBe(now);
      expect(intent.state).toBe('pending');
      expect(order.status).toBe('confirmed');
      expect(order.history).toEqual([
        expect.objectContaining({ status: 'confirmed', actorUserId: 'payme:callback' }),
      ]);
      expect(flush).toHaveBeenCalledTimes(1);
      expect(result).toEqual({
        status: 'ok',
        transaction: expect.objectContaining({ state: 'pending', providerTransactionId: 'provider-tx-1' }),
      });
    });
  });

  describe('performProviderTransaction', () => {
    it('returns not_found for an unknown provider transaction', async () => {
      const { findOne, entityManager } = createEntityManagerMock();
      repository = new PostgresPaymentRepository(entityManager);
      findOne.mockResolvedValueOnce(null);

      const result = await repository.performProviderTransaction(tenantId, 'payme', 'provider-tx-1');

      expect(result).toEqual({ status: 'not_found' });
      expect(findOne).toHaveBeenCalledWith(
        PaymentTransactionEntity,
        { tenantId, provider: 'payme', providerTransactionId: 'provider-tx-1' },
        { lockMode: LockMode.PESSIMISTIC_WRITE },
      );
    });

    it('treats a repeated perform on a paid transaction as idempotent', async () => {
      const { flush, findOne, entityManager } = createEntityManagerMock();
      repository = new PostgresPaymentRepository(entityManager);
      findOne.mockResolvedValueOnce(createTransaction({ state: 'paid', providerTransactionId: 'provider-tx-1' }));

      const result = await repository.performProviderTransaction(tenantId, 'payme', 'provider-tx-1');

      expect(result).toEqual({ status: 'ok', transaction: expect.objectContaining({ state: 'paid' }) });
      expect(findOne).toHaveBeenCalledTimes(1);
      expect(flush).not.toHaveBeenCalled();
    });

    it.each(['created', 'cancelled', 'failed', 'refunded'] as PaymentState[])(
      'rejects perform from the %s state',
      async (state) => {
        const { findOne, entityManager } = createEntityManagerMock();
        repository = new PostgresPaymentRepository(entityManager);
        findOne.mockResolvedValueOnce(createTransaction({ state, providerTransactionId: 'provider-tx-1' }));

        const result = await repository.performProviderTransaction(tenantId, 'payme', 'provider-tx-1');

        expect(result).toEqual({ status: 'invalid_state' });
      },
    );

    it('rejects perform when the order is missing or terminal', async () => {
      const { findOne, entityManager } = createEntityManagerMock();
      repository = new PostgresPaymentRepository(entityManager);
      findOne
        .mockResolvedValueOnce(createTransaction({ state: 'pending', providerTransactionId: 'provider-tx-1' }))
        .mockResolvedValueOnce(null);

      const result = await repository.performProviderTransaction(tenantId, 'payme', 'provider-tx-1');

      expect(result).toEqual({ status: 'invalid_state' });
      expect(findOne).toHaveBeenNthCalledWith(
        2,
        OrderEntity,
        { tenantId, id: 'order-1' },
        { lockMode: LockMode.PESSIMISTIC_WRITE },
      );
    });

    it('cancels a payme transaction after the 12h timeout and releases inventory', async () => {
      const { flush, findOne, entityManager } = createEntityManagerMock();
      repository = new PostgresPaymentRepository(entityManager);
      const order = createOrder();
      const product = { stockQuantity: 8, status: 'out_of_stock' } as ProductEntity;
      const transaction = createTransaction({
        state: 'pending',
        providerTransactionId: 'provider-tx-1',
        providerCreatedAt: new Date(Date.now() - 13 * 60 * 60 * 1000),
      });
      findOne.mockResolvedValueOnce(transaction).mockResolvedValueOnce(order).mockResolvedValueOnce(product);

      const result = await repository.performProviderTransaction(tenantId, 'payme', 'provider-tx-1');

      expect(result).toEqual({ status: 'invalid_state' });
      expect(transaction.state).toBe('cancelled');
      expect(transaction.reason).toBe(4);
      expect(product.stockQuantity).toBe(10);
      expect(product.status).toBe('active');
      expect(order.status).toBe('cancelled');
      expect(order.history).toEqual([
        expect.objectContaining({ status: 'cancelled', actorUserId: 'payme:timeout' }),
      ]);
      expect(flush).toHaveBeenCalledTimes(1);
    });

    it('does not time out a click transaction with an old provider timestamp', async () => {
      const { findOne, entityManager } = createEntityManagerMock();
      repository = new PostgresPaymentRepository(entityManager);
      const order = createOrder({ status: 'confirmed' });
      const transaction = createTransaction({
        provider: 'click',
        state: 'pending',
        providerTransactionId: 'provider-tx-1',
        providerCreatedAt: new Date(Date.now() - 48 * 60 * 60 * 1000),
      });
      findOne.mockResolvedValueOnce(transaction).mockResolvedValueOnce(order);

      const result = await repository.performProviderTransaction(tenantId, 'click', 'provider-tx-1');

      expect(result).toEqual({ status: 'ok', transaction: expect.objectContaining({ state: 'paid' }) });
      expect(transaction.state).toBe('paid');
      expect(order.status).toBe('processing');
    });

    it('marks the transaction paid and moves the order to processing', async () => {
      const { flush, findOne, entityManager } = createEntityManagerMock();
      repository = new PostgresPaymentRepository(entityManager);
      const order = createOrder({ status: 'confirmed' });
      const transaction = createTransaction({
        state: 'pending',
        providerTransactionId: 'provider-tx-1',
        providerCreatedAt: now,
      });
      findOne.mockResolvedValueOnce(transaction).mockResolvedValueOnce(order);

      const result = await repository.performProviderTransaction(tenantId, 'payme', 'provider-tx-1');

      expect(transaction.state).toBe('paid');
      expect(order.status).toBe('processing');
      expect(order.history).toEqual([
        expect.objectContaining({ status: 'processing', actorUserId: 'payme:callback' }),
      ]);
      expect(flush).toHaveBeenCalledTimes(1);
      expect(result).toEqual({ status: 'ok', transaction: expect.objectContaining({ state: 'paid' }) });
    });
  });

  describe('cancelProviderTransaction', () => {
    it('returns not_found for an unknown provider transaction', async () => {
      const { findOne, entityManager } = createEntityManagerMock();
      repository = new PostgresPaymentRepository(entityManager);
      findOne.mockResolvedValueOnce(null);

      const result = await repository.cancelProviderTransaction(tenantId, 'payme', 'provider-tx-1', 1);

      expect(result).toEqual({ status: 'not_found' });
    });

    it.each(['cancelled', 'refunded'] as PaymentState[])(
      'treats a repeated cancel on a %s transaction as idempotent',
      async (state) => {
        const { flush, findOne, entityManager } = createEntityManagerMock();
        repository = new PostgresPaymentRepository(entityManager);
        findOne.mockResolvedValueOnce(createTransaction({ state, providerTransactionId: 'provider-tx-1' }));

        const result = await repository.cancelProviderTransaction(tenantId, 'payme', 'provider-tx-1', 1);

        expect(result).toEqual({ status: 'ok', transaction: expect.objectContaining({ state }) });
        expect(flush).not.toHaveBeenCalled();
      },
    );

    it('rejects cancel for a transaction in the created state', async () => {
      const { findOne, entityManager } = createEntityManagerMock();
      repository = new PostgresPaymentRepository(entityManager);
      findOne.mockResolvedValueOnce(createTransaction({ state: 'created', providerTransactionId: 'provider-tx-1' }));

      const result = await repository.cancelProviderTransaction(tenantId, 'payme', 'provider-tx-1', 1);

      expect(result).toEqual({ status: 'invalid_state' });
    });

    it('rejects cancel when the order is missing', async () => {
      const { findOne, entityManager } = createEntityManagerMock();
      repository = new PostgresPaymentRepository(entityManager);
      findOne
        .mockResolvedValueOnce(createTransaction({ state: 'pending', providerTransactionId: 'provider-tx-1' }))
        .mockResolvedValueOnce(null);

      const result = await repository.cancelProviderTransaction(tenantId, 'payme', 'provider-tx-1', 1);

      expect(result).toEqual({ status: 'invalid_state' });
    });

    it('rejects cancel when the order is delivered', async () => {
      const { findOne, entityManager } = createEntityManagerMock();
      repository = new PostgresPaymentRepository(entityManager);
      findOne
        .mockResolvedValueOnce(createTransaction({ state: 'pending', providerTransactionId: 'provider-tx-1' }))
        .mockResolvedValueOnce(createOrder({ status: 'delivered' }));

      const result = await repository.cancelProviderTransaction(tenantId, 'payme', 'provider-tx-1', 1);

      expect(result).toEqual({ status: 'invalid_state' });
    });

    it('cancels a pending transaction and releases product inventory', async () => {
      const { flush, findOne, entityManager } = createEntityManagerMock();
      repository = new PostgresPaymentRepository(entityManager);
      const order = createOrder();
      const product = { stockQuantity: 8, status: 'out_of_stock' } as ProductEntity;
      const transaction = createTransaction({ state: 'pending', providerTransactionId: 'provider-tx-1' });
      findOne.mockResolvedValueOnce(transaction).mockResolvedValueOnce(order).mockResolvedValueOnce(product);

      const result = await repository.cancelProviderTransaction(tenantId, 'payme', 'provider-tx-1', 2);

      expect(transaction.state).toBe('cancelled');
      expect(transaction.reason).toBe(2);
      expect(findOne).toHaveBeenNthCalledWith(
        3,
        ProductEntity,
        { tenantId, id: 'product-1' },
        { lockMode: LockMode.PESSIMISTIC_WRITE },
      );
      expect(product.stockQuantity).toBe(10);
      expect(product.status).toBe('active');
      expect(order.status).toBe('cancelled');
      expect(order.history).toEqual([
        expect.objectContaining({ status: 'cancelled', actorUserId: 'payme:callback' }),
      ]);
      expect(flush).toHaveBeenCalledTimes(1);
      expect(result).toEqual({
        status: 'ok',
        transaction: expect.objectContaining({ state: 'cancelled', reason: 2 }),
      });
    });

    it('skips missing products while releasing input inventory', async () => {
      const { findOne, entityManager } = createEntityManagerMock();
      repository = new PostgresPaymentRepository(entityManager);
      const order = createOrder();
      const transaction = createTransaction({ state: 'pending', providerTransactionId: 'provider-tx-1' });
      findOne.mockResolvedValueOnce(transaction).mockResolvedValueOnce(order).mockResolvedValueOnce(null);

      const result = await repository.cancelProviderTransaction(tenantId, 'payme', 'provider-tx-1', 1);

      expect(result).toEqual({ status: 'ok', transaction: expect.objectContaining({ state: 'cancelled' }) });
      expect(findOne).toHaveBeenNthCalledWith(
        3,
        ProductEntity,
        { tenantId, id: 'product-1' },
        { lockMode: LockMode.PESSIMISTIC_WRITE },
      );
      expect(order.status).toBe('cancelled');
    });

    it('refunds a paid transaction instead of cancelling it', async () => {
      const { findOne, entityManager } = createEntityManagerMock();
      repository = new PostgresPaymentRepository(entityManager);
      const order = createOrder({ status: 'processing' });
      const product = { stockQuantity: 8, status: 'active' } as ProductEntity;
      const transaction = createTransaction({ state: 'paid', providerTransactionId: 'provider-tx-1' });
      findOne.mockResolvedValueOnce(transaction).mockResolvedValueOnce(order).mockResolvedValueOnce(product);

      const result = await repository.cancelProviderTransaction(tenantId, 'payme', 'provider-tx-1', 3);

      expect(transaction.state).toBe('refunded');
      expect(transaction.reason).toBe(3);
      expect(order.status).toBe('cancelled');
      expect(result).toEqual({
        status: 'ok',
        transaction: expect.objectContaining({ state: 'refunded', reason: 3 }),
      });
    });

    it('skips inventory release when the order is already cancelled', async () => {
      const { flush, findOne, entityManager } = createEntityManagerMock();
      repository = new PostgresPaymentRepository(entityManager);
      const order = createOrder({ status: 'cancelled' });
      const transaction = createTransaction({ state: 'pending', providerTransactionId: 'provider-tx-1' });
      findOne.mockResolvedValueOnce(transaction).mockResolvedValueOnce(order);

      const result = await repository.cancelProviderTransaction(tenantId, 'payme', 'provider-tx-1', 5);

      expect(result).toEqual({ status: 'ok', transaction: expect.objectContaining({ state: 'cancelled' }) });
      expect(findOne).toHaveBeenCalledTimes(2);
      expect(order.history).toEqual([]);
      expect(flush).toHaveBeenCalledTimes(1);
    });

    it('restores produce listing availability for produce orders', async () => {
      const { findOne, entityManager } = createEntityManagerMock();
      repository = new PostgresPaymentRepository(entityManager);
      const order = createOrder({
        kind: 'produce',
        produceListingId: 'listing-1',
        items: [{ productId: '', productName: 'Cotton', quantity: 500, unitPriceUzs: 100, totalUzs: 50_000 }],
      });
      const listing = { availableQuantityKg: 100, status: 'reserved' } as unknown as ProduceListingEntity;
      const transaction = createTransaction({ state: 'pending', providerTransactionId: 'provider-tx-1' });
      findOne.mockResolvedValueOnce(transaction).mockResolvedValueOnce(order).mockResolvedValueOnce(listing);

      const result = await repository.cancelProviderTransaction(tenantId, 'payme', 'provider-tx-1', 1);

      expect(result).toEqual({ status: 'ok', transaction: expect.objectContaining({ state: 'cancelled' }) });
      expect(findOne).toHaveBeenNthCalledWith(
        3,
        ProduceListingEntity,
        { tenantId, id: 'listing-1' },
        { lockMode: LockMode.PESSIMISTIC_WRITE },
      );
      expect(listing.availableQuantityKg).toBe(600);
      expect(listing.status).toBe('active');
      expect(order.status).toBe('cancelled');
    });

    it('releases nothing when the produce listing was removed', async () => {
      const { flush, findOne, entityManager } = createEntityManagerMock();
      repository = new PostgresPaymentRepository(entityManager);
      const order = createOrder({
        kind: 'produce',
        produceListingId: 'listing-1',
        items: [{ productId: '', productName: 'Cotton', quantity: 500, unitPriceUzs: 100, totalUzs: 50_000 }],
      });
      const transaction = createTransaction({ state: 'pending', providerTransactionId: 'provider-tx-1' });
      findOne.mockResolvedValueOnce(transaction).mockResolvedValueOnce(order).mockResolvedValueOnce(null);

      const result = await repository.cancelProviderTransaction(tenantId, 'payme', 'provider-tx-1', 1);

      expect(result).toEqual({ status: 'ok', transaction: expect.objectContaining({ state: 'cancelled' }) });
      expect(order.status).toBe('cancelled');
      expect(flush).toHaveBeenCalledTimes(1);
    });

    it('releases nothing when the produce order has no items', async () => {
      const { findOne, entityManager } = createEntityManagerMock();
      repository = new PostgresPaymentRepository(entityManager);
      const order = createOrder({
        kind: 'produce',
        produceListingId: 'listing-1',
        items: [],
        totalAmountUzs: 0,
      });
      const listing = { availableQuantityKg: 100, status: 'reserved' } as unknown as ProduceListingEntity;
      const transaction = createTransaction({ state: 'pending', providerTransactionId: 'provider-tx-1' });
      findOne.mockResolvedValueOnce(transaction).mockResolvedValueOnce(order).mockResolvedValueOnce(listing);

      const result = await repository.cancelProviderTransaction(tenantId, 'payme', 'provider-tx-1', 1);

      expect(result).toEqual({ status: 'ok', transaction: expect.objectContaining({ state: 'cancelled' }) });
      expect(listing.availableQuantityKg).toBe(100);
      expect(listing.status).toBe('reserved');
    });

    it('does not touch the produce listing when the reserved quantity is zero', async () => {
      const { findOne, entityManager } = createEntityManagerMock();
      repository = new PostgresPaymentRepository(entityManager);
      const order = createOrder({
        kind: 'produce',
        produceListingId: 'listing-1',
        items: [{ productId: '', productName: 'Cotton', quantity: 0, unitPriceUzs: 100, totalUzs: 0 }],
        totalAmountUzs: 0,
      });
      const listing = { availableQuantityKg: 100, status: 'reserved' } as unknown as ProduceListingEntity;
      const transaction = createTransaction({ state: 'pending', providerTransactionId: 'provider-tx-1' });
      findOne.mockResolvedValueOnce(transaction).mockResolvedValueOnce(order).mockResolvedValueOnce(listing);

      const result = await repository.cancelProviderTransaction(tenantId, 'payme', 'provider-tx-1', 1);

      expect(result).toEqual({ status: 'ok', transaction: expect.objectContaining({ state: 'cancelled' }) });
      expect(listing.availableQuantityKg).toBe(100);
      expect(listing.status).toBe('reserved');
    });
  });

  describe('findProviderTransaction', () => {
    it('returns the transaction scoped to tenant and provider', async () => {
      const { findOne, entityManager } = createEntityManagerMock();
      repository = new PostgresPaymentRepository(entityManager);
      findOne.mockResolvedValueOnce(createTransaction({ state: 'paid', providerTransactionId: 'provider-tx-1' }));

      const result = await repository.findProviderTransaction(tenantId, 'payme', 'provider-tx-1');

      expect(findOne).toHaveBeenCalledWith(PaymentTransactionEntity, {
        tenantId,
        provider: 'payme',
        providerTransactionId: 'provider-tx-1',
      });
      expect(result).toEqual({ status: 'ok', transaction: expect.objectContaining({ id: 'tx-1' }) });
    });

    it('returns not_found when the transaction belongs to another tenant', async () => {
      const { findOne, entityManager } = createEntityManagerMock();
      repository = new PostgresPaymentRepository(entityManager);
      findOne.mockResolvedValueOnce(null);

      const result = await repository.findProviderTransaction('tenant-2', 'payme', 'provider-tx-1');

      expect(result).toEqual({ status: 'not_found' });
    });
  });

  describe('listProviderTransactions', () => {
    it('lists transactions in the provider window ordered by creation time', async () => {
      const { find, entityManager } = createEntityManagerMock();
      repository = new PostgresPaymentRepository(entityManager);
      const from = new Date('2026-08-01T00:00:00Z');
      const to = new Date('2026-08-05T23:59:59Z');
      const first = createTransaction({
        id: 'tx-1',
        providerTransactionId: 'provider-tx-1',
        providerCreatedAt: new Date('2026-08-02T00:00:00Z'),
      });
      const second = createTransaction({
        id: 'tx-2',
        state: 'paid',
        reason: 0,
        providerTransactionId: 'provider-tx-2',
        providerCreatedAt: new Date('2026-08-03T00:00:00Z'),
      });
      find.mockResolvedValueOnce([first, second]);

      const result = await repository.listProviderTransactions(tenantId, 'click', from, to);

      expect(find).toHaveBeenCalledWith(
        PaymentTransactionEntity,
        { tenantId, provider: 'click', providerCreatedAt: { $gte: from, $lte: to } },
        { orderBy: { providerCreatedAt: 'ASC' } },
      );
      expect(result).toEqual([
        expect.objectContaining({ id: 'tx-1', providerTransactionId: 'provider-tx-1' }),
        expect.objectContaining({ id: 'tx-2', providerTransactionId: 'provider-tx-2', reason: 0 }),
      ]);
    });

    it('returns an empty list when no transactions match the window', async () => {
      const { find, entityManager } = createEntityManagerMock();
      repository = new PostgresPaymentRepository(entityManager);
      find.mockResolvedValueOnce([]);

      const result = await repository.listProviderTransactions(
        tenantId,
        'payme',
        new Date('2026-08-01T00:00:00Z'),
        new Date('2026-08-02T00:00:00Z'),
      );

      expect(result).toEqual([]);
    });
  });
});
