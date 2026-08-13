// @requirements REQ-AGRITECH-ANALYTICS-011
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { adminApi } from '@app/frontend-api-client';
import { FrontendI18nProvider, FrontendStateProvider } from '@app/frontend-runtime';
import { adminFrontendTranslations } from '@app/frontend-feature-admin-i18n';
import { createAdminAccess } from '../../entities/admin-session';
import { AgriTechAdminPage } from './agritech-page';

const ok = <T,>(data: T) => ({ data, error: undefined, response: new Response(null, { status: 200 }) });

const mockInitialLoad = () => {
  vi.spyOn(adminApi, 'agriTechAdminControllerListPartners').mockResolvedValue(ok({ items: [] }) as never);
  vi.spyOn(adminApi, 'agriTechAdminControllerListFarmers').mockResolvedValue(ok({ items: [] }) as never);
  vi.spyOn(adminApi, 'agriTechAdminControllerListOrders').mockResolvedValue(ok({ items: [] }) as never);
  vi.spyOn(adminApi, 'agriTechAdminControllerListPilots').mockResolvedValue(ok({ items: [] }) as never);
  vi.spyOn(adminApi, 'agriTechAdminControllerIntegrations').mockResolvedValue(ok({ items: [] }) as never);
  vi.spyOn(adminApi, 'agriTechAdminControllerAnalytics').mockResolvedValue(
    ok({
      activeInputProducts: 0,
      activeProduceListings: 0,
      activeFarmers: 0,
      approvedBuyers: 0,
      approvedSuppliers: 0,
      commissionBasisPoints: 800,
      deliveredOrders: 0,
      farmers: 0,
      fulfillmentRateBasisPoints: 0,
      gmvUzs: 0,
      inputStockUnits: 0,
      orders: 0,
      paidPayments: 0,
      partnerApplications: 0,
      pendingFarmers: 0,
      pendingPartners: 0,
      platformCommissionUzs: 0,
      produceAvailableKg: 0,
      repeatBuyerRateBasisPoints: 0,
      repeatBuyers: 0,
    }) as never,
  );
};

const fullAccess = createAdminAccess({
  permissions: ['admin:agritech:read', 'admin:agritech:write', 'admin:agritech:approve'],
  roles: ['admin'],
  subject: 'admin-1',
});

const renderPage = (configured = true) =>
  render(
    <FrontendStateProvider>
      <FrontendI18nProvider translations={adminFrontendTranslations}>
        <AgriTechAdminPage access={fullAccess} requestOptions={configured ? {} : undefined} />
      </FrontendI18nProvider>
    </FrontendStateProvider>,
  );

const mockOperationalLoad = () => {
  vi.spyOn(adminApi, 'agriTechAdminControllerListPartners').mockResolvedValue(
    ok({
      items: [
        {
          id: 'partner-1',
          legalName: 'Fergana Inputs',
          kind: 'supplier',
          status: 'pending',
          region: 'Fergana',
        },
      ],
    }) as never,
  );
  vi.spyOn(adminApi, 'agriTechAdminControllerListFarmers').mockResolvedValue(
    ok({
      items: [
        {
          id: 'farmer-1',
          firstName: 'Dilshod',
          lastName: 'Karimov',
          region: 'Fergana',
          status: 'pending_verification',
          fieldAgentUserId: 'agent-old',
        },
      ],
    }) as never,
  );
  vi.spyOn(adminApi, 'agriTechAdminControllerListOrders').mockResolvedValue(
    ok({
      items: [
        { id: 'order-1', kind: 'produce', status: 'paid', totalAmountUzs: 1_000_000, region: 'Fergana' },
        { id: 'order-2', kind: 'input', status: 'delivered', totalAmountUzs: 200_000, region: 'Tashkent' },
        { id: 'order-3', kind: 'input', status: 'cancelled', totalAmountUzs: 300_000, region: 'Bukhara' },
      ],
    }) as never,
  );
  vi.spyOn(adminApi, 'agriTechAdminControllerListPilots').mockResolvedValue(
    ok({
      items: [
        {
          id: 'pilot-planned',
          name: 'Fergana launch',
          status: 'planned',
          targetFarmers: 100,
          actualFarmers: 20,
          targetSuppliers: 10,
          actualSuppliers: 3,
        },
        {
          id: 'pilot-active',
          name: 'Samarkand launch',
          status: 'active',
          targetFarmers: 80,
          actualFarmers: 75,
          targetSuppliers: 8,
          actualSuppliers: 8,
        },
        {
          id: 'pilot-complete',
          name: 'Tashkent launch',
          status: 'completed',
          targetFarmers: 60,
          actualFarmers: 60,
          targetSuppliers: 6,
          actualSuppliers: 6,
        },
      ],
    }) as never,
  );
  vi.spyOn(adminApi, 'agriTechAdminControllerIntegrations').mockResolvedValue(
    ok({
      items: [
        { provider: 'click', status: 'ready', lastSuccessfulAt: '2026-08-02T10:00:00.000Z' },
        { provider: 'payme', status: 'error', lastErrorCode: 'AUTH_FAILED' },
        { provider: 'bnpl', status: 'not_configured' },
      ],
    }) as never,
  );
  vi.spyOn(adminApi, 'agriTechAdminControllerAnalytics').mockResolvedValue(
    ok({
      activeInputProducts: 4,
      activeProduceListings: 5,
      activeFarmers: 10,
      approvedBuyers: 3,
      approvedSuppliers: 2,
      commissionBasisPoints: 800,
      deliveredOrders: 8,
      farmers: 12,
      fulfillmentRateBasisPoints: 6_667,
      gmvUzs: 12_500_000,
      inputStockUnits: 240,
      orders: 12,
      paidPayments: 9,
      partnerApplications: 7,
      pendingFarmers: 2,
      pendingPartners: 2,
      platformCommissionUzs: 1_000_000,
      produceAvailableKg: 1_200,
      repeatBuyerRateBasisPoints: 3_333,
      repeatBuyers: 1,
    }) as never,
  );
};

describe('AgriTech admin page', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('shows the complete operator controls only with write permission', async () => {
    mockInitialLoad();
    renderPage();

    expect(await screen.findByRole('heading', { name: 'AgriTech control center' })).toBeTruthy();
    expect(await screen.findByRole('button', { name: 'Schedule delivery' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Publish advisory' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Create pilot' })).toBeTruthy();
  });

  it('runs approval, assignment, fulfillment, advisory, and pilot operations', async () => {
    mockOperationalLoad();
    const setPartnerStatus = vi
      .spyOn(adminApi, 'agriTechAdminControllerSetPartnerStatus')
      .mockResolvedValue(ok({ id: 'partner-1' }) as never);
    const setFarmerStatus = vi
      .spyOn(adminApi, 'agriTechAdminControllerSetFarmerStatus')
      .mockResolvedValue(ok({ id: 'farmer-1' }) as never);
    const assignFarmer = vi
      .spyOn(adminApi, 'agriTechAdminControllerAssignFarmer')
      .mockResolvedValue(ok({ id: 'farmer-1' }) as never);
    const scheduleDelivery = vi
      .spyOn(adminApi, 'agriTechAdminControllerScheduleDelivery')
      .mockResolvedValue(ok({ id: 'delivery-1' }) as never);
    const publishAdvisory = vi
      .spyOn(adminApi, 'agriTechAdminControllerPublishAdvisory')
      .mockResolvedValue(ok({ id: 'advisory-1' }) as never);
    const createPilot = vi
      .spyOn(adminApi, 'agriTechAdminControllerCreatePilot')
      .mockResolvedValue(ok({ id: 'pilot-new' }) as never);
    const setPilotStatus = vi
      .spyOn(adminApi, 'agriTechAdminControllerSetPilotStatus')
      .mockResolvedValue(ok({ id: 'pilot-1' }) as never);

    renderPage();
    expect(await screen.findByText('Fergana Inputs · supplier · pending · Fergana')).toBeTruthy();
    expect(screen.getByText('12,500,000 UZS')).toBeTruthy();
    expect(screen.getByText('66.7%')).toBeTruthy();
    expect(screen.getByText('240 / 1200 kg')).toBeTruthy();
    expect(screen.getByText('1 · 33.3%')).toBeTruthy();
    expect(screen.getByText('click · ready · 2026-08-02T10:00:00.000Z')).toBeTruthy();
    expect(screen.getByText('payme · error · AUTH_FAILED')).toBeTruthy();
    expect(screen.getByText('bnpl · not_configured')).toBeTruthy();
    expect(screen.queryByRole('option', { name: /order-2/ })).toBeNull();
    expect(screen.queryByRole('option', { name: /order-3/ })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    await waitFor(() => {
      expect(setPartnerStatus).toHaveBeenCalledWith('partner-1', { status: 'approved' }, expect.any(Object));
    });
    await screen.findByRole('button', { name: 'Reject' });
    fireEvent.click(screen.getByRole('button', { name: 'Reject' }));
    await waitFor(() => {
      expect(setPartnerStatus).toHaveBeenCalledWith('partner-1', { status: 'rejected' }, expect.any(Object));
    });

    await screen.findByRole('button', { name: 'Verify farmer' });
    fireEvent.click(screen.getByRole('button', { name: 'Verify farmer' }));
    await waitFor(() => {
      expect(setFarmerStatus).toHaveBeenCalledWith('farmer-1', { status: 'active' }, expect.any(Object));
    });

    const agent = await screen.findByLabelText('Field agent user ID');
    fireEvent.change(agent, { target: { value: 'agent-new' } });
    fireEvent.submit(screen.getByRole('button', { name: 'Assign field agent' }).closest('form')!);
    await waitFor(() => {
      expect(assignFarmer).toHaveBeenCalledWith('farmer-1', { agentUserId: 'agent-new' }, expect.any(Object));
    });

    fireEvent.change(await screen.findByLabelText('Order ID'), { target: { value: 'order-1' } });
    fireEvent.change(screen.getByLabelText('Field agent user ID (optional)'), { target: { value: 'agent-new' } });
    fireEvent.change(screen.getByLabelText('Scheduled at'), { target: { value: '2026-08-05T09:30' } });
    fireEvent.submit(screen.getByRole('button', { name: 'Schedule delivery' }).closest('form')!);
    await waitFor(() => {
      expect(scheduleDelivery).toHaveBeenCalledWith(
        { orderId: 'order-1', agentUserId: 'agent-new', scheduledAt: '2026-08-05T09:30' },
        expect.any(Object),
      );
    });

    fireEvent.change(await screen.findByLabelText('Farmer ID'), { target: { value: 'farmer-1' } });
    fireEvent.change(screen.getByLabelText('Advisory kind (weather or agronomy)'), { target: { value: 'weather' } });
    fireEvent.change(screen.getByLabelText('Source attribution'), { target: { value: 'Hydromet' } });
    fireEvent.change(screen.getByLabelText('Localized advisory summary'), { target: { value: 'Rain expected' } });
    fireEvent.change(screen.getByLabelText('Observed at'), { target: { value: '2026-08-02T08:00' } });
    fireEvent.change(screen.getByLabelText('Expires at'), { target: { value: '2026-08-03T08:00' } });
    fireEvent.submit(screen.getByRole('button', { name: 'Publish advisory' }).closest('form')!);
    await waitFor(() => {
      expect(publishAdvisory).toHaveBeenCalledWith(
        {
          farmerId: 'farmer-1',
          kind: 'weather',
          source: 'Hydromet',
          summary: 'Rain expected',
          observedAt: '2026-08-02T08:00',
          expiresAt: '2026-08-03T08:00',
        },
        expect.any(Object),
      );
    });

    fireEvent.change(await screen.findByLabelText('Pilot name'), { target: { value: 'Andijan pilot' } });
    fireEvent.change(screen.getByLabelText('Target farmers'), { target: { value: '50' } });
    fireEvent.change(screen.getByLabelText('Target suppliers'), { target: { value: '5' } });
    fireEvent.change(screen.getByLabelText('Starts at'), { target: { value: '2026-09-01T00:00' } });
    fireEvent.change(screen.getByLabelText('Ends at'), { target: { value: '2026-12-01T00:00' } });
    fireEvent.submit(screen.getByRole('button', { name: 'Create pilot' }).closest('form')!);
    await waitFor(() => {
      expect(createPilot).toHaveBeenCalledWith(
        {
          name: 'Andijan pilot',
          targetFarmers: 50,
          targetSuppliers: 5,
          startsAt: '2026-09-01T00:00',
          endsAt: '2026-12-01T00:00',
        },
        expect.any(Object),
      );
    });

    fireEvent.click(await screen.findByRole('button', { name: 'Activate pilot' }));
    await waitFor(() => {
      expect(setPilotStatus).toHaveBeenCalledWith('pilot-planned', { status: 'active' }, expect.any(Object));
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Complete pilot' }));
    await waitFor(() => {
      expect(setPilotStatus).toHaveBeenCalledWith('pilot-active', { status: 'completed' }, expect.any(Object));
    });
  });

  it('omits mutation controls for read-only access', async () => {
    mockOperationalLoad();
    render(
      <FrontendStateProvider>
        <FrontendI18nProvider translations={adminFrontendTranslations}>
          <AgriTechAdminPage
            access={createAdminAccess({
              permissions: ['admin:agritech:read'],
              roles: ['support'],
              subject: 'support-1',
            })}
            requestOptions={{}}
          />
        </FrontendI18nProvider>
      </FrontendStateProvider>,
    );

    expect(await screen.findByText('Fergana Inputs · supplier · pending · Fergana')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Verify farmer' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Schedule delivery' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Publish advisory' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Create pilot' })).toBeNull();
  });

  it('renders configuration and load failures and recovers on retry', async () => {
    const unconfigured = renderPage(false);
    expect(await screen.findByText('AgriTech administration is unavailable.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    unconfigured.unmount();

    mockInitialLoad();
    vi.mocked(adminApi.agriTechAdminControllerListPartners).mockRejectedValueOnce(new Error('offline'));
    renderPage();
    expect(await screen.findByText('AgriTech administration is unavailable.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('Partner approvals')).toBeTruthy();
  });

  it('surfaces mutation failure and supports agronomy and unassigned delivery branches', async () => {
    mockOperationalLoad();
    const schedule = vi
      .spyOn(adminApi, 'agriTechAdminControllerScheduleDelivery')
      .mockResolvedValue(ok({ id: 'delivery-2' }) as never);
    const publish = vi
      .spyOn(adminApi, 'agriTechAdminControllerPublishAdvisory')
      .mockResolvedValue(ok({ id: 'advisory-2' }) as never);
    vi.spyOn(adminApi, 'agriTechAdminControllerCreatePilot').mockRejectedValue(new Error('write failed'));
    renderPage();
    await screen.findByText('Fergana Inputs · supplier · pending · Fergana');

    fireEvent.change(screen.getByLabelText('Order ID'), { target: { value: 'order-1' } });
    fireEvent.change(screen.getByLabelText('Scheduled at'), { target: { value: '2026-08-06T09:30' } });
    fireEvent.submit(screen.getByRole('button', { name: 'Schedule delivery' }).closest('form')!);
    await waitFor(() => {
      expect(schedule).toHaveBeenCalledWith(
        { orderId: 'order-1', scheduledAt: '2026-08-06T09:30' },
        expect.any(Object),
      );
    });

    fireEvent.change(await screen.findByLabelText('Farmer ID'), { target: { value: 'farmer-1' } });
    fireEvent.change(screen.getByLabelText('Advisory kind (weather or agronomy)'), { target: { value: 'agronomy' } });
    fireEvent.change(screen.getByLabelText('Source attribution'), { target: { value: 'Agronomist' } });
    fireEvent.change(screen.getByLabelText('Localized advisory summary'), { target: { value: 'Apply fertilizer' } });
    fireEvent.change(screen.getByLabelText('Observed at'), { target: { value: '2026-08-02T08:00' } });
    fireEvent.change(screen.getByLabelText('Expires at'), { target: { value: '2026-08-03T08:00' } });
    fireEvent.submit(screen.getByRole('button', { name: 'Publish advisory' }).closest('form')!);
    await waitFor(() => {
      expect(publish).toHaveBeenCalledWith(expect.objectContaining({ kind: 'agronomy' }), expect.any(Object));
    });

    fireEvent.submit((await screen.findByRole('button', { name: 'Create pilot' })).closest('form')!);
    expect(await screen.findByText('The operation could not be completed.')).toBeTruthy();
  });
});
