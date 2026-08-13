// @requirements REQ-AGRITECH-WEB-006
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiClientProvider, userApi } from '@app/frontend-api-client';
import { userFrontendTranslations } from '@app/frontend-feature-user-i18n';
import { FrontendI18nProvider, FrontendStateProvider } from '@app/frontend-runtime';
import { FarmerRegisterPage } from './farmer-register-page';

const ok = <T,>(data: T) => ({ data, error: undefined, response: new Response(null, { status: 201 }) });

const renderPage = () =>
  render(
    <FrontendStateProvider>
      <FrontendI18nProvider translations={userFrontendTranslations}>
        <ApiClientProvider baseUrls={{ admin: '', auth: '', user: '' }}>
          <FarmerRegisterPage />
        </ApiClientProvider>
      </FrontendI18nProvider>
    </FrontendStateProvider>,
  );

const fillRequiredFields = () => {
  fireEvent.change(screen.getByLabelText('Phone Number'), { target: { value: '+998901234567' } });
  fireEvent.change(screen.getByLabelText('First Name'), { target: { value: 'Dilshod' } });
  fireEvent.change(screen.getByLabelText('Last Name'), { target: { value: 'Karimov' } });
  fireEvent.change(screen.getByLabelText('Region'), { target: { value: "Farg'ona viloyati" } });
  fireEvent.change(screen.getByLabelText('Farm Size (hectares)'), { target: { value: '7.5' } });
};

describe('Farmer registration page', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('submits required and optional enrollment data and renders success', async () => {
    const create = vi.spyOn(userApi, 'farmerControllerCreate').mockResolvedValue(ok({ id: 'farmer-1' }) as never);
    renderPage();
    fillRequiredFields();
    fireEvent.change(screen.getByLabelText('District'), { target: { value: 'Quva' } });
    fireEvent.change(screen.getByLabelText('Village'), { target: { value: 'Yangi hayot' } });
    fireEvent.change(screen.getByLabelText('Telegram ID (optional)'), { target: { value: '998900001' } });
    fireEvent.click(screen.getByLabelText('cotton'));
    fireEvent.click(screen.getByLabelText('cotton'));
    fireEvent.click(screen.getByLabelText('wheat'));
    fireEvent.click(screen.getByRole('button', { name: 'Register' }));

    await waitFor(() => {
      expect(create).toHaveBeenCalledWith(
        {
          phone: '+998901234567',
          firstName: 'Dilshod',
          lastName: 'Karimov',
          region: "Farg'ona viloyati",
          farmSizeHectares: 7.5,
          crops: ['wheat'],
          district: 'Quva',
          village: 'Yangi hayot',
          telegramId: '998900001',
        },
        expect.any(Object),
      );
    });
    expect((await screen.findByRole('status')).textContent).toBe(
      'Your farmer profile was created and is awaiting verification.',
    );
  });

  it('maps blank optional fields to undefined and exposes submission failure', async () => {
    const create = vi.spyOn(userApi, 'farmerControllerCreate').mockRejectedValue(new Error('offline'));
    renderPage();
    fillRequiredFields();
    fireEvent.click(screen.getByRole('button', { name: 'Register' }));

    expect((await screen.findByRole('alert')).textContent).toBe(
      'We could not create the profile. Check the form or sign in again.',
    );
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ district: undefined, village: undefined, telegramId: undefined, crops: [] }),
      expect.any(Object),
    );
  });
});
