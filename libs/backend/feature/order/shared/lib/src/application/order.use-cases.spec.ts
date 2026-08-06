// @requirements REQ-AGRITECH-ORDER-003
import { describe, expect, it, vi } from 'vitest';
import { BadRequestException, ConflictException, ResourceNotFoundException } from '@app/backend-common-exception';
import type { CreateOrderDto, Order, OrderOwner, OrderRepository } from '../domain';
import { CreateOrderUseCase, GetOrderUseCase, ListFarmerOrdersUseCase } from './order.use-cases';

const owner: OrderOwner = { tenantId: 'tenant-1', userId: 'user-1' };
const input: CreateOrderDto = {
  items: [{ productId: 'product-1', quantity: 2 }],
  deliveryAddress: 'Toshkent',
  region: 'Toshkent viloyati',
};
const order: Order = {
  ...owner,
  id: 'order-1',
  farmerId: 'farmer-1',
  items: [{ productId: 'product-1', quantity: 2, productName: 'Seed', unitPriceUzs: 5_000, totalUzs: 10_000 }],
  totalAmountUzs: 10_000,
  status: 'pending',
  deliveryAddress: input.deliveryAddress,
  region: input.region,
  createdAt: new Date('2026-08-02T00:00:00Z'),
  updatedAt: new Date('2026-08-02T00:00:00Z'),
};

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

  it.each([
    { items: [], label: 'empty' },
    { items: [{ productId: 'p', quantity: 0 }], label: 'zero quantity' },
    { items: [{ productId: 'p', quantity: 1.5 }], label: 'fractional quantity' },
  ])('rejects $label item collections before persistence', async ({ items }) => {
    const createOwned = vi.fn();
    const useCase = new CreateOrderUseCase({ createOwned } as unknown as OrderRepository);
    await expect(useCase.execute(owner, { ...input, items })).rejects.toBeInstanceOf(BadRequestException);
    expect(createOwned).not.toHaveBeenCalled();
  });

  it.each([
    [{ status: 'farmer_not_found' } as const, ResourceNotFoundException],
    [{ status: 'invalid_product', productId: 'missing' } as const, ResourceNotFoundException],
    [{ status: 'insufficient_stock', productId: 'product-1' } as const, ConflictException],
  ])('maps repository result %o to its public domain exception', async (result, exceptionType) => {
    const repository = { createOwned: vi.fn().mockResolvedValue(result) } as unknown as OrderRepository;
    await expect(new CreateOrderUseCase(repository).execute(owner, input)).rejects.toBeInstanceOf(exceptionType);
  });

  it('returns the transactionally created order', async () => {
    const createOwned = vi.fn().mockResolvedValue({ status: 'created', order });
    await expect(
      new CreateOrderUseCase({ createOwned } as unknown as OrderRepository).execute(owner, input),
    ).resolves.toBe(order);
  });
});

describe('order queries', () => {
  it('loads and lists only orders owned by the authenticated farmer', async () => {
    const findOwned = vi.fn().mockResolvedValueOnce(order).mockResolvedValueOnce(undefined);
    const listOwned = vi.fn().mockResolvedValue([order]);
    const repository = { findOwned, listOwned } as unknown as OrderRepository;

    await expect(new GetOrderUseCase(repository).execute(owner, order.id)).resolves.toBe(order);
    await expect(new GetOrderUseCase(repository).execute(owner, 'missing')).rejects.toBeInstanceOf(
      ResourceNotFoundException,
    );
    await expect(new ListFarmerOrdersUseCase(repository).execute(owner)).resolves.toEqual([order]);
    expect(listOwned).toHaveBeenCalledWith(owner);
  });
});
