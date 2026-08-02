import { Inject, Injectable } from '@nestjs/common';
import { ResourceNotFoundException } from '@app/backend-common-exception';
import type { Product, ProductCategory, ProductRepository } from '../domain';
import { ProductRepositoryInjectToken } from './inject-tokens';

@Injectable()
export class GetProductUseCase {
  constructor(@Inject(ProductRepositoryInjectToken) private readonly repository: ProductRepository) {}

  async execute(id: string): Promise<Product> {
    const product = await this.repository.findActiveById(id);
    if (!product) {
      throw new ResourceNotFoundException('catalog-product', id);
    }
    return product;
  }
}

@Injectable()
export class ListProductsUseCase {
  constructor(@Inject(ProductRepositoryInjectToken) private readonly repository: ProductRepository) {}

  execute(filter?: { category?: ProductCategory; region?: string }): Promise<Product[]> {
    return this.repository.findActive(filter);
  }
}
