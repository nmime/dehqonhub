// @requirements REQ-AUTH-RECOVERY-010
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiClientProvider } from '@app/frontend-api-client';
import { AuthRecoveryCard } from './auth-recovery-card';

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    headers: { 'Content-Type': status >= 400 ? 'application/problem+json' : 'application/json' },
    status,
  });

const renderCard = (fetchMock: ReturnType<typeof vi.fn>) => {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
  return render(
    <ApiClientProvider baseUrls={{ admin: '', auth: 'https://auth-api', user: '' }} fetchImpl={fetchMock}>
      <QueryClientProvider client={queryClient}>
        <AuthRecoveryCard t={(key) => key} />
      </QueryClientProvider>
    </ApiClientProvider>,
  );
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('AuthRecoveryCard', () => {
  it('requests and confirms email verification and password recovery', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async () => jsonResponse({ data: { accepted: true } }));
    renderCard(fetchMock);

    const verificationSection = screen.getByRole('heading', { name: 'user.auth.recovery.verifyTitle' }).parentElement;
    const resetSection = screen.getByRole('heading', { name: 'user.auth.recovery.resetTitle' }).parentElement;
    expect(verificationSection).not.toBeNull();
    expect(resetSection).not.toBeNull();

    const verification = within(verificationSection!);
    fireEvent.change(verification.getByLabelText('user.form.email'), { target: { value: 'user@example.com' } });
    fireEvent.click(verification.getByRole('button', { name: 'user.auth.recovery.sendVerification' }));
    expect(await screen.findByText('user.auth.recovery.verificationRequested')).toBeTruthy();

    fireEvent.change(verification.getByLabelText('user.auth.recovery.code'), {
      target: { value: 'verification-token-1234' },
    });
    fireEvent.click(verification.getByRole('button', { name: 'user.auth.recovery.confirmVerification' }));
    expect(await screen.findByText('user.auth.recovery.verificationConfirmed')).toBeTruthy();

    const reset = within(resetSection!);
    fireEvent.change(reset.getByLabelText('user.form.email'), { target: { value: 'user@example.com' } });
    fireEvent.click(reset.getByRole('button', { name: 'user.auth.recovery.sendReset' }));
    expect(await screen.findByText('user.auth.recovery.resetRequested')).toBeTruthy();

    fireEvent.change(reset.getByLabelText('user.auth.recovery.code'), { target: { value: 'reset-token-12345678' } });
    fireEvent.change(reset.getByLabelText('user.auth.recovery.newPassword'), { target: { value: 'new-password' } });
    fireEvent.click(reset.getByRole('button', { name: 'user.auth.recovery.confirmReset' }));
    expect(await screen.findByText('user.auth.recovery.resetConfirmed')).toBeTruthy();

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(4);
    });
    expect(
      fetchMock.mock.calls.map(([request]) => (request instanceof Request ? request.url : String(request))),
    ).toEqual([
      'https://auth-api/auth/email-verification-token',
      'https://auth-api/auth/email-verification/confirm',
      'https://auth-api/auth/password-reset-token',
      'https://auth-api/auth/password-reset/confirm',
    ]);
  });

  it('shows one generic error for an invalid or expired code', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse(
        {
          detail: 'The supplied token is invalid.',
          status: 400,
          title: 'Bad Request',
          type: 'about:blank',
        },
        400,
      ),
    );
    renderCard(fetchMock);

    const verification = within(screen.getByRole('heading', { name: 'user.auth.recovery.verifyTitle' }).parentElement!);
    fireEvent.change(verification.getByLabelText('user.auth.recovery.code'), {
      target: { value: 'invalid-token-1234' },
    });
    fireEvent.click(verification.getByRole('button', { name: 'user.auth.recovery.confirmVerification' }));

    expect(await screen.findByText('user.auth.recovery.error')).toBeTruthy();
  });
});
