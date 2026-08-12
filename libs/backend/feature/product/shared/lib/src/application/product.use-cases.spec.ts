// @requirements REQ-AGRITECH-CATALOG-002 REQ-AGRITECH-MARKETPLACE-016
import { describe, expect, it, vi } from 'vitest';
import { ResourceNotFoundException } from '@app/backend-common-exception';
import { DemoProducts, ProductCategories, type Product, type ProductRepository } from '../domain';
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

const firstDemoProduct = DemoProducts[0]!;

describe('ListProductsUseCase', () => {
  it('delegates validated filters to the active-product repository boundary', async () => {
    const findActive = vi.fn(async () => [product]);
    const useCase = new ListProductsUseCase({ findActive } as unknown as ProductRepository);
    await expect(
      useCase.execute('tenant-agritech', { category: 'seed', region: 'Toshkent viloyati' }),
    ).resolves.toEqual({ demo: false, items: [product] });
    expect(findActive).toHaveBeenCalledWith('tenant-agritech', {
      category: 'seed',
      region: 'Toshkent viloyati',
    });
  });

  it('passes an omitted filter through without inventing catalog defaults', async () => {
    const findActive = vi.fn(async () => [product]);
    const useCase = new ListProductsUseCase({ findActive } as unknown as ProductRepository);
    await expect(useCase.execute('tenant-agritech')).resolves.toEqual({ demo: false, items: [product] });
    expect(findActive).toHaveBeenCalledWith('tenant-agritech', undefined);
    expect(ProductCategories).toContain('seed');
  });

  it('answers a tenant that has published nothing with the demo catalog', async () => {
    const findActive = vi.fn(async () => []);
    const useCase = new ListProductsUseCase({ findActive } as unknown as ProductRepository);

    const listing = await useCase.execute('tenant-agritech');

    expect(listing.demo).toBe(true);
    expect(listing.items).toEqual([...DemoProducts]);
  });

  it('applies the requested filter to the demo catalog as the repository would', async () => {
    const findActive = vi.fn(async () => []);
    const useCase = new ListProductsUseCase({ findActive } as unknown as ProductRepository);

    const listing = await useCase.execute('tenant-agritech', { category: 'irrigation' });

    expect(listing.demo).toBe(true);
    expect(listing.items.length).toBeGreaterThan(0);
    expect(listing.items.every((item) => item.category === 'irrigation')).toBe(true);
  });

  // A filter that matches none of a stocked tenant's listings is a real empty
  // result. Answering it with demo rows would look like the filter was ignored.
  it('keeps a filtered empty page empty when the tenant does have listings', async () => {
    const findActive = vi
      .fn<(tenantId: string, filter?: { region?: string }) => Promise<Product[]>>()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([product]);
    const useCase = new ListProductsUseCase({ findActive } as unknown as ProductRepository);

    await expect(useCase.execute('tenant-agritech', { region: 'Xorazm' })).resolves.toEqual({
      demo: false,
      items: [],
    });
    expect(findActive).toHaveBeenNthCalledWith(2, 'tenant-agritech');
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

  // Product detail has to work for the rows the list read just handed out, or
  // every card on a demo catalog would open onto a not-found page.
  it('resolves a demo listing the tenant catalog does not hold', async () => {
    const findActiveById = vi.fn(async () => undefined);
    const useCase = new GetProductUseCase({ findActiveById } as unknown as ProductRepository);

    await expect(useCase.execute('tenant-agritech', firstDemoProduct.id)).resolves.toEqual(firstDemoProduct);
  });
});
