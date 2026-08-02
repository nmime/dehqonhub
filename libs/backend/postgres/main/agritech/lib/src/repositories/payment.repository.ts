import { EntityManager, LockMode } from '@mikro-orm/core';
import { Inject, Injectable } from '@nestjs/common';
import type {
  CreatePaymentDto,
  PaymentOwner,
  PaymentProvider,
  PaymentRepository,
  PaymentRepositoryResult,
  PaymentTransaction,
} from '@app/backend-feature-payment-shared';
import { OrderEntity } from '../entities/order.entity';
import { PaymentTransactionEntity } from '../entities/operations.entity';
import { ProduceListingEntity } from '../entities/operations.entity';
import { ProductEntity } from '../entities/product.entity';

@Injectable()
export class PostgresPaymentRepository implements PaymentRepository {
  constructor(@Inject(EntityManager) private readonly em: EntityManager) {}

  createIntent(owner: PaymentOwner, input: CreatePaymentDto): Promise<PaymentRepositoryResult> {
    return this.em.transactional(async (em) => {
      const existing = await em.findOne(PaymentTransactionEntity, {
        tenantId: owner.tenantId,
        provider: input.provider,
        idempotencyKey: input.idempotencyKey,
      });
      if (existing) {
        return existing.orderId === input.orderId && existing.userId === owner.userId
          ? { status: 'ok', transaction: toPayment(existing) }
          : { status: 'conflict' };
      }
      const order = await em.findOne(OrderEntity, {
        tenantId: owner.tenantId,
        id: input.orderId,
        userId: owner.userId,
      });
      if (!order) {
        return { status: 'not_found' };
      }
      if (order.status === 'cancelled' || order.status === 'delivered') {
        return { status: 'invalid_state' };
      }
      const entity = new PaymentTransactionEntity();
      Object.assign(entity, {
        tenantId: owner.tenantId,
        orderId: order.id,
        userId: owner.userId,
        provider: input.provider,
        idempotencyKey: input.idempotencyKey,
        amountUzs: Number(order.totalAmountUzs),
      });
      em.persist(entity);
      await em.flush();
      return { status: 'ok', transaction: toPayment(entity) };
    });
  }

  async checkOrder(tenantId: string, orderId: string, amountUzs: number): Promise<PaymentRepositoryResult> {
    const order = await this.em.findOne(OrderEntity, { tenantId, id: orderId });
    if (!order) {
      return { status: 'not_found' };
    }
    if (Number(order.totalAmountUzs) !== amountUzs) {
      return { status: 'amount_mismatch' };
    }
    if (order.status === 'cancelled' || order.status === 'delivered') {
      return { status: 'invalid_state' };
    }
    const intent = await this.em.findOne(
      PaymentTransactionEntity,
      { tenantId, orderId },
      { orderBy: { createdAt: 'DESC' } },
    );
    return intent ? { status: 'ok', transaction: toPayment(intent) } : { status: 'not_found' };
  }

  createProviderTransaction(input: {
    tenantId: string;
    provider: PaymentProvider;
    providerTransactionId: string;
    orderId: string;
    amountUzs: number;
    providerCreatedAt: Date;
  }): Promise<PaymentRepositoryResult> {
    return this.em.transactional(async (em) => {
      const replay = await em.findOne(PaymentTransactionEntity, {
        tenantId: input.tenantId,
        provider: input.provider,
        providerTransactionId: input.providerTransactionId,
      });
      if (replay) {
        if (replay.orderId !== input.orderId || Number(replay.amountUzs) !== input.amountUzs) {
          return { status: 'conflict' };
        }
        return { status: 'ok', transaction: toPayment(replay) };
      }
      const order = await em.findOne(
        OrderEntity,
        { tenantId: input.tenantId, id: input.orderId },
        { lockMode: LockMode.PESSIMISTIC_WRITE },
      );
      if (!order) {
        return { status: 'not_found' };
      }
      if (Number(order.totalAmountUzs) !== input.amountUzs) {
        return { status: 'amount_mismatch' };
      }
      if (order.status === 'cancelled' || order.status === 'delivered') {
        return { status: 'invalid_state' };
      }
      const intent = await em.findOne(
        PaymentTransactionEntity,
        { tenantId: input.tenantId, orderId: order.id, provider: input.provider, state: 'created' },
        { orderBy: { createdAt: 'DESC' }, lockMode: LockMode.PESSIMISTIC_WRITE },
      );
      if (!intent) {
        return { status: 'not_found' };
      }
      intent.providerTransactionId = input.providerTransactionId;
      intent.providerCreatedAt = input.providerCreatedAt;
      intent.state = 'pending';
      order.status = 'confirmed';
      order.history = [
        ...order.history,
        { status: 'confirmed', actorUserId: `${input.provider}:callback`, at: new Date().toISOString() },
      ];
      await em.flush();
      return { status: 'ok', transaction: toPayment(intent) };
    });
  }

  performProviderTransaction(
    tenantId: string,
    provider: PaymentProvider,
    providerTransactionId: string,
  ): Promise<PaymentRepositoryResult> {
    return this.em.transactional(async (em) => {
      const transaction = await em.findOne(
        PaymentTransactionEntity,
        { tenantId, provider, providerTransactionId },
        { lockMode: LockMode.PESSIMISTIC_WRITE },
      );
      if (!transaction) {
        return { status: 'not_found' };
      }
      if (transaction.state === 'paid') {
        return { status: 'ok', transaction: toPayment(transaction) };
      }
      if (transaction.state !== 'pending') {
        return { status: 'invalid_state' };
      }
      const order = await em.findOne(
        OrderEntity,
        { tenantId, id: transaction.orderId },
        { lockMode: LockMode.PESSIMISTIC_WRITE },
      );
      if (!order || order.status === 'cancelled' || order.status === 'delivered') {
        return { status: 'invalid_state' };
      }
      if (
        provider === 'payme' &&
        transaction.providerCreatedAt &&
        transaction.providerCreatedAt.getTime() + 12 * 60 * 60 * 1000 < Date.now()
      ) {
        transaction.state = 'cancelled';
        transaction.reason = 4;
        await releaseInventory(em, order);
        order.status = 'cancelled';
        order.history = [
          ...order.history,
          { status: 'cancelled', actorUserId: 'payme:timeout', at: new Date().toISOString() },
        ];
        await em.flush();
        return { status: 'invalid_state' };
      }
      transaction.state = 'paid';
      order.status = 'processing';
      order.history = [
        ...order.history,
        { status: 'processing', actorUserId: `${provider}:callback`, at: new Date().toISOString() },
      ];
      await em.flush();
      return { status: 'ok', transaction: toPayment(transaction) };
    });
  }

  cancelProviderTransaction(
    tenantId: string,
    provider: PaymentProvider,
    providerTransactionId: string,
    reason: number,
  ): Promise<PaymentRepositoryResult> {
    return this.em.transactional(async (em) => {
      const transaction = await em.findOne(
        PaymentTransactionEntity,
        { tenantId, provider, providerTransactionId },
        { lockMode: LockMode.PESSIMISTIC_WRITE },
      );
      if (!transaction) {
        return { status: 'not_found' };
      }
      if (transaction.state === 'cancelled' || transaction.state === 'refunded') {
        return { status: 'ok', transaction: toPayment(transaction) };
      }
      if (!['pending', 'paid'].includes(transaction.state)) {
        return { status: 'invalid_state' };
      }
      const order = await em.findOne(
        OrderEntity,
        { tenantId, id: transaction.orderId },
        { lockMode: LockMode.PESSIMISTIC_WRITE },
      );
      if (!order || order.status === 'delivered') {
        return { status: 'invalid_state' };
      }
      transaction.state = transaction.state === 'paid' ? 'refunded' : 'cancelled';
      transaction.reason = reason;
      if (order.status !== 'cancelled') {
        await releaseInventory(em, order);
        order.status = 'cancelled';
        order.history = [
          ...order.history,
          { status: 'cancelled', actorUserId: `${provider}:callback`, at: new Date().toISOString() },
        ];
      }
      await em.flush();
      return { status: 'ok', transaction: toPayment(transaction) };
    });
  }

  async findProviderTransaction(
    tenantId: string,
    provider: PaymentProvider,
    providerTransactionId: string,
  ): Promise<PaymentRepositoryResult> {
    const transaction = await this.em.findOne(PaymentTransactionEntity, { tenantId, provider, providerTransactionId });
    return transaction ? { status: 'ok', transaction: toPayment(transaction) } : { status: 'not_found' };
  }

  async listProviderTransactions(
    tenantId: string,
    provider: PaymentProvider,
    from: Date,
    to: Date,
  ): Promise<PaymentTransaction[]> {
    const transactions = await this.em.find(
      PaymentTransactionEntity,
      { tenantId, provider, providerCreatedAt: { $gte: from, $lte: to } },
      { orderBy: { providerCreatedAt: 'ASC' } },
    );
    return transactions.map(toPayment);
  }
}

async function releaseInventory(em: EntityManager, order: OrderEntity): Promise<void> {
  if (order.kind === 'produce' && order.produceListingId) {
    const listing = await em.findOne(
      ProduceListingEntity,
      { tenantId: order.tenantId, id: order.produceListingId },
      { lockMode: LockMode.PESSIMISTIC_WRITE },
    );
    const quantity = order.items[0]?.quantity ?? 0;
    if (listing && quantity > 0) {
      listing.availableQuantityKg += quantity;
      listing.status = 'active';
    }
    return;
  }
  for (const item of order.items) {
    // Deterministic request order prevents lock inversion across cancellation paths.
    // eslint-disable-next-line no-await-in-loop
    const product = await em.findOne(
      ProductEntity,
      { tenantId: order.tenantId, id: item.productId },
      { lockMode: LockMode.PESSIMISTIC_WRITE },
    );
    if (product) {
      product.stockQuantity += item.quantity;
      if (product.status === 'out_of_stock') {
        product.status = 'active';
      }
    }
  }
}

const toPayment = (entity: PaymentTransactionEntity): PaymentTransaction => ({
  id: entity.id,
  tenantId: entity.tenantId,
  orderId: entity.orderId,
  userId: entity.userId,
  provider: entity.provider,
  idempotencyKey: entity.idempotencyKey,
  amountUzs: Number(entity.amountUzs),
  state: entity.state,
  ...(entity.providerTransactionId ? { providerTransactionId: entity.providerTransactionId } : {}),
  ...(entity.providerCreatedAt ? { providerCreatedAt: entity.providerCreatedAt } : {}),
  ...(entity.reason === null ? {} : { reason: entity.reason }),
  createdAt: entity.createdAt,
  updatedAt: entity.updatedAt,
});
