export const ProductCategories = ['fertilizer', 'seed', 'pesticide', 'equipment', 'irrigation', 'other'] as const;
export type ProductCategory = (typeof ProductCategories)[number];
export type ProductStatus = 'active' | 'inactive' | 'out_of_stock';

export interface Product {
  id: string;
  name: string;
  nameRu?: string;
  nameUz?: string;
  nameUzCyrl?: string;
  category: ProductCategory;
  description: string;
  supplierId: string;
  supplierName: string;
  priceUzs: number;
  unit: string;
  stockQuantity: number;
  sampleAvailable: boolean;
  region: string;
  status: ProductStatus;
  images: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface ProductRepository {
  findActiveById(tenantId: string, id: string): Promise<Product | undefined>;
  findActive(tenantId: string, filter?: { category?: ProductCategory; region?: string }): Promise<Product[]>;
}
