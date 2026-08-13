// @requirements REQ-AGRITECH-WEB-006 REQ-AGRITECH-ROUTING-015
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiClientProvider, userApi } from '@app/frontend-api-client';
import { FrontendI18nProvider, FrontendStateProvider, type Locale } from '@app/frontend-runtime';
import { userFrontendTranslations } from '@app/frontend-feature-user-i18n';
import { AgriTechOperationsPage } from './agritech-operations-page';

const ok = <T,>(data: T) => ({ data, error: undefined, response: new Response(null, { status: 200 }) });

const renderPage = (initialLocale?: Locale) =>
  render(
    <FrontendStateProvider initialLocale={initialLocale}>
      <FrontendI18nProvider translations={userFrontendTranslations}>
        <ApiClientProvider baseUrls={{ admin: '', auth: '', user: '' }}>
          <AgriTechOperationsPage />
        </ApiClientProvider>
      </FrontendI18nProvider>
    </FrontendStateProvider>,
  );

const mockInitialLoad = () => {
  vi.spyOn(userApi, 'agriTechOperationsControllerListPartners').mockResolvedValue(ok({ items: [] }) as never);
  vi.spyOn(userApi, 'agriTechOperationsControllerListSupplierProducts').mockResolvedValue(ok({ items: [] }) as never);
  vi.spyOn(userApi, 'agriTechOperationsControllerListProduce').mockResolvedValue(ok({ items: [] }) as never);
  vi.spyOn(userApi, 'agriTechOperationsControllerListDeliveries').mockResolvedValue(ok({ items: [] }) as never);
  vi.spyOn(userApi, 'agriTechOperationsControllerListAdvisories').mockResolvedValue(ok({ items: [] }) as never);
};

const mockOperationalLoad = () => {
  vi.spyOn(userApi, 'agriTechOperationsControllerListPartners').mockResolvedValue(
    ok({
      items: [
        {
          id: 'supplier-1',
          kind: 'supplier',
          legalName: 'Fergana Inputs',
          taxId: '111',
          phone: '+998901111111',
          region: 'Fergana',
          status: 'approved',
        },
        {
          id: 'buyer-1',
          kind: 'buyer',
          legalName: 'Tashkent Buyer',
          taxId: '222',
          phone: '+998902222222',
          region: 'Tashkent',
          status: 'approved',
        },
      ],
    }) as never,
  );
  vi.spyOn(userApi, 'agriTechOperationsControllerListSupplierProducts').mockResolvedValue(
    ok({
      items: [
        {
          id: 'product-1',
          partnerId: 'supplier-1',
          name: 'Cotton Seed',
          category: 'seed',
          description: 'Certified seed',
          priceUzs: 250_000,
          unit: 'bag',
          stockQuantity: 20,
          region: 'Fergana',
          status: 'active',
        },
      ],
    }) as never,
  );
  vi.spyOn(userApi, 'agriTechOperationsControllerListProduce').mockResolvedValue(
    ok({
      items: [
        {
          id: 'listing-1',
          crop: 'Cotton',
          grade: 'A',
          quantityKg: 100,
          availableQuantityKg: 80,
          pricePerKgUzs: 12_000,
          region: 'Fergana',
          availableFrom: '2026-08-02T00:00:00.000Z',
          availableUntil: '2026-09-02T00:00:00.000Z',
          status: 'active',
        },
      ],
    }) as never,
  );
  vi.spyOn(userApi, 'agriTechOperationsControllerListDeliveries').mockResolvedValue(
    ok({ items: [{ id: 'delivery-1', orderId: 'order-existing', status: 'in_transit' }] }) as never,
  );
  vi.spyOn(userApi, 'agriTechOperationsControllerListAdvisories').mockResolvedValue(
    ok({
      items: [
        { id: 'advisory-1', kind: 'weather', summary: 'Rain expected', stale: true },
        { id: 'advisory-2', kind: 'agronomy', summary: 'Irrigate tomorrow', stale: false },
      ],
    }) as never,
  );
};

describe('AgriTech operations page', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('renders explicit empty marketplace, delivery, and advisory states', async () => {
    mockInitialLoad();
    renderPage();

    expect(await screen.findByRole('heading', { name: 'AgriTech Operations' })).toBeTruthy();
    expect((await screen.findAllByText('No records are available.')).length).toBeGreaterThanOrEqual(3);
  });

  it('submits a tenant-owned supplier registration through the generated client', async () => {
    mockInitialLoad();
    const createPartner = vi
      .spyOn(userApi, 'agriTechOperationsControllerCreatePartner')
      .mockResolvedValue(ok({ id: 'partner-1' }) as never);
    renderPage();
    await screen.findByRole('heading', { name: 'AgriTech Operations' });

    fireEvent.change(screen.getByRole('textbox', { name: 'Legal name' }), { target: { value: 'Fergana Inputs' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Tax ID' }), { target: { value: '123456789' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Phone Number' }), {
      target: { value: '+998901234567' },
    });
    const regionFields = screen.getAllByRole('textbox', { name: 'Region' });
    fireEvent.change(regionFields[0]!, { target: { value: 'Fergana' } });
    fireEvent.click(screen.getByRole('button', { name: 'Register organization' }));

    await waitFor(() => {
      expect(createPartner).toHaveBeenCalledWith(
        {
          kind: 'supplier',
          legalName: 'Fergana Inputs',
          phone: '+998901234567',
          region: 'Fergana',
          taxId: '123456789',
        },
        expect.any(Object),
      );
    });
  });

  it('does not coerce binary form entries into API text fields', async () => {
    mockInitialLoad();
    const createPartner = vi
      .spyOn(userApi, 'agriTechOperationsControllerCreatePartner')
      .mockResolvedValue(ok({ id: 'partner-1' }) as never);
    renderPage();
    await screen.findByRole('heading', { name: 'AgriTech Operations' });

    vi.stubGlobal(
      'FormData',
      class {
        get() {
          return new File(['binary'], 'binary.dat');
        }
      },
    );
    fireEvent.submit(screen.getByRole('button', { name: 'Register organization' }).closest('form')!);

    await waitFor(() => {
      expect(createPartner).toHaveBeenCalledWith(
        { kind: '', legalName: '', phone: '', region: '', taxId: '' },
        expect.any(Object),
      );
    });
  });

  it('runs inventory, produce, reservation, pricing, payment, delivery, and advisory workflows', async () => {
    mockOperationalLoad();
    const createPartner = vi
      .spyOn(userApi, 'agriTechOperationsControllerCreatePartner')
      .mockResolvedValue(ok({ id: 'partner-new' }) as never);
    const createProduct = vi
      .spyOn(userApi, 'agriTechOperationsControllerCreateSupplierProduct')
      .mockResolvedValue(ok({ id: 'product-new' }) as never);
    const updateProduct = vi
      .spyOn(userApi, 'agriTechOperationsControllerUpdateSupplierProduct')
      .mockResolvedValue(ok({ id: 'product-1' }) as never);
    const createProduce = vi
      .spyOn(userApi, 'agriTechOperationsControllerCreateProduce')
      .mockResolvedValue(ok({ id: 'listing-new' }) as never);
    const discoverPrice = vi
      .spyOn(userApi, 'agriTechOperationsControllerDiscoverPrice')
      .mockResolvedValue(ok({ minimumUzs: 10_000, medianUzs: 12_000, maximumUzs: 14_000 }) as never);
    const reserveProduce = vi
      .spyOn(userApi, 'agriTechOperationsControllerReserveProduce')
      .mockResolvedValue(ok({ orderId: 'order-new' }) as never);
    const createPayment = vi
      .spyOn(userApi, 'paymentControllerCreate')
      .mockResolvedValue(ok({ checkoutUrl: 'https://payments.example/checkout' }) as never);
    const assign = vi.fn();
    vi.stubGlobal('location', { origin: 'http://localhost', assign });

    renderPage();
    expect(await screen.findByText('Fergana Inputs · supplier · approved')).toBeTruthy();
    expect(screen.getByText('order-existing · in_transit')).toBeTruthy();
    expect(screen.getByText('weather · Rain expected · Stale')).toBeTruthy();
    expect(screen.getByText('agronomy · Irrigate tomorrow · Ready')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Organization type'), { target: { value: 'buyer' } });
    fireEvent.change(screen.getByLabelText('Legal name'), { target: { value: 'New Buyer' } });
    fireEvent.change(screen.getByLabelText('Tax ID'), { target: { value: '333' } });
    fireEvent.change(screen.getByLabelText('Phone Number'), { target: { value: '+998903333333' } });
    fireEvent.change(screen.getAllByLabelText('Region')[0]!, { target: { value: 'Namangan' } });
    fireEvent.click(screen.getByRole('button', { name: 'Register organization' }));
    await waitFor(() => {
      expect(createPartner).toHaveBeenCalled();
    });

    fireEvent.change(screen.getByLabelText('Product name'), { target: { value: 'Drip Line' } });
    fireEvent.change(screen.getByLabelText('Category'), { target: { value: 'irrigation' } });
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Water-saving line' } });
    fireEvent.change(screen.getAllByLabelText('Price (UZS)')[0]!, { target: { value: '90000' } });
    fireEvent.change(screen.getByLabelText('Unit'), { target: { value: 'roll' } });
    fireEvent.change(screen.getAllByLabelText('In Stock')[0]!, { target: { value: '12' } });
    fireEvent.change(screen.getAllByLabelText('Region')[1]!, { target: { value: 'Fergana' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Publish' })[0]!);
    await waitFor(() => {
      expect(createProduct).toHaveBeenCalled();
    });

    fireEvent.change(screen.getAllByLabelText('Price (UZS)')[1]!, { target: { value: '275000' } });
    fireEvent.change(screen.getAllByLabelText('In Stock')[1]!, { target: { value: '18' } });
    fireEvent.change(screen.getByLabelText('Inventory status'), { target: { value: 'inactive' } });
    fireEvent.click(screen.getByRole('button', { name: 'Update inventory' }));
    await waitFor(() => {
      expect(updateProduct).toHaveBeenCalledWith(
        'product-1',
        { priceUzs: 275_000, stockQuantity: 18, status: 'inactive' },
        expect.any(Object),
      );
    });

    fireEvent.change(screen.getByLabelText('Crop'), { target: { value: 'Wheat' } });
    fireEvent.change(screen.getByLabelText('Grade (A, B, or C)'), { target: { value: 'B' } });
    fireEvent.change(screen.getByLabelText('Quantity (kg)'), { target: { value: '500' } });
    fireEvent.change(screen.getByLabelText('Price per kg (UZS)'), { target: { value: '7000' } });
    fireEvent.change(screen.getAllByLabelText('Region')[2]!, { target: { value: 'Jizzakh' } });
    fireEvent.change(screen.getByLabelText('Available until'), { target: { value: '2026-09-01T12:00' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Publish' })[1]!);
    await waitFor(() => {
      expect(createProduce).toHaveBeenCalled();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Discover price' }));
    expect(await screen.findByText('Range: 10000–14000 UZS; median 12000 UZS.')).toBeTruthy();
    expect(discoverPrice).toHaveBeenCalledWith({ crop: 'Cotton', region: 'Fergana', grade: 'A' }, expect.any(Object));

    fireEvent.change(screen.getByLabelText('Reservation quantity (kg)'), { target: { value: '25' } });
    fireEvent.change(screen.getByLabelText('Delivery address'), { target: { value: 'Tashkent warehouse' } });
    fireEvent.click(screen.getByRole('button', { name: 'Reserve produce' }));
    expect(await screen.findByText(/order-new/)).toBeTruthy();
    expect(reserveProduce).toHaveBeenCalledWith(
      'listing-1',
      { partnerId: 'buyer-1', quantityKg: 25, deliveryAddress: 'Tashkent warehouse' },
      expect.any(Object),
    );

    for (const provider of ['click', 'payme', 'bnpl'] as const) {
      fireEvent.click(screen.getByRole('button', { name: provider }));
      // eslint-disable-next-line no-await-in-loop -- each payment handoff must complete before the next click.
      await waitFor(() => {
        expect(createPayment).toHaveBeenCalledWith(
          expect.objectContaining({
            orderId: 'order-new',
            provider,
            idempotencyKey: `${provider}:order-new`,
            returnUrl: 'http://localhost/',
          }),
          expect.any(Object),
        );
      });
    }
    expect(assign).toHaveBeenCalledWith('https://payments.example/checkout');
  });

  it('requires approved organizations before publishing inventory or reserving produce', async () => {
    mockInitialLoad();
    vi.spyOn(userApi, 'agriTechOperationsControllerListProduce').mockResolvedValue(
      ok({
        items: [
          {
            id: 'listing-1',
            crop: 'Cotton',
            grade: 'A',
            availableQuantityKg: 10,
            pricePerKgUzs: 12_000,
            region: 'Fergana',
          },
        ],
      }) as never,
    );
    renderPage();
    await screen.findByText('Cotton · A · 10 kg · 12000 UZS');

    fireEvent.submit(screen.getAllByRole('button', { name: 'Publish' })[0]!.closest('form')!);
    expect(await screen.findByText('An approved organization is required for this action.')).toBeTruthy();
    // Publishing harvested produce names the supplier organization too.
    fireEvent.submit(screen.getAllByRole('button', { name: 'Publish' })[1]!.closest('form')!);
    expect(await screen.findByText('An approved organization is required for this action.')).toBeTruthy();
    fireEvent.submit(screen.getByRole('button', { name: 'Reserve produce' }).closest('form')!);
    expect(await screen.findByText('An approved organization is required for this action.')).toBeTruthy();
  });

  // The payment gateways speak Latin Uzbek only, so a Cyrillic-Uzbek session has to
  // hand off in the script they accept rather than the one it renders in.
  it('hands a Cyrillic Uzbek session off to the gateway in Latin Uzbek', async () => {
    mockOperationalLoad();
    vi.spyOn(userApi, 'agriTechOperationsControllerReserveProduce').mockResolvedValue(
      ok({ orderId: 'order-cyrl' }) as never,
    );
    const createPayment = vi
      .spyOn(userApi, 'paymentControllerCreate')
      .mockResolvedValue(ok({ checkoutUrl: 'https://payments.example/checkout' }) as never);
    vi.stubGlobal('location', { assign: vi.fn(), origin: 'http://localhost' });

    renderPage('uz-cyrl');

    // Field names and gateway names are the same in every locale, so this reaches
    // the reservation and the hand-off without depending on the rendered script.
    const reservation = await waitFor(() => {
      const field = document.querySelector('input[name="deliveryAddress"]');
      if (!(field instanceof HTMLInputElement) || !field.form) {
        throw new Error('The reservation form has not rendered yet.');
      }
      return field.form;
    });
    fireEvent.submit(reservation);
    fireEvent.click(await screen.findByRole('button', { name: 'payme' }));

    await waitFor(() => {
      expect(createPayment).toHaveBeenCalledWith(
        expect.objectContaining({ locale: 'uz', orderId: 'order-cyrl', provider: 'payme' }),
        expect.any(Object),
      );
    });
  });

  it('keeps advisory failure non-fatal and exposes action and load retry states', async () => {
    mockInitialLoad();
    vi.mocked(userApi.agriTechOperationsControllerListAdvisories).mockRejectedValue(new Error('advisory offline'));
    const createPartner = vi
      .spyOn(userApi, 'agriTechOperationsControllerCreatePartner')
      .mockRejectedValue(new Error('write failed'));
    renderPage();
    await screen.findByText('Supplier inventory');

    fireEvent.submit(screen.getByRole('button', { name: 'Register organization' }).closest('form')!);
    await waitFor(() => {
      expect(createPartner).toHaveBeenCalled();
    });
    expect(screen.getByText('The operation could not be completed.')).toBeTruthy();
    cleanup();
    vi.restoreAllMocks();

    vi.spyOn(userApi, 'agriTechOperationsControllerListPartners')
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue(ok({ items: [] }) as never);
    vi.spyOn(userApi, 'agriTechOperationsControllerListSupplierProducts').mockResolvedValue(ok({ items: [] }) as never);
    vi.spyOn(userApi, 'agriTechOperationsControllerListProduce').mockResolvedValue(ok({ items: [] }) as never);
    vi.spyOn(userApi, 'agriTechOperationsControllerListDeliveries').mockResolvedValue(ok({ items: [] }) as never);
    vi.spyOn(userApi, 'agriTechOperationsControllerListAdvisories').mockResolvedValue(ok({ items: [] }) as never);
    renderPage();
    expect(await screen.findByRole('alert')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => {
      expect(screen.getByText('Supplier inventory')).toBeTruthy();
    });
  });
});
