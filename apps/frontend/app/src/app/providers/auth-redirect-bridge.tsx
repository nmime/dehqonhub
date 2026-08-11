import { useEffect } from 'react';
import { apiRuntimeEvents, clearApiAuthRequired } from '@app/frontend-api-support';
import { isTmaApp, type TmaEnvironment } from '@app/frontend-runtime';
import { isMarketplaceRoute } from '../router/user-navigation';

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

const isTelegramRoute = (path: string): boolean => {
  const route = normalizePath(path);
  return route === '/tma' || route === '/tma/auth' || route === '/telegram-mini-app' || route === '/link/telegram';
};

const isAnonymousPublicRoute = (path: string): boolean => normalizePath(path) === '/problems';

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

        // The RFC 9457 registry is public documentation. The application-wide
        // session probe may report an anonymous visitor, but that must not turn
        // `/problems` into an authenticated route after its initial render.
        if (
          isAnonymousPublicRoute(pathname) &&
          event.reason === 'unauthenticated' &&
          event.error?.endpoint === '/auth/me'
        ) {
          clearApiAuthRequired();
          return;
        }

        // Marketplace entry routes intentionally render their own signed-out
        // state when the initial tenant catalog rejects an absent session.
        // Other 401s (for example, an expired session during a mutation) keep
        // the normal protected-route redirect behavior.
        if (
          isMarketplaceRoute(pathname) &&
          event.reason === 'unauthenticated' &&
          event.error?.endpoint === '/marketplace/catalog'
        ) {
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
