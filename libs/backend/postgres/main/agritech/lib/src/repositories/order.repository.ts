import { EntityManager, LockMode } from '@mikro-orm/core';
import { Inject, Injectable } from '@nestjs/common';
import type {
  CreateOrderDto,
  CreateOwnedOrderResult,
  Order,
  OrderOwner,
  OrderRepository,
} from '@app/backend-feature-order-shared';
import { FarmerEntity } from '../entities/farmer.entity';
import { OrderEntity } from '../entities/order.entity';
import { ProductEntity } from '../entities/product.entity';

function toOrder(entity: OrderEntity): Order {
  return {
    id: entity.id,
    tenantId: entity.tenantId,
    userId: entity.userId,
    farmerId: entity.farmerId,
    items: entity.items,
    totalAmountUzs: Number(entity.totalAmountUzs),
    status: entity.status,
    deliveryAddress: entity.deliveryAddress,
    region: entity.region,
    notes: entity.notes ?? undefined,
    createdAt: entity.createdAt,
    updatedAt: entity.updatedAt,
  };
}

@Injectable()
export class PostgresOrderRepository implements OrderRepository {
  constructor(@Inject(EntityManager) private readonly em: EntityManager) {}

  createOwned(owner: OrderOwner, input: CreateOrderDto): Promise<CreateOwnedOrderResult> {
    return this.em.transactional(async (em) => {
      const farmer = await em.findOne(FarmerEntity, owner);
      if (!farmer) {
        return { status: 'farmer_not_found' };
      }

      const lines: OrderEntity['items'] = [];
      for (const requested of input.items) {
        // Product rows are deliberately locked and validated in request order within one transaction.
        // eslint-disable-next-line no-await-in-loop
        const product = await em.findOne(
          ProductEntity,
          { tenantId: owner.tenantId, id: requested.productId, status: 'active' },
          { lockMode: LockMode.PESSIMISTIC_WRITE },
        );
        if (!product) {
          return { status: 'invalid_product', productId: requested.productId };
        }
        if (product.stockQuantity < requested.quantity) {
          return { status: 'insufficient_stock', productId: requested.productId };
        }
        product.stockQuantity -= requested.quantity;
        lines.push({
          productId: product.id,
          productName: product.name,
          quantity: requested.quantity,
          unitPriceUzs: Number(product.priceUzs),
          totalUzs: Number(product.priceUzs) * requested.quantity,
        });
      }

      const order = new OrderEntity();
      Object.assign(order, {
        ...owner,
        farmerId: farmer.id,
        items: lines,
        totalAmountUzs: lines.reduce((total, line) => total + line.totalUzs, 0),
        deliveryAddress: input.deliveryAddress,
        region: input.region,
        notes: input.notes ?? null,
      });
      em.persist(order);
      await em.flush();
      return { status: 'created', order: toOrder(order) };
    });
  }

  async findOwned(owner: OrderOwner, id: string): Promise<Order | undefined> {
    const entity = await this.em.findOne(OrderEntity, { ...owner, id });
    return entity ? toOrder(entity) : undefined;
  }

  async listOwned(owner: OrderOwner): Promise<Order[]> {
    const entities = await this.em.find(OrderEntity, owner, { orderBy: { createdAt: 'DESC' } });
    return entities.map(toOrder);
  }
}
