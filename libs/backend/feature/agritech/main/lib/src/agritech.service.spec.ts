// @requirements REQ-AGRITECH-PARTNER-007 REQ-AGRITECH-OUTPUT-008 REQ-AGRITECH-FULFILLMENT-010 REQ-AGRITECH-ADVISORY-009 REQ-AGRITECH-ANALYTICS-011 REQ-AGRITECH-INTEGRATION-013
import { describe, expect, it, vi } from 'vitest';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  ResourceNotFoundException,
} from '@app/backend-common-exception';
import type { AgriTechOperationsRepository, OperationResult } from '@app/backend-feature-agritech-shared';
import { AgriTechNotificationPublisher } from './agritech-notification.publisher';
import { AgriTechOperationsService } from './agritech.service';

const owner = { tenantId: 'tenant-1', userId: 'user-1' };
const now = new Date('2026-08-02T00:00:00Z');
const partner = {
  id: 'partner-1',
  tenantId: owner.tenantId,
  ownerUserId: owner.userId,
  kind: 'supplier' as const,
  legalName: 'Agro Supply',
  taxId: '123456789',
  phone: '+998901234567',
  region: 'Fergana',
  status: 'approved' as const,
  createdAt: now,
  updatedAt: now,
};
const farmer = {
  id: 'farmer-1',
  userId: 'farmer-user-1',
  firstName: 'Ali',
  lastName: 'Valiyev',
  phone: '+998901234567',
  region: 'Fergana',
  crops: ['cotton'],
  status: 'active' as const,
};
const delivery = {
  id: 'delivery-1',
  tenantId: owner.tenantId,
  orderId: 'order-1',
  agentUserId: 'agent-1',
  status: 'scheduled' as const,
  scheduledAt: now,
  history: [],
  createdAt: now,
  updatedAt: now,
};
const advisory = {
  id: 'advisory-1',
  tenantId: owner.tenantId,
  farmerId: farmer.id,
  kind: 'weather' as const,
  source: 'hydromet',
  summary: 'Rain expected',
  observedAt: now,
  expiresAt: new Date('2026-08-03T00:00:00Z'),
  createdAt: now,
  stale: false,
};
const ok = <T>(value: T): OperationResult<T> => ({ status: 'ok', value });

function fixture() {
  const repository = {
    createPartner: vi.fn().mockResolvedValue(ok(partner)),
    listOwnedPartners: vi.fn().mockResolvedValue([partner]),
    listPartners: vi.fn().mockResolvedValue([partner]),
    setPartnerStatus: vi.fn().mockResolvedValue(ok(partner)),
    createSupplierProduct: vi.fn().mockResolvedValue(ok({ id: 'supplier-product-1' })),
    listSupplierProducts: vi.fn().mockResolvedValue([]),
    updateSupplierProduct: vi.fn().mockResolvedValue(ok({ id: 'supplier-product-1' })),
    createProduceListing: vi.fn().mockResolvedValue(ok({ id: 'produce-1' })),
    listProduce: vi.fn().mockResolvedValue([]),
    discoverPrice: vi.fn().mockResolvedValue(ok({ crop: 'cotton' })),
    reserveProduce: vi.fn().mockResolvedValue(ok({ orderId: 'order-1', totalAmountUzs: 50_000 })),
    cancelProduceListing: vi.fn().mockResolvedValue(ok({ id: 'produce-1' })),
    listAssignedFarmers: vi.fn().mockResolvedValue([farmer]),
    listFarmers: vi.fn().mockResolvedValue([farmer]),
    assignFarmer: vi.fn().mockResolvedValue(ok({ farmerId: farmer.id })),
    setFarmerStatus: vi.fn().mockResolvedValue(ok({ farmerId: farmer.id, status: 'active' })),
    recordFieldVisit: vi.fn().mockResolvedValue(ok({ id: 'visit-1' })),
    listOrders: vi.fn().mockResolvedValue([]),
    scheduleDelivery: vi.fn().mockResolvedValue(ok(delivery)),
    listDeliveries: vi.fn().mockResolvedValue([delivery]),
    transitionDelivery: vi.fn().mockResolvedValue(ok(delivery)),
    publishAdvisory: vi.fn().mockResolvedValue(ok(advisory)),
    listAdvisories: vi.fn().mockResolvedValue(ok([advisory])),
    analytics: vi.fn().mockResolvedValue({ farmers: 1 }),
    createPilot: vi.fn().mockResolvedValue(ok({ id: 'pilot-1' })),
    listPilots: vi.fn().mockResolvedValue([]),
    setPilotStatus: vi.fn().mockResolvedValue(ok({ id: 'pilot-1' })),
    integrationReadiness: vi.fn().mockResolvedValue([]),
  };
  const notifications = {
    partnerStatus: vi.fn().mockResolvedValue(undefined),
    farmerAssigned: vi.fn().mockResolvedValue(undefined),
    advisoryPublished: vi.fn().mockResolvedValue(undefined),
    deliveryScheduled: vi.fn().mockResolvedValue(undefined),
    produceReserved: vi.fn().mockResolvedValue(undefined),
  };
  return {
    repository,
    notifications,
    service: new AgriTechOperationsService(
      repository as unknown as AgriTechOperationsRepository,
      notifications as unknown as AgriTechNotificationPublisher,
    ),
  };
}

describe('AgriTechOperationsService', () => {
  it('delegates the complete farmer, partner, marketplace, fulfillment, pilot, and analytics surface', async () => {
    const { repository, notifications, service } = fixture();
    const partnerInput = { kind: 'supplier' as const, legalName: 'Agro', taxId: '1', phone: '+99890', region: 'R' };
    const supplierInput = {
      partnerId: partner.id,
      name: 'Seed',
      category: 'seed' as const,
      description: 'Certified',
      priceUzs: 10_000,
      unit: 'kg',
      stockQuantity: 10,
      region: 'R',
    };
    const listingInput = {
      crop: 'cotton',
      grade: 'A' as const,
      quantityKg: 100,
      pricePerKgUzs: 5_000,
      region: 'R',
      supplierPartnerId: 'partner-1',
      availableFrom: now,
      availableUntil: new Date('2026-09-02T00:00:00Z'),
    };

    await service.createPartner(owner, partnerInput);
    await service.listOwnedPartners(owner);
    await service.createSupplierProduct(owner, supplierInput);
    await service.listSupplierProducts(owner);
    await service.updateSupplierProduct(owner, 'supplier-product-1', {
      priceUzs: 12_000,
      stockQuantity: 8,
      status: 'active',
    });
    await service.createProduceListing(owner, listingInput);
    await service.listProduce(owner, { crop: 'cotton', region: 'R', grade: 'A' });
    await service.discoverPrice(owner, { crop: 'cotton', region: 'R', grade: 'A' });
    await service.reserveProduce(owner, 'produce-1', {
      partnerId: partner.id,
      quantityKg: 10,
      deliveryAddress: 'Toshkent',
    });
    await service.cancelProduceListing(owner, 'produce-1');
    await service.listAssignedFarmers(owner);
    await service.listFarmers(owner.tenantId);
    await service.listDeliveries(owner);
    await service.transitionDelivery(owner, delivery.id, { status: 'assigned' });
    await service.recordFieldVisit(owner, { farmerId: farmer.id, notes: 'Healthy', observedAt: now });
    await service.listOrders(owner.tenantId);
    await service.listAdvisories(owner);
    await service.listPartners(owner.tenantId);
    await service.setPartnerStatus(owner, partner.id, 'approved');
    await service.assignFarmer(owner, farmer.id, 'agent-1');
    await service.setFarmerStatus(owner, farmer.id, 'active');
    await service.scheduleDelivery(owner, { orderId: 'order-1', agentUserId: 'agent-1', scheduledAt: now });
    await service.publishAdvisory(owner, {
      farmerId: farmer.id,
      kind: 'weather',
      source: 'hydromet',
      summary: 'Rain expected',
      observedAt: now,
      expiresAt: advisory.expiresAt,
    });
    await service.analytics(owner.tenantId);
    await service.createPilot(owner, {
      name: 'Fergana pilot',
      targetFarmers: 10,
      targetSuppliers: 2,
      startsAt: now,
      endsAt: new Date('2026-10-02T00:00:00Z'),
    });
    await service.listPilots(owner.tenantId);
    await service.setPilotStatus(owner, 'pilot-1', 'active');
    await service.integrationReadiness(owner.tenantId);

    expect(repository.listProduce).toHaveBeenCalledWith(owner.tenantId, {
      crop: 'cotton',
      region: 'R',
      grade: 'A',
    });
    expect(notifications.produceReserved).toHaveBeenCalledWith('order-1', owner.userId);
    expect(notifications.partnerStatus).toHaveBeenCalledWith(partner);
    expect(notifications.farmerAssigned).toHaveBeenCalledWith(farmer, 'agent-1');
    expect(notifications.deliveryScheduled).toHaveBeenCalledWith(delivery);
    expect(notifications.advisoryPublished).toHaveBeenCalledWith(advisory, farmer.userId);
  });

  it('does not publish farmer-targeted events when the tenant farmer no longer exists', async () => {
    const { repository, notifications, service } = fixture();
    repository.listFarmers.mockResolvedValue([]);
    await service.assignFarmer(owner, farmer.id, 'agent-1');
    await service.publishAdvisory(owner, {
      farmerId: farmer.id,
      kind: 'agronomy',
      source: 'agronomist',
      summary: 'Irrigate',
      observedAt: now,
      expiresAt: advisory.expiresAt,
    });
    expect(notifications.farmerAssigned).not.toHaveBeenCalled();
    expect(notifications.advisoryPublished).not.toHaveBeenCalled();
  });

  it.each([
    [{ status: 'not_found' } as const, ResourceNotFoundException],
    [{ status: 'forbidden' } as const, ForbiddenException],
    [{ status: 'partner_unapproved' } as const, ForbiddenException],
    [{ status: 'conflict', field: 'taxId' } as const, ConflictException],
    [{ status: 'insufficient_quantity' } as const, ConflictException],
    [{ status: 'invalid_state' } as const, BadRequestException],
  ])('maps failed repository result %o to the public exception contract', async (result, exceptionType) => {
    const { repository, service } = fixture();
    repository.createPartner.mockResolvedValue(result);
    await expect(
      service.createPartner(owner, {
        kind: 'supplier',
        legalName: 'Agro',
        taxId: '1',
        phone: '+99890',
        region: 'R',
      }),
    ).rejects.toBeInstanceOf(exceptionType);
  });
});
