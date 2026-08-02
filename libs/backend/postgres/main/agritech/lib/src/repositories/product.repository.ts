import { EntityManager } from '@mikro-orm/core';
import { Inject, Injectable } from '@nestjs/common';
import type { Product, ProductCategory, ProductRepository } from '@app/backend-feature-product-shared';
import { ProductEntity } from '../entities/product.entity';

export function toProduct(entity: ProductEntity): Product {
  return {
    id: entity.id,
    name: entity.name,
    nameRu: entity.nameRu ?? undefined,
    nameUz: entity.nameUz ?? undefined,
    category: entity.category,
    description: entity.description,
    supplierName: entity.supplierName,
    priceUzs: Number(entity.priceUzs),
    unit: entity.unit,
    stockQuantity: entity.stockQuantity,
    region: entity.region,
    status: entity.status,
    images: entity.images,
    createdAt: entity.createdAt,
    updatedAt: entity.updatedAt,
  };
}

@Injectable()
export class PostgresProductRepository implements ProductRepository {
  constructor(@Inject(EntityManager) private readonly em: EntityManager) {}

  async findActiveById(tenantId: string, id: string): Promise<Product | undefined> {
    const entity = await this.em.findOne(ProductEntity, { tenantId, id, status: 'active' });
    return entity ? toProduct(entity) : undefined;
  }

  async findActive(tenantId: string, filter?: { category?: ProductCategory; region?: string }): Promise<Product[]> {
    const where: { tenantId: string; status: 'active'; category?: ProductCategory; region?: string } = {
      tenantId,
      status: 'active',
    };
    if (filter?.category) {
      where.category = filter.category;
    }
    if (filter?.region) {
      where.region = filter.region;
    }
    const entities = await this.em.find(ProductEntity, where, { orderBy: { createdAt: 'DESC' } });
    return entities.map(toProduct);
  }
}
