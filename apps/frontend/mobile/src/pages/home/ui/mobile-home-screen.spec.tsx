// @requirements REQ-FRONTEND-NATIVE-006 REQ-AGRITECH-FULFILLMENT-010
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FrontendI18nProvider, FrontendStateProvider } from '@app/frontend-runtime';
import { userFrontendTranslations } from '@app/frontend-feature-user-i18n';
import { ApiClientProvider, userApi } from '@app/frontend-api-client';
import { MobileRuntimeProvider } from '../../../shared';

vi.mock('@app/frontend-ui-native', async () => {
  // Mock only the Tamagui React wrappers; use the REAL shared design tokens so
  // native tests track the single source instead of encoding stale values.
  const { designColors, designRadii, designSpacing } = await import('@app/common-design-tokens');
  return {
    TamaguiProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    Theme: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    designColors,
    designRadii,
    designSpacing,
  };
});

vi.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const applyUserLocale = vi.fn();
const persistUserLocale = vi.fn(() => Promise.resolve());

describe('mobile home screen', () => {
  const renderScreen = async () => {
    const { MobileHomeScreen } = await import('./mobile-home-screen');
    return render(
      <FrontendStateProvider>
        <FrontendI18nProvider translations={userFrontendTranslations}>
          <MobileRuntimeProvider value={{ applyUserLocale, persistUserLocale, userLocale: 'en' }}>
            <ApiClientProvider baseUrls={{ admin: '', auth: '', user: '' }}>
              <MobileHomeScreen />
            </ApiClientProvider>
          </MobileRuntimeProvider>
        </FrontendI18nProvider>
      </FrontendStateProvider>,
    );
  };

  beforeEach(() => {
    applyUserLocale.mockClear();
    persistUserLocale.mockClear();
    vi.spyOn(userApi, 'agriTechOperationsControllerListAssignedFarmers').mockResolvedValue({
      data: { items: [] },
      error: undefined,
      response: new Response(null, { status: 200 }),
    } as never);
    vi.spyOn(userApi, 'agriTechOperationsControllerListDeliveries').mockResolvedValue({
      data: { items: [] },
      error: undefined,
      response: new Response(null, { status: 200 }),
    } as never);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders the app title', async () => {
    await renderScreen();

    expect(screen.getByRole('heading', { name: 'DehqonHub Mobile' })).toBeTruthy();
  });

  it('renders the field-agent workspace', async () => {
    await renderScreen();

    expect(screen.getByText('Field agent')).toBeTruthy();
  });

  it('renders three capability cards', async () => {
    await renderScreen();

    expect(screen.getByText('Assigned farms')).toBeTruthy();
    expect(screen.getByText('Record observations')).toBeTruthy();
    expect(screen.getByText('Tasks and proof')).toBeTruthy();
  });

  it('renders the assigned territory panel', async () => {
    await renderScreen();

    expect(screen.getByText('Your territory')).toBeTruthy();
    expect(screen.getByText('Assigned farmers and work stay close at hand.')).toBeTruthy();
  });

  it('switches locale through the shared preference model', async () => {
    await renderScreen();

    fireEvent.click(screen.getByText('Ўзбекча (кирилл)'));

    expect(applyUserLocale).toHaveBeenCalledWith('uz-cyrl');
    expect(persistUserLocale).toHaveBeenCalledWith('uz-cyrl');
  });

  it('records a visit with the selected farmer and normalized grade', async () => {
    vi.mocked(userApi.agriTechOperationsControllerListAssignedFarmers).mockResolvedValue({
      data: {
        items: [
          {
            id: 'farmer-1',
            userId: 'farmer-user-1',
            firstName: 'Aziza',
            lastName: 'Karimova',
            phone: '+998901234567',
            region: 'Fergana',
            crops: ['tomato'],
            status: 'active',
          },
        ],
      },
      error: undefined,
      response: new Response(null, { status: 200 }),
    } as never);
    const recordVisit = vi.spyOn(userApi, 'agriTechOperationsControllerRecordFieldVisit').mockResolvedValue({
      data: { id: 'visit-1' },
      error: undefined,
      response: new Response(null, { status: 200 }),
    } as never);
    await renderScreen();
    await screen.findByText(/Aziza Karimova/u);

    fireEvent.change(screen.getByLabelText('Field visit notes'), { target: { value: 'Grade checked in field' } });
    fireEvent.click(screen.getByText('B'));
    fireEvent.click(screen.getByText('Record field visit'));

    await waitFor(() => {
      expect(recordVisit).toHaveBeenCalledWith(
        expect.objectContaining({
          farmerId: 'farmer-1',
          notes: 'Grade checked in field',
          observedGrade: 'B',
        }),
        expect.any(Object),
      );
    });
  });

  it('recovers the field workspace after a load failure', async () => {
    vi.mocked(userApi.agriTechOperationsControllerListAssignedFarmers)
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({
        data: { items: [] },
        error: undefined,
        response: new Response(null, { status: 200 }),
      } as never);
    await renderScreen();

    fireEvent.click(await screen.findByText('Retry'));

    await waitFor(() => {
      expect(userApi.agriTechOperationsControllerListAssignedFarmers).toHaveBeenCalledTimes(2);
    });
    expect(await screen.findAllByText('No assigned work is available.')).toHaveLength(2);
  });

  it('selects farmers, rejects blank visits, and reports visit persistence failures', async () => {
    vi.mocked(userApi.agriTechOperationsControllerListAssignedFarmers).mockResolvedValue({
      data: {
        items: [
          {
            id: 'farmer-1',
            userId: 'farmer-user-1',
            firstName: 'Aziza',
            lastName: 'Karimova',
            phone: '+998901234567',
            region: 'Fergana',
            crops: ['tomato'],
            status: 'active',
          },
          {
            id: 'farmer-2',
            userId: 'farmer-user-2',
            firstName: 'Bek',
            lastName: 'Usmonov',
            phone: '+998901234568',
            region: 'Andijan',
            crops: ['wheat'],
            status: 'active',
          },
        ],
      },
      error: undefined,
      response: new Response(null, { status: 200 }),
    } as never);
    const recordVisit = vi
      .spyOn(userApi, 'agriTechOperationsControllerRecordFieldVisit')
      .mockRejectedValue(new Error('offline'));
    await renderScreen();
    fireEvent.click(await screen.findByText(/Bek Usmonov/u));

    fireEvent.click(screen.getByText('Record field visit'));
    expect(recordVisit).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('Field visit notes'), { target: { value: '  Needs irrigation  ' } });
    fireEvent.click(screen.getByText('C'));
    fireEvent.click(screen.getByText('Record field visit'));

    expect(await screen.findByText('The field operation could not be saved.')).toBeTruthy();
    expect(recordVisit).toHaveBeenCalledWith(
      expect.objectContaining({ farmerId: 'farmer-2', notes: 'Needs irrigation', observedGrade: 'C' }),
      expect.any(Object),
    );
  });

  it('advances every delivery state, requires final proof, and reloads retained farmer selection', async () => {
    vi.mocked(userApi.agriTechOperationsControllerListAssignedFarmers).mockResolvedValue({
      data: {
        items: [
          {
            id: 'farmer-1',
            userId: 'farmer-user-1',
            firstName: 'Aziza',
            lastName: 'Karimova',
            phone: '+998901234567',
            region: 'Fergana',
            crops: ['tomato'],
            status: 'active',
          },
        ],
      },
      error: undefined,
      response: new Response(null, { status: 200 }),
    } as never);
    vi.mocked(userApi.agriTechOperationsControllerListDeliveries).mockResolvedValue({
      data: {
        items: [
          { id: 'delivery-1', orderId: 'order-1', status: 'assigned' },
          { id: 'delivery-2', orderId: 'order-2', status: 'picked_up' },
          { id: 'delivery-3', orderId: 'order-3', status: 'in_transit' },
          { id: 'delivery-4', orderId: 'order-4', status: 'delivered' },
          { id: 'delivery-5', orderId: 'order-5', status: 'cancelled' },
        ],
      },
      error: undefined,
      response: new Response(null, { status: 200 }),
    } as never);
    const transition = vi
      .spyOn(userApi, 'agriTechOperationsControllerTransitionDelivery')
      .mockResolvedValue({ data: {}, error: undefined, response: new Response(null, { status: 200 }) } as never);
    await renderScreen();
    await screen.findByText(/Aziza Karimova/u);

    let advance = screen.getAllByText('Advance status');
    fireEvent.click(advance[0]!);
    await waitFor(() => {
      expect(transition).toHaveBeenCalledWith('delivery-1', { status: 'picked_up' }, expect.any(Object));
    });

    advance = screen.getAllByText('Advance status');
    fireEvent.click(advance[1]!);
    await waitFor(() => {
      expect(transition).toHaveBeenCalledWith('delivery-2', { status: 'in_transit' }, expect.any(Object));
    });

    advance = screen.getAllByText('Advance status');
    fireEvent.click(advance[2]!);
    expect(await screen.findByText('A proof reference is required before delivery.')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Delivery proof reference'), {
      target: { value: '  proof://delivery/3  ' },
    });
    fireEvent.click(screen.getAllByText('Advance status')[2]!);
    await waitFor(() => {
      expect(transition).toHaveBeenCalledWith(
        'delivery-3',
        { status: 'delivered', proofReference: 'proof://delivery/3' },
        expect.any(Object),
      );
    });
    expect(await screen.findByText('Field work was saved.')).toBeTruthy();
  });

  it('reports delivery transition failures and falls back to the provider locale', async () => {
    vi.mocked(userApi.agriTechOperationsControllerListDeliveries).mockResolvedValue({
      data: { items: [{ id: 'delivery-1', orderId: 'order-1', status: 'assigned' }] },
      error: undefined,
      response: new Response(null, { status: 200 }),
    } as never);
    vi.spyOn(userApi, 'agriTechOperationsControllerTransitionDelivery').mockRejectedValue(new Error('offline'));
    const { MobileHomeScreen } = await import('./mobile-home-screen');
    render(
      <FrontendStateProvider>
        <FrontendI18nProvider initialLocale="uz" translations={userFrontendTranslations}>
          <MobileRuntimeProvider value={{ applyUserLocale, persistUserLocale, userLocale: null }}>
            <ApiClientProvider baseUrls={{ admin: '', auth: '', user: '' }}>
              <MobileHomeScreen />
            </ApiClientProvider>
          </MobileRuntimeProvider>
        </FrontendI18nProvider>
      </FrontendStateProvider>,
    );

    fireEvent.click((await screen.findAllByText('Advance status'))[0]!);
    expect(await screen.findByText('The field operation could not be saved.')).toBeTruthy();
  });
});
