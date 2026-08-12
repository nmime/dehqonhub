import { Inject, Injectable } from '@nestjs/common';
import { ResourceNotFoundException } from '@app/backend-common-exception';
import {
  filterDemoProducts,
  findDemoProduct,
  type Product,
  type ProductCategory,
  type ProductRepository,
} from '../domain';
import { ProductRepositoryInjectToken } from './inject-tokens';

/** A catalog page plus whether it is the tenant's own listings or demo content. */
export interface ProductListing {
  demo: boolean;
  items: Product[];
}

@Injectable()
export class GetProductUseCase {
  constructor(@Inject(ProductRepositoryInjectToken) private readonly repository: ProductRepository) {}

  async execute(tenantId: string, id: string): Promise<Product> {
    const product = (await this.repository.findActiveById(tenantId, id)) ?? findDemoProduct(id);
    if (!product) {
      throw new ResourceNotFoundException('catalog-product', id);
    }
    return product;
  }
}

@Injectable()
export class ListProductsUseCase {
  constructor(@Inject(ProductRepositoryInjectToken) private readonly repository: ProductRepository) {}

  /**
   * A tenant that has published nothing would answer every query with an empty
   * page, which leaves the marketplace with no shelves, no filter options and
   * nothing to search. The demo dataset stands in for it, and the `demo` flag
   * tells the caller which of the two it received.
   */
  async execute(tenantId: string, filter?: { category?: ProductCategory; region?: string }): Promise<ProductListing> {
    const items = await this.repository.findActive(tenantId, filter);
    if (items.length > 0) {
      return { demo: false, items };
    }
    // An empty *filtered* page still counts as a real catalog, so the fallback
    // asks the unfiltered question first: only a tenant with no listings at all
    // hands the surface over to demo content.
    const published = filter ? await this.repository.findActive(tenantId) : items;
    return published.length > 0 ? { demo: false, items } : { demo: true, items: filterDemoProducts(filter) };
  }
}
