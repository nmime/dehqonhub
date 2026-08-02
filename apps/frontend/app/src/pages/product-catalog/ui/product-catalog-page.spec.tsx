// @requirements REQ-AGRITECH-WEB-006
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiClientProvider, userApi } from '@app/frontend-api-client';
import { userFrontendTranslations } from '@app/frontend-feature-user-i18n';
import { FrontendI18nProvider, FrontendStateProvider } from '@app/frontend-runtime';
import { ProductCatalogPage } from './product-catalog-page';

const ok = <T,>(data: T) => ({ data, error: undefined, response: new Response(null, { status: 200 }) });

const renderPage = () =>
  render(
    <FrontendStateProvider>
      <FrontendI18nProvider translations={userFrontendTranslations}>
        <ApiClientProvider baseUrls={{ admin: '', auth: '', user: '' }}>
          <ProductCatalogPage />
        </ApiClientProvider>
      </FrontendI18nProvider>
    </FrontendStateProvider>,
  );

const products = [
  {
    id: 'product-1',
    name: 'Premium Cotton Seed',
    supplierName: 'Fergana Inputs',
    category: 'seed',
    unit: 'bag',
    priceUzs: 250_000,
    stockQuantity: 40,
  },
  {
    id: 'product-2',
    name: 'Organic Fertilizer',
    supplierName: 'Samarkand Supply',
    category: 'fertilizer',
    unit: 'kg',
    priceUzs: 15_000,
    stockQuantity: 300,
  },
];

describe('Product catalog page', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders products and applies category and search filters', async () => {
    vi.spyOn(userApi, 'productControllerList').mockResolvedValue(ok({ items: products }) as never);
    renderPage();

    expect(await screen.findByText('Premium Cotton Seed')).toBeTruthy();
    expect(screen.getByText('Organic Fertilizer')).toBeTruthy();
    expect(screen.getByText('250,000 UZS')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'seed' }));
    expect(screen.queryByText('Organic Fertilizer')).toBeNull();
    fireEvent.change(screen.getByLabelText('Search products'), { target: { value: 'missing' } });
    expect(screen.getByRole('status').textContent).toBe('No matching products are available.');
    fireEvent.click(screen.getByRole('button', { name: 'all' }));
    fireEvent.change(screen.getByLabelText('Search products'), { target: { value: 'organic' } });
    expect(screen.getByText('Organic Fertilizer')).toBeTruthy();
  });

  it('renders a load error and retries successfully', async () => {
    vi.spyOn(userApi, 'productControllerList')
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue(ok({ items: [] }) as never);
    renderPage();

    expect((await screen.findByRole('alert')).textContent).toBe('The catalog is unavailable. Try again.');
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => {
      expect(screen.getByRole('status').textContent).toBe('No matching products are available.');
    });
  });
});
