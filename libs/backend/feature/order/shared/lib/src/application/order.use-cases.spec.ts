// @requirements REQ-AGRITECH-ORDER-003
import { describe, expect, it, vi } from 'vitest';
import { BadRequestException } from '@app/backend-common-exception';
import type { OrderRepository } from '../domain';
import { CreateOrderUseCase } from './order.use-cases';

describe('CreateOrderUseCase', () => {
  it('rejects duplicate product lines before opening a persistence transaction', async () => {
    const createOwned = vi.fn();
    const useCase = new CreateOrderUseCase({ createOwned } as unknown as OrderRepository);
    await expect(
      useCase.execute(
        { tenantId: 't', userId: 'u' },
        {
          items: [
            { productId: 'p', quantity: 1 },
            { productId: 'p', quantity: 2 },
          ],
          deliveryAddress: 'A',
          region: 'R',
        },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(createOwned).not.toHaveBeenCalled();
  });
});
