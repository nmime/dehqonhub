// @requirements REQ-AGRITECH-PROFILE-001 REQ-AGRITECH-CATALOG-002 REQ-AGRITECH-ORDER-003
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EntityManager } from '@mikro-orm/core';
import { PostgresMarketplaceRepository } from './marketplace.repository';

const owner = { tenantId: 'tenant-1', userId: 'user-1' };
const now = new Date('2026-08-09T00:00:00Z');

function makeEm(overrides: Partial<Record<string, ReturnType<typeof vi.fn>>> = {}) {
  const em = {
    findOne: vi.fn().mockResolvedValue(null),
    find: vi.fn().mockResolvedValue([]),
    count: vi.fn().mockResolvedValue(0),
    persist: vi.fn(),
    flush: vi.fn().mockResolvedValue(undefined),
    nativeDelete: vi.fn().mockResolvedValue(1),
    transactional: vi.fn(async (cb: (em: unknown) => unknown) => cb(em)),
    ...overrides,
  };
  return em as unknown as EntityManager & typeof em;
}

function verificationEntity(overrides: Record<string, unknown> = {}) {
  return {
    id: 'v-1', tenantId: 'tenant-1', userId: 'user-1', role: 'farmer', level: 'verified',
    status: 'pending', oneIdLinked: true, documents: [{ kind: 'id', fileName: 'p.jpg', storageKey: 'k1' }],
    reviewedBy: null, reviewedAt: null, rejectionReason: null, createdAt: now, updatedAt: now,
    ...overrides,
  };
}

function productEntity(overrides: Record<string, unknown> = {}) {
  return {
    id: 'p-1', tenantId: 'tenant-1', name: 'Corn seed', category: 'seed', description: 'd',
    supplierId: 's-1', supplierName: 'Agro', priceUzs: 500000, unit: 'kg', stockQuantity: 100,
    region: 'Samarkand', status: 'active', images: [], createdAt: now, updatedAt: now,
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

  it('creates a pending verification for a fresh profile', async () => {
    em.findOne.mockResolvedValue(null);
    const result = await repo.submitVerification(owner, {
      role: 'farmer',
      level: 'verified',
      oneIdLinked: true,
      documents: [{ kind: 'id', fileName: 'p.jpg', storageKey: 'k1' }],
    });
    expect(em.persist).toHaveBeenCalled();
    expect(em.flush).toHaveBeenCalled();
    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(result.value.status).toBe('pending');
      expect(result.value.role).toBe('farmer');
    }
  });

  it('returns conflict when re-submitting an already verified profile', async () => {
    em.findOne.mockResolvedValue(verificationEntity({ status: 'verified' }));
    const result = await repo.submitVerification(owner, {
      role: 'farmer',
      level: 'verified',
      oneIdLinked: true,
      documents: [{ kind: 'id', fileName: 'p.jpg', storageKey: 'k1' }],
    });
    expect(result.status).toBe('conflict');
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
    expect(result.status).toBe('invalid_state');
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
      if (String(entity).includes('Product')) return productEntity();
      return null;
    });
    const result = await repo.addToCart(owner, 's-1', { productId: 'p-1', quantity: 2 });
    expect(em.persist).toHaveBeenCalled();
    expect(em.flush).toHaveBeenCalled();
    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(result.value.sellerId).toBe('s-1');
      expect(result.value.items).toEqual([{ productId: 'p-1', quantity: 2 }]);
    }
  });

  it('appends to an existing open cart from the same seller', async () => {
    em.findOne.mockImplementation(async (entity: unknown, where: { id?: string; status?: string }) => {
      if (String(entity).includes('Product')) return productEntity();
      return {
        id: 'c-1', tenantId: 'tenant-1', userId: 'user-1', sellerId: 's-1',
        items: [{ productId: 'p-1', quantity: 1 }], status: 'open', createdAt: now, updatedAt: now,
      };
    });
    const result = await repo.addToCart(owner, 's-1', { productId: 'p-1', quantity: 3 });
    if (result.status === 'ok') {
      const first = result.value.items[0] as { quantity: number };
      expect(first.quantity).toBe(4);
    }
  });

  it('returns not_found when the product does not exist', async () => {
    em.findOne.mockResolvedValue(null);
    const result = await repo.addToCart(owner, 's-1', { productId: 'p-x', quantity: 1 });
    expect(result.status).toBe('not_found');
  });

  it('removes an item when quantity is zero', async () => {
    const cart = {
      id: 'c-1', tenantId: 'tenant-1', userId: 'user-1', sellerId: 's-1',
      items: [{ productId: 'p-1', quantity: 1 }], status: 'open', createdAt: now, updatedAt: now,
    };
    em.findOne.mockResolvedValue(cart);
    const result = await repo.updateCartItem(owner, 'c-1', 'p-1', 0);
    if (result.status === 'ok') {
      expect(result.value.items).toEqual([]);
    }
  });

  it('checkouts an open cart with items', async () => {
    em.findOne.mockResolvedValue({
      id: 'c-1', tenantId: 'tenant-1', userId: 'user-1', sellerId: 's-1',
      items: [{ productId: 'p-1', quantity: 2 }], status: 'open', createdAt: now, updatedAt: now,
    });
    const result = await repo.checkoutCart(owner, 'c-1');
    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(result.value.cartId).toBe('c-1');
      expect(result.value.orderId).toBeTruthy();
    }
  });

  it('rejects checkout of an empty cart', async () => {
    em.findOne.mockResolvedValue({
      id: 'c-1', tenantId: 'tenant-1', userId: 'user-1', sellerId: 's-1',
      items: [], status: 'open', createdAt: now, updatedAt: now,
    });
    const result = await repo.checkoutCart(owner, 'c-1');
    expect(result.status).toBe('invalid_state');
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
    em.findOne.mockResolvedValue(productEntity());
    const result = await repo.requestSample(owner, 'p-1', 's-1');
    expect(em.persist).toHaveBeenCalled();
    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(result.value.status).toBe('pending');
      expect(result.value.productId).toBe('p-1');
    }
  });

  it('rejects a sample for a missing product', async () => {
    em.findOne.mockResolvedValue(null);
    const result = await repo.requestSample(owner, 'p-x', 's-1');
    expect(result.status).toBe('not_found');
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
    const result = await repo.createRequest(owner, {
      title: 'Corn seeds', product: 'corn', volume: '10 t', region: 'Samarkand',
      deadline: '2026-08-20', budgetUzs: 5000000, requirements: 'certified',
    });
    expect(em.persist).toHaveBeenCalled();
    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(result.value.status).toBe('open');
      expect(result.value.region).toBe('Samarkand');
    }
  });

  it('makes an offer on an open request', async () => {
    em.findOne.mockImplementation(async (_e: unknown, where: { id?: string }) => {
      if (where.id === 'r-1') return { id: 'r-1', status: 'open' };
      return null;
    });
    const result = await repo.makeOffer(owner, 'r-1', 4500000, 'delivery in 5 days', 5);
    expect(result.status).toBe('ok');
  });

  it('rejects an offer when price is not positive', async () => {
    em.findOne.mockResolvedValue({ id: 'r-1', status: 'open' });
    const result = await repo.makeOffer(owner, 'r-1', 0);
    expect(result.status).toBe('invalid_state');
  });

  it('chooses an offer and closes the request', async () => {
    em.findOne.mockImplementation(async (_e: unknown, where: { id?: string }) => {
      if (where.id === 'o-1') return { id: 'o-1', requestId: 'r-1', status: 'pending', sellerUserId: 's-1' };
      return { id: 'r-1', status: 'offering', buyerUserId: 'user-1' };
    });
    const result = await repo.chooseOffer(owner, 'r-1', 'o-1');
    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(result.value.sellerUserId).toBe('s-1');
    }
  });
});

describe('PostgresMarketplaceRepository — contracts, reviews, ai', () => {
  let em: ReturnType<typeof makeEm>;
  let repo: PostgresMarketplaceRepository;

  beforeEach(() => {
    em = makeEm();
    repo = new PostgresMarketplaceRepository(em as unknown as EntityManager);
  });

  it('creates a draft contract', async () => {
    const result = await repo.createContract(owner, {
      buyerUserId: 'b-1', sellerUserId: 's-1', subject: 'Corn 10t',
      amountUzs: 5000000, deliveryTerms: 'pickup', factoringEnabled: false,
    });
    expect(em.persist).toHaveBeenCalled();
    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(result.value.status).toBe('draft');
      expect(result.value.factoringEnabled).toBe(false);
    }
  });

  it('rejects a contract with a non-positive amount', async () => {
    const result = await repo.createContract(owner, {
      buyerUserId: 'b-1', sellerUserId: 's-1', subject: 'Corn', amountUzs: 0, deliveryTerms: 'pickup', factoringEnabled: false,
    });
    expect(result.status).toBe('invalid_state');
  });

  it('signs a draft contract', async () => {
    em.findOne.mockResolvedValue({
      id: 'c-1', tenantId: 'tenant-1', status: 'draft', signedAt: null, updatedAt: now,
    });
    const result = await repo.signContract(owner, 'c-1');
    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(result.value.status).toBe('signed');
      expect(result.value.signedAt).toBeTruthy();
    }
  });

  it('rejects a review with out-of-range rating', async () => {
    const result = await repo.addReview(owner, 'p-1', 6);
    expect(result.status).toBe('invalid_state');
  });

  it('adds a valid review', async () => {
    em.findOne.mockResolvedValue(productEntity());
    const result = await repo.addReview(owner, 'p-1', 4, 'Good quality');
    expect(em.persist).toHaveBeenCalled();
    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(result.value.rating).toBe(4);
    }
  });

  it('answers an AI find-cheaper consultation from the catalog', async () => {
    em.find.mockResolvedValue([productEntity({ priceUzs: 300000 }), productEntity({ id: 'p-2', priceUzs: 500000 })]);
    const result = await repo.askAi(owner, 'find_cheaper', 'find me the cheapest corn seed');
    expect(em.persist).toHaveBeenCalled();
    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(result.value.answer.length).toBeGreaterThan(0);
      expect(result.value.kind).toBe('find_cheaper');
    }
  });
});
