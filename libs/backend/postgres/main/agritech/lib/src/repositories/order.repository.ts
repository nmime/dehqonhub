import { EntityManager } from '@mikro-orm/core';
import { Inject, Injectable } from '@nestjs/common';
import { OrderEntity } from '../entities/order.entity';
import { ProductEntity } from '../entities/product.entity';
import { Order, CreateOrderDto, OrderRepository, ProductQueryService } from '@app/backend-feature-order-shared';

function toOrder(e: OrderEntity): Order {
  return {
    id: e.id,
    farmerId: e.farmerId,
    items: e.items,
    totalAmountUzs: Number(e.totalAmountUzs),
    status: e.status,
    paymentMethod: e.paymentMethod ?? undefined,
    deliveryAddress: e.deliveryAddress,
    region: e.region,
    notes: e.notes ?? undefined,
    createdAt: e.createdAt,
    updatedAt: e.updatedAt,
  };
}

@Injectable()
export class PostgresOrderRepository implements OrderRepository {
  constructor(@Inject(EntityManager) private readonly em: EntityManager) {}

  async findById(id: string): Promise<Order | undefined> {
    const e = await this.em.findOne(OrderEntity, { id });
    return e ? toOrder(e) : undefined;
  }

  async findByFarmerId(farmerId: string): Promise<Order[]> {
    const list = await this.em.find(OrderEntity, { farmerId }, { orderBy: { createdAt: 'DESC' } });
    return list.map(toOrder);
  }

  async create(order: Order): Promise<void> {
    const e = new OrderEntity();
    Object.assign(e, order);
    this.em.persist(e);
    await this.em.flush();
  }

  async updateStatus(id: string, status: string): Promise<void> {
    const e = await this.em.findOne(OrderEntity, { id });
    if (!e) throw new Error(`Order ${id} not found`);
    e.status = status as any;
    e.updatedAt = new Date();
    await this.em.flush();
  }
}

// Product query service delegates to product repository
@Injectable()
export class PostgresProductQueryService implements ProductQueryService {
  constructor(@Inject(EntityManager) private readonly em: EntityManager) {}

  async getProduct(productId: string): Promise<{ id: string; name: string; priceUzs: number } | undefined> {
    const e = await this.em.findOne(ProductEntity, { id: productId });
    if (!e) return undefined;
    return { id: e.id, name: e.name, priceUzs: Number(e.priceUzs) };
  }
}
