export type ProductCategory = 'fertilizer' | 'seed' | 'pesticide' | 'equipment' | 'irrigation' | 'other';
export type ProductStatus = 'active' | 'inactive' | 'out_of_stock';

export interface Product {
  id: string;
  name: string;
  nameRu?: string;
  category: ProductCategory;
  description: string;
  supplierId: string;
  supplierName: string;
  priceUzs: number;
  unit: string;
  stockQuantity: number;
  region: string;
  status: ProductStatus;
  images?: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateProductDto {
  name: string;
  nameRu?: string;
  category: ProductCategory;
  description: string;
  supplierId: string;
  supplierName: string;
  priceUzs: number;
  unit: string;
  stockQuantity: number;
  region: string;
  images?: string[];
}

export interface UpdateProductDto {
  name?: string;
  nameRu?: string;
  description?: string;
  priceUzs?: number;
  stockQuantity?: number;
  status?: ProductStatus;
  images?: string[];
}

export function createProduct(dto: CreateProductDto, id: string): Product {
  return {
    ...dto,
    id,
    status: 'active',
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

export interface ProductRepository {
  findById(id: string): Promise<Product | undefined>;
  findAll(filter?: { category?: string; region?: string; supplierId?: string }): Promise<Product[]>;
  create(product: Product): Promise<void>;
  update(id: string, data: UpdateProductDto): Promise<void>;
}

