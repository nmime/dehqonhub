// @requirements REQ-FRONTEND-SHELL-004 REQ-AGRITECH-ROUTING-015 REQ-AGRITECH-MARKETPLACE-016 REQ-AGRITECH-EXPERIENCE-026 REQ-API-PROBLEM-001
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiRuntimeEvents } from '@app/frontend-api-support';
import App from './app';

const jsonResponse = (body: unknown, ok = true, status = 200): Response =>
  new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
    status,
    statusText: ok ? 'OK' : 'Error',
  });

const installStorage = () => {
  const values = new Map<string, string>();
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      clear: () => {
        values.clear();
      },
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    },
  });
};

function installRadixPointerMocks() {
  Object.defineProperty(HTMLElement.prototype, 'hasPointerCapture', {
    configurable: true,
    value: vi.fn(() => false),
  });
  Object.defineProperty(HTMLElement.prototype, 'releasePointerCapture', {
    configurable: true,
    value: vi.fn(),
  });
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    configurable: true,
    value: vi.fn(),
  });
}

function chooseSelectOption(label: string | RegExp, option: string) {
  installRadixPointerMocks();
  const selectTrigger = screen.queryByRole('combobox', { name: label });
  if (selectTrigger) {
    fireEvent.pointerDown(selectTrigger, {
      button: 0,
      ctrlKey: false,
      pointerType: 'mouse',
    });

    const optionElement = document.querySelector<HTMLElement>(`[role="option"][data-value="${option}"]`);

    expect(optionElement).toBeTruthy();
    fireEvent.click(optionElement as HTMLElement);
    return;
  }

  const menuTrigger = screen.getAllByRole('button', { name: label })[0];
  const menuLabels: Record<string, string> = {
    dark: 'Dark',
    en: 'English',
    light: 'Light',
    ru: 'Russian',
    system: 'System',
    uz: 'Uzbek (Latin)',
    'uz-Cyrl': 'Uzbek (Cyrillic)',
  };

  expect(menuTrigger).toBeTruthy();
  fireEvent.pointerDown(menuTrigger as HTMLElement, {
    button: 0,
    ctrlKey: false,
    pointerType: 'mouse',
  });
  fireEvent.click(screen.getByRole('menuitem', { name: menuLabels[option] ?? option }));
}

const getSubmitButton = (name: string | RegExp): HTMLButtonElement => {
  const button = screen
    .getAllByRole('button', { name })
    .find((candidate) => candidate.getAttribute('type') === 'submit');
  expect(button).toBeTruthy();
  return button as HTMLButtonElement;
};

type FetchReply = Response | { rejectsWith: Error };

const setFetch = (...responses: FetchReply[]) => {
  let initialSessionChecked = false;
  const queue = [...responses];
  const fetchMock = vi.fn((input: RequestInfo | URL) => {
    const pathname = new URL(input instanceof Request ? input.url : String(input), window.location.origin).pathname;
    if (pathname === '/auth/me' && !initialSessionChecked) {
      initialSessionChecked = true;
      return Promise.resolve(jsonResponse({}, false, 401));
    }
    const response = queue.shift();
    if (!response) {
      return Promise.reject(new Error(`Unexpected fetch: ${pathname}`));
    }
    return 'rejectsWith' in response ? Promise.reject(response.rejectsWith) : Promise.resolve(response);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
};

const installSignedOutMarketplaceFetch = () => {
  const fetchMock = vi.fn((input: RequestInfo | URL) => {
    const pathname = new URL(input instanceof Request ? input.url : String(input), window.location.origin).pathname;
    if (pathname === '/marketplace/public/catalog' || pathname === '/marketplace/public/requests') {
      return Promise.resolve(jsonResponse({ data: { items: [] } }));
    }
    if (
      pathname === '/auth/me' ||
      pathname === '/auth/problem-presentations' ||
      pathname === '/marketplace/catalog' ||
      pathname === '/marketplace/verification'
    ) {
      return Promise.resolve(jsonResponse({}, false, 401));
    }
    return Promise.reject(new Error(`Unexpected fetch: ${pathname}`));
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
};

const enableProductionSameOriginApi = () => {
  vi.stubEnv('MODE', 'production');
  vi.stubEnv('VITE_API_BASE_URL_MODE', 'same-origin');
};

type FetchInit = {
  body?: BodyInit | null;
  headers?: Record<string, string>;
  method?: string;
};

type FetchMock = ReturnType<typeof setFetch>;
type FetchCall = [unknown, unknown?];

const normalizeHeaders = (headers: HeadersInit | undefined): Record<string, string> | undefined =>
  headers ? Object.fromEntries(new Headers(headers).entries()) : undefined;

const getCalledUrl = (calledInput: unknown): string =>
  calledInput instanceof Request ? calledInput.url : String(calledInput);

const getCalledInit = (calledInput: unknown, init: unknown): FetchInit => {
  if (calledInput instanceof Request) {
    return {
      body: calledInput.body,
      headers: normalizeHeaders(calledInput.headers),
      method: calledInput.method,
    };
  }

  const requestInit = init as RequestInit | undefined;

  return {
    body: requestInit?.body,
    headers: normalizeHeaders(requestInit?.headers),
    method: requestInit?.method,
  };
};

const matchesUrl = (actualUrl: string, expectedUrl: string): boolean => {
  if (actualUrl === expectedUrl) {
    return true;
  }

  if (expectedUrl.startsWith('/')) {
    try {
      return new URL(actualUrl).pathname === expectedUrl;
    } catch {
      return false;
    }
  }

  return false;
};

const findFetchCall = (
  fetchMock: FetchMock,
  url: string,
  expectedHeaders: Record<string, string>,
  method?: string,
): FetchCall | undefined =>
  fetchMock.mock.calls.find(([calledInput, init]) => {
    const fetchInit = getCalledInit(calledInput, init);

    return (
      matchesUrl(getCalledUrl(calledInput), url) &&
      (!method || fetchInit.method === method) &&
      Object.entries(expectedHeaders).every(([key, value]) => fetchInit.headers?.[key.toLowerCase()] === value)
    );
  }) as FetchCall | undefined;

const findFetchInit = (
  fetchMock: FetchMock,
  url: string,
  expectedHeaders: Record<string, string>,
  method?: string,
): FetchInit | undefined => {
  const call = findFetchCall(fetchMock, url, expectedHeaders, method);

  return call ? getCalledInit(call[0], call[1]) : undefined;
};

const readFetchBody = async (
  fetchMock: FetchMock,
  url: string,
  expectedHeaders: Record<string, string>,
  method?: string,
): Promise<string | undefined> => {
  const call = findFetchCall(fetchMock, url, expectedHeaders, method);
  if (!call) {
    return undefined;
  }

  if (call[0] instanceof Request) {
    return call[0].clone().text();
  }

  const body = getCalledInit(call[0], call[1]).body;
  return typeof body === 'string' ? body : undefined;
};

const expectFetchRequest = (
  fetchMock: FetchMock,
  url: string,
  expectedHeaders: Record<string, string>,
  method?: string,
): FetchInit => {
  const init = findFetchInit(fetchMock, url, expectedHeaders, method);
  expect(init, `missing ${method ?? 'GET'} ${url}`).toBeTruthy();
  expect(init?.headers).toMatchObject(
    Object.fromEntries(
      Object.entries({
        Accept: 'application/json',
        ...expectedHeaders,
      }).map(([key, value]) => [key.toLowerCase(), value]),
    ),
  );

  return init as FetchInit;
};

// Waits for either the marketplace or Telegram shell to mount its route outlet.
const awaitShell = () => screen.findByRole('main');

const submitLogin = async (email = 'user@example.com') => {
  await awaitShell();
  fireEvent.change(await screen.findByLabelText('Login email'), {
    target: { value: email },
  });
  fireEvent.change(screen.getByLabelText('Login password'), {
    target: { value: 'password123' },
  });
  fireEvent.click(getSubmitButton('Login'));
};

const openEmailRegistration = async () => {
  fireEvent.click(await screen.findByRole('button', { name: /^(Create an account|Создать аккаунт)$/u }));
  fireEvent.click(
    await screen.findByRole('button', {
      name: /^(Email and password|Email и пароль)/u,
    }),
  );
};

describe('User app shell', () => {
  beforeEach(() => {
    installStorage();
    vi.stubGlobal('scrollTo', vi.fn());
    window.localStorage.clear();
    document.cookie = 'locale=; path=/; max-age=0';
    document.cookie = 'lang=; path=/; max-age=0';
    window.history.pushState({}, '', '/');
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('renders the anonymous DehqonHub entry when the production problem-presentation bootstrap returns 401', async () => {
    enableProductionSameOriginApi();
    const fetchMock = installSignedOutMarketplaceFetch();
    const { container } = render(<App />);
    await screen.findByRole('heading', { name: "Uzbekistan's entire agro market — on one platform" });
    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(
          ([input]) =>
            new URL(input instanceof Request ? input.url : String(input), window.location.origin).pathname ===
            '/auth/problem-presentations',
        ),
      ).toBe(true);
      expect(apiRuntimeEvents.getState().authRequired).toBe(false);
      expect(window.location.pathname).toBe('/');
    });
    const html = container.innerHTML;

    expect(container.querySelectorAll('.dh-marketplace')).toHaveLength(1);
    expect(container.querySelectorAll('.dh-brand__mark img')).toHaveLength(0);
    expect(container.querySelectorAll('svg.dh-brand__mark')).toHaveLength(2);
    expect(container.querySelectorAll('.dh-brand__wordmark')).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: 'Language' })).toHaveLength(2);
    expect(
      screen.getAllByRole('button', { name: 'Language' }).every((button) => button.textContent.includes('EN')),
    ).toBe(true);
    expect(html).toContain('Dehqon');
    expect(html).not.toContain('xr-mini-app-bottom-bar');
    expect(html).not.toContain('design v3');
    expect(html).not.toContain('route readiness');
    expect(html).not.toContain('3003');

    fireEvent.click(screen.getAllByRole('button', { name: 'Verification' })[0]!);
    await screen.findByRole('heading', { name: 'Sign in to DehqonHub' });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() => {
      expect(window.location.pathname).toBe('/auth');
    });
    expect(new URLSearchParams(window.location.search).get('returnUrl')).toBe('/verification');
  });

  it('keeps an anonymous presentation-preference rejection on the current public route', async () => {
    enableProductionSameOriginApi();
    installSignedOutMarketplaceFetch();
    render(<App />);

    await screen.findByRole('heading', { name: "Uzbekistan's entire agro market — on one platform" });
    act(() => {
      apiRuntimeEvents.emit({
        type: 'auth-required',
        error: {
          code: 'http.401',
          endpoint: '/auth/me/preferences',
          id: 'PATCH:/auth/me/preferences:401:http.401',
          kind: 'client',
          message: 'Authentication is required.',
          method: 'PATCH',
          status: 401,
        },
        reason: 'unauthenticated',
        redirectTo: '/auth',
      });
    });

    expect(apiRuntimeEvents.getState().authRequired).toBe(false);
    expect(window.location.pathname).toBe('/');
  });

  it('keeps the public problem registry available after its anonymous production bootstrap and session event', async () => {
    window.history.replaceState({}, '', '/problems');
    enableProductionSameOriginApi();
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const pathname = new URL(input instanceof Request ? input.url : String(input), window.location.origin).pathname;
      if (pathname === '/auth/problem-presentations') {
        return Promise.resolve(jsonResponse({}, false, 401));
      }
      return Promise.reject(new Error(`Unexpected fetch: ${pathname}`));
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<App />);

    expect(await screen.findByRole('heading', { level: 1, name: 'API problem types' })).toBeTruthy();
    expect(screen.getByText('https://dehqonhub.uz/problems')).toBeTruthy();
    await waitFor(() => {
      expect(
        new Set(
          fetchMock.mock.calls.map(
            ([input]) => new URL(input instanceof Request ? input.url : String(input), window.location.origin).pathname,
          ),
        ),
      ).toEqual(new Set(['/auth/problem-presentations']));
      expect(apiRuntimeEvents.getState().authRequired).toBe(false);
      expect(window.location.pathname).toBe('/problems');
    });

    act(() => {
      apiRuntimeEvents.emit({
        type: 'auth-required',
        error: {
          code: 'http.401',
          endpoint: '/auth/me',
          id: 'GET:/auth/me:401:http.401',
          kind: 'client',
          message: 'Authentication is required.',
          method: 'GET',
          status: 401,
        },
        reason: 'unauthenticated',
        redirectTo: '/auth',
      });
    });

    expect(apiRuntimeEvents.getState().authRequired).toBe(false);
    expect(window.location.pathname).toBe('/problems');
  });

  it('keeps marketplace loading and catalog failure states inside DehqonHub chrome', async () => {
    let resolveCatalog: ((response: Response) => void) | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        const pathname = new URL(input instanceof Request ? input.url : String(input), window.location.origin).pathname;
        if (pathname === '/auth/me') {
          return Promise.resolve(jsonResponse({}, false, 401));
        }
        if (pathname === '/marketplace/catalog') {
          return new Promise<Response>((resolve) => {
            resolveCatalog = resolve;
          });
        }
        return Promise.reject(new Error(`Unexpected fetch: ${pathname}`));
      }),
    );

    const loading = render(<App />);
    expect(await screen.findByLabelText('Loading…')).toBeTruthy();
    expect(loading.container.innerHTML).not.toContain('xr-mini-app-bottom-bar');
    loading.unmount();
    resolveCatalog?.(jsonResponse({}, false, 503));

    window.history.replaceState({}, '', '/');
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        const pathname = new URL(input instanceof Request ? input.url : String(input), window.location.origin).pathname;
        if (pathname === '/auth/me') {
          return Promise.resolve(jsonResponse({}, false, 401));
        }
        if (pathname === '/marketplace/catalog') {
          return Promise.resolve(jsonResponse({}, false, 503));
        }
        return Promise.reject(new Error(`Unexpected fetch: ${pathname}`));
      }),
    );

    const failed = render(<App />);
    expect(await screen.findByRole('heading', { level: 1, name: 'Catalog unavailable' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy();
    expect(failed.container.innerHTML).not.toContain('xr-mini-app-bottom-bar');
  });

  it('keeps focused account entry inside the marketplace chrome', async () => {
    window.history.replaceState({}, '', '/auth');
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(jsonResponse({}, false, 401))),
    );
    const { container } = render(<App />);
    await awaitShell();

    expect(await screen.findByRole('heading', { name: 'Sign in to DehqonHub' })).toBeTruthy();
    expect(container.querySelector('.dh-marketplace')).toBeTruthy();
    expect(container.querySelector('.xr-mini-app-bottom-bar')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull();
  });

  it('keeps direct settings navigation on its route without Telegram chrome', async () => {
    window.history.replaceState({}, '', '/settings');
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(jsonResponse({}, false, 401))),
    );

    const { container } = render(<App />);

    expect(await screen.findByText('Preferences')).toBeTruthy();
    expect(window.location.pathname).toBe('/settings');
    expect(container.querySelector('.dh-marketplace')).toBeTruthy();
    expect(container.querySelector('.xr-mini-app-bottom-bar')).toBeNull();
  });

  it('hydrates an authenticated session when settings is loaded directly', async () => {
    window.history.pushState({}, '', '/settings');
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        const pathname = new URL(input instanceof Request ? input.url : String(input), window.location.origin).pathname;
        if (pathname === '/auth/me') {
          return Promise.resolve(
            jsonResponse({
              data: {
                principal: { email: 'settings@example.com', subject: 'settings-subject' },
                user: { locale: 'en', theme: 'system' },
              },
            }),
          );
        }
        if (pathname === '/auth/provider-identities') {
          return Promise.resolve(jsonResponse({ data: { items: [] } }));
        }
        return Promise.reject(new Error(`Unexpected fetch: ${pathname}`));
      }),
    );

    render(<App />);

    expect(await screen.findByRole('button', { name: 'Sign out' })).toBeTruthy();
    expect(screen.queryByText('Sign in or register to continue.')).toBeNull();
  });

  it('keeps direct settings navigation silent but reports auth when a guest opens profile', async () => {
    window.history.pushState({}, '', '/settings');
    apiRuntimeEvents.reset();
    const events: string[] = [];
    const unsubscribe = apiRuntimeEvents.subscribe((event) => events.push(event.type));
    const fetchMock = vi.fn(() => Promise.resolve(jsonResponse({}, false, 401)));
    vi.stubGlobal('fetch', fetchMock);

    const settingsView = render(<App />);

    await screen.findByText('Preferences');
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });
    expect(window.location.pathname).toBe('/settings');
    expect(events).not.toContain('auth-required');
    expect(apiRuntimeEvents.getState().authRequired).toBe(false);

    settingsView.unmount();
    window.history.replaceState({}, '', '/profile');
    render(<App />);

    await waitFor(() => {
      expect(events).toContain('auth-required');
    });
    expect(window.location.pathname).toBe('/auth');
    expect(new URLSearchParams(window.location.search).get('returnUrl')).toBe('/profile');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    unsubscribe();
  });

  it('renders every preserved user route without scaffold diagnostics', async () => {
    const routes = [
      '/auth',
      '/auth/discord/callback',
      '/profile',
      '/settings',
      '/tma',
      '/tma/auth',
      '/telegram-mini-app',
      '/link/telegram',
      '/link/discord',
    ];

    for (const route of routes) {
      window.history.pushState({}, '', route);
      const { container, unmount } = render(<App />);
      // eslint-disable-next-line no-await-in-loop -- routes render sequentially; each is unmounted before the next.
      await awaitShell();
      const html = container.innerHTML;
      const isTelegramRoute = ['/tma', '/tma/auth', '/telegram-mini-app', '/link/telegram'].includes(route);

      expect(html).toContain('<main');
      expect(html.includes('xr-mini-app-bottom-bar')).toBe(isTelegramRoute);
      expect(html.includes('dh-marketplace')).toBe(!isTelegramRoute);
      expect(html).not.toContain('data-design-marker');
      expect(html).not.toContain('route readiness');
      expect(html).not.toContain('nonblank smoke');
      unmount();
    }
  });

  it('renders the home shell even when local storage access throws', async () => {
    installSignedOutMarketplaceFetch();
    installStorage();
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get: () => {
        throw new Error('storage blocked');
      },
    });

    const { container } = render(<App />);
    await screen.findByRole('heading', { name: "Uzbekistan's entire agro market — on one platform" });
    expect(container.innerHTML).toContain('Dehqon');
  });

  it('loads a profile after login establishes a cookie session', async () => {
    window.history.pushState({}, '', '/auth');
    vi.stubEnv('VITE_USER_API_BASE_URL', 'https://user-api/');
    const fetchMock = setFetch(
      jsonResponse({ data: { user: {} } }),
      jsonResponse({ data: { user: { locale: 'en' } } }),
      jsonResponse({
        data: {
          principal: { subject: 'subject-id', email: 'ready@example.com' },
        },
      }),
    );

    render(<App />);
    await submitLogin('ready@example.com');

    expect(await screen.findByText('Ready: ready@example.com')).toBeTruthy();
    expectFetchRequest(fetchMock, '/auth/me', {
      'Accept-Language': 'en',
    });
    expectFetchRequest(fetchMock, process.versions.bun ? '/profile/me' : 'https://user-api/profile/me', {
      'Accept-Language': 'en',
    });
  });

  it('returns to the protected route after auth redirect login', async () => {
    window.history.pushState({}, '', '/auth?returnUrl=/profile');
    setFetch(
      jsonResponse({ data: { user: {} } }),
      jsonResponse({ data: { user: { locale: 'en' } } }),
      jsonResponse({
        data: {
          principal: { subject: 'return-subject', email: 'return@example.com' },
        },
      }),
    );

    render(<App />);
    await submitLogin('return@example.com');

    await waitFor(() => {
      expect(window.location.pathname).toBe('/profile');
    });
    expect(await screen.findByText('Ready: return@example.com')).toBeTruthy();
  });

  it('shows forbidden states for profile response and thrown failures', async () => {
    window.history.pushState({}, '', '/auth');
    setFetch(jsonResponse({ data: { user: {} } }), jsonResponse({ data: {} }), jsonResponse({}, false, 403));
    const { unmount } = render(<App />);
    await submitLogin();
    expect(await screen.findByText('Forbidden: Request failed with 403.')).toBeTruthy();
    unmount();

    window.history.pushState({}, '', '/auth');
    setFetch(jsonResponse({ data: { user: {} } }), jsonResponse({ data: {} }), {
      rejectsWith: 'network failed',
    });
    render(<App />);
    await submitLogin();
    expect(await screen.findByText('Forbidden: Profile request failed.')).toBeTruthy();
  });

  it('handles incomplete profile payloads and non-error auth rejections', async () => {
    window.history.pushState({}, '', '/auth');
    setFetch(jsonResponse({ data: { user: {} } }), jsonResponse({ data: {} }), jsonResponse({ data: {} }));
    const { unmount } = render(<App />);
    await submitLogin();
    expect(await screen.findByText('Ready: unknown')).toBeTruthy();
    unmount();
    cleanup();
    window.localStorage.clear();
    document.cookie = 'locale=; path=/; max-age=0';
    document.cookie = 'lang=; path=/; max-age=0';
    window.history.pushState({}, '', '/auth');

    const rejectAuthJson = vi.fn<() => Promise<unknown>>().mockRejectedValue('auth offline');
    const rejectAuthResponse = new Response(null, {
      headers: { 'Content-Type': 'application/json' },
      status: 200,
    });
    vi.spyOn(rejectAuthResponse, 'json').mockImplementation(rejectAuthJson);
    setFetch(rejectAuthResponse);
    render(<App />);
    await submitLogin();

    await waitFor(() => {
      expect(screen.getByText('Sign in or register to continue.')).toBeTruthy();
    });
  });

  it('uses saved user locale before profile calls and ignores stale local storage', async () => {
    window.history.pushState({}, '', '/auth');
    window.localStorage.setItem('boilerplate.locale', 'en');
    vi.stubEnv('VITE_USER_API_BASE_URL', 'https://user-api/');
    let authenticated = false;
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const pathname = new URL(input instanceof Request ? input.url : String(input), window.location.origin).pathname;
      const method = input instanceof Request ? input.method : (init?.method ?? 'GET');

      if (pathname === '/auth/login' && method === 'POST') {
        authenticated = true;
        return Promise.resolve(jsonResponse({ data: { user: {} } }));
      }
      if (pathname === '/auth/me') {
        return Promise.resolve(
          authenticated ? jsonResponse({ data: { user: { locale: 'ru' } } }) : jsonResponse({}, false, 401),
        );
      }
      if (pathname === '/profile/me') {
        return Promise.resolve(jsonResponse({ data: { principal: { subject: 'profile-subject' } } }));
      }

      return Promise.reject(new Error(`Unexpected fetch: ${method} ${pathname}`));
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<App />);
    await submitLogin();

    expect(await screen.findByText('Готово: profile-subject', {}, { timeout: 5_000 })).toBeTruthy();
    expectFetchRequest(fetchMock, '/auth/me', {
      'Accept-Language': 'en',
    });
    expectFetchRequest(fetchMock, '/auth/me', {
      'Accept-Language': 'ru',
    });
    expectFetchRequest(fetchMock, process.versions.bun ? '/profile/me' : 'https://user-api/profile/me', {
      'Accept-Language': 'ru',
    });
  });

  it('persists language switches for authenticated users and subsequent calls', async () => {
    window.history.pushState({}, '', '/auth');
    const fetchMock = setFetch(
      jsonResponse({ data: { user: {} } }),
      jsonResponse({ data: { user: { locale: 'en' } } }),
      jsonResponse({ data: { principal: { subject: 'profile-subject' } } }),
      jsonResponse({ data: { user: { locale: 'ru' } } }),
      jsonResponse({ data: { user: { locale: 'ru' } } }),
      jsonResponse({ data: { principal: { subject: 'profile-subject' } } }),
    );

    render(<App />);
    await submitLogin();
    expect(await screen.findByText('Ready: profile-subject')).toBeTruthy();

    chooseSelectOption('Language', 'ru');

    await waitFor(() => {
      expect(
        findFetchInit(
          fetchMock,
          '/auth/me/preferences',
          {
            'Accept-Language': 'ru',
            'Content-Type': 'application/json',
          },
          'PATCH',
        ),
      ).toBeTruthy();
    });
    expectFetchRequest(
      fetchMock,
      '/auth/me/preferences',
      {
        'Accept-Language': 'ru',
        'Content-Type': 'application/json',
      },
      'PATCH',
    );
    await expect(
      readFetchBody(
        fetchMock,
        '/auth/me/preferences',
        {
          'Accept-Language': 'ru',
          'Content-Type': 'application/json',
        },
        'PATCH',
      ),
    ).resolves.toBe(JSON.stringify({ locale: 'ru' }));
    await waitFor(() => {
      expect(
        findFetchInit(fetchMock, '/profile/me', {
          'Accept-Language': 'ru',
        }),
      ).toBeTruthy();
    });
  });

  it('persists theme switches for authenticated users', async () => {
    window.history.pushState({}, '', '/auth');
    const fetchMock = setFetch(
      jsonResponse({ data: { user: {} } }),
      jsonResponse({ data: { user: { locale: 'en', theme: 'system' } } }),
      jsonResponse({ data: { principal: { subject: 'profile-subject' } } }),
      jsonResponse({ data: { theme: 'dark' } }),
      jsonResponse({ data: { user: { locale: 'en', theme: 'dark' } } }),
      jsonResponse({ data: { principal: { subject: 'profile-subject' } } }),
    );

    render(<App />);
    await submitLogin();
    expect(await screen.findByText('Ready: profile-subject')).toBeTruthy();

    chooseSelectOption('Theme', 'dark');

    expect(window.location.pathname).toBe('/auth');

    await waitFor(() => {
      expect(
        findFetchInit(
          fetchMock,
          '/auth/me/preferences',
          {
            'Accept-Language': 'en',
            'Content-Type': 'application/json',
          },
          'PATCH',
        ),
      ).toBeTruthy();
    });
    await expect(
      readFetchBody(
        fetchMock,
        '/auth/me/preferences',
        {
          'Accept-Language': 'en',
          'Content-Type': 'application/json',
        },
        'PATCH',
      ),
    ).resolves.toBe(JSON.stringify({ theme: 'dark' }));
  });

  it('logs in then loads the protected profile', async () => {
    vi.stubEnv('VITE_AUTH_API_BASE_URL', 'https://auth-api/');
    setFetch(
      jsonResponse({ data: { user: {} } }),
      jsonResponse({ data: { user: { locale: 'en' } } }),
      jsonResponse({ data: { principal: { subject: 'profile-subject' } } }),
    );
    window.history.pushState({}, '', '/auth');
    render(<App />);

    fireEvent.change(await screen.findByLabelText('Login email'), {
      target: { value: 'user@example.com' },
    });
    fireEvent.change(screen.getByLabelText('Login password'), {
      target: { value: 'password123' },
    });
    fireEvent.click(getSubmitButton('Login'));

    expect(await screen.findByText('Ready: profile-subject')).toBeTruthy();
  });

  it('handles register failures and empty success tokens', async () => {
    setFetch(jsonResponse({}, false, 409));
    window.history.pushState({}, '', '/auth');
    const { unmount } = render(<App />);

    await openEmailRegistration();
    fireEvent.change(await screen.findByLabelText('Register display name'), {
      target: { value: 'Registered User' },
    });
    fireEvent.change(screen.getByLabelText(/^(Register email|Email de registro)$/u), {
      target: { value: 'new@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^(Continue|Продолжить)$/u }));
    fireEvent.change(screen.getByLabelText(/^(Register password|Contraseña de registro)$/u), {
      target: { value: 'password123' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^(Register|Registrarse)$/u }));
    expect(await screen.findByText('Forbidden: Request failed with 409.')).toBeTruthy();
    unmount();

    setFetch(jsonResponse({ data: {} }));
    window.history.pushState({}, '', '/auth');
    render(<App />);
    await screen.findByLabelText('Login email');
    fireEvent.click(getSubmitButton('Login'));
    await waitFor(() => {
      expect(screen.getByText('Sign in or register to continue.')).toBeTruthy();
    });
  });

  it('continues after a verified session and hides unnormalized object error details', async () => {
    setFetch(
      jsonResponse({ data: { user: {} } }),
      jsonResponse({ data: { user: { locale: 'en' } } }),
      jsonResponse({ data: { profile: { email: 'after-auth@example.com' } } }),
    );
    window.history.pushState({}, '', '/auth');
    const { unmount } = render(<App />);
    await submitLogin();
    expect(await screen.findByText('Ready: after-auth@example.com')).toBeTruthy();
    unmount();

    window.history.pushState({}, '', '/auth');
    setFetch(jsonResponse({ data: { user: {} } }), jsonResponse({ data: {} }), {
      rejectsWith: { detail: 'Object detail' },
    });
    render(<App />);
    await submitLogin();
    expect(await screen.findByText('Forbidden: Profile request failed.')).toBeTruthy();
  });

  it('applies profile locales and auth success locale/theme payloads', async () => {
    window.history.pushState({}, '', '/auth');
    setFetch(
      jsonResponse({ data: { user: {} } }),
      jsonResponse({ data: { user: { locale: 'en', theme: 'light' } } }),
      jsonResponse({
        data: {
          profile: { email: 'locale@example.com', locale: 'ru', theme: 'blue' },
        },
      }),
      jsonResponse({ data: { user: { locale: 'ru', theme: 'light' } } }),
      jsonResponse({
        data: {
          profile: { email: 'locale@example.com', locale: 'ru', theme: 'blue' },
        },
      }),
    );
    const { unmount } = render(<App />);
    await submitLogin();
    expect(await screen.findByText('Готово: locale@example.com')).toBeTruthy();
    unmount();

    setFetch(
      jsonResponse({
        data: { user: { locale: 'ru', theme: 'dark' } },
      }),
      jsonResponse({ data: { user: { locale: 'ru', theme: 'dark' } } }),
      jsonResponse({ data: { profile: { email: 'registered@example.com' } } }),
    );
    window.history.pushState({}, '', '/auth');
    render(<App />);
    await openEmailRegistration();
    (await screen.findByLabelText(/^(Register display name|Отображаемое имя для регистрации)$/u)).remove();
    fireEvent.change(screen.getByLabelText(/^(Register email|Email для регистрации)$/u), {
      target: { value: 'registered@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^(Continue|Продолжить)$/u }));
    fireEvent.change(screen.getByLabelText(/^(Register password|Пароль для регистрации)$/u), {
      target: { value: 'password123' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^(Register|Зарегистрироваться)$/u }));

    expect(await screen.findByText('Готово: registered@example.com')).toBeTruthy();
  });

  it('renders link-discord and the removed marketplace route through the shell', async () => {
    window.history.pushState({}, '', '/link/discord');
    const { unmount } = render(<App />);

    expect(await screen.findByText('Preferences')).toBeTruthy();
    unmount();

    window.history.pushState({}, '', '/settings/');
    const trailingSlash = render(<App />);
    expect(await screen.findByText('Preferences')).toBeTruthy();
    trailingSlash.unmount();

    window.history.pushState({}, '', '/marketplace');
    render(<App />);

    expect(await screen.findByText('This route is not available.')).toBeTruthy();
    expect(window.location.pathname).toBe('/marketplace');
  });

  it('lets the browser handle non-SPA link clicks', () => {
    render(<App />);
    const startPath = window.location.pathname;
    const preventBrowserNavigation = (event: MouseEvent) => {
      event.preventDefault();
    };
    const appendAnchor = (href: string, configure?: (anchor: HTMLAnchorElement) => void) => {
      const anchor = document.createElement('a');
      anchor.setAttribute('href', href);
      anchor.textContent = href;
      configure?.(anchor);
      document.body.append(anchor);
      return anchor;
    };

    document.addEventListener('click', preventBrowserNavigation);
    try {
      document.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 }));
      fireEvent.click(appendAnchor('/settings'), { metaKey: true });
      fireEvent.click(
        appendAnchor('/profile', (anchor) => {
          anchor.target = '_blank';
        }),
      );
      fireEvent.click(
        appendAnchor('/download', (anchor) => {
          anchor.setAttribute('download', 'report.txt');
        }),
      );
      fireEvent.click(appendAnchor('mailto:support@example.test'));
    } finally {
      document.removeEventListener('click', preventBrowserNavigation);
    }

    expect(window.location.pathname).toBe(startPath);
  });
});
