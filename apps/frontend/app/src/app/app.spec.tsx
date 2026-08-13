// @requirements REQ-FRONTEND-SHELL-004 REQ-AGRITECH-ROUTING-015 REQ-AGRITECH-MARKETPLACE-016
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
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

// `index` picks between duplicate controls: the site header carries its own
// switchers, so pages that also offer one in a preferences card match twice.
function chooseSelectOption(label: string | RegExp, option: string, index = 0) {
  const trigger = screen.getAllByRole('combobox', { name: label })[index]!;

  installRadixPointerMocks();
  fireEvent.pointerDown(trigger, {
    button: 0,
    ctrlKey: false,
    pointerType: 'mouse',
  });

  const optionElement = document.querySelector<HTMLElement>(`[role="option"][data-value="${option}"]`);

  expect(optionElement).toBeTruthy();
  fireEvent.click(optionElement as HTMLElement);
}

// The site header carries the language control as a dropdown menu (the mobile
// row repeats it), so flows that are not on the preferences page switch locale
// through the menu rather than a select.
function chooseLanguageFromHeader(triggerName: string, optionName: string) {
  installRadixPointerMocks();
  fireEvent.pointerDown(screen.getAllByRole('button', { name: triggerName })[0]!, {
    button: 0,
    ctrlKey: false,
    pointerType: 'mouse',
  });
  fireEvent.click(screen.getByRole('menuitem', { name: optionName }));
}

type FetchReply = Response | { rejectsWith: Error };

/**
 * One listing in the shape the API publishes, standing in for the demo
 * assortment the catalog endpoint answers with while a tenant has nothing of its
 * own. The frontend no longer bundles a dataset, so a rendered product name is
 * proof the payload made it through the client and onto the page.
 */
const catalogListing = {
  category: 'equipment',
  createdAt: '2026-03-02T08:00:00.000Z',
  description: 'Traktor, 2023-yil, 80 ot kuchi.',
  id: 'dec0de00-0000-4000-8000-000000000012',
  images: [],
  name: 'Tractor TTZ-80, 2023',
  nameRu: 'Трактор ТТЗ-80, 2023',
  nameUz: 'Traktor TTZ-80, 2023',
  priceUzs: 185_000_000,
  region: "Farg'ona viloyati",
  status: 'active',
  stockQuantity: 2,
  supplierId: 'demo-supplier-dehqon-bozori-kooperativi',
  supplierName: 'Dehqon Bozori Kooperativi',
  unit: 'dona',
  updatedAt: '2026-07-28T08:00:00.000Z',
};

/**
 * The site chrome wraps every route, so its three marketplace reads fire on the
 * auth and account pages too. Answering them outside each test's queue keeps
 * these tests about the flow under test instead of the chrome's own requests.
 * Two are public; verification is the session probe, and its 401 is how the
 * chrome learns that nobody is signed in.
 */
const marketplaceChromeResponse = (pathname: string): Response | undefined => {
  if (pathname === '/marketplace/catalog') {
    return jsonResponse({ data: { demo: true, items: [catalogListing] } });
  }
  if (pathname === '/marketplace/requests') {
    return jsonResponse({ data: { items: [] } });
  }
  return pathname === '/marketplace/verification' ? jsonResponse({}, false, 401) : undefined;
};

const setFetch = (...responses: FetchReply[]) => {
  let initialSessionChecked = false;
  const queue = [...responses];
  const fetchMock = vi.fn((input: RequestInfo | URL) => {
    const pathname = new URL(input instanceof Request ? input.url : String(input), window.location.origin).pathname;
    if (pathname === '/auth/me' && !initialSessionChecked) {
      initialSessionChecked = true;
      return Promise.resolve(jsonResponse({}, false, 401));
    }
    const chrome = marketplaceChromeResponse(pathname);
    if (chrome) {
      return Promise.resolve(chrome);
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
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL) => {
      const pathname = new URL(input instanceof Request ? input.url : String(input), window.location.origin).pathname;
      const chrome = marketplaceChromeResponse(pathname);
      if (chrome) {
        return Promise.resolve(chrome);
      }
      if (pathname === '/auth/me') {
        return Promise.resolve(jsonResponse({}, false, 401));
      }
      return Promise.reject(new Error(`Unexpected fetch: ${pathname}`));
    }),
  );
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

// Waits for the async router to render the site chrome (its search field is
// present on every route) so the outlet content is available to query.
const awaitShell = () => screen.findByRole('search');

/**
 * Signs in through the form. Succeeding now means leaving it: a visitor with no
 * return url lands on the signed-in hub instead of staring at the card they just
 * submitted. So a test that watches the profile state opens the form with
 * `?returnUrl=/profile`, which is where that card lives once signed in.
 */
const submitLogin = async (email = 'user@example.com') => {
  await awaitShell();
  fireEvent.change(await screen.findByLabelText('Login email'), {
    target: { value: email },
  });
  fireEvent.change(screen.getByLabelText('Login password'), {
    target: { value: 'password123' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Login' }));
};

/**
 * Registration is a three-step flow, so a test that registers walks it: leave the
 * sign-in card, choose the email method, say who you are, then set a password.
 * The names are matched per locale because these tests switch language mid-flow.
 */
const submitRegister = async ({ displayName, email }: { displayName?: string; email: string }) => {
  await awaitShell();
  fireEvent.click(
    await screen.findByRole('button', {
      name: /^(Create an account|Создать аккаунт|Hisob yaratish)$/u,
    }),
  );
  // The method tiles carry their explanation inside the button, so the accessible
  // name starts with the tile's own title rather than matching it exactly.
  fireEvent.click(screen.getByRole('button', { name: /^(Email and password|Email и пароль|Email va parol)/u }));
  if (displayName !== undefined) {
    fireEvent.change(screen.getByLabelText(/^(Register display name|Отображаемое имя для регистрации)$/u), {
      target: { value: displayName },
    });
  }
  fireEvent.change(screen.getByLabelText(/^(Register email|Email для регистрации|Email de registro)$/u), {
    target: { value: email },
  });
  fireEvent.click(screen.getByRole('button', { name: /^(Continue|Продолжить|Davom etish)$/u }));
  fireEvent.change(screen.getByLabelText(/^(Register password|Пароль для регистрации|Contraseña de registro)$/u), {
    target: { value: 'password123' },
  });
  fireEvent.click(screen.getByRole('button', { name: /^(Register|Зарегистрироваться|Registrarse)$/u }));
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

  it('renders the demo DehqonHub catalog at the repository root without duplicate product chrome', async () => {
    installSignedOutMarketplaceFetch();
    const { container } = render(<App />);
    // The catalog read needs no session, so a visitor lands on listings served by
    // the API rather than on a sign-in wall.
    await screen.findByRole('heading', { name: 'Test accounts for review' });
    const html = container.innerHTML;

    expect(container.querySelectorAll('.dh-marketplace')).toHaveLength(1);
    expect(html).toContain('Dehqon');
    expect(html).toContain('Tractor TTZ-80, 2023');
    expect(html).not.toContain('xr-mini-app-bottom-bar');
    expect(html).not.toContain('design v3');
    expect(html).not.toContain('route readiness');
    expect(html).not.toContain('3003');

    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() => {
      expect(window.location.pathname).toBe('/auth');
    });
    expect(new URLSearchParams(window.location.search).get('returnUrl')).toBe('/');
  });

  it('offers the demo credentials and keeps favorites in local storage without a session', async () => {
    installSignedOutMarketplaceFetch();
    render(<App />);
    await screen.findByRole('heading', { name: 'Test accounts for review' });

    expect(screen.getByText('dehqon@demo.dehqonhub.uz')).toBeTruthy();
    expect(screen.getByText('DemoDehqon2026')).toBeTruthy();

    // Favouriting without a session is a local write: no request, and the choice
    // survives in local storage for the next visit.
    fireEvent.click(screen.getAllByRole('button', { name: 'Add product to favorites' })[0]!);
    await waitFor(() => {
      expect(window.localStorage.getItem('dehqonhub.guest.favorites')).toContain(catalogListing.id);
    });
  });

  it('keeps marketplace loading and catalog failure states inside DehqonHub chrome', async () => {
    // The catalog is the API's to serve, so a failed read is a real failure with
    // nothing to show. It has to say so inside the chrome and keep the retry
    // within reach, rather than leave a blank page behind the header.
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
    expect(
      await screen.findByText(
        'The catalog is unreachable right now. Try again in a moment, or sign in with a test account below.',
      ),
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy();
    expect(failed.container.innerHTML).not.toContain('xr-mini-app-bottom-bar');
  });

  // One chrome for the whole site: moving between the marketplace and the
  // account pages keeps the same header, footer and mobile navigation, and the
  // navigation stays client-side.
  it('moves between the account pages and the marketplace inside one chrome', async () => {
    window.history.replaceState({}, '', '/auth');
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(jsonResponse({}, false, 401))),
    );
    render(<App />);
    await awaitShell();

    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    await screen.findByText('Preferences');
    expect(window.location.pathname).toBe('/settings');
    expect(await awaitShell()).toBeTruthy();

    fireEvent.click(screen.getAllByRole('button', { name: 'Home' })[0]!);

    expect(await screen.findByRole('heading', { name: 'Test accounts for review' })).toBeTruthy();
    expect(window.location.pathname).toBe('/');
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
    const fetchMock = vi.fn(() => Promise.resolve(jsonResponse({}, false, 401)));
    vi.stubGlobal('fetch', fetchMock);

    render(<App />);

    await screen.findByText('Preferences');
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });
    // The chrome reads the marketplace on every route, and here every read is
    // rejected. What must not follow is a navigation: this is the reported
    // "throws you onto another page" flow, and the bridge clears the flag for
    // those session-optional endpoints instead of redirecting.
    expect(window.location.pathname).toBe('/settings');
    expect(apiRuntimeEvents.getState().authRequired).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: 'Profile' }));

    // A protected page is the opposite case: its 401 has to send the guest to
    // the sign-in form and remember where they were going.
    await waitFor(() => {
      expect(window.location.pathname).toBe('/auth');
    });
    expect(new URLSearchParams(window.location.search).get('returnUrl')).toBe('/profile');
    expect(screen.queryByText('Ready: unknown')).toBeNull();
  });

  it('renders every preserved site route inside the DehqonHub chrome', async () => {
    installSignedOutMarketplaceFetch();
    const routes = ['/auth', '/auth/discord/callback', '/profile', '/settings', '/link/telegram', '/link/discord'];

    for (const route of routes) {
      window.history.pushState({}, '', route);
      const { container, unmount } = render(<App />);
      // eslint-disable-next-line no-await-in-loop -- routes render sequentially; each is unmounted before the next.
      await awaitShell();
      const html = container.innerHTML;

      expect(html).toContain('<main');
      // One chrome, and it is the marketplace's: header, footer and the single
      // mobile navigation bar, with no second generic shell inside it.
      expect(container.querySelectorAll('.dh-header')).toHaveLength(1);
      expect(container.querySelectorAll('.dh-mobile-nav')).toHaveLength(1);
      expect(html).not.toContain('xr-mini-app-bottom-bar');
      expect(html).not.toContain('data-design-marker');
      expect(html).not.toContain('route readiness');
      expect(html).not.toContain('nonblank smoke');
      unmount();
    }
  });

  // Telegram draws its own header and back control around the webview, so the
  // mini-app routes are the one place the site chrome stays out of the way.
  it('renders Telegram mini-app routes without the site chrome', async () => {
    installSignedOutMarketplaceFetch();

    for (const route of ['/tma', '/tma/auth', '/telegram-mini-app']) {
      window.history.pushState({}, '', route);
      const { container, unmount } = render(<App />);
      // eslint-disable-next-line no-await-in-loop -- routes render sequentially; each is unmounted before the next.
      const frame = await screen.findByText('Open this page inside Telegram to continue.');

      expect(frame).toBeTruthy();
      expect(container.querySelector('.dh-telegram-frame')).toBeTruthy();
      expect(container.querySelector('.dh-header')).toBeNull();
      expect(container.querySelector('.dh-mobile-nav')).toBeNull();
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
    // Guest favourites and carts read local storage; a throwing accessor must
    // degrade to an empty list rather than take the page down.
    await screen.findByRole('heading', { name: 'Test accounts for review' });
    expect(container.innerHTML).toContain('Dehqon');
  });

  it('loads a profile after login establishes a cookie session', async () => {
    window.history.pushState({}, '', '/auth?returnUrl=/profile');
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
    window.history.pushState({}, '', '/auth?returnUrl=/profile');
    setFetch(jsonResponse({ data: { user: {} } }), jsonResponse({ data: {} }), jsonResponse({}, false, 403));
    const { unmount } = render(<App />);
    await submitLogin();
    expect(await screen.findByText('Forbidden: Request failed with 403.')).toBeTruthy();
    unmount();

    window.history.pushState({}, '', '/auth?returnUrl=/profile');
    setFetch(jsonResponse({ data: { user: {} } }), jsonResponse({ data: {} }), {
      rejectsWith: 'network failed',
    });
    render(<App />);
    await submitLogin();
    expect(await screen.findByText('Forbidden: Profile request failed.')).toBeTruthy();
  });

  it('handles incomplete profile payloads and non-error auth rejections', async () => {
    window.history.pushState({}, '', '/auth?returnUrl=/profile');
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
    window.history.pushState({}, '', '/auth?returnUrl=/profile');
    window.localStorage.setItem('boilerplate.locale', 'en');
    vi.stubEnv('VITE_USER_API_BASE_URL', 'https://user-api/');
    // Signing in navigates and the language switch to Russian re-keys both reads,
    // so the session and the profile are each fetched twice. Every reply carries
    // the same session and principal, which keeps the test about the language
    // each request asked in rather than about the order they came back.
    const signedIn = { principal: { subject: 'profile-subject' }, user: { locale: 'ru' } };
    const fetchMock = setFetch(
      jsonResponse({ data: { user: {} } }),
      jsonResponse({ data: signedIn }),
      jsonResponse({ data: signedIn }),
      jsonResponse({ data: signedIn }),
      jsonResponse({ data: signedIn }),
    );

    render(<App />);
    await submitLogin();

    expect(await screen.findByText('Готово: profile-subject')).toBeTruthy();
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
    window.history.pushState({}, '', '/auth?returnUrl=/profile');
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

    chooseLanguageFromHeader('Language', 'Russian');

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

  it('keeps the shell on the light palette without exposing a theme control', async () => {
    // DehqonHub ships one light palette. The shell used to resolve `system`,
    // which painted `data-theme="dark"` on dark-mode machines, and the theme
    // select wrote to `/auth/me/preferences` — a 401 for a visitor without a
    // session, which the runtime answered by navigating to the sign-in form.
    window.history.pushState({}, '', '/settings');
    setFetch(
      jsonResponse({}, false, 401),
      jsonResponse({}, false, 401),
      jsonResponse({}, false, 401),
      jsonResponse({}, false, 401),
    );

    render(<App />);
    await screen.findByText('Preferences');

    expect(document.documentElement.dataset['theme']).toBe('light');
    expect(document.documentElement.dataset['themePreference']).toBe('light');
    expect(screen.queryByRole('combobox', { name: 'Theme' })).toBeNull();
  });

  it('keeps an anonymous preference change on the current page', async () => {
    window.history.pushState({}, '', '/settings');
    const fetchMock = setFetch(
      jsonResponse({}, false, 401),
      jsonResponse({}, false, 401),
      jsonResponse({}, false, 401),
      jsonResponse({}, false, 401),
      jsonResponse({}, false, 401),
      jsonResponse({}, false, 401),
    );

    render(<App />);
    await screen.findByText('Preferences');
    chooseSelectOption('Language', 'ru');

    // The rejected preference write must not move the visitor: this is the
    // reported "randomly throws you onto another page" flow.
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
    await waitFor(() => {
      expect(window.location.pathname).toBe('/settings');
    });
    expect(window.location.search).toBe('');
  });

  it('logs in then loads the protected profile', async () => {
    vi.stubEnv('VITE_AUTH_API_BASE_URL', 'https://auth-api/');
    setFetch(
      jsonResponse({ data: { user: {} } }),
      jsonResponse({ data: { user: { locale: 'en' } } }),
      jsonResponse({ data: { principal: { subject: 'profile-subject' } } }),
    );
    window.history.pushState({}, '', '/auth?returnUrl=/profile');
    render(<App />);

    fireEvent.change(await screen.findByLabelText('Login email'), {
      target: { value: 'user@example.com' },
    });
    fireEvent.change(screen.getByLabelText('Login password'), {
      target: { value: 'password123' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Login' }));

    expect(await screen.findByText('Ready: profile-subject')).toBeTruthy();
  });

  it('handles register failures and empty success tokens', async () => {
    setFetch(jsonResponse({}, false, 409));
    window.history.pushState({}, '', '/auth');
    const { unmount } = render(<App />);

    await submitRegister({
      displayName: 'Registered User',
      email: 'new@example.com',
    });
    expect(await screen.findByText('Forbidden: Request failed with 409.')).toBeTruthy();
    unmount();

    setFetch(jsonResponse({ data: {} }));
    window.history.pushState({}, '', '/auth');
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: 'Login' }));
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
    window.history.pushState({}, '', '/auth?returnUrl=/profile');
    const { unmount } = render(<App />);
    await submitLogin();
    expect(await screen.findByText('Ready: after-auth@example.com')).toBeTruthy();
    unmount();

    window.history.pushState({}, '', '/auth?returnUrl=/profile');
    setFetch(jsonResponse({ data: { user: {} } }), jsonResponse({ data: {} }), {
      rejectsWith: { detail: 'Object detail' },
    });
    render(<App />);
    await submitLogin();
    expect(await screen.findByText('Forbidden: Profile request failed.')).toBeTruthy();
  });

  it('applies profile locales and auth success locale/theme payloads', async () => {
    window.history.pushState({}, '', '/auth?returnUrl=/profile');
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
    window.history.pushState({}, '', '/auth?returnUrl=/profile');
    render(<App />);
    // No display name: the request must still carry the address and password, so
    // the optional field stays empty rather than being removed from the step.
    await submitRegister({ email: 'registered@example.com' });

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
