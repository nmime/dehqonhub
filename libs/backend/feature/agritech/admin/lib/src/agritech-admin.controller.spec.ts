// @requirements REQ-AGRITECH-PARTNER-007 REQ-AGRITECH-FULFILLMENT-010 REQ-AGRITECH-ANALYTICS-011 REQ-AGRITECH-INTEGRATION-013 REQ-AGRITECH-ROUTING-015
import { describe, expect, it, vi } from 'vitest';
import type { AuthenticatedPrincipal } from '@app/backend-feature-auth-shared';
import type { AgriTechOperationsService } from '@app/backend-feature-agritech-main';
import { AgriTechAdminController } from './agritech-admin.controller';

const principal = {
  tenantId: 'tenant-1',
  subject: 'operator-1',
} as unknown as AuthenticatedPrincipal;

const partner = {
  id: 'partner-1',
  tenantId: 'tenant-1',
  ownerUserId: 'owner-1',
  kind: 'supplier' as const,
  legalName: 'Agro Supply',
  taxId: '123456789',
  phone: '+998901234567',
  region: 'Fergana',
  status: 'approved' as const,
  createdAt: new Date('2026-08-01T00:00:00Z'),
  updatedAt: new Date('2026-08-01T00:00:00Z'),
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
  fieldAgentUserId: 'agent-1',
};

function fixture() {
  const service = {
    listPartners: vi.fn().mockResolvedValue([partner]),
    setPartnerStatus: vi.fn().mockResolvedValue(partner),
    listFarmers: vi.fn().mockResolvedValue([farmer]),
    setFarmerStatus: vi.fn().mockResolvedValue({ farmerId: farmer.id, status: 'active' }),
    assignFarmer: vi.fn().mockResolvedValue({ farmerId: farmer.id }),
    listOrders: vi.fn().mockResolvedValue([{ id: 'order-1' }]),
    scheduleDelivery: vi.fn().mockResolvedValue({ id: 'delivery-1', status: 'scheduled' }),
    publishAdvisory: vi.fn().mockResolvedValue({ id: 'advisory-1', kind: 'weather' }),
    analytics: vi.fn().mockResolvedValue({ farmers: 1, orders: 2 }),
    createPilot: vi.fn().mockResolvedValue({ id: 'pilot-1', status: 'planned' }),
    listPilots: vi.fn().mockResolvedValue([{ id: 'pilot-1' }]),
    setPilotStatus: vi.fn().mockResolvedValue({ id: 'pilot-1', status: 'active' }),
    integrationReadiness: vi.fn().mockResolvedValue([{ provider: 'click', ready: true }]),
  };
  return {
    service,
    controller: new AgriTechAdminController(service as unknown as AgriTechOperationsService),
  };
}

describe('AgriTechAdminController', () => {
  it('lists partners for the authenticated tenant and wraps in ok response', async () => {
    const { service, controller } = fixture();
    const result = await controller.listPartners(principal);
    expect(service.listPartners).toHaveBeenCalledWith('tenant-1');
    expect(result).toEqual({ data: { items: [partner] } });
  });

  it('sets partner status using owner identity derived from the principal', async () => {
    const { service, controller } = fixture();
    const result = await controller.setPartnerStatus(principal, 'partner-1', { status: 'approved' });
    expect(service.setPartnerStatus).toHaveBeenCalledWith(
      { tenantId: 'tenant-1', userId: 'operator-1' },
      'partner-1',
      'approved',
    );
    expect(result).toEqual({ data: partner });
  });

  it('lists farmers for the tenant', async () => {
    const { service, controller } = fixture();
    const result = await controller.listFarmers(principal);
    expect(service.listFarmers).toHaveBeenCalledWith('tenant-1');
    expect(result).toEqual({ data: { items: [farmer] } });
  });

  it('assigns a field agent to a farmer', async () => {
    const { service, controller } = fixture();
    const result = await controller.assignFarmer(principal, 'farmer-1', { agentUserId: 'agent-1' });
    expect(service.assignFarmer).toHaveBeenCalledWith(
      { tenantId: 'tenant-1', userId: 'operator-1' },
      'farmer-1',
      'agent-1',
    );
    expect(result).toEqual({ data: { farmerId: 'farmer-1' } });
  });

  it('sets farmer status', async () => {
    const { service, controller } = fixture();
    const result = await controller.setFarmerStatus(principal, 'farmer-1', { status: 'active' });
    expect(service.setFarmerStatus).toHaveBeenCalledWith(
      { tenantId: 'tenant-1', userId: 'operator-1' },
      'farmer-1',
      'active',
    );
    expect(result).toEqual({ data: { farmerId: 'farmer-1', status: 'active' } });
  });

  it('lists orders for the tenant', async () => {
    const { service, controller } = fixture();
    const result = await controller.listOrders(principal);
    expect(service.listOrders).toHaveBeenCalledWith('tenant-1');
    expect(result).toEqual({ data: { items: [{ id: 'order-1' }] } });
  });

  it('schedules a delivery with full input', async () => {
    const { service, controller } = fixture();
    const scheduledAt = new Date('2026-08-05T08:00:00Z');
    const input = { orderId: 'order-1', agentUserId: 'agent-1', scheduledAt };
    const result = await controller.scheduleDelivery(principal, input);
    expect(service.scheduleDelivery).toHaveBeenCalledWith(
      { tenantId: 'tenant-1', userId: 'operator-1' },
      input,
    );
    expect(result).toEqual({ data: { id: 'delivery-1', status: 'scheduled' } });
  });

  it('publishes an advisory with observation and expiry windows', async () => {
    const { service, controller } = fixture();
    const input = {
      farmerId: 'farmer-1',
      kind: 'weather' as const,
      source: 'hydromet',
      summary: 'Rain expected in Fergana Valley',
      observedAt: new Date('2026-08-02T00:00:00Z'),
      expiresAt: new Date('2026-08-09T00:00:00Z'),
    };
    const result = await controller.publishAdvisory(principal, input);
    expect(service.publishAdvisory).toHaveBeenCalledWith(
      { tenantId: 'tenant-1', userId: 'operator-1' },
      input,
    );
    expect(result).toEqual({ data: { id: 'advisory-1', kind: 'weather' } });
  });

  it('returns tenant analytics', async () => {
    const { service, controller } = fixture();
    const result = await controller.analytics(principal);
    expect(service.analytics).toHaveBeenCalledWith('tenant-1');
    expect(result).toEqual({ data: { farmers: 1, orders: 2 } });
  });

  it('creates a pilot cohort with targets', async () => {
    const { service, controller } = fixture();
    const input = {
      name: 'Fergana pilot',
      targetFarmers: 100,
      targetSuppliers: 10,
      startsAt: new Date('2026-08-10T00:00:00Z'),
      endsAt: new Date('2026-11-10T00:00:00Z'),
    };
    const result = await controller.createPilot(principal, input);
    expect(service.createPilot).toHaveBeenCalledWith({ tenantId: 'tenant-1', userId: 'operator-1' }, input);
    expect(result).toEqual({ data: { id: 'pilot-1', status: 'planned' } });
  });

  it('lists pilot cohorts', async () => {
    const { service, controller } = fixture();
    const result = await controller.listPilots(principal);
    expect(service.listPilots).toHaveBeenCalledWith('tenant-1');
    expect(result).toEqual({ data: { items: [{ id: 'pilot-1' }] } });
  });

  it('transitions pilot status', async () => {
    const { service, controller } = fixture();
    const result = await controller.setPilotStatus(principal, 'pilot-1', { status: 'active' });
    expect(service.setPilotStatus).toHaveBeenCalledWith(
      { tenantId: 'tenant-1', userId: 'operator-1' },
      'pilot-1',
      'active',
    );
    expect(result).toEqual({ data: { id: 'pilot-1', status: 'active' } });
  });

  it('lists integration readiness for the tenant', async () => {
    const { service, controller } = fixture();
    const result = await controller.integrations(principal);
    expect(service.integrationReadiness).toHaveBeenCalledWith('tenant-1');
    expect(result).toEqual({ data: { items: [{ provider: 'click', ready: true }] } });
  });

  it('propagates service errors to the caller', async () => {
    const { service, controller } = fixture();
    service.listPartners.mockRejectedValue(new Error('database unavailable'));
    await expect(controller.listPartners(principal)).rejects.toThrow('database unavailable');
  });
});
