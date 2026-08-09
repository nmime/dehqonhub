// @requirements REQ-AGRITECH-ORDER-003 REQ-AGRITECH-PARTNER-007 REQ-AGRITECH-MARKETPLACE-016
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EntityManager } from '@mikro-orm/core';
import { PostgresMarketplaceRepository } from './marketplace.repository';

const owner = { tenantId: 'tenant-1', userId: 'user-1' };
const sellerPartnerId = 'partner-seller-1';
const sellerOwnerUserId = 'seller-user-1';
const now = new Date('2026-08-09T00:00:00Z');

function makeEm(overrides: Partial<Record<string, ReturnType<typeof vi.fn>>> = {}) {
  const execute = vi.fn().mockResolvedValue([]);
  const em = {
    findOne: vi.fn().mockResolvedValue(null),
    find: vi.fn().mockResolvedValue([]),
    count: vi.fn().mockResolvedValue(0),
    persist: vi.fn(),
    flush: vi.fn().mockResolvedValue(undefined),
    nativeDelete: vi.fn().mockResolvedValue(1),
    getConnection: vi.fn(() => ({ execute })),
    transactional: vi.fn(async (cb: (em: unknown) => unknown) => cb(em)),
    ...overrides,
  };
  return em as unknown as EntityManager & typeof em;
}

function verificationEntity(overrides: Record<string, unknown> = {}) {
  return {
    id: 'v-1',
    tenantId: 'tenant-1',
    userId: 'user-1',
    role: 'farmer',
    level: 'verified',
    status: 'pending',
    oneIdLinked: true,
    documents: [{ kind: 'id', fileName: 'p.jpg', storageKey: 'k1' }],
    reviewedBy: null,
    reviewedAt: null,
    rejectionReason: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function productEntity(overrides: Record<string, unknown> = {}) {
  return {
    id: 'p-1',
    tenantId: 'tenant-1',
    name: 'Corn seed',
    category: 'seed',
    description: 'd',
    supplierId: sellerPartnerId,
    supplierName: 'Agro',
    priceUzs: 500000,
    unit: 'kg',
    stockQuantity: 100,
    region: 'Samarkand',
    status: 'active',
    images: [],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function partnerEntity(overrides: Record<string, unknown> = {}) {
  return {
    id: sellerPartnerId,
    tenantId: 'tenant-1',
    ownerUserId: sellerOwnerUserId,
    kind: 'supplier',
    status: 'approved',
    ...overrides,
  };
}

describe('PostgresMarketplaceRepository — verification', () => {
  let em: ReturnType<typeof makeEm>;
  let repo: PostgresMarketplaceRepository;

  beforeEach(() => {
    em = makeEm();
    repo = new PostgresMarketplaceRepository(em as unknown as EntityManager);
  });

  it('returns undefined when no verification exists', async () => {
    em.findOne.mockResolvedValue(null);
    expect(await repo.getVerification(owner)).toBeUndefined();
  });

  it('reviews a pending verification to verified', async () => {
    em.findOne.mockResolvedValue(verificationEntity());
    const result = await repo.reviewVerification('tenant-1', 'v-1', 'verified', 'admin-1');
    expect(em.flush).toHaveBeenCalled();
    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(result.value.status).toBe('verified');
      expect(result.value.reviewedBy).toBe('admin-1');
    }
  });

  it('rejects review of a non-pending verification', async () => {
    em.findOne.mockResolvedValue(verificationEntity({ status: 'verified' }));
    const result = await repo.reviewVerification('tenant-1', 'v-1', 'verified', 'admin-1');
    expect(result).toMatchObject({ status: 'conflict', field: 'status' });
  });

  it.each([
    ['rejected', undefined],
    ['verified', 'criteria_not_met'],
  ] as const)('rejects invalid verification reason provenance for %s', async (decision, reason) => {
    const result = await repo.reviewVerification('tenant-1', 'v-1', decision, 'admin-1', reason);
    expect(result).toMatchObject({ status: 'invalid_state', field: 'reason' });
    expect(em.transactional).not.toHaveBeenCalled();
  });
});

describe('PostgresMarketplaceRepository — cart', () => {
  let em: ReturnType<typeof makeEm>;
  let repo: PostgresMarketplaceRepository;

  beforeEach(() => {
    em = makeEm();
    repo = new PostgresMarketplaceRepository(em as unknown as EntityManager);
  });

  it('creates a new cart for a new seller', async () => {
    em.findOne.mockImplementation(async (entity: unknown, where: { id?: string }) => {
      if (String(entity).includes('Product')) {
        return productEntity();
      }
      return null;
    });
    const result = await repo.addToCart(owner, { productId: 'p-1', quantity: 2 });
    expect(em.persist).toHaveBeenCalled();
    expect(em.flush).toHaveBeenCalled();
    expect(em.transactional).toHaveBeenCalledOnce();
    expect(em.getConnection().execute).toHaveBeenCalledWith('select pg_advisory_xact_lock(hashtext(?))', [
      `marketplace-cart:tenant-1:user-1:${sellerPartnerId}`,
    ]);
    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(result.value.sellerId).toBe(sellerPartnerId);
      expect(result.value.items).toEqual([{ productId: 'p-1', quantity: 2 }]);
    }
    expect(em.findOne).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ tenantId: 'tenant-1', id: 'p-1', status: 'active' }),
    );
  });

  it('appends to an existing open cart from the same seller', async () => {
    em.findOne.mockImplementation(async (entity: unknown, where: { id?: string; status?: string }) => {
      if (String(entity).includes('Product')) {
        return productEntity();
      }
      return {
        id: 'c-1',
        tenantId: 'tenant-1',
        userId: 'user-1',
        sellerId: sellerPartnerId,
        items: [{ productId: 'p-1', quantity: 1 }],
        status: 'open',
        createdAt: now,
        updatedAt: now,
      };
    });
    const result = await repo.addToCart(owner, { productId: 'p-1', quantity: 3 });
    if (result.status === 'ok') {
      const first = result.value.items[0] as { quantity: number };
      expect(first.quantity).toBe(4);
    }
  });

  it('returns not_found when the product does not exist', async () => {
    em.findOne.mockResolvedValue(null);
    const result = await repo.addToCart(owner, { productId: 'p-x', quantity: 1 });
    expect(result.status).toBe('not_found');
  });

  it('does not schedule an empty cart when the first item exceeds stock', async () => {
    em.findOne.mockImplementation(async (entity: unknown) => {
      if (String(entity).includes('Product')) {
        return productEntity({ stockQuantity: 1 });
      }
      return null;
    });

    await expect(repo.addToCart(owner, { productId: 'p-1', quantity: 2 })).resolves.toMatchObject({
      status: 'conflict',
      field: 'stockQuantity',
    });
    expect(em.persist).not.toHaveBeenCalled();
    expect(em.flush).not.toHaveBeenCalled();
  });

  it('removes an item when quantity is zero', async () => {
    const cart = {
      id: 'c-1',
      tenantId: 'tenant-1',
      userId: 'user-1',
      sellerId: sellerPartnerId,
      items: [{ productId: 'p-1', quantity: 1 }],
      status: 'open',
      createdAt: now,
      updatedAt: now,
    };
    em.findOne.mockResolvedValue(cart);
    const result = await repo.updateCartItem(owner, 'c-1', 'p-1', 0);
    if (result.status === 'ok') {
      expect(result.value.items).toEqual([]);
    }
  });

  it('atomically closes an open cart and persists server-priced contract terms', async () => {
    const cart = {
      id: 'c-1',
      tenantId: 'tenant-1',
      userId: 'user-1',
      sellerId: sellerPartnerId,
      items: [{ productId: 'p-1', quantity: 2 }],
      status: 'open',
      createdAt: now,
      updatedAt: now,
    };
    em.findOne.mockImplementation(async (entity: unknown) => {
      const name = String(entity);
      if (name.includes('Cart')) {
        return cart;
      }
      if (name.includes('AgriTechPartner')) {
        return partnerEntity();
      }
      if (name.includes('Verification')) {
        return verificationEntity({ userId: sellerOwnerUserId, role: 'seller', status: 'verified' });
      }
      return null;
    });
    em.find.mockResolvedValue([productEntity()]);
    const result = await repo.checkoutCart(owner, 'c-1', {
      deliveryTerms: 'seller_delivery',
    });
    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(result.value.cartId).toBe('c-1');
      expect(result.value.contractId).toBeTruthy();
    }
    expect(cart.status).toBe('ordered');
    expect(em.transactional).toHaveBeenCalledOnce();
    expect(em.find).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ tenantId: 'tenant-1', supplierId: sellerPartnerId, status: 'active' }),
      expect.objectContaining({ lockMode: expect.anything() }),
    );
    expect(em.persist).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-1',
        buyerUserId: 'user-1',
        sellerUserId: sellerOwnerUserId,
        sourceType: 'cart_checkout',
        sourceId: 'c-1',
        amountUzs: 1_000_000,
        deliveryTerms: 'seller_delivery',
        deliveryPriceUzs: null,
        factoringEnabled: false,
        status: 'draft',
        lines: [
          expect.objectContaining({ productId: 'p-1', quantity: 2, unitPriceUzs: 500_000, lineTotalUzs: 1_000_000 }),
        ],
      }),
    );
  });

  it('rejects checkout of an empty cart', async () => {
    em.findOne.mockResolvedValue({
      id: 'c-1',
      tenantId: 'tenant-1',
      userId: 'user-1',
      sellerId: sellerPartnerId,
      items: [],
      status: 'open',
      createdAt: now,
      updatedAt: now,
    });
    const result = await repo.checkoutCart(owner, 'c-1', { deliveryTerms: 'pickup' });
    expect(result.status).toBe('invalid_state');
  });

  it('rejects checkout when the derived seller is no longer verified', async () => {
    em.findOne.mockImplementation(async (entity: unknown) => {
      if (String(entity).includes('Cart')) {
        return {
          id: 'c-1',
          tenantId: 'tenant-1',
          userId: 'user-1',
          sellerId: sellerPartnerId,
          items: [{ productId: 'p-1', quantity: 1 }],
          status: 'open',
          createdAt: now,
          updatedAt: now,
        };
      }
      if (String(entity).includes('AgriTechPartner')) {
        return partnerEntity();
      }
      return null;
    });

    await expect(repo.checkoutCart(owner, 'c-1', { deliveryTerms: 'pickup' })).resolves.toMatchObject({
      status: 'forbidden',
      field: 'sellerId',
    });
    expect(em.find).not.toHaveBeenCalled();
    expect(em.persist).not.toHaveBeenCalled();
  });

  it('rejects self-checkout through a distinct supplier partner identity', async () => {
    em.findOne.mockImplementation(async (entity: unknown) => {
      if (String(entity).includes('Cart')) {
        return {
          id: 'c-1',
          tenantId: 'tenant-1',
          userId: owner.userId,
          sellerId: sellerPartnerId,
          items: [{ productId: 'p-1', quantity: 1 }],
          status: 'open',
          createdAt: now,
          updatedAt: now,
        };
      }
      if (String(entity).includes('AgriTechPartner')) {
        return partnerEntity({ ownerUserId: owner.userId });
      }
      return null;
    });

    await expect(repo.checkoutCart(owner, 'c-1', { deliveryTerms: 'pickup' })).resolves.toMatchObject({
      status: 'forbidden',
      field: 'sellerId',
    });
    expect(em.find).not.toHaveBeenCalled();
    expect(em.persist).not.toHaveBeenCalled();
  });

  it('rejects checkout when a server-priced catalog line is not positive', async () => {
    const cart = {
      id: 'c-1',
      tenantId: 'tenant-1',
      userId: 'user-1',
      sellerId: sellerPartnerId,
      items: [{ productId: 'p-1', quantity: 1 }],
      status: 'open',
      createdAt: now,
      updatedAt: now,
    };
    em.findOne.mockImplementation(async (entity: unknown) => {
      const name = String(entity);
      if (name.includes('Cart')) {
        return cart;
      }
      if (name.includes('AgriTechPartner')) {
        return partnerEntity();
      }
      if (name.includes('Verification')) {
        return verificationEntity({ userId: sellerOwnerUserId, role: 'seller', status: 'verified' });
      }
      return null;
    });
    em.find.mockResolvedValue([productEntity({ priceUzs: 0 })]);

    await expect(repo.checkoutCart(owner, 'c-1', { deliveryTerms: 'pickup' })).resolves.toMatchObject({
      status: 'invalid_state',
      field: 'priceUzs',
    });
    expect(cart.status).toBe('open');
    expect(em.persist).not.toHaveBeenCalled();
  });

  it('rejects a fractional server-priced catalog line even when its aggregate is an integer', async () => {
    const cart = {
      id: 'c-fractional-price',
      tenantId: 'tenant-1',
      userId: owner.userId,
      sellerId: sellerPartnerId,
      items: [{ productId: 'p-1', quantity: 2 }],
      status: 'open',
      createdAt: now,
      updatedAt: now,
    };
    em.findOne.mockImplementation(async (entity: unknown) => {
      const name = String(entity);
      if (name.includes('Cart')) {
        return cart;
      }
      if (name.includes('AgriTechPartner')) {
        return partnerEntity();
      }
      if (name.includes('Verification')) {
        return verificationEntity({ userId: sellerOwnerUserId, role: 'seller', status: 'verified' });
      }
      return null;
    });
    em.find.mockResolvedValue([productEntity({ priceUzs: 500_000.5 })]);

    await expect(repo.checkoutCart(owner, cart.id, { deliveryTerms: 'pickup' })).resolves.toMatchObject({
      status: 'invalid_state',
      field: 'priceUzs',
    });
    expect(cart.status).toBe('open');
    expect(em.persist).not.toHaveBeenCalled();
  });

  it('rejects a server-priced checkout total beyond the database money range', async () => {
    const cart = {
      id: 'c-overflow',
      tenantId: 'tenant-1',
      userId: owner.userId,
      sellerId: sellerPartnerId,
      items: [{ productId: 'p-1', quantity: 2 }],
      status: 'open',
      createdAt: now,
      updatedAt: now,
    };
    em.findOne.mockImplementation(async (entity: unknown) => {
      const name = String(entity);
      if (name.includes('Cart')) {
        return cart;
      }
      if (name.includes('AgriTechPartner')) {
        return partnerEntity();
      }
      if (name.includes('Verification')) {
        return verificationEntity({ userId: sellerOwnerUserId, role: 'seller', status: 'verified' });
      }
      return null;
    });
    em.find.mockResolvedValue([productEntity({ priceUzs: 5_000_000_000_000 })]);

    await expect(repo.checkoutCart(owner, cart.id, { deliveryTerms: 'pickup' })).resolves.toMatchObject({
      status: 'invalid_state',
      field: 'amountUzs',
    });
    expect(cart.status).toBe('open');
    expect(em.persist).not.toHaveBeenCalled();
  });

  it('rejects a cart line when the product belongs to another tenant', async () => {
    const cart = {
      id: 'c-1',
      tenantId: 'tenant-1',
      userId: 'user-1',
      sellerId: sellerPartnerId,
      items: [{ productId: 'foreign-product', quantity: 1 }],
      status: 'open',
      createdAt: now,
      updatedAt: now,
    };
    em.findOne.mockImplementation(async (entity: unknown) => {
      const name = String(entity);
      if (name.includes('Cart')) {
        return cart;
      }
      if (name.includes('AgriTechPartner')) {
        return partnerEntity();
      }
      if (name.includes('Verification')) {
        return verificationEntity({ userId: sellerOwnerUserId, role: 'seller', status: 'verified' });
      }
      return null;
    });
    em.find.mockResolvedValue([]);

    await expect(repo.checkoutCart(owner, 'c-1', { deliveryTerms: 'pickup' })).resolves.toMatchObject({
      status: 'not_found',
      field: 'productId',
    });
    expect(em.persist).not.toHaveBeenCalled();
  });
});

describe('PostgresMarketplaceRepository — samples', () => {
  let em: ReturnType<typeof makeEm>;
  let repo: PostgresMarketplaceRepository;

  beforeEach(() => {
    em = makeEm();
    repo = new PostgresMarketplaceRepository(em as unknown as EntityManager);
  });

  it('creates a sample request for a real product', async () => {
    em.findOne.mockImplementation(async (entity: unknown) => {
      if (String(entity).includes('Verification')) {
        return verificationEntity({ status: 'verified' });
      }
      if (String(entity).includes('Product')) {
        return productEntity();
      }
      if (String(entity).includes('AgriTechPartner')) {
        return partnerEntity();
      }
      return null;
    });
    const result = await repo.requestSample(owner, 'p-1');
    expect(em.persist).toHaveBeenCalled();
    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(result.value.status).toBe('pending');
      expect(result.value.productId).toBe('p-1');
      expect(result.value.sellerId).toBe(sellerPartnerId);
    }
    expect(em.findOne).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        tenantId: 'tenant-1',
        id: sellerPartnerId,
        kind: 'supplier',
        status: 'approved',
      }),
    );
  });

  it('rejects a sample for a missing product', async () => {
    em.findOne.mockImplementation(async (entity: unknown) => {
      const name = String(entity);
      if (name.includes('AgriTechPartner')) {
        return partnerEntity({ id: 'buyer-partner', ownerUserId: owner.userId, kind: 'buyer' });
      }
      return name.includes('Verification') ? verificationEntity({ status: 'verified' }) : null;
    });
    const result = await repo.requestSample(owner, 'p-x');
    expect(result.status).toBe('not_found');
  });

  it('serializes and enforces the persisted monthly sample allowance', async () => {
    em.findOne.mockResolvedValue(verificationEntity({ status: 'verified' }));
    em.count.mockResolvedValue(5);

    await expect(repo.requestSample(owner, 'p-1')).resolves.toMatchObject({
      status: 'invalid_state',
      field: 'samples',
    });
    expect(em.findOne).toHaveBeenCalledWith(
      expect.anything(),
      { tenantId: 'tenant-1', userId: 'user-1', status: 'verified' },
      expect.objectContaining({ lockMode: expect.anything() }),
    );
    expect(em.persist).not.toHaveBeenCalled();
  });

  it('counts samples created this month', async () => {
    em.count.mockResolvedValue(3);
    expect(await repo.sampleUsageThisMonth(owner)).toBe(3);
  });
});

describe('PostgresMarketplaceRepository — requests and offers', () => {
  let em: ReturnType<typeof makeEm>;
  let repo: PostgresMarketplaceRepository;

  beforeEach(() => {
    em = makeEm();
    repo = new PostgresMarketplaceRepository(em as unknown as EntityManager);
  });

  it('creates a buyer request', async () => {
    em.findOne.mockResolvedValue(partnerEntity({ id: 'buyer-partner', ownerUserId: owner.userId, kind: 'buyer' }));
    const result = await repo.createRequest(owner, {
      title: 'Corn seeds',
      product: 'corn',
      volume: '10 t',
      region: 'Samarkand',
      deadline: '2026-08-20',
      budgetUzs: 5000000,
      requirements: 'certified',
    });
    expect(em.transactional).toHaveBeenCalledOnce();
    expect(em.findOne).toHaveBeenCalledWith(
      expect.anything(),
      {
        tenantId: owner.tenantId,
        ownerUserId: owner.userId,
        kind: 'buyer',
        status: 'approved',
      },
      expect.objectContaining({ lockMode: expect.anything() }),
    );
    expect(em.persist).toHaveBeenCalled();
    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(result.value.status).toBe('open');
      expect(result.value.region).toBe('Samarkand');
    }
  });

  it('does not persist a buyer request when the transaction cannot lock an approved organization', async () => {
    em.findOne.mockResolvedValue(null);

    await expect(
      repo.createRequest(owner, {
        title: 'Corn seeds',
        region: 'Samarkand',
      }),
    ).resolves.toEqual({ status: 'forbidden', field: 'organization' });

    expect(em.transactional).toHaveBeenCalledOnce();
    expect(em.persist).not.toHaveBeenCalled();
    expect(em.flush).not.toHaveBeenCalled();
  });

  it('makes an offer on an open request', async () => {
    em.findOne.mockImplementation(async (entity: unknown, where: { id?: string }) => {
      if (String(entity).includes('AgriTechPartner')) {
        return partnerEntity({ ownerUserId: owner.userId });
      }
      if (where.id === 'r-1') {
        return { id: 'r-1', status: 'open' };
      }
      return null;
    });
    const result = await repo.makeOffer(owner, 'r-1', 4500000, 'seller_delivery', 250_000, 'delivery in 5 days', 5);
    expect(result.status).toBe('ok');
    expect(em.transactional).toHaveBeenCalledOnce();
  });

  it('rejects an offer when price is not positive', async () => {
    em.findOne.mockResolvedValue({ id: 'r-1', status: 'open', buyerUserId: 'buyer-2' });
    const result = await repo.makeOffer(owner, 'r-1', 0, 'pickup');
    expect(result.status).toBe('invalid_state');
  });

  it('rejects an offer when delivery duration is not positive', async () => {
    em.findOne.mockResolvedValue({ id: 'r-1', status: 'open', buyerUserId: 'buyer-2' });
    await expect(repo.makeOffer(owner, 'r-1', 4_500_000, 'pickup', undefined, undefined, 0)).resolves.toMatchObject({
      status: 'invalid_state',
      field: 'deliveryDays',
    });
    expect(em.persist).not.toHaveBeenCalled();
  });

  it('requires a seller-authored positive delivery price only for seller delivery', async () => {
    em.findOne.mockResolvedValue({ id: 'r-1', status: 'open', buyerUserId: 'buyer-2' });

    await expect(repo.makeOffer(owner, 'r-1', 4_500_000, 'seller_delivery')).resolves.toMatchObject({
      status: 'invalid_state',
      field: 'deliveryPriceUzs',
    });
    await expect(repo.makeOffer(owner, 'r-1', 4_500_000, 'pickup', 10)).resolves.toMatchObject({
      status: 'invalid_state',
      field: 'deliveryPriceUzs',
    });
    expect(em.persist).not.toHaveBeenCalled();
  });

  it('rejects an offer from the request owner', async () => {
    em.findOne.mockResolvedValue({ id: 'r-1', status: 'open', buyerUserId: 'user-1' });
    await expect(repo.makeOffer(owner, 'r-1', 4_500_000, 'pickup')).resolves.toMatchObject({
      status: 'forbidden',
    });
    expect(em.persist).not.toHaveBeenCalled();
  });

  it('lists offers only for the owning buyer request', async () => {
    em.findOne.mockResolvedValue(null);
    await expect(repo.listOffers(owner, 'foreign-request')).resolves.toMatchObject({ status: 'not_found' });
    expect(em.find).not.toHaveBeenCalled();

    em.findOne.mockResolvedValue({ id: 'r-1', tenantId: 'tenant-1', buyerUserId: 'user-1' });
    em.find.mockResolvedValue([]);
    await expect(repo.listOffers(owner, 'r-1')).resolves.toEqual({ status: 'ok', value: [] });
  });

  it('atomically selects one offer, declines alternatives, and creates a draft contract', async () => {
    const request = {
      id: 'r-1',
      tenantId: 'tenant-1',
      status: 'offering',
      buyerUserId: 'user-1',
      title: 'Corn seeds',
      volume: '10 t',
      updatedAt: now,
    };
    const selected = {
      id: 'o-1',
      requestId: 'r-1',
      tenantId: 'tenant-1',
      status: 'pending',
      sellerUserId: 's-1',
      priceUzs: 4_500_000,
      deliveryNote: 'Seller delivery',
      deliveryDays: 5,
      createdAt: now,
    };
    const alternative = { ...selected, id: 'o-2', sellerUserId: 's-2' };
    em.findOne.mockImplementation(async (entity: unknown, where: { id?: string }) => {
      const name = String(entity);
      if (name.includes('AgriTechPartner')) {
        return partnerEntity({
          id: where.id ?? 'approved-partner',
          ownerUserId: String((where as { ownerUserId?: string }).ownerUserId ?? owner.userId),
          kind: (where as { kind?: string }).kind ?? 'buyer',
        });
      }
      if (name.includes('BuyerRequest')) {
        return request;
      }
      if (name.includes('RequestOffer') && where.id === 'o-1') {
        return selected;
      }
      if (name.includes('Verification')) {
        return verificationEntity({ userId: 's-1', role: 'seller', status: 'verified' });
      }
      return null;
    });
    em.find.mockResolvedValue([selected, alternative]);
    const result = await repo.chooseOffer(owner, 'r-1', 'o-1');
    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(result.value.sellerUserId).toBe('s-1');
      expect(result.value.contractId).toBeTruthy();
    }
    expect(selected.status).toBe('accepted');
    expect(alternative.status).toBe('declined');
    expect(request.status).toBe('selected');
    expect(em.transactional).toHaveBeenCalledOnce();
    expect(em.persist).toHaveBeenCalledWith(
      expect.objectContaining({
        buyerUserId: 'user-1',
        sellerUserId: 's-1',
        sourceType: 'offer_selection',
        sourceId: 'o-1',
        amountUzs: 4_500_000,
        deliveryNote: 'Seller delivery',
        deliveryDays: 5,
        status: 'draft',
      }),
    );
  });

  it('returns a status conflict for an already-decided request before reading its offers', async () => {
    em.findOne.mockImplementation(async (entity: unknown) => {
      const name = String(entity);
      if (name.includes('AgriTechPartner')) {
        return partnerEntity({ id: 'buyer-partner', ownerUserId: owner.userId, kind: 'buyer' });
      }
      if (name.includes('BuyerRequest')) {
        return { id: 'r-selected', tenantId: owner.tenantId, buyerUserId: owner.userId, status: 'selected' };
      }
      throw new Error(`Unexpected lookup for ${name}`);
    });

    await expect(repo.chooseOffer(owner, 'r-selected', 'o-accepted')).resolves.toEqual({
      status: 'conflict',
      field: 'status',
    });
    expect(em.findOne).not.toHaveBeenCalledWith(
      expect.objectContaining({ name: 'RequestOfferEntity' }),
      expect.anything(),
      expect.anything(),
    );
    expect(em.persist).not.toHaveBeenCalled();
  });

  it('distinguishes an already-decided offer from an absent offer', async () => {
    const request = {
      id: 'r-1',
      tenantId: owner.tenantId,
      buyerUserId: owner.userId,
      status: 'offering',
    };
    em.findOne.mockImplementation(async (entity: unknown, where: { id?: string }) => {
      const name = String(entity);
      if (name.includes('AgriTechPartner')) {
        return partnerEntity({ id: 'buyer-partner', ownerUserId: owner.userId, kind: 'buyer' });
      }
      if (name.includes('BuyerRequest')) {
        return request;
      }
      if (name.includes('RequestOffer') && where.id === 'o-accepted') {
        return { id: 'o-accepted', requestId: request.id, tenantId: owner.tenantId, status: 'accepted' };
      }
      return null;
    });

    await expect(repo.chooseOffer(owner, request.id, 'o-accepted')).resolves.toEqual({
      status: 'conflict',
      field: 'status',
    });
    await expect(repo.chooseOffer(owner, request.id, 'o-missing')).resolves.toEqual({
      status: 'not_found',
      field: 'offerId',
    });
    expect(em.persist).not.toHaveBeenCalled();
  });

  it('rejects selection when the offer seller is no longer verified', async () => {
    em.findOne.mockImplementation(async (entity: unknown, where: { ownerUserId?: string }) => {
      const name = String(entity);
      if (name.includes('AgriTechPartner') && where.ownerUserId === owner.userId) {
        return partnerEntity({ id: 'buyer-partner', ownerUserId: owner.userId, kind: 'buyer' });
      }
      if (name.includes('BuyerRequest')) {
        return { id: 'r-1', tenantId: 'tenant-1', status: 'offering', buyerUserId: 'user-1' };
      }
      if (name.includes('RequestOffer')) {
        return {
          id: 'o-1',
          requestId: 'r-1',
          tenantId: 'tenant-1',
          status: 'pending',
          sellerUserId: 's-1',
        };
      }
      return null;
    });

    await expect(repo.chooseOffer(owner, 'r-1', 'o-1')).resolves.toMatchObject({
      status: 'forbidden',
      field: 'sellerUserId',
    });
    expect(em.find).not.toHaveBeenCalled();
    expect(em.persist).not.toHaveBeenCalled();
  });
});

describe('PostgresMarketplaceRepository — contracts, reviews, ai', () => {
  let em: ReturnType<typeof makeEm>;
  let repo: PostgresMarketplaceRepository;

  beforeEach(() => {
    em = makeEm();
    repo = new PostgresMarketplaceRepository(em as unknown as EntityManager);
  });

  it('lets only the seller quote an unsigned seller-delivery contract', async () => {
    const contract = {
      id: 'c-delivery',
      tenantId: 'tenant-1',
      buyerUserId: 'user-1',
      sellerUserId: sellerOwnerUserId,
      sourceType: 'cart_checkout',
      deliveryTerms: 'seller_delivery',
      deliveryPriceUzs: null,
      deliveryNote: null,
      deliveryDays: null,
      status: 'draft',
      buyerSignedAt: null,
      sellerSignedAt: null,
      updatedAt: now,
    };
    em.findOne.mockImplementation(async (entity: unknown) =>
      String(entity).includes('AgriTechPartner') ? partnerEntity() : contract,
    );

    await expect(
      repo.updateContractDeliveryQuote(owner, contract.id, { deliveryPriceUzs: 250_000 }),
    ).resolves.toMatchObject({ status: 'forbidden' });
    await expect(
      repo.updateContractDeliveryQuote({ tenantId: 'tenant-1', userId: sellerOwnerUserId }, contract.id, {
        deliveryPriceUzs: 250_000,
        deliveryDays: 2,
        deliveryNote: 'Delivered to the farm gate',
      }),
    ).resolves.toMatchObject({
      status: 'ok',
      value: { deliveryPriceUzs: 250_000, deliveryDays: 2 },
    });
    expect(contract.deliveryPriceUzs).toBe(250_000);

    await expect(
      repo.updateContractDeliveryQuote({ tenantId: 'tenant-1', userId: sellerOwnerUserId }, contract.id, {
        deliveryPriceUzs: 300_000,
      }),
    ).resolves.toMatchObject({ status: 'invalid_state' });

    contract.sourceType = 'offer_selection';
    contract.deliveryPriceUzs = null;
    await expect(
      repo.updateContractDeliveryQuote({ tenantId: 'tenant-1', userId: sellerOwnerUserId }, contract.id, {
        deliveryPriceUzs: 300_000,
      }),
    ).resolves.toMatchObject({ status: 'invalid_state' });
  });

  it('blocks consent until seller delivery has an authorized quote', async () => {
    const contract = {
      id: 'c-unquoted',
      tenantId: 'tenant-1',
      buyerUserId: 'user-1',
      sellerUserId: sellerOwnerUserId,
      sourceType: 'cart_checkout',
      sourceId: 'cart-1',
      subject: 'Corn seed',
      amountUzs: 1_000_000,
      lines: [],
      deliveryTerms: 'seller_delivery',
      deliveryPriceUzs: null,
      deliveryNote: null,
      deliveryDays: null,
      factoringEnabled: false,
      status: 'draft',
      buyerSignedAt: null,
      sellerSignedAt: null,
      signedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    em.findOne.mockResolvedValue(contract);

    await expect(repo.signContract(owner, contract.id)).resolves.toMatchObject({
      status: 'invalid_state',
      field: 'deliveryPriceUzs',
    });
    expect(contract.buyerSignedAt).toBeNull();
    expect(em.flush).not.toHaveBeenCalled();
  });

  it('blocks a verified contract party without an approved organization', async () => {
    const contract = {
      id: 'c-unapproved-buyer',
      tenantId: 'tenant-1',
      buyerUserId: owner.userId,
      sellerUserId: sellerOwnerUserId,
      sourceType: 'offer_selection',
      sourceId: 'offer-1',
      subject: 'Corn seed',
      amountUzs: 1_000_000,
      lines: [],
      deliveryTerms: 'pickup',
      deliveryPriceUzs: 0,
      deliveryNote: null,
      deliveryDays: null,
      factoringEnabled: false,
      status: 'draft',
      buyerSignedAt: null,
      sellerSignedAt: null,
      signedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    em.findOne.mockImplementation(async (entity: unknown) => (String(entity).includes('Contract') ? contract : null));

    await expect(repo.signContract(owner, contract.id)).resolves.toMatchObject({
      status: 'forbidden',
      field: 'organization',
    });
    expect(contract.buyerSignedAt).toBeNull();
    expect(em.flush).not.toHaveBeenCalled();
  });

  it('records each party consent and activates only after both signatures', async () => {
    const contract = {
      id: 'c-1',
      tenantId: 'tenant-1',
      buyerUserId: 'user-1',
      sellerUserId: 'seller-1',
      sourceType: 'offer_selection',
      sourceId: 'offer-1',
      subject: 'Corn seed',
      amountUzs: 1_000_000,
      lines: [],
      deliveryTerms: 'pickup',
      deliveryPriceUzs: 0,
      deliveryNote: null,
      deliveryDays: null,
      factoringEnabled: false,
      status: 'draft',
      buyerSignedAt: null,
      sellerSignedAt: null,
      signedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    em.findOne.mockResolvedValue(contract);

    const buyerResult = await repo.signContract(owner, 'c-1');
    expect(buyerResult.status).toBe('ok');
    expect(contract.status).toBe('signed');
    expect(contract.buyerSignedAt).toBeInstanceOf(Date);
    expect(contract.sellerSignedAt).toBeNull();
    expect(contract.signedAt).toBeNull();

    em.flush.mockClear();
    await expect(repo.signContract(owner, 'c-1')).resolves.toMatchObject({ status: 'ok' });
    expect(em.flush).not.toHaveBeenCalled();

    const sellerResult = await repo.signContract({ tenantId: 'tenant-1', userId: 'seller-1' }, 'c-1');
    expect(sellerResult.status).toBe('ok');
    expect(contract.status).toBe('active');
    expect(contract.sellerSignedAt).toBeInstanceOf(Date);
    expect(contract.signedAt).toBeInstanceOf(Date);
    expect(em.transactional).toHaveBeenCalledTimes(3);
  });

  it('rejects a signature from a foreign tenant party', async () => {
    em.findOne.mockResolvedValue({
      id: 'c-1',
      tenantId: 'tenant-1',
      buyerUserId: 'buyer-1',
      sellerUserId: 'seller-1',
      status: 'draft',
      buyerSignedAt: null,
      sellerSignedAt: null,
    });
    await expect(repo.signContract(owner, 'c-1')).resolves.toMatchObject({ status: 'forbidden' });
    expect(em.flush).not.toHaveBeenCalled();
  });

  it('keeps a fully consented active contract stable when a party retries signing', async () => {
    const contract = {
      id: 'c-active',
      tenantId: 'tenant-1',
      buyerUserId: 'user-1',
      sellerUserId: 'seller-1',
      sourceType: 'offer_selection',
      sourceId: 'offer-1',
      subject: 'Active contract',
      amountUzs: 1_000_000,
      lines: [],
      deliveryTerms: 'pickup',
      deliveryPriceUzs: 0,
      deliveryNote: null,
      deliveryDays: null,
      factoringEnabled: false,
      status: 'active',
      buyerSignedAt: now,
      sellerSignedAt: now,
      signedAt: now,
      createdAt: now,
      updatedAt: now,
    };
    em.findOne.mockResolvedValue(contract);

    const result = await repo.signContract(owner, 'c-active');

    expect(result).toMatchObject({ status: 'ok', value: { status: 'active', factoringEnabled: false } });
    expect(contract.status).toBe('active');
    expect(contract.buyerSignedAt).toBe(now);
    expect(em.flush).not.toHaveBeenCalled();
  });

  it('commits frozen cart quantities exactly when the second party activates the contract', async () => {
    const product = productEntity({ stockQuantity: 3 });
    const contract = {
      id: 'c-cart',
      tenantId: 'tenant-1',
      buyerUserId: 'user-1',
      sellerUserId: sellerOwnerUserId,
      sourceType: 'cart_checkout',
      sourceId: 'cart-1',
      subject: 'Corn seed',
      amountUzs: 1_000_000,
      lines: [
        {
          productId: 'p-1',
          name: 'Corn seed',
          unit: 'kg',
          unitPriceUzs: 500_000,
          quantity: 2,
          lineTotalUzs: 1_000_000,
        },
      ],
      deliveryTerms: 'pickup',
      deliveryPriceUzs: 0,
      deliveryNote: null,
      deliveryDays: null,
      factoringEnabled: false,
      status: 'signed',
      buyerSignedAt: now,
      sellerSignedAt: null,
      signedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    em.findOne.mockResolvedValue(contract);
    em.find.mockImplementation(async (entity: unknown) =>
      String(entity).includes('AgriTechPartner') ? [partnerEntity()] : [product],
    );

    const result = await repo.signContract({ tenantId: 'tenant-1', userId: sellerOwnerUserId }, contract.id);

    expect(result).toMatchObject({ status: 'ok', value: { status: 'active' } });
    expect(product.stockQuantity).toBe(1);
    expect(contract.sellerSignedAt).toBeInstanceOf(Date);
    expect(contract.signedAt).toBeInstanceOf(Date);
    expect(em.flush).toHaveBeenCalledOnce();
  });

  it('preserves consent and stock when activation cannot satisfy a frozen cart line', async () => {
    const product = productEntity({ stockQuantity: 1 });
    const contract = {
      id: 'c-cart',
      tenantId: 'tenant-1',
      buyerUserId: 'user-1',
      sellerUserId: sellerOwnerUserId,
      sourceType: 'cart_checkout',
      sourceId: 'cart-1',
      subject: 'Corn seed',
      amountUzs: 1_000_000,
      lines: [
        {
          productId: 'p-1',
          name: 'Corn seed',
          unit: 'kg',
          unitPriceUzs: 500_000,
          quantity: 2,
          lineTotalUzs: 1_000_000,
        },
      ],
      deliveryTerms: 'pickup',
      deliveryPriceUzs: 0,
      deliveryNote: null,
      deliveryDays: null,
      factoringEnabled: false,
      status: 'signed',
      buyerSignedAt: now,
      sellerSignedAt: null,
      signedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    em.findOne.mockResolvedValue(contract);
    em.find.mockImplementation(async (entity: unknown) =>
      String(entity).includes('AgriTechPartner') ? [partnerEntity()] : [product],
    );

    await expect(
      repo.signContract({ tenantId: 'tenant-1', userId: sellerOwnerUserId }, contract.id),
    ).resolves.toMatchObject({ status: 'conflict', field: 'stockQuantity' });
    expect(product.stockQuantity).toBe(1);
    expect(contract.status).toBe('signed');
    expect(contract.sellerSignedAt).toBeNull();
    expect(em.flush).not.toHaveBeenCalled();
  });

  it('rejects a review with out-of-range rating', async () => {
    const result = await repo.addReview(owner, 'p-1', 6);
    expect(result.status).toBe('invalid_state');
  });

  it('returns not_found without deleting when a favorite product is outside the tenant', async () => {
    em.findOne.mockResolvedValue(null);

    await expect(repo.removeFavorite(owner, 'foreign-product')).resolves.toMatchObject({
      status: 'not_found',
      field: 'productId',
    });
    expect(em.findOne).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ tenantId: owner.tenantId, id: 'foreign-product' }),
    );
    expect(em.nativeDelete).not.toHaveBeenCalled();
  });

  it('removes a tenant-owned favorite idempotently', async () => {
    em.findOne.mockResolvedValue(productEntity({ status: 'inactive' }));

    await expect(repo.removeFavorite(owner, 'p-1')).resolves.toMatchObject({
      status: 'ok',
      value: { productId: 'p-1' },
    });
    expect(em.nativeDelete).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ tenantId: owner.tenantId, userId: owner.userId, productId: 'p-1' }),
    );
  });

  it('adds a valid review', async () => {
    em.findOne.mockImplementation(async (entity: unknown) => {
      const name = String(entity);
      if (name.includes('AgriTechPartner')) {
        return partnerEntity({ id: 'buyer-partner', ownerUserId: owner.userId, kind: 'buyer' });
      }
      return name.includes('Product') ? productEntity() : null;
    });
    em.find.mockResolvedValue([
      {
        buyerUserId: owner.userId,
        lines: [{ productId: 'p-1' }],
        status: 'active',
        tenantId: owner.tenantId,
      },
    ]);
    const result = await repo.addReview(owner, 'p-1', 4, 'Good quality');
    expect(em.persist).toHaveBeenCalled();
    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(result.value.rating).toBe(4);
    }
    expect(em.findOne).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ tenantId: 'tenant-1', id: 'p-1' }),
    );
    expect(em.transactional).toHaveBeenCalledOnce();
  });

  it('rejects a review without a completed marketplace purchase', async () => {
    em.findOne.mockResolvedValue(productEntity());
    em.find.mockResolvedValue([]);

    await expect(repo.addReview(owner, 'p-1', 4, 'Unverified claim')).resolves.toMatchObject({
      status: 'forbidden',
      field: 'purchase',
    });
    expect(em.persist).not.toHaveBeenCalled();
  });

  it('answers an AI find-cheaper consultation from the catalog', async () => {
    em.find.mockResolvedValue([productEntity({ priceUzs: 300000 }), productEntity({ id: 'p-2', priceUzs: 500000 })]);
    const result = await repo.askAi(owner, 'find_cheaper', 'find me the cheapest corn seed');
    expect(em.persist).toHaveBeenCalled();
    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(result.value.answer).toBe('catalog_match');
      expect(result.value.kind).toBe('find_cheaper');
      expect(result.value.productIds).toEqual(['p-1', 'p-2']);
    }
    expect(em.find).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        tenantId: 'tenant-1',
        status: 'active',
        $and: expect.arrayContaining([
          expect.objectContaining({
            $or: expect.arrayContaining([expect.objectContaining({ name: { $ilike: '%corn%' } })]),
          }),
        ]),
      }),
      { limit: 50, orderBy: { id: 'ASC', priceUzs: 'ASC' } },
    );
  });

  it('fails closed without persisting unsupported agronomy advice', async () => {
    em.find.mockResolvedValue([productEntity()]);

    const result = await repo.askAi(owner, 'season_advice', 'When should I sow cotton?');

    expect(result).toMatchObject({
      status: 'ok',
      value: {
        answer: 'no_catalog_match',
        productIds: [],
      },
    });
    expect(em.persist).toHaveBeenCalledWith(
      expect.objectContaining({
        answer: 'no_catalog_match',
        productIds: [],
      }),
    );
    expect(em.find).not.toHaveBeenCalled();
    expect(JSON.stringify(em.persist.mock.calls)).not.toMatch(/Feb|Apr|Aug|Oct|certified|winter wheat/i);
  });

  it('returns no catalog identity when a recommendation has no factual match', async () => {
    em.find.mockResolvedValue([]);

    await expect(repo.askAi(owner, 'recommendation', 'tractor hydraulic pump')).resolves.toMatchObject({
      status: 'ok',
      value: { answer: 'no_catalog_match', productIds: [] },
    });
  });
});
