import { EntityManager } from '@mikro-orm/core';
import { Inject, Injectable } from '@nestjs/common';
import { ProductEntity } from '../entities/product.entity';
import { Product, CreateProductDto, UpdateProductDto, ProductRepository } from '@app/backend-feature-product-shared';

function toProduct(e: ProductEntity): Product {
  return {
    id: e.id,
    name: e.name,
    nameRu: e.nameRu ?? undefined,
    category: e.category,
    description: e.description,
    supplierId: e.supplierId,
    supplierName: e.supplierName,
    priceUzs: Number(e.priceUzs),
    unit: e.unit,
    stockQuantity: e.stockQuantity,
    region: e.region,
    status: e.status,
    images: e.images,
    createdAt: e.createdAt,
    updatedAt: e.updatedAt,
  };
}

@Injectable()
export class PostgresProductRepository implements ProductRepository {
  constructor(@Inject(EntityManager) private readonly em: EntityManager) {}

  async findById(id: string): Promise<Product | undefined> {
    const e = await this.em.findOne(ProductEntity, { id });
    return e ? toProduct(e) : undefined;
  }

  async findAll(filter?: { category?: string; region?: string; supplierId?: string }): Promise<Product[]> {
    const where: Record<string, unknown> = {};
    if (filter?.category) where.category = filter.category;
    if (filter?.region) where.region = filter.region;
    if (filter?.supplierId) where.supplierId = filter.supplierId;
    const list = await this.em.find(ProductEntity, where, { orderBy: { createdAt: 'DESC' } });
    return list.map(toProduct);
  }

  async create(product: Product): Promise<void> {
    const e = new ProductEntity();
    Object.assign(e, product);
    this.em.persist(e);
    await this.em.flush();
  }

  async update(id: string, data: UpdateProductDto): Promise<void> {
    const e = await this.em.findOne(ProductEntity, { id });
    if (!e) throw new Error(`Product ${id} not found`);
    Object.assign(e, data, { updatedAt: new Date() });
    await this.em.flush();
  }
}
