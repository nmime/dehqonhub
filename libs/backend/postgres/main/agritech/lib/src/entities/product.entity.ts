import { randomUUID } from 'node:crypto';
import { EntitySchema } from '@mikro-orm/core';

export type ProductCategory = 'fertilizer' | 'seed' | 'pesticide' | 'equipment' | 'irrigation' | 'other';
export type ProductStatus = 'active' | 'inactive' | 'out_of_stock';

export class ProductEntity {
  id: string = randomUUID();
  name!: string;
  nameRu: string | null = null;
  category!: ProductCategory;
  description!: string;
  supplierId!: string;
  supplierName!: string;
  priceUzs!: number;
  unit!: string;
  stockQuantity!: number;
  region!: string;
  status: ProductStatus = 'active';
  images: string[] = [];
  createdAt: Date = new Date();
  updatedAt: Date = new Date();
}

export const ProductEntitySchema = new EntitySchema<ProductEntity>({
  class: ProductEntity,
  tableName: 'products',
  properties: {
    id: { type: 'uuid', primary: true },
    name: { type: 'varchar', length: 200 },
    nameRu: { type: 'varchar', length: 200, nullable: true, fieldName: 'name_ru' },
    category: { type: 'varchar', length: 30 },
    description: { type: 'text' },
    supplierId: { type: 'varchar', length: 100, fieldName: 'supplier_id' },
    supplierName: { type: 'varchar', length: 200, fieldName: 'supplier_name' },
    priceUzs: { type: 'decimal', precision: 15, scale: 2, fieldName: 'price_uzs' },
    unit: { type: 'varchar', length: 50 },
    stockQuantity: { type: 'int', fieldName: 'stock_quantity' },
    region: { type: 'varchar', length: 100 },
    status: { type: 'varchar', length: 20, default: 'active' },
    images: { type: 'json', defaultRaw: "'[]'::jsonb" },
    createdAt: { type: 'timestamptz', fieldName: 'created_at', onCreate: () => new Date() },
    updatedAt: { type: 'timestamptz', fieldName: 'updated_at', onCreate: () => new Date(), onUpdate: () => new Date() },
  },
  indexes: [
    { name: 'ix__products__category', properties: ['category'] },
    { name: 'ix__products__region', properties: ['region'] },
    { name: 'ix__products__supplier_id', properties: ['supplierId'] },
    { name: 'ix__products__status', properties: ['status'] },
  ],
});
