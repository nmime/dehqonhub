// @requirements REQ-AGRITECH-CATALOG-002
import { describe, expect, it, vi } from 'vitest';
import type { ProductRepository } from '../domain';
import { ListProductsUseCase } from './product.use-cases';

describe('ListProductsUseCase', () => {
  it('delegates validated filters to the active-product repository boundary', async () => {
    const findActive = vi.fn(async () => []);
    const useCase = new ListProductsUseCase({ findActive } as unknown as ProductRepository);
    await expect(useCase.execute({ category: 'seed', region: 'Toshkent viloyati' })).resolves.toEqual([]);
    expect(findActive).toHaveBeenCalledWith({ category: 'seed', region: 'Toshkent viloyati' });
  });
});
