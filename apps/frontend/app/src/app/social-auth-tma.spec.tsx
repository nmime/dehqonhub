// @requirements REQ-FRONTEND-SHELL-004
import { StrictMode } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './app';
import { TmaAuthPanel } from '../features/tma-auth';

vi.mock('@tma.js/sdk-react', async () => {
  const actual = await vi.importActual<typeof import('@tma.js/sdk-react')>('@tma.js/sdk-react');
  const availableMethod = Object.assign(vi.fn(), { isAvailable: vi.fn(() => true) });
  const headerColorMethod = Object.assign(vi.fn(), {
    isAvailable: vi.fn(() => true),
    supports: vi.fn(() => true),
  });
  const requestFullscreen = Object.assign(
    vi.fn(() => Promise.resolve()),
    {
      isAvailable: vi.fn(() => true),
    },
  );
  const retrieveRawInitData = vi.fn(() => undefined);
  return {
    ...actual,
    backButton: {
      hide: vi.fn(),
      isMounted: vi.fn(() => false),
      mount: vi.fn(),
      onClick: vi.fn(() => vi.fn()),
      show: vi.fn(),
    },
    init: vi.fn(),
    isTMA: vi.fn(() => false),
    retrieveRawInitData,
    miniApp: {
      bindCssVars: vi.fn(() => vi.fn()),
      isCssVarsBound: vi.fn(() => false),
      isMounted: vi.fn(() => false),
      mount: vi.fn(),
      ready: vi.fn(),
      setBgColor: availableMethod,
      setBottomBarColor: availableMethod,
      setHeaderColor: headerColorMethod,
    },
    shareURL: vi.fn(),
    swipeBehavior: {
      disableVertical: availableMethod(),
      enableVertical: availableMethod(),
      isMounted: vi.fn(() => false),
      isSupported: vi.fn(() => true),
      mount: vi.fn(),
      unmount: vi.fn(),
    },
    themeParams: {
      bindCssVars: vi.fn(() => vi.fn()),
      isCssVarsBound: vi.fn(() => false),
      isMounted: vi.fn(() => false),
      mount: vi.fn(),
    },
    useLaunchParams: vi.fn(() => ({})),
    useRawInitData: retrieveRawInitData,
    viewport: {
      bindCssVars: vi.fn(() => vi.fn()),
      expand: vi.fn(),
      isCssVarsBound: vi.fn(() => false),
      isFullscreen: vi.fn(() => false),
      isMounted: vi.fn(() => false),
      mount: vi.fn(() => Promise.resolve()),
      requestFullscreen,
    },
  };
});

const tma = vi.mocked(await import('@tma.js/sdk-react'));

const jsonResponse = (body: unknown, ok = true, status = 200): Response =>
  new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
    status,
    statusText: ok ? 'OK' : 'Error',
  });

const deferredResponse = () => {
  let resolveResponse!: (value: Response) => void;
  const promise = new Promise<Response>((resolve) => {
    resolveResponse = resolve;
  });

  return { promise, resolve: resolveResponse };
};

// The site chrome reads the catalog, the request feed and the session probe on
// every route, so they are answered outside each test's queue: these tests are
// about the auth flows, not the chrome's own requests.
const marketplaceChromeEndpoints = new Set([
  '/marketplace/catalog',
  '/marketplace/requests',
  '/marketplace/verification',
]);

const setFetch = (...responses: Response[]) => {
  const queue = [...responses];
  const fetchMock = vi.fn<typeof fetch>((input) => {
    const pathname = new URL(input instanceof Request ? input.url : String(input), window.location.origin).pathname;
    if (pathname === '/auth/me' || marketplaceChromeEndpoints.has(pathname)) {
      return Promise.resolve(jsonResponse({}, false, 401));
    }
    const response = queue.shift();
    return response ? Promise.resolve(response) : Promise.reject(new Error(`Unexpected fetch: ${pathname}`));
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
};

const resetPath = (path = '/') => {
  window.history.replaceState(null, '', path);
};

describe('social auth and TMA UI', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_AUTH_API_BASE_URL', 'https://auth-api');
    vi.stubEnv('VITE_USER_API_BASE_URL', 'https://user-api');
    vi.stubEnv('VITE_TELEGRAM_AUTH_ENABLED', 'true');
    vi.stubEnv('VITE_API_BASE_URL_MODE', undefined);
    tma.useLaunchParams.mockReturnValue({});
    tma.useRawInitData.mockReturnValue(undefined);
    tma.isTMA.mockReturnValue(false);
    resetPath();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    resetPath();
  });

  it.each(['/tma', '/tma/auth', '/telegram-mini-app'])(
    'shows a localized TMA fallback outside Telegram on %s without crashing',
    async (path) => {
      resetPath(path);
      tma.useRawInitData.mockReturnValue(undefined);

      render(<App />);

      expect(await screen.findByText('Open this page inside Telegram to continue.')).toBeTruthy();
      expect(
        screen.getByText(
          'Telegram provides the secure launch context; the same screen remains understandable when opened in a regular browser.',
        ),
      ).toBeTruthy();
    },
  );

  it('turns Telegram SDK launch-data errors into the browser fallback state', async () => {
    resetPath('/tma');
    tma.retrieveRawInitData.mockImplementationOnce(() => {
      throw new Error('launch parameters unavailable');
    });

    render(<App />);

    expect(await screen.findByText('Open this page inside Telegram to continue.')).toBeTruthy();
    expect(screen.queryByText('Something went wrong')).toBeFalsy();
  });

  // Telegram frames the mini app itself: the route adds no header or bottom bar
  // of its own, and the only control it wires is Telegram's native back button.
  it('negotiates fullscreen colored Telegram chrome and wires the native back control', async () => {
    resetPath('/tma?startapp=profile');
    tma.isTMA.mockReturnValue(true);

    render(<App />);

    const frame = await waitFor(() => {
      const element = document.querySelector<HTMLElement>('.dh-telegram-frame');
      expect(element).toBeTruthy();
      return element as HTMLElement;
    });
    expect(frame.dataset.miniAppEnvironment).toBe('telegram');
    expect(document.querySelector('.dh-header')).toBeNull();
    expect(document.querySelector('.dh-mobile-nav')).toBeNull();
    await waitFor(() => {
      expect(tma.viewport.requestFullscreen).toHaveBeenCalledOnce();
    });
    expect(tma.miniApp.setBgColor).toHaveBeenCalledWith('#fbf3e3');
    expect(tma.miniApp.setHeaderColor).toHaveBeenCalledWith('#0b7138');
    expect(tma.miniApp.setBottomBarColor).toHaveBeenCalledWith('#203128');
    expect(tma.backButton.onClick).toHaveBeenCalledOnce();

    act(() => {
      tma.backButton.onClick.mock.calls[0]?.[0]();
    });
    await waitFor(() => {
      expect(window.location.pathname).toBe('/');
    });
  });

  it('uses same-origin API URLs for Telegram Mini App verification when configured', async () => {
    resetPath('/telegram-mini-app');
    vi.stubEnv('VITE_API_BASE_URL_MODE', 'same-origin');
    vi.stubEnv('VITE_AUTH_API_BASE_URL', undefined);
    vi.stubEnv('VITE_USER_API_BASE_URL', undefined);
    tma.useRawInitData.mockReturnValue('query_id=raw&hash=same-origin');
    const fetchMock = setFetch(jsonResponse({}, false, 409));

    render(<App />);

    expect(await screen.findByText('Request failed with 409.')).toBeTruthy();
    expect(fetchMock.mock.calls).toHaveLength(1);
    const input = fetchMock.mock.calls[0]?.[0];
    const url = input instanceof Request ? input.url : String(input);
    expect(new URL(url, window.location.origin).pathname).toBe('/api/auth/telegram/tma');
    expect(new URL(url, window.location.origin).pathname).not.toBe('/');
  });

  it('keeps Telegram auth on the launch route when verification fails', async () => {
    resetPath('/tma/auth');
    tma.useRawInitData.mockReturnValue('query_id=raw&hash=bad');
    tma.useLaunchParams.mockReturnValue({ tgWebAppStartParam: 'settings' });
    const fetchMock = setFetch(
      jsonResponse({
        identity: { channel: 'telegram_tma', provider: 'telegram', providerSubject: '42' },
        session: {},
        status: 'authenticated',
        token: 'better-auth-session',
        user: {},
      }),
      jsonResponse({}, false, 401),
    );

    render(<App />);

    expect(await screen.findByText('Request failed with 401.')).toBeTruthy();
    expect(window.location.pathname).toBe('/tma/auth');
    expect(
      fetchMock.mock.calls.some(([input]) =>
        (input instanceof Request ? input.url : String(input)).includes('/auth/telegram/tma'),
      ),
    ).toBe(true);
  });

  it('submits Telegram Mini App auth through the documented /telegram-mini-app route', async () => {
    resetPath('/telegram-mini-app');
    tma.useRawInitData.mockReturnValue('query_id=raw&hash=route');
    const fetchMock = setFetch(
      jsonResponse({
        identity: { channel: 'telegram_tma', provider: 'telegram', providerSubject: '42' },
        session: {},
        status: 'authenticated',
        token: 'better-auth-session',
        user: {},
      }),
      jsonResponse({}, false, 409),
    );

    render(<App />);

    expect(await screen.findByText('Request failed with 409.')).toBeTruthy();
    expect(window.location.pathname).toBe('/telegram-mini-app');
    expect(
      fetchMock.mock.calls.some(([input]) =>
        (input instanceof Request ? input.url : String(input)).includes('/auth/telegram/tma'),
      ),
    ).toBe(true);
  });

  it('shows Telegram verification loading until the backend responds', async () => {
    resetPath('/tma/auth');
    tma.useRawInitData.mockReturnValue('query_id=raw&hash=hash');
    const pending = deferredResponse();
    const fetchMock = vi.fn<typeof fetch>().mockReturnValueOnce(pending.promise);
    vi.stubGlobal('fetch', fetchMock);

    render(<App />);

    expect(await screen.findByText('Loading Telegram Mini App…')).toBeTruthy();
    pending.resolve(jsonResponse({}, false, 409));
    expect(await screen.findByText('Request failed with 409.')).toBeTruthy();
  });

  it('submits raw TMA initData to backend, stores session, and navigates', async () => {
    resetPath('/tma/auth?startapp=profile');
    tma.useRawInitData.mockReturnValue('query_id=raw&hash=hash');
    tma.useLaunchParams.mockReturnValue({ tgWebAppStartParam: 'profile' });
    const fetchMock = setFetch(
      jsonResponse({
        identity: { channel: 'telegram_tma', provider: 'telegram', providerSubject: '42' },
        session: {},
        status: 'authenticated',
        token: 'better-auth-session',
        user: {},
      }),
      jsonResponse({
        data: {
          returnUrl: `${window.location.origin}/profile?from=tma`,
          session: {
            user: {
              email: 'telegram@example.com',
              id: 'user-id',
              permissions: [],
              roles: [],
              tenantId: 'tenant-id',
              theme: 'system',
            },
          },
          status: 'authenticated',
        },
      }),
      jsonResponse({ data: { user: { locale: 'en' } } }),
      jsonResponse({ data: { profile: { email: 'telegram@example.com' } } }),
    );

    render(<App />);

    await waitFor(() => {
      expect(window.location.pathname).toBe('/profile');
      expect(window.location.search).toBe('?from=tma');
    });
    const tmaCall = fetchMock.mock.calls.find(([input]) => {
      const url = input instanceof Request ? input.url : String(input);
      return new URL(url, window.location.origin).pathname === '/auth/telegram/tma';
    });
    const tmaRequest = tmaCall?.[0] as Request | undefined;
    const requestText = (await tmaRequest?.clone().text()) ?? '{}';
    const body = JSON.parse(requestText) as Record<string, unknown>;
    expect(body).toMatchObject({
      initData: 'query_id=raw&hash=hash',
      returnUrl: `${window.location.origin}/profile`,
    });
    expect(Object.hasOwn(body, 'init' + 'DataUnsafe')).toBe(false);
    expect(
      fetchMock.mock.calls.every(
        ([input]) => !(input instanceof Request) || input.headers.get('authorization') === null,
      ),
    ).toBe(true);
  });

  it('starts Telegram link flow from /link/telegram instead of generic settings', async () => {
    resetPath('/link/telegram');
    tma.useRawInitData.mockReturnValue('query_id=raw&hash=link');
    const fetchMock = setFetch(
      jsonResponse({
        identity: { channel: 'telegram_tma', provider: 'telegram', providerSubject: '42' },
        session: {},
        status: 'authenticated',
        token: 'better-auth-session',
        user: {},
      }),
      jsonResponse({}, false, 409),
    );

    render(<App />);

    expect(await screen.findByText('Request failed with 409.')).toBeTruthy();
    const tmaCall = fetchMock.mock.calls.find(([input]) => {
      const url = input instanceof Request ? input.url : String(input);
      return new URL(url, window.location.origin).pathname === '/auth/telegram/tma';
    });
    const tmaRequest = tmaCall?.[0] as Request | undefined;
    const requestText = (await tmaRequest?.clone().text()) ?? '{}';
    const body = JSON.parse(requestText) as Record<string, unknown>;
    expect(body).toMatchObject({
      initData: 'query_id=raw&hash=link',
      intent: 'link',
      returnUrl: `${window.location.origin}/settings`,
    });
  });

  it('parses TMA startapp link_telegram as a link intent', async () => {
    resetPath('/tma?startapp=link_telegram');
    tma.useRawInitData.mockReturnValue('query_id=raw&hash=startapp');
    const fetchMock = setFetch(
      jsonResponse({
        identity: { channel: 'telegram_tma', provider: 'telegram', providerSubject: '42' },
        session: {},
        status: 'authenticated',
        token: 'better-auth-session',
        user: {},
      }),
      jsonResponse({}, false, 409),
    );

    render(<App />);

    expect(await screen.findByText('Request failed with 409.')).toBeTruthy();
    const tmaCall = fetchMock.mock.calls.find(([input]) => {
      const url = input instanceof Request ? input.url : String(input);
      return new URL(url, window.location.origin).pathname === '/auth/telegram/tma';
    });
    const tmaRequest = tmaCall?.[0] as Request | undefined;
    const requestText = (await tmaRequest?.clone().text()) ?? '{}';
    const body = JSON.parse(requestText) as Record<string, unknown>;
    expect(body).toMatchObject({ intent: 'link', returnUrl: `${window.location.origin}/settings` });
  });

  it('renders TMA deep navigation not-found state', async () => {
    resetPath('/tma?startapp=missing_destination');
    tma.useRawInitData.mockReturnValue(undefined);

    render(<App />);

    expect(await screen.findByText('The requested Mini App destination was not found.')).toBeTruthy();
  });

  it('finishes Discord callback through the SPA route', async () => {
    resetPath('/auth/discord/callback?code=discord-code&state=oauth-state');
    const pending = deferredResponse();
    // The callback, the session read and the profile read keep their order; only
    // the chrome's own marketplace requests are answered out of band.
    const queue: Array<Promise<Response>> = [
      pending.promise,
      Promise.resolve(jsonResponse({ data: { user: { locale: 'en' } } })),
      Promise.resolve(jsonResponse({ data: { profile: { email: 'discord@example.com' } } })),
    ];
    const fetchMock = vi.fn<typeof fetch>((input) => {
      const pathname = new URL(input instanceof Request ? input.url : String(input), window.location.origin).pathname;
      if (marketplaceChromeEndpoints.has(pathname)) {
        return Promise.resolve(jsonResponse({}, false, 401));
      }
      return queue.shift() ?? Promise.reject(new Error(`Unexpected fetch: ${pathname}`));
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<App />);

    expect(await screen.findByText('Waiting for Discord confirmation.')).toBeTruthy();
    pending.resolve(
      jsonResponse({
        data: {
          session: {
            user: {
              email: 'discord@example.com',
              id: 'user-id',
              permissions: [],
              roles: [],
              tenantId: 'tenant-id',
              theme: 'system',
            },
          },
          status: 'authenticated',
        },
      }),
    );
    await waitFor(() => {
      expect(window.location.pathname).toBe('/profile');
    });
    expect(
      fetchMock.mock.calls.some(([input]) => {
        const url = input instanceof Request ? input.url : String(input);
        return (
          url.includes('/auth/discord/callback') &&
          url.includes('code=discord-code') &&
          url.includes('state=oauth-state')
        );
      }),
    ).toBe(true);
  });

  it('renders provider-specific Discord callback errors', async () => {
    resetPath('/auth/discord/callback');

    render(<App />);

    expect(await screen.findByText('Discord did not return the required sign-in state. Start again.')).toBeTruthy();
  });

  // A Discord exchange the server rejects leaves the visitor on the callback page,
  // where the reason has to be stated instead of a spinner that never resolves.
  it('states why a Discord exchange the server rejected could not be verified', async () => {
    resetPath('/auth/discord/callback?code=discord-code&state=oauth-state');
    setFetch(jsonResponse({ message: 'Invalid authorization code' }, false, 400));

    render(<App />);

    expect(await screen.findByText('Invalid authorization code')).toBeTruthy();
    expect(screen.queryByText('Waiting for Discord confirmation.')).toBeNull();
  });

  // A 200 that carries neither a session nor a link keeps the visitor here: the
  // exchange worked, so it is reported as done rather than as a failure.
  it('reports a Discord exchange that answered without a session or a link', async () => {
    resetPath('/auth/discord/callback?code=discord-code&state=oauth-state');
    setFetch(jsonResponse({ data: { status: 'pending' } }));

    render(<App />);

    expect(await screen.findByText('Discord sign-in completed.')).toBeTruthy();
    expect(window.location.pathname).toBe('/auth/discord/callback');
  });

  it('projects a completed Better Auth Telegram OIDC session through the SPA callback', async () => {
    resetPath('/auth/telegram/callback');
    sessionStorage.setItem('telegramOidcAuthState', JSON.stringify({ intent: 'login', returnUrl: '/profile' }));
    const fetchMock = setFetch(
      jsonResponse({
        data: {
          session: {
            user: {
              email: null,
              id: 'user-id',
              permissions: [],
              roles: [],
              tenantId: 'tenant-id',
              theme: 'system',
            },
          },
          status: 'authenticated',
        },
      }),
      jsonResponse({ data: { user: { locale: 'en' } } }),
      jsonResponse({ data: { profile: { email: null } } }),
    );

    render(
      <StrictMode>
        <App />
      </StrictMode>,
    );

    await waitFor(() => {
      expect(window.location.pathname).toBe('/profile');
    });
    const projectionCalls = fetchMock.mock.calls.filter(([input]) => {
      const url = input instanceof Request ? input.url : String(input);
      return new URL(url, window.location.origin).pathname === '/auth/telegram/oidc/session';
    });
    expect(projectionCalls).toHaveLength(1);
    const projectionCall = projectionCalls[0];
    const request = projectionCall?.[0] as Request;
    expect(request.credentials).toBe('include');
    expect(JSON.parse(await request.clone().text())).toEqual({
      intent: 'login',
      returnUrl: `${window.location.origin}/profile`,
    });
    expect(sessionStorage.getItem('telegramOidcAuthState')).toBeNull();
  });

  it('states why a Telegram session projection the server rejected failed', async () => {
    resetPath('/auth/telegram/callback');
    sessionStorage.setItem('telegramOidcAuthState', JSON.stringify({ intent: 'login', returnUrl: '/profile' }));
    setFetch(jsonResponse({ message: 'The OIDC session has expired' }, false, 400));

    render(<App />);

    expect(await screen.findByText('The OIDC session has expired')).toBeTruthy();
    expect(screen.queryByText('Verifying the Telegram session.')).toBeNull();
  });

  it('reports a Telegram projection that answered without a session or a link', async () => {
    resetPath('/auth/telegram/callback');
    sessionStorage.setItem('telegramOidcAuthState', JSON.stringify({ intent: 'login' }));
    setFetch(jsonResponse({ data: { status: 'pending' } }));

    render(<App />);

    expect(await screen.findByText('Telegram sign-in completed.')).toBeTruthy();
    expect(window.location.pathname).toBe('/auth/telegram/callback');
  });

  it('does not project a Telegram OIDC callback that contains a provider error', async () => {
    resetPath('/auth/telegram/callback?error=access_denied');
    sessionStorage.setItem('telegramOidcAuthState', JSON.stringify({ intent: 'login', returnUrl: '/profile' }));
    const fetchMock = setFetch();

    render(<App />);

    expect(await screen.findByText('Telegram did not complete sign-in. Start again.')).toBeTruthy();
    // The chrome's own session and catalog reads still happen; what must not
    // happen is a session projection for a failed provider callback.
    expect(
      fetchMock.mock.calls.some(([input]) =>
        (input instanceof Request ? input.url : String(input)).includes('/auth/telegram/oidc/session'),
      ),
    ).toBe(false);
    expect(sessionStorage.getItem('telegramOidcAuthState')).toBeNull();
  });

  it('social auth buttons call wrapper-backed redirect logic', async () => {
    resetPath('/auth');

    const fetchMock = setFetch(
      jsonResponse({
        data: {},
      }),
    );

    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: 'Continue with Discord' }));

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(([input]) =>
          (input instanceof Request ? input.url : String(input)).includes('/auth/discord/authorization-request'),
        ),
      ).toBe(true);
    });
  });

  it('prevents double Discord authorization requests while loading', async () => {
    resetPath('/auth');
    const pending = deferredResponse();
    const fetchMock = vi.fn<typeof fetch>((input) => {
      const pathname = new URL(input instanceof Request ? input.url : String(input), window.location.origin).pathname;
      return pathname === '/auth/me' ? Promise.resolve(jsonResponse({}, false, 401)) : pending.promise;
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<App />);
    const discordButton = await screen.findByRole('button', {
      name: 'Continue with Discord',
    });
    fireEvent.click(discordButton);
    fireEvent.click(discordButton);

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.filter(([input]) =>
          (input instanceof Request ? input.url : String(input)).includes('/auth/discord/authorization-request'),
        ),
      ).toHaveLength(1);
    });
    const loadingDiscordButton = await screen.findByRole('button', {
      name: /Waiting for Discord confirmation\./u,
    });
    expect((loadingDiscordButton as HTMLButtonElement).disabled).toBe(true);
    pending.resolve(jsonResponse({ data: {} }));
  });

  it('starts Telegram OIDC from the social entry instead of routing to TMA', async () => {
    resetPath('/auth');
    tma.useRawInitData.mockReturnValue(undefined);
    const fetchMock = setFetch(jsonResponse({ redirect: false, url: '' }));

    render(<App />);
    const telegramButton = await screen.findByRole('button', { name: 'Continue with Telegram' });
    fireEvent.click(telegramButton);
    // A second click on the same button must not open a second authorization.
    fireEvent.click(telegramButton);

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(([input]) =>
          (input instanceof Request ? input.url : String(input)).includes('/api/auth/sign-in/oauth2'),
        ),
      ).toBe(true);
    });
    expect(
      fetchMock.mock.calls.filter(([input]) =>
        (input instanceof Request ? input.url : String(input)).includes('/api/auth/sign-in/oauth2'),
      ),
    ).toHaveLength(1);
    const request = fetchMock.mock.calls.find(([input]) =>
      (input instanceof Request ? input.url : String(input)).includes('/api/auth/sign-in/oauth2'),
    )?.[0] as Request;
    expect(new URL(request.url).pathname).toBe('/api/auth/sign-in/oauth2');
    expect(JSON.parse(await request.clone().text())).toMatchObject({
      callbackURL: 'https://app.local.test/auth/telegram/callback',
      disableRedirect: true,
      providerId: 'telegram',
    });
    expect(window.location.pathname).toBe('/auth');
  });

  // A provider hand-off that is refused before the redirect starts used to leave
  // the button looking like it had done nothing. Each provider now says why, and
  // it says what the auth service said rather than a generic apology.
  it('states why a refused Telegram hand-off never redirected', async () => {
    resetPath('/auth');
    setFetch(jsonResponse({ detail: 'Telegram sign-in is not configured for this environment.' }, false, 503));

    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: 'Continue with Telegram' }));

    expect(await screen.findByText('Telegram sign-in is not configured for this environment.')).toBeTruthy();
  });

  it('states why a refused Discord hand-off never redirected', async () => {
    resetPath('/auth');
    setFetch(jsonResponse({ detail: 'Discord sign-in is not configured for this environment.' }, false, 503));

    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: 'Continue with Discord' }));

    expect(await screen.findByText('Discord sign-in is not configured for this environment.')).toBeTruthy();
    // Telegram is the first provider the toast reports, so its own hand-off has
    // to be untouched for the Discord failure to be the one on screen.
    expect(screen.queryByText(/Telegram sign-in is temporarily unavailable/u)).toBeNull();
  });

  it('navigates the site chrome without a full page reload', async () => {
    resetPath('/auth');
    setFetch();
    render(<App />);

    fireEvent.click(await screen.findByRole('button', { name: 'Settings' }));

    await waitFor(() => {
      expect(window.location.pathname).toBe('/settings');
    });
  });

  // Registering through Telegram is the same redirect as signing in through it,
  // so the stepped flow hands the choice straight to the provider — and the flow
  // still offers the way back to the sign-in card.
  it('starts Telegram registration from the stepped flow and returns to sign-in', async () => {
    resetPath('/auth');
    const fetchMock = setFetch(jsonResponse({ redirect: false, url: '' }));

    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: 'Create an account' }));
    fireEvent.click(await screen.findByRole('button', { name: /Register with Telegram/u }));

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(([input]) =>
          (input instanceof Request ? input.url : String(input)).includes('/api/auth/sign-in/oauth2'),
        ),
      ).toBe(true);
    });

    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByRole('button', { name: 'Login' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Register with Telegram/u })).toBeNull();
  });

  // While the authorization request is in flight the button says so and takes no
  // further clicks; once it settles, the button is usable again.
  it('holds the Telegram button in its waiting state while the request is in flight', async () => {
    resetPath('/auth');
    const pending = deferredResponse();
    const fetchMock = vi.fn<typeof fetch>((input) => {
      const pathname = new URL(input instanceof Request ? input.url : String(input), window.location.origin).pathname;
      if (pathname === '/auth/me' || marketplaceChromeEndpoints.has(pathname)) {
        return Promise.resolve(jsonResponse({}, false, 401));
      }
      return pending.promise;
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: 'Continue with Telegram' }));

    const waiting = await screen.findByRole('button', { name: /Waiting for Telegram/u });
    fireEvent.click(waiting);
    pending.resolve(jsonResponse({ redirect: false, url: '' }));

    expect(await screen.findByRole('button', { name: 'Continue with Telegram' })).toBeTruthy();
    expect(
      fetchMock.mock.calls.filter(([input]) =>
        (input instanceof Request ? input.url : String(input)).includes('/api/auth/sign-in/oauth2'),
      ),
    ).toHaveLength(1);
  });

  // A "create an account" link anywhere on the site carries `?mode=register`, so
  // the visitor lands on the first registration step instead of the sign-in form.
  it('opens the stepped registration flow directly from a register link', async () => {
    resetPath('/auth?mode=register');
    setFetch();

    render(<App />);

    expect(await screen.findByRole('button', { name: /Register with Telegram/u })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Login' })).toBeNull();
  });

  // The settings page owns where each provider link goes: Discord is an OAuth
  // redirect from the page itself, Telegram is the Mini App route.
  it('routes each account link from the settings page to its own provider flow', async () => {
    resetPath('/settings');
    const session = {
      data: {
        session: {
          user: {
            email: 'farmer@example.com',
            id: 'user-id',
            permissions: [],
            roles: [],
            tenantId: 'tenant-id',
            theme: 'system',
          },
        },
        status: 'authenticated',
      },
    };
    const fetchMock = vi.fn<typeof fetch>((input) => {
      const pathname = new URL(input instanceof Request ? input.url : String(input), window.location.origin).pathname;
      if (pathname === '/auth/me') {
        return Promise.resolve(jsonResponse(session));
      }
      if (pathname === '/auth/provider-identities') {
        return Promise.resolve(jsonResponse({ data: { identities: [] } }));
      }
      if (pathname === '/auth/discord/authorization-request') {
        return Promise.resolve(jsonResponse({ data: {} }));
      }
      return Promise.resolve(jsonResponse({}, false, 401));
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<App />);

    fireEvent.click(await screen.findByRole('button', { name: 'Link Discord' }));
    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(([input]) =>
          (input instanceof Request ? input.url : String(input)).includes('/auth/discord/authorization-request'),
        ),
      ).toBe(true);
    });

    fireEvent.click(screen.getByRole('button', { name: 'Link Telegram' }));
    await waitFor(() => {
      expect(window.location.pathname).toBe('/link/telegram');
    });
  });

  it('names a Mini App destination it cannot open, and a link it completed', () => {
    const view = render(
      <TmaAuthPanel
        deepNavigationState="unsupported"
        error={null}
        intent="link"
        isTelegram
        isVerifying={false}
        status="idle"
        t={(key) => key}
      />,
    );

    expect(screen.getByText('tma.deepNavigation.unsupported')).toBeTruthy();
    expect(screen.getByText('tma.link.pending')).toBeTruthy();

    view.rerender(
      <TmaAuthPanel
        deepNavigationState="none"
        error={null}
        intent="link"
        isTelegram
        isVerifying={false}
        status="success"
        t={(key) => key}
      />,
    );

    expect(screen.getByText('tma.link.success')).toBeTruthy();
    expect(screen.queryByText('tma.deepNavigation.unsupported')).toBeNull();

    // The same panel, reached as a sign-in rather than as a link from settings.
    view.rerender(
      <TmaAuthPanel
        deepNavigationState="none"
        error={null}
        intent="login"
        isTelegram
        isVerifying={false}
        status="success"
        t={(key) => key}
      />,
    );

    expect(screen.getByText('tma.authenticated')).toBeTruthy();
  });
});
