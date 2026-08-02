import { Injectable, Inject } from '@nestjs/common';
import { Product, CreateProductDto } from '../domain';
import type { ProductRepository } from '../domain';
import { ProductRepositoryInjectToken } from './inject-tokens';

@Injectable()
export class CreateProductUseCase {
  constructor(@Inject(ProductRepositoryInjectToken) private readonly repository: ProductRepository) {}

  async execute(dto: CreateProductDto): Promise<Product> {
    const id = crypto.randomUUID();
    const product: Product = {
      ...dto, id, status: 'active', createdAt: new Date(), updatedAt: new Date(),
    };
    await this.repository.create(product);
    return product;
  }
}

@Injectable()
export class GetProductUseCase {
  constructor(@Inject(ProductRepositoryInjectToken) private readonly repository: ProductRepository) {}
  async execute(id: string): Promise<Product | undefined> {
    return this.repository.findById(id);
  }
}

@Injectable()
export class ListProductsUseCase {
  constructor(@Inject(ProductRepositoryInjectToken) private readonly repository: ProductRepository) {}
  async execute(filter?: { category?: string; region?: string }): Promise<Product[]> {
    return this.repository.findAll(filter);
  }
}
