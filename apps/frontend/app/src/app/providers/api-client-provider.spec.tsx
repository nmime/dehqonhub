// @requirements REQ-FRONTEND-SHELL-004 REQ-AGRITECH-MARKETPLACE-016
import { useEffect } from 'react';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthApiClient, useUserApiClient } from '@app/frontend-api-client';
import { apiRuntimeEvents, resetApiRuntimeForOnline } from '@app/frontend-api-support';
import { useAuthShellStore } from '@app/frontend-runtime';
import { AppProviders } from './app-providers';

const SessionSeeder = () => {
  const authStore = useAuthShellStore();

  useEffect(() => {
    authStore.markAuthenticated();
  }, [authStore]);

  return null;
};

const Probe = () => {
  const authClient = useAuthApiClient();
  const userClient = useUserApiClient();

  return (
    <output data-testid="api-client-runtime">
      {JSON.stringify({
        authBaseUrl: authClient.requestOptions.baseUrl,
        hasCredentials: authClient.requestOptions.fetchImpl !== undefined,
        userBaseUrl: userClient.requestOptions.baseUrl,
      })}
    </output>
  );
};

const AuthRequiredProbe = ({ endpoint = '/profile/me' }: Readonly<{ endpoint?: string }>) => {
  const userClient = useUserApiClient();

  useEffect(() => {
    void userClient.requestOptions.fetchImpl?.(`https://api.example.test${endpoint}`, {});
  }, [endpoint, userClient.requestOptions]);

  return null;
};

describe('user app API client provider wiring', () => {
  beforeEach(() => {
    window.history.pushState({}, '', '/');
  });

  afterEach(() => {
    cleanup();
    resetApiRuntimeForOnline();
    vi.unstubAllGlobals();
  });
  it('injects public generated clients with configured auth/user base URLs', async () => {
    render(
      <AppProviders>
        <SessionSeeder />
        <Probe />
      </AppProviders>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('api-client-runtime').textContent).toBe(
        JSON.stringify({
          authBaseUrl: '',
          hasCredentials: true,
          userBaseUrl: '',
        }),
      );
    });
  });

  it('redirects auth-required failures from protected routes with a return URL', async () => {
    window.history.replaceState({}, '', '/profile?tab=security');
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          new Response(JSON.stringify({ message: 'session expired' }), {
            headers: { 'content-type': 'application/json' },
            status: 401,
          }),
        ),
      ),
    );

    render(
      <AppProviders>
        <AuthRequiredProbe />
      </AppProviders>,
    );

    await waitFor(() => {
      expect(window.location.pathname).toBe('/auth');
    });
    expect(new URLSearchParams(window.location.search).get('returnUrl')).toBe('/profile?tab=security');
    expect(screen.queryByText('Authentication required')).toBeNull();
  });

  it('keeps an initial marketplace catalog 401 on the signed-out entry route', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify({ message: 'session required' }), {
          headers: { 'content-type': 'application/json' },
          status: 401,
        }),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    render(
      <AppProviders>
        <AuthRequiredProbe endpoint="/marketplace/catalog" />
      </AppProviders>,
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledOnce();
      expect(apiRuntimeEvents.getState().authRequired).toBe(false);
    });
    expect(window.location.pathname).toBe('/');
  });

  it('keeps a guest on the home page when the problem-presentation boot read 401s', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify({ message: 'session required' }), {
          headers: { 'content-type': 'application/json' },
          status: 401,
        }),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    render(
      <AppProviders>
        <AuthRequiredProbe endpoint="/auth/problem-presentations" />
      </AppProviders>,
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledOnce();
      expect(apiRuntimeEvents.getState().authRequired).toBe(false);
    });
    expect(window.location.pathname).toBe('/');
  });

  it('keeps auth-required failures in Telegram Mini App routes', async () => {
    window.history.pushState({}, '', '/tma/auth');
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          new Response(JSON.stringify({ message: 'session expired' }), {
            headers: { 'content-type': 'application/json' },
            status: 401,
          }),
        ),
      ),
    );

    render(
      <AppProviders>
        <AuthRequiredProbe />
      </AppProviders>,
    );

    expect(await screen.findByText('Authentication required')).toBeTruthy();
    expect(window.location.pathname).toBe('/tma/auth');
  });

  it('sanitizes auth redirect targets and clears already-auth-route events', async () => {
    render(<AppProviders />);

    window.history.pushState({}, '', '/profile?tab=security');
    act(() => {
      apiRuntimeEvents.emit({
        type: 'auth-required',
        reason: 'missing-token',
        redirectTo: 'https://evil.example/auth',
      });
    });

    await waitFor(() => {
      expect(window.location.pathname).toBe('/auth');
    });
    expect(new URLSearchParams(window.location.search).get('returnUrl')).toBe('/profile?tab=security');

    window.history.pushState({}, '', '/auth/step/');
    act(() => {
      apiRuntimeEvents.emit({
        type: 'auth-required',
        reason: 'missing-token',
        redirectTo: '/auth/',
      });
    });

    expect(window.location.pathname).toBe('/auth/step/');
  });
});
