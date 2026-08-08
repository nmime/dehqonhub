// @requirements REQ-AGRITECH-WEB-006
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiClientError, ApiClientProvider, userApi } from '@app/frontend-api-client';
import { userFrontendTranslations } from '@app/frontend-feature-user-i18n';
import { FrontendI18nProvider, FrontendStateProvider } from '@app/frontend-runtime';
import { FarmerDashboardPage } from './farmer-dashboard-page';

const ok = <T,>(data: T) => ({ data, error: undefined, response: new Response(null, { status: 200 }) });

const renderPage = () =>
  render(
    <FrontendStateProvider>
      <FrontendI18nProvider translations={userFrontendTranslations}>
        <ApiClientProvider baseUrls={{ admin: '', auth: '', user: '' }}>
          <FarmerDashboardPage />
        </ApiClientProvider>
      </FrontendI18nProvider>
    </FrontendStateProvider>,
  );

const profile = {
  id: 'farmer-1',
  phone: '+998901234567',
  firstName: 'Dilshod',
  lastName: 'Karimov',
  region: 'Fergana',
  farmSizeHectares: 12.5,
  crops: ['cotton'],
  status: 'verified',
};

describe('Farmer dashboard page', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders a source-backed profile and order table', async () => {
    vi.spyOn(userApi, 'farmerControllerGet').mockResolvedValue(ok(profile) as never);
    vi.spyOn(userApi, 'orderControllerList').mockResolvedValue(
      ok({
        items: [
          {
            id: 'order-1',
            createdAt: '2026-08-02T00:00:00.000Z',
            totalAmountUzs: 1_250_000,
            status: 'paid',
          },
        ],
      }) as never,
    );

    renderPage();

    expect(await screen.findByText('Dilshod Karimov')).toBeTruthy();
    expect(screen.getByText('12.5 ha')).toBeTruthy();
    expect(screen.getByText('order-1')).toBeTruthy();
    expect(screen.getByText('1,250,000 UZS')).toBeTruthy();
  });

  it('renders the explicit empty-order state', async () => {
    vi.spyOn(userApi, 'farmerControllerGet').mockResolvedValue(ok(profile) as never);
    vi.spyOn(userApi, 'orderControllerList').mockResolvedValue(ok({ items: [] }) as never);

    renderPage();

    expect(await screen.findByText('No orders yet.')).toBeTruthy();
  });

  it('distinguishes a missing profile from a transient error and retries failures', async () => {
    vi.spyOn(userApi, 'farmerControllerGet').mockRejectedValueOnce(
      new ApiClientError(404, {}, new Response(null, { status: 404 })),
    );
    vi.spyOn(userApi, 'orderControllerList').mockResolvedValue(ok({ items: [] }) as never);
    const view = renderPage();

    expect(await screen.findByText('Create a farmer profile before opening the dashboard.')).toBeTruthy();
    view.unmount();

    vi.restoreAllMocks();
    vi.spyOn(userApi, 'farmerControllerGet')
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue(ok(profile) as never);
    vi.spyOn(userApi, 'orderControllerList').mockResolvedValue(ok({ items: [] }) as never);
    renderPage();

    expect((await screen.findByRole('alert')).textContent).toBe('The dashboard is unavailable. Try again.');
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => {
      expect(screen.getByText('Dilshod Karimov')).toBeTruthy();
    });
  });
});
