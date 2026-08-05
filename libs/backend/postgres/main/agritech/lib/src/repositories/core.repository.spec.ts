// @requirements REQ-AGRITECH-PROFILE-001 REQ-AGRITECH-CATALOG-002 REQ-AGRITECH-ORDER-003
import type { EntityManager } from '@mikro-orm/core';
import { LockMode } from '@mikro-orm/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CreateFarmerDto, UpdateFarmerDto } from '@app/backend-feature-farmer-shared';
import type { CreateOrderDto } from '@app/backend-feature-order-shared';
import { FarmerEntity } from '../entities/farmer.entity';
import { OrderEntity } from '../entities/order.entity';
import { ProductEntity } from '../entities/product.entity';
import { PostgresFarmerRepository, toFarmerProfile } from './farmer.repository';
import { PostgresOrderRepository } from './order.repository';
import { PostgresProductRepository, toProduct } from './product.repository';

const owner = { tenantId: 'tenant-1', userId: 'user-1' };
const now = new Date('2026-08-02T00:00:00Z');

function farmerEntity(overrides: Partial<FarmerEntity> = {}): FarmerEntity {
  return Object.assign(new FarmerEntity(), {
    id: 'farmer-1',
    tenantId: owner.tenantId,
    userId: owner.userId,
    phone: '+998901234567',
    firstName: 'Ali',
    lastName: 'Valiyev',
    region: "Farg'ona viloyati",
    district: 'Quva tumani',
    village: 'Qishloq',
    farmSizeHectares: 12.5,
    crops: ['cotton', 'wheat'],
    status: 'active',
    telegramId: '123456789',
    latitude: 40.38,
    longitude: 71.78,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  });
}

function productEntity(overrides: Partial<ProductEntity> = {}): ProductEntity {
  return Object.assign(new ProductEntity(), {
    id: 'product-1',
    tenantId: owner.tenantId,
    name: 'Cotton seed',
    nameRu: 'Семена хлопка',
    nameUz: 'Paxta urugʻi',
    category: 'seed',
    description: 'Certified seed',
    supplierId: 'supplier-1',
    supplierName: 'Agro Supply',
    priceUzs: 10_000,
    unit: 'kg',
    stockQuantity: 100,
    region: "Farg'ona viloyati",
    status: 'active',
    images: ['seed.jpg'],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  });
}

function orderEntity(overrides: Partial<OrderEntity> = {}): OrderEntity {
  return Object.assign(new OrderEntity(), {
    id: 'order-1',
    tenantId: owner.tenantId,
    userId: owner.userId,
    farmerId: 'farmer-1',
    items: [
      {
        productId: 'product-1',
        productName: 'Cotton seed',
        quantity: 2,
        unitPriceUzs: 10_000,
        totalUzs: 20_000,
      },
    ],
    totalAmountUzs: 20_000,
    status: 'pending',
    deliveryAddress: 'Quva tumani, Qishloq',
    region: "Farg'ona viloyati",
    notes: 'Deliver in the morning',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  });
}

function emMock() {
  return {
    findOne: vi.fn(),
    find: vi.fn(),
    persist: vi.fn(),
    flush: vi.fn().mockResolvedValue(undefined),
    assign: vi.fn((target: object, input: object) => Object.assign(target, input)),
    transactional: vi.fn(
      async (callback: (em: ReturnType<typeof emMock>) => Promise<unknown>) => {
        const txEm = emMock();
        return callback(txEm);
      },
    ),
  };
}

type EmMock = ReturnType<typeof emMock>;

describe('PostgresFarmerRepository', () => {
  let em: EmMock;
  let repository: PostgresFarmerRepository;

  beforeEach(() => {
    em = emMock();
    repository = new PostgresFarmerRepository(em as unknown as EntityManager);
  });

  describe('toFarmerProfile', () => {
    it('maps all entity fields and coerces decimal columns to numbers', () => {
      const entity = farmerEntity();
      const profile = toFarmerProfile(entity);
      expect(profile).toEqual({
        id: 'farmer-1',
        tenantId: owner.tenantId,
        userId: owner.userId,
        phone: '+998901234567',
        firstName: 'Ali',
        lastName: 'Valiyev',
        region: "Farg'ona viloyati",
        district: 'Quva tumani',
        village: 'Qishloq',
        farmSizeHectares: 12.5,
        crops: ['cotton', 'wheat'],
        status: 'active',
        telegramId: '123456789',
        latitude: 40.38,
        longitude: 71.78,
        createdAt: now,
        updatedAt: now,
      });
    });

    it('maps nullable columns to undefined in the profile', () => {
      const profile = toFarmerProfile(
        farmerEntity({
          district: null,
          village: null,
          telegramId: null,
          latitude: null,
          longitude: null,
        }),
      );
      expect(profile.district).toBeUndefined();
      expect(profile.village).toBeUndefined();
      expect(profile.telegramId).toBeUndefined();
      expect(profile.latitude).toBeUndefined();
      expect(profile.longitude).toBeUndefined();
    });
  });

  describe('findByOwner', () => {
    it('returns the mapped profile scoped to tenant and user', async () => {
      em.findOne.mockResolvedValue(farmerEntity());

      const profile = await repository.findByOwner(owner);

      expect(em.findOne).toHaveBeenCalledWith(FarmerEntity, owner);
      expect(profile?.id).toBe('farmer-1');
      expect(profile?.tenantId).toBe(owner.tenantId);
      expect(profile?.userId).toBe(owner.userId);
    });

    it('returns undefined when the tenant farmer does not exist (not_found path)', async () => {
      em.findOne.mockResolvedValue(null);

      await expect(repository.findByOwner(owner)).resolves.toBeUndefined();
    });

    it('enforces tenant isolation by returning undefined for a foreign tenant farmer', async () => {
      em.findOne.mockResolvedValue(null);

      const foreignOwner = { tenantId: 'tenant-2', userId: owner.userId };
      await expect(repository.findByOwner(foreignOwner)).resolves.toBeUndefined();
      expect(em.findOne).toHaveBeenCalledWith(FarmerEntity, foreignOwner);
    });
  });

  describe('findByPhone', () => {
    it('looks up a farmer by tenant and phone', async () => {
      em.findOne.mockResolvedValue(farmerEntity());

      const profile = await repository.findByPhone(owner.tenantId, '+998901234567');

      expect(em.findOne).toHaveBeenCalledWith(FarmerEntity, {
        tenantId: owner.tenantId,
        phone: '+998901234567',
      });
      expect(profile?.phone).toBe('+998901234567');
    });

    it('returns undefined when the phone is not registered in the tenant (conflict check path)', async () => {
      em.findOne.mockResolvedValue(null);

      await expect(
        repository.findByPhone(owner.tenantId, '+998909999999'),
      ).resolves.toBeUndefined();
    });
  });

  describe('create', () => {
    it('persists a new farmer with owner and input fields and flushes', async () => {
      const input: CreateFarmerDto = {
        phone: '+998901234567',
        firstName: 'Ali',
        lastName: 'Valiyev',
        region: "Farg'ona viloyati",
        district: 'Quva tumani',
        village: 'Qishloq',
        farmSizeHectares: 12.5,
        crops: ['cotton', 'wheat'],
        telegramId: '123456789',
        latitude: 40.38,
        longitude: 71.78,
      };

      const profile = await repository.create(owner, input);

      expect(em.persist).toHaveBeenCalledTimes(1);
      const persisted = em.persist.mock.calls[0]?.[0] as FarmerEntity;
      expect(persisted).toBeInstanceOf(FarmerEntity);
      expect(persisted.tenantId).toBe(owner.tenantId);
      expect(persisted.userId).toBe(owner.userId);
      expect(persisted.phone).toBe(input.phone);
      expect(persisted.crops).toEqual(input.crops);
      expect(em.flush).toHaveBeenCalledTimes(1);
      expect(profile.id).toBe(persisted.id);
      expect(profile.phone).toBe(input.phone);
      expect(profile.farmSizeHectares).toBe(12.5);
      expect(profile.status).toBe('pending_verification');
    });
  });

  describe('update', () => {
    it('returns undefined without touching the store when the farmer is missing (not_found path)', async () => {
      em.findOne.mockResolvedValue(null);

      await expect(repository.update(owner, { firstName: 'Vali' })).resolves.toBeUndefined();
      expect(em.assign).not.toHaveBeenCalled();
      expect(em.flush).not.toHaveBeenCalled();
    });

    it('assigns the update payload, flushes and returns the updated profile', async () => {
      const entity = farmerEntity();
      em.findOne.mockResolvedValue(entity);
      const input: UpdateFarmerDto = { firstName: 'Vali', crops: ['rice'], region: 'Buxoro viloyati' };

      const profile = await repository.update(owner, input);

      expect(em.findOne).toHaveBeenCalledWith(FarmerEntity, owner);
      expect(em.assign).toHaveBeenCalledWith(entity, input);
      expect(em.flush).toHaveBeenCalledTimes(1);
      expect(profile?.firstName).toBe('Vali');
      expect(profile?.crops).toEqual(['rice']);
      expect(profile?.region).toBe('Buxoro viloyati');
    });
  });
});

describe('PostgresProductRepository', () => {
  let em: EmMock;
  let repository: PostgresProductRepository;

  beforeEach(() => {
    em = emMock();
    repository = new PostgresProductRepository(em as unknown as EntityManager);
  });

  describe('toProduct', () => {
    it('maps entity fields, coerces the price to a number and drops null localized names', () => {
      const product = toProduct(productEntity({ nameRu: null, nameUz: null }));
      expect(product).toEqual({
        id: 'product-1',
        name: 'Cotton seed',
        nameRu: undefined,
        nameUz: undefined,
        category: 'seed',
        description: 'Certified seed',
        supplierName: 'Agro Supply',
        priceUzs: 10_000,
        unit: 'kg',
        stockQuantity: 100,
        region: "Farg'ona viloyati",
        status: 'active',
        images: ['seed.jpg'],
        createdAt: now,
        updatedAt: now,
      });
    });
  });

  describe('findActiveById', () => {
    it('queries by tenant, id and active status and maps the product', async () => {
      em.findOne.mockResolvedValue(productEntity());

      const product = await repository.findActiveById(owner.tenantId, 'product-1');

      expect(em.findOne).toHaveBeenCalledWith(ProductEntity, {
        tenantId: owner.tenantId,
        id: 'product-1',
        status: 'active',
      });
      expect(product?.id).toBe('product-1');
      expect(product?.priceUzs).toBe(10_000);
    });

    it('returns undefined for inactive or unknown products (not_found path)', async () => {
      em.findOne.mockResolvedValue(null);

      await expect(
        repository.findActiveById(owner.tenantId, 'missing-product'),
      ).resolves.toBeUndefined();
    });

    it('enforces tenant isolation by scoping the lookup to the tenant', async () => {
      em.findOne.mockResolvedValue(null);

      await expect(
        repository.findActiveById('tenant-2', 'product-1'),
      ).resolves.toBeUndefined();
      expect(em.findOne).toHaveBeenCalledWith(ProductEntity, {
        tenantId: 'tenant-2',
        id: 'product-1',
        status: 'active',
      });
    });
  });

  describe('findActive', () => {
    it('lists active products for the tenant ordered by creation date without filters', async () => {
      em.find.mockResolvedValue([productEntity(), productEntity({ id: 'product-2', name: 'Urea' })]);

      const products = await repository.findActive(owner.tenantId);

      expect(em.find).toHaveBeenCalledWith(
        ProductEntity,
        { tenantId: owner.tenantId, status: 'active' },
        { orderBy: { createdAt: 'DESC' } },
      );
      expect(products).toHaveLength(2);
      expect(products.map((product) => product.id)).toEqual(['product-1', 'product-2']);
    });

    it('applies only the category filter when the region is absent', async () => {
      em.find.mockResolvedValue([productEntity()]);

      await repository.findActive(owner.tenantId, { category: 'seed' });

      expect(em.find).toHaveBeenCalledWith(
        ProductEntity,
        { tenantId: owner.tenantId, status: 'active', category: 'seed' },
        { orderBy: { createdAt: 'DESC' } },
      );
    });

    it('applies only the region filter when the category is absent', async () => {
      em.find.mockResolvedValue([productEntity()]);

      await repository.findActive(owner.tenantId, { region: "Farg'ona viloyati" });

      expect(em.find).toHaveBeenCalledWith(
        ProductEntity,
        { tenantId: owner.tenantId, status: 'active', region: "Farg'ona viloyati" },
        { orderBy: { createdAt: 'DESC' } },
      );
    });

    it('applies both category and region filters together', async () => {
      em.find.mockResolvedValue([productEntity()]);

      await repository.findActive(owner.tenantId, {
        category: 'seed',
        region: "Farg'ona viloyati",
      });

      expect(em.find).toHaveBeenCalledWith(
        ProductEntity,
        {
          tenantId: owner.tenantId,
          status: 'active',
          category: 'seed',
          region: "Farg'ona viloyati",
        },
        { orderBy: { createdAt: 'DESC' } },
      );
    });

    it('returns an empty list when no active products match', async () => {
      em.find.mockResolvedValue([]);

      await expect(repository.findActive(owner.tenantId)).resolves.toEqual([]);
    });
  });
});

describe('PostgresOrderRepository', () => {
  let em: EmMock;
  let repository: PostgresOrderRepository;

  beforeEach(() => {
    em = emMock();
    repository = new PostgresOrderRepository(em as unknown as EntityManager);
  });

  describe('createOwned', () => {
    const input: CreateOrderDto = {
      items: [{ productId: 'product-1', quantity: 2 }],
      deliveryAddress: 'Quva tumani, Qishloq',
      region: "Farg'ona viloyati",
      notes: 'Deliver in the morning',
    };

    function transactionalRepository() {
      const txEm = emMock();
      em.transactional.mockImplementation(
        async (callback: (em: EmMock) => Promise<unknown>) => callback(txEm),
      );
      return txEm;
    }

    it('returns farmer_not_found when the owner has no farmer profile in the tenant', async () => {
      const txEm = transactionalRepository();
      txEm.findOne.mockResolvedValue(null);

      const result = await repository.createOwned(owner, input);

      expect(result).toEqual({ status: 'farmer_not_found' });
      expect(txEm.findOne).toHaveBeenCalledWith(FarmerEntity, owner);
      expect(txEm.persist).not.toHaveBeenCalled();
      expect(txEm.flush).not.toHaveBeenCalled();
    });

    it('returns invalid_product when a requested product is missing, inactive, or in another tenant', async () => {
      const txEm = transactionalRepository();
      txEm.findOne
        .mockResolvedValueOnce(farmerEntity())
        .mockResolvedValueOnce(null);

      const result = await repository.createOwned(owner, input);

      expect(result).toEqual({ status: 'invalid_product', productId: 'product-1' });
      expect(txEm.findOne).toHaveBeenLastCalledWith(
        ProductEntity,
        { tenantId: owner.tenantId, id: 'product-1', status: 'active' },
        { lockMode: LockMode.PESSIMISTIC_WRITE },
      );
      expect(txEm.persist).not.toHaveBeenCalled();
      expect(txEm.flush).not.toHaveBeenCalled();
    });

    it('returns insufficient_stock without decrementing stock when the quantity exceeds availability', async () => {
      const txEm = transactionalRepository();
      const product = productEntity({ stockQuantity: 1 });
      txEm.findOne
        .mockResolvedValueOnce(farmerEntity())
        .mockResolvedValueOnce(product);

      const result = await repository.createOwned(owner, {
        ...input,
        items: [{ productId: 'product-1', quantity: 2 }],
      });

      expect(result).toEqual({ status: 'insufficient_stock', productId: 'product-1' });
      expect(product.stockQuantity).toBe(1);
      expect(txEm.persist).not.toHaveBeenCalled();
      expect(txEm.flush).not.toHaveBeenCalled();
    });

    it('locks products, decrements stock, and persists the order with computed totals', async () => {
      const txEm = transactionalRepository();
      const product = productEntity({ stockQuantity: 5, priceUzs: 10_000 });
      txEm.findOne
        .mockResolvedValueOnce(farmerEntity())
        .mockResolvedValueOnce(product);

      const result = await repository.createOwned(owner, input);

      expect(product.stockQuantity).toBe(3);
      expect(txEm.persist).toHaveBeenCalledTimes(1);
      const persisted = txEm.persist.mock.calls[0]?.[0] as OrderEntity;
      expect(persisted).toBeInstanceOf(OrderEntity);
      expect(persisted.tenantId).toBe(owner.tenantId);
      expect(persisted.userId).toBe(owner.userId);
      expect(persisted.farmerId).toBe('farmer-1');
      expect(persisted.items).toEqual([
        {
          productId: 'product-1',
          productName: 'Cotton seed',
          quantity: 2,
          unitPriceUzs: 10_000,
          totalUzs: 20_000,
        },
      ]);
      expect(persisted.totalAmountUzs).toBe(20_000);
      expect(persisted.deliveryAddress).toBe(input.deliveryAddress);
      expect(persisted.region).toBe(input.region);
      expect(persisted.notes).toBe('Deliver in the morning');
      expect(txEm.flush).toHaveBeenCalledTimes(1);

      expect(result.status).toBe('created');
      if (result.status === 'created') {
        expect(result.order.id).toBe(persisted.id);
        expect(result.order.totalAmountUzs).toBe(20_000);
        expect(result.order.status).toBe('pending');
        expect(result.order.notes).toBe('Deliver in the morning');
      }
    });

    it('stores null notes when the input omits notes', async () => {
      const txEm = transactionalRepository();
      const product = productEntity({ stockQuantity: 5 });
      txEm.findOne
        .mockResolvedValueOnce(farmerEntity())
        .mockResolvedValueOnce(product);

      const result = await repository.createOwned(owner, {
        ...input,
        notes: undefined,
      });

      const persisted = txEm.persist.mock.calls[0]?.[0] as OrderEntity;
      expect(persisted.notes).toBeNull();
      expect(result.status).toBe('created');
      if (result.status === 'created') {
        expect(result.order.notes).toBeUndefined();
      }
    });

    it('processes multiple items sequentially, summing totals and aborting on a later insufficient item', async () => {
      const txEm = transactionalRepository();
      const first = productEntity({ id: 'product-1', stockQuantity: 10, priceUzs: 10_000 });
      const second = productEntity({ id: 'product-2', name: 'Urea', stockQuantity: 1, priceUzs: 5_000 });
      txEm.findOne
        .mockResolvedValueOnce(farmerEntity())
        .mockResolvedValueOnce(first)
        .mockResolvedValueOnce(second);

      const result = await repository.createOwned(owner, {
        ...input,
        items: [
          { productId: 'product-1', quantity: 3 },
          { productId: 'product-2', quantity: 2 },
        ],
      });

      expect(result).toEqual({ status: 'insufficient_stock', productId: 'product-2' });
      expect(first.stockQuantity).toBe(7);
      expect(second.stockQuantity).toBe(1);
      expect(txEm.persist).not.toHaveBeenCalled();
    });
  });

  describe('findOwned', () => {
    it('returns the mapped order scoped to owner and id', async () => {
      em.findOne.mockResolvedValue(orderEntity());

      const order = await repository.findOwned(owner, 'order-1');

      expect(em.findOne).toHaveBeenCalledWith(OrderEntity, { ...owner, id: 'order-1' });
      expect(order?.id).toBe('order-1');
      expect(order?.farmerId).toBe('farmer-1');
      expect(order?.totalAmountUzs).toBe(20_000);
      expect(order?.items).toHaveLength(1);
    });

    it('maps null notes to undefined', async () => {
      em.findOne.mockResolvedValue(orderEntity({ notes: null }));

      const order = await repository.findOwned(owner, 'order-1');

      expect(order?.notes).toBeUndefined();
    });

    it('returns undefined for foreign-tenant or missing orders (not_found path)', async () => {
      em.findOne.mockResolvedValue(null);

      await expect(repository.findOwned(owner, 'order-x')).resolves.toBeUndefined();
    });
  });

  describe('listOwned', () => {
    it('lists owner orders ordered by creation date descending', async () => {
      em.find.mockResolvedValue([orderEntity(), orderEntity({ id: 'order-2' })]);

      const orders = await repository.listOwned(owner);

      expect(em.find).toHaveBeenCalledWith(OrderEntity, owner, {
        orderBy: { createdAt: 'DESC' },
      });
      expect(orders.map((order) => order.id)).toEqual(['order-1', 'order-2']);
    });

    it('returns an empty list when the owner has no orders', async () => {
      em.find.mockResolvedValue([]);

      await expect(repository.listOwned(owner)).resolves.toEqual([]);
    });
  });

  it('runs order creation inside a transaction', async () => {
    const txEm = emMock();
    txEm.findOne.mockResolvedValue(null);
    em.transactional.mockImplementation(
      async (callback: (em: EmMock) => Promise<unknown>) => callback(txEm),
    );

    await repository.createOwned(owner, {
      items: [{ productId: 'product-1', quantity: 1 }],
      deliveryAddress: 'Toshkent',
      region: 'Toshkent shahri',
    });

    expect(em.transactional).toHaveBeenCalledTimes(1);
    expect(txEm.findOne).toHaveBeenCalledWith(FarmerEntity, owner);
  });
});
