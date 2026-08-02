import { Injectable, Inject } from '@nestjs/common';
import { Order, CreateOrderDto, OrderItem, OrderRepository, ProductQueryService } from '../domain';
import { OrderRepositoryInjectToken, ProductQueryServiceInjectToken } from './inject-tokens';

@Injectable()
export class CreateOrderUseCase {
  constructor(
    @Inject(OrderRepositoryInjectToken) private readonly repository: OrderRepository,
    @Inject(ProductQueryServiceInjectToken) private readonly productQuery: ProductQueryService,
  ) {}

  async execute(dto: CreateOrderDto): Promise<Order> {
    const items: OrderItem[] = [];
    for (const item of dto.items) {
      const product = await this.productQuery.getProduct(item.productId);
      if (!product) throw new Error(`Product ${item.productId} not found`);
      items.push({
        productId: product.id,
        productName: product.name,
        quantity: item.quantity,
        unitPriceUzs: product.priceUzs,
        totalUzs: product.priceUzs * item.quantity,
      });
    }

    const id = crypto.randomUUID();
    const order: Order = {
      id, farmerId: dto.farmerId, items,
      totalAmountUzs: items.reduce((s, i) => s + i.totalUzs, 0),
      status: 'pending', paymentMethod: dto.paymentMethod,
      deliveryAddress: dto.deliveryAddress, region: dto.region, notes: dto.notes,
      createdAt: new Date(), updatedAt: new Date(),
    };
    await this.repository.create(order);
    return order;
  }
}

@Injectable()
export class GetOrderUseCase {
  constructor(@Inject(OrderRepositoryInjectToken) private readonly repository: OrderRepository) {}
  async execute(id: string): Promise<Order | undefined> {
    return this.repository.findById(id);
  }
}

@Injectable()
export class ListFarmerOrdersUseCase {
  constructor(@Inject(OrderRepositoryInjectToken) private readonly repository: OrderRepository) {}
  async execute(farmerId: string): Promise<Order[]> {
    return this.repository.findByFarmerId(farmerId);
  }
}
