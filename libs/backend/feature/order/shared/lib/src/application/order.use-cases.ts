import { Inject, Injectable } from '@nestjs/common';
import { BadRequestException, ConflictException, ResourceNotFoundException } from '@app/backend-common-exception';
import type { CreateOrderDto, Order, OrderOwner, OrderRepository } from '../domain';
import { OrderRepositoryInjectToken } from './inject-tokens';

@Injectable()
export class CreateOrderUseCase {
  constructor(@Inject(OrderRepositoryInjectToken) private readonly repository: OrderRepository) {}

  async execute(owner: OrderOwner, input: CreateOrderDto): Promise<Order> {
    if (!validItems(input.items)) {
      throw new BadRequestException();
    }
    const result = await this.repository.createOwned(owner, input);
    if (result.status !== 'created') {
      if (result.status === 'farmer_not_found') {
        throw new ResourceNotFoundException('farmer-profile');
      }
      if (result.status === 'invalid_product') {
        throw new ResourceNotFoundException('catalog-product', result.productId);
      }
      throw new ConflictException('catalog-product', 'stockQuantity');
    }
    return result.order;
  }
}

@Injectable()
export class GetOrderUseCase {
  constructor(@Inject(OrderRepositoryInjectToken) private readonly repository: OrderRepository) {}

  async execute(owner: OrderOwner, id: string): Promise<Order> {
    const order = await this.repository.findOwned(owner, id);
    if (!order) {
      throw new ResourceNotFoundException('farmer-order', id);
    }
    return order;
  }
}

@Injectable()
export class ListFarmerOrdersUseCase {
  constructor(@Inject(OrderRepositoryInjectToken) private readonly repository: OrderRepository) {}
  execute(owner: OrderOwner): Promise<Order[]> {
    return this.repository.listOwned(owner);
  }
}

function validItems(items: readonly { productId: string; quantity: number }[]): boolean {
  if (items.length === 0) {
    return false;
  }
  const ids = new Set<string>();
  return items.every((item) => {
    if (!Number.isSafeInteger(item.quantity) || item.quantity <= 0 || ids.has(item.productId)) {
      return false;
    }
    ids.add(item.productId);
    return true;
  });
}
