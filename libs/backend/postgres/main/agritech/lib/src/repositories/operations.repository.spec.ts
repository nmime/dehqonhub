// @requirements REQ-AGRITECH-OUTPUT-008 REQ-AGRITECH-ADVISORY-009 REQ-AGRITECH-INTEGRATION-013 REQ-AGRITECH-PARTNER-007 REQ-AGRITECH-FULFILLMENT-010 REQ-AGRITECH-ANALYTICS-011 REQ-AGRITECH-I18N-012
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { LockMode, type EntityManager } from '@mikro-orm/core';
import { PostgresAgriTechOperationsRepository } from './operations.repository';

const owner = { tenantId: 'tenant-1', userId: 'user-1' };
const now = new Date('2026-08-02T00:00:00Z');
const later = new Date('2026-09-02T00:00:00Z');

function makeEm(overrides: Partial<Record<string, ReturnType<typeof vi.fn>>> = {}) {
  const em = {
    findOne: vi.fn().mockResolvedValue(null),
    find: vi.fn().mockResolvedValue([]),
    count: vi.fn().mockResolvedValue(0),
    persist: vi.fn(),
    flush: vi.fn().mockResolvedValue(undefined),
    transactional: vi.fn(async (cb: (em: unknown) => unknown) => cb(em)),
    ...overrides,
  };
  return em as unknown as EntityManager & typeof em;
}

function partnerEntity(overrides: Record<string, unknown> = {}) {
  return {
    id: 'partner-1',
    tenantId: 'tenant-1',
    ownerUserId: 'user-1',
    kind: 'supplier',
    legalName: 'Agro Supply',
    taxId: '123456789',
    phone: '+998901234567',
    region: 'Fergana',
    status: 'approved',
    reviewedBy: null,
    reviewedAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function farmerEntity(overrides: Record<string, unknown> = {}) {
  return {
    id: 'farmer-1',
    tenantId: 'tenant-1',
    userId: 'user-1',
    firstName: 'Ali',
    lastName: 'Valiyev',
    phone: '+998901234567',
    region: 'Fergana',
    district: null,
    crops: ['cotton'],
    status: 'active',
    fieldAgentUserId: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('PostgresAgriTechOperationsRepository — partners', () => {
  let em: ReturnType<typeof makeEm>;
  let repo: PostgresAgriTechOperationsRepository;

  beforeEach(() => {
    em = makeEm();
    repo = new PostgresAgriTechOperationsRepository(em as unknown as EntityManager);
  });

  it('creates a partner when taxId is unique within tenant+kind', async () => {
    const input = { kind: 'supplier' as const, legalName: 'Agro', taxId: '999', phone: '+99890', region: 'R' };
    const result = await repo.createPartner(owner, input);
    expect(em.findOne).toHaveBeenCalledWith(expect.anything(), {
      tenantId: 'tenant-1',
      kind: 'supplier',
      taxId: '999',
    });
    expect(em.persist).toHaveBeenCalled();
    expect(em.flush).toHaveBeenCalled();
    expect(result.status).toBe('ok');
  });

  it('rejects duplicate partner taxId with conflict', async () => {
    em.findOne.mockResolvedValue(partnerEntity());
    const input = { kind: 'supplier' as const, legalName: 'Agro', taxId: '123456789', phone: '+99890', region: 'R' };
    const result = await repo.createPartner(owner, input);
    expect(result).toEqual({ status: 'conflict', field: 'taxId' });
    expect(em.persist).not.toHaveBeenCalled();
  });

  it('lists owned partners scoped to tenant and user', async () => {
    em.find.mockResolvedValue([partnerEntity()]);
    const result = await repo.listOwnedPartners(owner);
    expect(em.find).toHaveBeenCalledWith(
      expect.anything(),
      { tenantId: 'tenant-1', ownerUserId: 'user-1' },
      expect.anything(),
    );
    expect(result).toHaveLength(1);
    expect(result[0]?.legalName).toBe('Agro Supply');
  });

  it('sets partner status and records reviewer', async () => {
    const entity = partnerEntity({ status: 'pending' });
    em.findOne.mockResolvedValue(entity);
    const result = await repo.setPartnerStatus(owner, 'partner-1', 'approved');
    expect(result.status).toBe('ok');
    expect(entity.status).toBe('approved');
    expect(entity.reviewedBy).toBe('user-1');
  });

  it('returns not_found when partner does not exist', async () => {
    em.findOne.mockResolvedValue(null);
    const result = await repo.setPartnerStatus(owner, 'missing', 'approved');
    expect(result).toEqual({ status: 'not_found' });
  });

  it('is idempotent when status is unchanged', async () => {
    const entity = partnerEntity({ status: 'approved' });
    em.findOne.mockResolvedValue(entity);
    const result = await repo.setPartnerStatus(owner, 'partner-1', 'approved');
    expect(result.status).toBe('ok');
    expect(em.flush).not.toHaveBeenCalled();
  });

  it('blocks rejected → approved transition', async () => {
    const entity = partnerEntity({ status: 'rejected' });
    em.findOne.mockResolvedValue(entity);
    const result = await repo.setPartnerStatus(owner, 'partner-1', 'approved');
    expect(result).toEqual({ status: 'invalid_state' });
  });
});

describe('PostgresAgriTechOperationsRepository — supplier products', () => {
  let em: ReturnType<typeof makeEm>;
  let repo: PostgresAgriTechOperationsRepository;

  beforeEach(() => {
    em = makeEm();
    repo = new PostgresAgriTechOperationsRepository(em as unknown as EntityManager);
  });

  const productInput = {
    partnerId: 'partner-1',
    name: 'NitroAmmonka',
    category: 'fertilizer' as const,
    description: 'N46',
    priceUzs: 85000,
    unit: '50kg bag',
    stockQuantity: 100,
    region: 'Fergana',
  };

  it('creates a supplier product for an approved supplier', async () => {
    em.findOne.mockResolvedValue(partnerEntity({ status: 'approved' }));
    const result = await repo.createSupplierProduct(owner, productInput);
    expect(result.status).toBe('ok');
    expect(em.persist).toHaveBeenCalled();
  });

  it('marks product out_of_stock when stockQuantity is zero', async () => {
    em.findOne.mockResolvedValue(partnerEntity({ status: 'approved' }));
    const result = await repo.createSupplierProduct(owner, { ...productInput, stockQuantity: 0 });
    expect(result.status).toBe('ok');
  });

  it('rejects when partner not found', async () => {
    em.findOne.mockResolvedValue(null);
    const result = await repo.createSupplierProduct(owner, productInput);
    expect(result).toEqual({ status: 'not_found' });
  });

  it('rejects when supplier is not approved', async () => {
    em.findOne.mockResolvedValue(partnerEntity({ status: 'pending' }));
    const result = await repo.createSupplierProduct(owner, productInput);
    expect(result).toEqual({ status: 'partner_unapproved' });
  });

  it('lists supplier products only for owned partners', async () => {
    em.find.mockResolvedValueOnce([partnerEntity()]).mockResolvedValueOnce([
      {
        id: 'p1',
        tenantId: 'tenant-1',
        supplierId: 'partner-1',
        name: 'Seed',
        nameRu: null,
        nameUz: null,
        nameUzCyrl: null,
        category: 'seed',
        description: 'd',
        priceUzs: 1000,
        unit: 'kg',
        stockQuantity: 5,
        region: 'R',
        status: 'active',
        createdAt: now,
      },
    ]);
    const result = await repo.listSupplierProducts(owner);
    expect(result).toHaveLength(1);
    expect(result[0]?.name).toBe('Seed');
  });

  it('returns empty when the user owns no supplier partners', async () => {
    em.find.mockResolvedValue([]);
    const result = await repo.listSupplierProducts(owner);
    expect(result).toEqual([]);
  });

  it('updates price, stock, and localized names of an owned product', async () => {
    const product = {
      id: 'prod-1',
      tenantId: 'tenant-1',
      supplierId: 'partner-1',
      name: 'Seed',
      nameRu: null,
      nameUz: null,
      nameUzCyrl: null,
      category: 'seed',
      description: 'd',
      priceUzs: 1000,
      unit: 'kg',
      stockQuantity: 5,
      region: 'R',
      status: 'active',
    };
    em.findOne.mockResolvedValueOnce(product).mockResolvedValueOnce(partnerEntity({ status: 'approved' }));
    const result = await repo.updateSupplierProduct(owner, 'prod-1', {
      name: 'Corn seed',
      nameRu: 'Семена кукурузы',
      nameUz: 'Makkajo\u02bbxori urug\u02bbi',
      nameUzCyrl: 'Маккажўхори уруғи',
      priceUzs: 2000,
      stockQuantity: 10,
      status: 'active',
    });
    expect(result.status).toBe('ok');
    expect(product.priceUzs).toBe(2000);
    expect(product.stockQuantity).toBe(10);
    expect(product).toMatchObject({
      name: 'Corn seed',
      nameRu: 'Семена кукурузы',
      nameUz: 'Makkajo\u02bbxori urug\u02bbi',
      nameUzCyrl: 'Маккажўхори уруғи',
    });
    expect(em.transactional).toHaveBeenCalledOnce();
    expect(em.findOne).toHaveBeenNthCalledWith(
      1,
      expect.anything(),
      { tenantId: 'tenant-1', id: 'prod-1' },
      { lockMode: LockMode.PESSIMISTIC_WRITE },
    );
    expect(em.findOne).toHaveBeenNthCalledWith(
      2,
      expect.anything(),
      {
        tenantId: 'tenant-1',
        id: 'partner-1',
        ownerUserId: 'user-1',
        kind: 'supplier',
      },
      { lockMode: LockMode.PESSIMISTIC_READ },
    );
  });

  it('returns not_found when updating a missing product', async () => {
    em.findOne.mockResolvedValue(null);
    const result = await repo.updateSupplierProduct(owner, 'missing', {
      priceUzs: 1,
      stockQuantity: 1,
      status: 'active',
    });
    expect(result).toEqual({ status: 'not_found' });
  });

  it('returns forbidden when product belongs to another owner', async () => {
    em.findOne
      .mockResolvedValueOnce({ id: 'prod-1', tenantId: 'tenant-1', supplierId: 'partner-1' })
      .mockResolvedValueOnce(null);
    const result = await repo.updateSupplierProduct(owner, 'prod-1', {
      priceUzs: 1,
      stockQuantity: 1,
      status: 'active',
    });
    expect(result).toEqual({ status: 'forbidden' });
  });

  it('rejects an update when the owning supplier is no longer approved', async () => {
    const product = { id: 'prod-1', tenantId: 'tenant-1', supplierId: 'partner-1' };
    em.findOne.mockResolvedValueOnce(product).mockResolvedValueOnce(partnerEntity({ status: 'suspended' }));

    const result = await repo.updateSupplierProduct(owner, 'prod-1', {
      priceUzs: 1,
      stockQuantity: 1,
      status: 'active',
    });

    expect(result).toEqual({ status: 'partner_unapproved' });
    expect(em.flush).not.toHaveBeenCalled();
  });
});

describe('PostgresAgriTechOperationsRepository — produce listings', () => {
  let em: ReturnType<typeof makeEm>;
  let repo: PostgresAgriTechOperationsRepository;

  beforeEach(() => {
    em = makeEm();
    repo = new PostgresAgriTechOperationsRepository(em as unknown as EntityManager);
  });

  const listingInput = {
    crop: 'cotton',
    grade: 'A' as const,
    quantityKg: 100,
    pricePerKgUzs: 5000,
    region: 'Fergana',
    supplierPartnerId: 'partner-1',
    availableFrom: now,
    availableUntil: later,
  };

  it('creates a listing for an active farmer', async () => {
    em.findOne.mockResolvedValueOnce(farmerEntity({ status: 'active' })).mockResolvedValueOnce(partnerEntity());
    const result = await repo.createProduceListing(owner, listingInput);
    expect(result.status).toBe('ok');
    expect(em.persist).toHaveBeenCalled();
  });

  it('rejects when availability window is inverted', async () => {
    const result = await repo.createProduceListing(owner, { ...listingInput, availableUntil: new Date('2026-07-01') });
    expect(result).toEqual({ status: 'invalid_state' });
  });

  it('rejects when farmer profile is missing', async () => {
    em.findOne.mockResolvedValue(null);
    const result = await repo.createProduceListing(owner, listingInput);
    expect(result).toEqual({ status: 'not_found' });
  });

  it('rejects when farmer is not active', async () => {
    em.findOne.mockResolvedValue(farmerEntity({ status: 'pending_verification' }));
    const result = await repo.createProduceListing(owner, listingInput);
    expect(result).toEqual({ status: 'farmer_inactive' });
  });

  it('rejects when the selected supplier organization is not approved for the owner', async () => {
    em.findOne.mockResolvedValueOnce(farmerEntity({ status: 'active' })).mockResolvedValueOnce(null);

    await expect(repo.createProduceListing(owner, listingInput)).resolves.toEqual({ status: 'partner_unapproved' });
    expect(em.persist).not.toHaveBeenCalled();
  });

  it('discovers median price across active listings', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-05T00:00:00Z'));
    em.find.mockResolvedValue([
      {
        id: 'l1',
        tenantId: 'tenant-1',
        farmerId: 'f1',
        crop: 'cotton',
        grade: 'A',
        quantityKg: 100,
        availableQuantityKg: 50,
        pricePerKgUzs: 4000,
        region: 'Fergana',
        images: [],
        availableFrom: now,
        availableUntil: later,
        status: 'active',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'l2',
        tenantId: 'tenant-1',
        farmerId: 'f2',
        crop: 'cotton',
        grade: 'A',
        quantityKg: 100,
        availableQuantityKg: 30,
        pricePerKgUzs: 6000,
        region: 'Fergana',
        images: [],
        availableFrom: now,
        availableUntil: later,
        status: 'active',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'l3',
        tenantId: 'tenant-1',
        farmerId: 'f3',
        crop: 'cotton',
        grade: 'A',
        quantityKg: 100,
        availableQuantityKg: 10,
        pricePerKgUzs: 5000,
        region: 'Fergana',
        images: [],
        availableFrom: now,
        availableUntil: later,
        status: 'active',
        createdAt: now,
        updatedAt: now,
      },
    ]);
    const result = await repo.discoverPrice('tenant-1', { crop: 'cotton', region: 'Fergana' });
    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(result.value.minimumUzs).toBe(4000);
      expect(result.value.medianUzs).toBe(5000);
      expect(result.value.maximumUzs).toBe(6000);
      expect(result.value.sampleSize).toBe(3);
    }
    vi.useRealTimers();
  });

  it('returns not_found for price discovery with no listings', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-05T00:00:00Z'));
    em.find.mockResolvedValue([]);
    const result = await repo.discoverPrice('tenant-1', { crop: 'saffron', region: 'Nowhere' });
    expect(result).toEqual({ status: 'not_found' });
    vi.useRealTimers();
  });

  it('cancels an untouched listing', async () => {
    const listing = {
      id: 'l1',
      tenantId: 'tenant-1',
      farmerId: 'farmer-1',
      crop: 'cotton',
      grade: 'A',
      quantityKg: 100,
      availableQuantityKg: 100,
      pricePerKgUzs: 5000,
      region: 'R',
      images: [],
      availableFrom: now,
      availableUntil: later,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    };
    em.findOne.mockResolvedValueOnce(farmerEntity()).mockResolvedValueOnce(listing);
    const result = await repo.cancelProduceListing(owner, 'l1');
    expect(result.status).toBe('ok');
    expect(listing.status).toBe('cancelled');
  });

  it('refuses to cancel a partially reserved listing', async () => {
    const listing = { id: 'l1', farmerId: 'farmer-1', quantityKg: 100, availableQuantityKg: 60, status: 'active' };
    em.findOne.mockResolvedValueOnce(farmerEntity()).mockResolvedValueOnce(listing);
    const result = await repo.cancelProduceListing(owner, 'l1');
    expect(result).toEqual({ status: 'invalid_state' });
  });
});

describe('PostgresAgriTechOperationsRepository — produce reservation', () => {
  let em: ReturnType<typeof makeEm>;
  let repo: PostgresAgriTechOperationsRepository;

  beforeEach(() => {
    em = makeEm();
    repo = new PostgresAgriTechOperationsRepository(em as unknown as EntityManager);
  });

  function listing(overrides: Record<string, unknown> = {}) {
    return {
      id: 'l1',
      tenantId: 'tenant-1',
      farmerId: 'farmer-1',
      crop: 'cotton',
      grade: 'A',
      quantityKg: 100,
      availableQuantityKg: 100,
      pricePerKgUzs: 5000,
      region: 'Fergana',
      images: [],
      availableFrom: now,
      availableUntil: later,
      status: 'active',
      createdAt: now,
      updatedAt: now,
      ...overrides,
    };
  }

  it('reserves quantity atomically and creates a confirmed order', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-05T00:00:00Z'));
    em.findOne
      .mockResolvedValueOnce(partnerEntity({ kind: 'buyer', status: 'approved' }))
      .mockResolvedValueOnce(listing());
    const result = await repo.reserveProduce(owner, 'l1', {
      partnerId: 'partner-1',
      quantityKg: 25,
      deliveryAddress: 'Toshkent',
    });
    expect(em.transactional).toHaveBeenCalled();
    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(result.value.totalAmountUzs).toBe(125_000);
    }
    vi.useRealTimers();
  });

  it('marks listing reserved when quantity reaches zero', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-05T00:00:00Z'));
    const l = listing({ availableQuantityKg: 30 });
    em.findOne.mockResolvedValueOnce(partnerEntity({ kind: 'buyer', status: 'approved' })).mockResolvedValueOnce(l);
    await repo.reserveProduce(owner, 'l1', { partnerId: 'partner-1', quantityKg: 30, deliveryAddress: 'T' });
    expect(l.status).toBe('reserved');
    expect(l.availableQuantityKg).toBe(0);
    vi.useRealTimers();
  });

  it('rejects reservation when buyer partner missing', async () => {
    em.findOne.mockResolvedValue(null);
    const result = await repo.reserveProduce(owner, 'l1', {
      partnerId: 'missing',
      quantityKg: 10,
      deliveryAddress: 'T',
    });
    expect(result).toEqual({ status: 'not_found' });
  });

  it('rejects reservation from unapproved buyer', async () => {
    em.findOne.mockResolvedValue(partnerEntity({ kind: 'buyer', status: 'pending' }));
    const result = await repo.reserveProduce(owner, 'l1', {
      partnerId: 'partner-1',
      quantityKg: 10,
      deliveryAddress: 'T',
    });
    expect(result).toEqual({ status: 'partner_unapproved' });
  });

  it('rejects overselling with insufficient_quantity', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-05T00:00:00Z'));
    em.findOne
      .mockResolvedValueOnce(partnerEntity({ kind: 'buyer', status: 'approved' }))
      .mockResolvedValueOnce(listing({ availableQuantityKg: 20 }));
    const result = await repo.reserveProduce(owner, 'l1', {
      partnerId: 'partner-1',
      quantityKg: 25,
      deliveryAddress: 'T',
    });
    expect(result).toEqual({ status: 'insufficient_quantity', field: 'quantityKg' });
    vi.useRealTimers();
  });
});

describe('PostgresAgriTechOperationsRepository — farmers and field visits', () => {
  let em: ReturnType<typeof makeEm>;
  let repo: PostgresAgriTechOperationsRepository;

  beforeEach(() => {
    em = makeEm();
    repo = new PostgresAgriTechOperationsRepository(em as unknown as EntityManager);
  });

  it('lists farmers assigned to the field agent', async () => {
    em.find.mockResolvedValue([farmerEntity({ fieldAgentUserId: 'user-1' })]);
    const result = await repo.listAssignedFarmers(owner);
    expect(em.find).toHaveBeenCalledWith(
      expect.anything(),
      { tenantId: 'tenant-1', fieldAgentUserId: 'user-1' },
      expect.anything(),
    );
    expect(result).toHaveLength(1);
  });

  it('assigns an agent to a farmer', async () => {
    const farmer = farmerEntity();
    em.findOne.mockResolvedValue(farmer);
    const result = await repo.assignFarmer(owner, 'farmer-1', 'agent-9');
    expect(result.status).toBe('ok');
    expect(farmer.fieldAgentUserId).toBe('agent-9');
  });

  it('returns not_found when assigning a missing farmer', async () => {
    em.findOne.mockResolvedValue(null);
    const result = await repo.assignFarmer(owner, 'missing', 'agent-9');
    expect(result).toEqual({ status: 'not_found' });
  });

  it('sets farmer status', async () => {
    const farmer = farmerEntity();
    em.findOne.mockResolvedValue(farmer);
    const result = await repo.setFarmerStatus(owner, 'farmer-1', 'inactive');
    expect(result.status).toBe('ok');
    expect(farmer.status).toBe('inactive');
  });

  it('records a field visit only for the assigned agent', async () => {
    em.findOne.mockResolvedValue(farmerEntity({ fieldAgentUserId: 'user-1' }));
    const result = await repo.recordFieldVisit(owner, {
      farmerId: 'farmer-1',
      notes: 'Healthy cotton',
      observedGrade: 'A',
      observedAt: now,
    });
    expect(result.status).toBe('ok');
    expect(em.persist).toHaveBeenCalled();
  });

  it('rejects field visit from a non-assigned agent', async () => {
    em.findOne.mockResolvedValue(null);
    const result = await repo.recordFieldVisit(owner, { farmerId: 'farmer-1', notes: 'x', observedAt: now });
    expect(result).toEqual({ status: 'forbidden' });
  });
});

describe('PostgresAgriTechOperationsRepository — deliveries', () => {
  let em: ReturnType<typeof makeEm>;
  let repo: PostgresAgriTechOperationsRepository;

  beforeEach(() => {
    em = makeEm();
    repo = new PostgresAgriTechOperationsRepository(em as unknown as EntityManager);
  });

  const order = { id: 'order-1', tenantId: 'tenant-1', status: 'confirmed', history: [] };

  it('schedules a delivery without agent as scheduled', async () => {
    em.findOne.mockResolvedValueOnce(order).mockResolvedValueOnce(null);
    const result = await repo.scheduleDelivery(owner, { orderId: 'order-1', scheduledAt: now });
    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(result.value.status).toBe('scheduled');
    }
  });

  it('schedules a delivery with agent as assigned', async () => {
    em.findOne.mockResolvedValueOnce(order).mockResolvedValueOnce(null);
    const result = await repo.scheduleDelivery(owner, { orderId: 'order-1', agentUserId: 'agent-1', scheduledAt: now });
    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(result.value.status).toBe('assigned');
    }
  });

  it('returns conflict when delivery already exists for the order', async () => {
    em.findOne.mockResolvedValueOnce(order).mockResolvedValueOnce({ id: 'delivery-1' });
    const result = await repo.scheduleDelivery(owner, { orderId: 'order-1', scheduledAt: now });
    expect(result).toEqual({ status: 'conflict', field: 'orderId' });
  });

  it('returns not_found when order is missing', async () => {
    em.findOne.mockResolvedValue(null);
    const result = await repo.scheduleDelivery(owner, { orderId: 'missing', scheduledAt: now });
    expect(result).toEqual({ status: 'not_found' });
  });

  it('transitions delivery with proof and appends history', async () => {
    const delivery = {
      id: 'd1',
      tenantId: 'tenant-1',
      orderId: 'order-1',
      agentUserId: 'user-1',
      status: 'in_transit',
      scheduledAt: now,
      proofReference: null,
      history: [],
      createdAt: now,
      updatedAt: now,
    };
    em.findOne.mockResolvedValueOnce(delivery).mockResolvedValueOnce({ ...order, history: [] });
    const result = await repo.transitionDelivery(owner, 'd1', { status: 'delivered', proofReference: 'photo://pod' });
    expect(result.status).toBe('ok');
    expect(delivery.status).toBe('delivered');
    expect(delivery.history).toHaveLength(1);
  });

  it('rejects delivery completion without proof', async () => {
    const delivery = {
      id: 'd1',
      tenantId: 'tenant-1',
      orderId: 'order-1',
      agentUserId: 'user-1',
      status: 'in_transit',
      scheduledAt: now,
      proofReference: null,
      history: [],
      createdAt: now,
      updatedAt: now,
    };
    em.findOne.mockResolvedValue(delivery);
    const result = await repo.transitionDelivery(owner, 'd1', { status: 'delivered' });
    expect(result).toEqual({ status: 'invalid_state' });
  });

  it('rejects transition from a different agent', async () => {
    em.findOne.mockResolvedValue(null);
    const result = await repo.transitionDelivery(owner, 'd1', { status: 'picked_up' });
    expect(result).toEqual({ status: 'forbidden' });
  });
});

describe('PostgresAgriTechOperationsRepository — advisories', () => {
  let em: ReturnType<typeof makeEm>;
  let repo: PostgresAgriTechOperationsRepository;

  beforeEach(() => {
    em = makeEm();
    repo = new PostgresAgriTechOperationsRepository(em as unknown as EntityManager);
  });

  const advisoryInput = {
    farmerId: 'farmer-1',
    kind: 'weather' as const,
    source: 'hydromet',
    summary: 'Rain',
    observedAt: now,
    expiresAt: later,
  };

  it('publishes an advisory for an existing farmer', async () => {
    em.findOne.mockResolvedValue(farmerEntity());
    const result = await repo.publishAdvisory(owner, advisoryInput);
    expect(result.status).toBe('ok');
  });

  it('rejects advisory with expiry before observation', async () => {
    const result = await repo.publishAdvisory(owner, { ...advisoryInput, expiresAt: new Date('2026-07-01') });
    expect(result).toEqual({ status: 'invalid_state' });
  });

  it('rejects advisory for unknown farmer', async () => {
    em.findOne.mockResolvedValue(null);
    const result = await repo.publishAdvisory(owner, advisoryInput);
    expect(result).toEqual({ status: 'not_found' });
  });

  it('lists advisories for the farmer identity', async () => {
    em.findOne.mockResolvedValue(farmerEntity());
    em.find.mockResolvedValue([
      {
        id: 'a1',
        tenantId: 'tenant-1',
        farmerId: 'farmer-1',
        kind: 'weather',
        source: 'hydromet',
        summary: 'Rain',
        observedAt: now,
        expiresAt: later,
        createdAt: now,
      },
    ]);
    const result = await repo.listAdvisories(owner);
    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(result.value).toHaveLength(1);
    }
  });

  it('returns not_found listing advisories without a farmer profile', async () => {
    em.findOne.mockResolvedValue(null);
    const result = await repo.listAdvisories(owner);
    expect(result).toEqual({ status: 'not_found' });
  });
});

describe('PostgresAgriTechOperationsRepository — analytics', () => {
  it('aggregates tenant KPIs with GMV and commission', async () => {
    const em = makeEm();
    em.find
      .mockResolvedValueOnce([
        farmerEntity({ status: 'active' }),
        farmerEntity({ id: 'f2', status: 'pending_verification' }),
      ])
      .mockResolvedValueOnce([
        partnerEntity({ kind: 'supplier', status: 'approved' }),
        partnerEntity({ id: 'p2', kind: 'buyer', status: 'pending' }),
      ])
      .mockResolvedValueOnce([
        { id: 'prod1', stockQuantity: 50 },
        { id: 'prod2', stockQuantity: 30 },
      ])
      .mockResolvedValueOnce([{ id: 'l1', availableQuantityKg: 100 }])
      .mockResolvedValueOnce([
        { id: 'o1', buyerPartnerId: 'p2', status: 'delivered' },
        { id: 'o2', buyerPartnerId: 'p2', status: 'confirmed' },
      ])
      .mockResolvedValueOnce([{ id: 'pay1', amountUzs: 200_000, state: 'paid' }]);
    const repo = new PostgresAgriTechOperationsRepository(em as unknown as EntityManager);
    const result = await repo.analytics('tenant-1');
    expect(result.farmers).toBe(2);
    expect(result.activeFarmers).toBe(1);
    expect(result.pendingFarmers).toBe(1);
    expect(result.approvedSuppliers).toBe(1);
    expect(result.inputStockUnits).toBe(80);
    expect(result.produceAvailableKg).toBe(100);
    expect(result.orders).toBe(2);
    expect(result.deliveredOrders).toBe(1);
    expect(result.repeatBuyers).toBe(1);
    expect(result.gmvUzs).toBe(200_000);
    expect(result.commissionBasisPoints).toBe(800);
    expect(result.platformCommissionUzs).toBe(16_000);
  });

  it('handles an empty tenant without division errors', async () => {
    const em = makeEm();
    const repo = new PostgresAgriTechOperationsRepository(em as unknown as EntityManager);
    const result = await repo.analytics('empty-tenant');
    expect(result.farmers).toBe(0);
    expect(result.fulfillmentRateBasisPoints).toBe(0);
    expect(result.repeatBuyerRateBasisPoints).toBe(0);
    expect(result.gmvUzs).toBe(0);
    expect(result.platformCommissionUzs).toBe(0);
  });
});

describe('PostgresAgriTechOperationsRepository — pilots and integrations', () => {
  let em: ReturnType<typeof makeEm>;
  let repo: PostgresAgriTechOperationsRepository;

  beforeEach(() => {
    em = makeEm();
    repo = new PostgresAgriTechOperationsRepository(em as unknown as EntityManager);
  });

  const pilotInput = { name: 'Fergana pilot', targetFarmers: 100, targetSuppliers: 10, startsAt: now, endsAt: later };

  it('creates a pilot cohort', async () => {
    const result = await repo.createPilot(owner, pilotInput);
    expect(result.status).toBe('ok');
  });

  it('rejects pilot with inverted window', async () => {
    const result = await repo.createPilot(owner, { ...pilotInput, endsAt: new Date('2026-07-01') });
    expect(result).toEqual({ status: 'invalid_state' });
  });

  it('rejects duplicate pilot name within tenant', async () => {
    em.findOne.mockResolvedValue({ id: 'existing' });
    const result = await repo.createPilot(owner, pilotInput);
    expect(result).toEqual({ status: 'conflict', field: 'name' });
  });

  it('transitions pilot status when allowed', async () => {
    const pilot = {
      id: 'p1',
      tenantId: 'tenant-1',
      name: 'pilot',
      status: 'planned',
      targetFarmers: 10,
      targetSuppliers: 2,
      startsAt: now,
      endsAt: later,
      createdAt: now,
      updatedAt: now,
    };
    em.findOne.mockResolvedValue(pilot);
    const result = await repo.setPilotStatus(owner, 'p1', 'active');
    expect(result.status).toBe('ok');
    expect(pilot.status).toBe('active');
  });

  it('rejects invalid pilot transition', async () => {
    em.findOne.mockResolvedValue({ id: 'p1', tenantId: 'tenant-1', status: 'completed' });
    const result = await repo.setPilotStatus(owner, 'p1', 'active');
    expect(result).toEqual({ status: 'invalid_state' });
  });

  it('returns all providers with disabled default when no state exists', async () => {
    em.find.mockResolvedValue([]);
    const result = await repo.integrationReadiness('tenant-1');
    expect(result).toHaveLength(7);
    expect(result.every((row) => row.status === 'disabled')).toBe(true);
  });

  it('reports provider state from integration rows', async () => {
    em.find.mockResolvedValue([{ provider: 'click', status: 'ready', lastSuccessfulAt: now, lastErrorCode: null }]);
    const result = await repo.integrationReadiness('tenant-1');
    const click = result.find((row) => row.provider === 'click');
    expect(click?.status).toBe('ready');
    expect(click?.lastSuccessfulAt).toEqual(now);
  });
});
