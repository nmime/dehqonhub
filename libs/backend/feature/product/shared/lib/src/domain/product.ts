export const ProductCategories = ['fertilizer', 'seed', 'pesticide', 'equipment', 'irrigation', 'other'] as const;
export type ProductCategory = (typeof ProductCategories)[number];
export type ProductStatus = 'active' | 'inactive' | 'out_of_stock';

export interface Product {
  id: string;
  name: string;
  nameRu?: string;
  category: ProductCategory;
  description: string;
  supplierName: string;
  priceUzs: number;
  unit: string;
  stockQuantity: number;
  region: string;
  status: ProductStatus;
  images: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface ProductRepository {
  findActiveById(id: string): Promise<Product | undefined>;
  findActive(filter?: { category?: ProductCategory; region?: string }): Promise<Product[]>;
}
