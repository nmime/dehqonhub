import { useEffect } from 'react';
import { apiRuntimeEvents, clearApiAuthRequired } from '@app/frontend-api-support';
import { isTmaApp, type TmaEnvironment } from '@app/frontend-runtime';

const defaultAuthRoute = '/auth';

const normalizePath = (path: string): string => {
  /* v8 ignore next -- browser location.pathname and sanitized auth routes are never blank; fallback keeps the helper total. */
  const normalized = path.trim() || '/';
  return normalized.endsWith('/') && normalized !== '/' ? normalized.slice(0, -1) : normalized;
};

const safeInternalPath = (value: string | null | undefined): string | null => {
  if (!value?.startsWith('/') || value.startsWith('//')) {
    return null;
  }

  const url = new URL(value, globalThis.location.origin);
  return `${url.pathname}${url.search}`;
};

const isAuthRoute = (path: string, authRoute: string): boolean => {
  const route = normalizePath(path);
  const normalizedAuthRoute = normalizePath(authRoute);
  return route === normalizedAuthRoute || route.startsWith(`${normalizedAuthRoute}/`);
};

// Endpoints whose 401 is a normal outcome for an anonymous visitor: the caller
// already degrades to a local-only result, so the runtime must not navigate.
//
// - Preference writes are opportunistic: a visitor toggling language or theme
//   keeps the choice locally.
// - The marketplace chrome probes `/marketplace/verification` on every route to
//   find out whether anybody is signed in, and renders the guest catalog when
//   the answer is no. The catalog and the request feed are public on a current
//   backend and stay listed so an older one cannot bounce a browsing visitor.
const sessionOptionalEndpoints = new Set([
  '/auth/me/preferences',
  '/auth/me/locale',
  '/marketplace/catalog',
  '/marketplace/requests',
  '/marketplace/verification',
]);

const isSessionOptionalEndpoint = (endpoint: string | null | undefined): boolean =>
  typeof endpoint === 'string' && sessionOptionalEndpoints.has(normalizePath(endpoint));

const isTelegramRoute = (path: string): boolean => {
  const route = normalizePath(path);
  return route === '/tma' || route === '/tma/auth' || route === '/telegram-mini-app' || route === '/link/telegram';
};

const tmaEnvironment = (): TmaEnvironment => {
  const env = import.meta.env as Partial<Record<keyof TmaEnvironment, string | undefined>>;
  return {
    VITE_TMA_APP: env.VITE_TMA_APP,
  };
};

const currentReturnUrl = (): string => {
  const pathname = globalThis.location.pathname;
  const search = globalThis.location.search;
  /* v8 ignore next -- pathname comes from browser location and always starts with "/", so safeInternalPath cannot reject it. */
  return safeInternalPath(`${pathname}${search}`) ?? '/';
};

const buildAuthRedirectUrl = (redirectTo: string | undefined, returnUrl: string): string => {
  const authRoute = safeInternalPath(redirectTo) ?? defaultAuthRoute;
  const url = new URL(authRoute, globalThis.location.origin);
  url.searchParams.set('returnUrl', returnUrl);
  return `${url.pathname}${url.search}`;
};

const navigateReplace = (to: string): void => {
  globalThis.history.replaceState(null, '', to);
  globalThis.dispatchEvent(new Event('popstate'));
};

export const AuthRedirectBridge = () => {
  useEffect(
    () =>
      apiRuntimeEvents.subscribe((event) => {
        if (event.type !== 'auth-required') {
          return;
        }

        const pathname = globalThis.location.pathname;
        const authRoute = safeInternalPath(event.redirectTo) ?? defaultAuthRoute;
        if (isAuthRoute(pathname, authRoute)) {
          clearApiAuthRequired();
          return;
        }

        // An absent session is an expected outcome for these reads, not a prompt
        // to sign in, and the route is deliberately not part of the check: the
        // chrome issues them wherever it is mounted, so keying on the path bounced
        // visitors off pages such as preferences. Other 401s (for example, an
        // expired session during a mutation) keep the protected-route redirect.
        if (event.reason === 'unauthenticated' && isSessionOptionalEndpoint(event.error?.endpoint)) {
          clearApiAuthRequired();
          return;
        }

        if (isTelegramRoute(pathname) || isTmaApp(tmaEnvironment())) {
          return;
        }

        clearApiAuthRequired();
        navigateReplace(buildAuthRedirectUrl(event.redirectTo, currentReturnUrl()));
      }),
    [],
  );

  return null;
};
