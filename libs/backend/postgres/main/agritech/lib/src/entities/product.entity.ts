import { randomUUID } from 'node:crypto';
import { EntitySchema } from '@mikro-orm/core';

export type ProductCategory = 'fertilizer' | 'seed' | 'pesticide' | 'equipment' | 'irrigation' | 'other';
export type ProductStatus = 'active' | 'inactive' | 'out_of_stock';

export class ProductEntity {
  id: string = randomUUID();
  tenantId!: string;
  name!: string;
  nameRu: string | null = null;
  nameUz: string | null = null;
  nameUzCyrl: string | null = null;
  category!: ProductCategory;
  description!: string;
  supplierId!: string;
  supplierName!: string;
  priceUzs!: number;
  unit!: string;
  stockQuantity!: number;
  sampleAvailable = false;
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
    tenantId: { type: 'varchar', length: 100, fieldName: 'tenant_id' },
    name: { type: 'varchar', length: 200 },
    nameRu: { type: 'varchar', length: 200, nullable: true, fieldName: 'name_ru' },
    nameUz: { type: 'varchar', length: 200, nullable: true, fieldName: 'name_uz' },
    nameUzCyrl: { type: 'varchar', length: 200, nullable: true, fieldName: 'name_uz_cyrl' },
    category: { type: 'varchar', length: 30 },
    description: { type: 'text' },
    supplierId: { type: 'varchar', length: 100, fieldName: 'supplier_id' },
    supplierName: { type: 'varchar', length: 200, fieldName: 'supplier_name' },
    priceUzs: { type: 'decimal', precision: 15, scale: 2, fieldName: 'price_uzs' },
    unit: { type: 'varchar', length: 50 },
    stockQuantity: { type: 'int', fieldName: 'stock_quantity' },
    sampleAvailable: { type: 'boolean', fieldName: 'sample_available', default: false },
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
    { name: 'ix__products__tenant_id_status', properties: ['tenantId', 'status'] },
  ],
});
