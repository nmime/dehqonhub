// @requirements REQ-AGRITECH-CATALOG-002 REQ-AGRITECH-MARKETPLACE-016
import { describe, expect, it, vi } from 'vitest';
import { ResourceNotFoundException } from '@app/backend-common-exception';
import { ProductCategories, type Product, type ProductRepository } from '../domain';
import { GetProductUseCase, ListProductsUseCase } from './product.use-cases';

const product: Product = {
  id: 'product-1',
  name: 'Cotton seed',
  category: 'seed',
  description: 'Certified seed',
  supplierId: 'supplier-1',
  supplierName: 'Agro Supply',
  priceUzs: 25_000,
  unit: 'kg',
  stockQuantity: 50,
  region: 'Toshkent viloyati',
  status: 'active',
  images: [],
  createdAt: new Date('2026-08-02T00:00:00Z'),
  updatedAt: new Date('2026-08-02T00:00:00Z'),
};

describe('ListProductsUseCase', () => {
  it('delegates validated filters to the active-product repository boundary', async () => {
    const findActive = vi.fn(async () => []);
    const useCase = new ListProductsUseCase({ findActive } as unknown as ProductRepository);
    await expect(
      useCase.execute('tenant-agritech', { category: 'seed', region: 'Toshkent viloyati' }),
    ).resolves.toEqual([]);
    expect(findActive).toHaveBeenCalledWith('tenant-agritech', {
      category: 'seed',
      region: 'Toshkent viloyati',
    });
  });

  it('passes an omitted filter through without inventing catalog defaults', async () => {
    const findActive = vi.fn(async () => [product]);
    const useCase = new ListProductsUseCase({ findActive } as unknown as ProductRepository);
    await expect(useCase.execute('tenant-agritech')).resolves.toEqual([product]);
    expect(findActive).toHaveBeenCalledWith('tenant-agritech', undefined);
    expect(ProductCategories).toContain('seed');
  });
});

describe('GetProductUseCase', () => {
  it('returns an active tenant product and rejects missing or cross-tenant identifiers', async () => {
    const findActiveById = vi
      .fn<(...args: [string, string]) => Promise<Product | undefined>>()
      .mockResolvedValueOnce(product)
      .mockResolvedValueOnce(undefined);
    const useCase = new GetProductUseCase({ findActiveById } as unknown as ProductRepository);

    await expect(useCase.execute('tenant-agritech', 'product-1')).resolves.toBe(product);
    await expect(useCase.execute('tenant-agritech', 'missing')).rejects.toBeInstanceOf(ResourceNotFoundException);
    expect(findActiveById).toHaveBeenNthCalledWith(1, 'tenant-agritech', 'product-1');
    expect(findActiveById).toHaveBeenNthCalledWith(2, 'tenant-agritech', 'missing');
  });
});
