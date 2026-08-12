import { normalizeApiBaseUrl, type FrontendApiBaseUrlKey, type FrontendEnv } from './frontend-env';

/**
 * Which API a same-origin path prefix belongs to. A deployment serves the SPA
 * and every API from one origin, so the reverse proxy — nginx in front of the
 * built assets, this table in front of the Vite dev server — is the only thing
 * that knows where a path goes.
 */
export type FrontendApiUpstream = 'admin' | 'auth' | 'user';

export interface FrontendDevProxyRoute {
  /** Matched as a path prefix, the same way nginx matches `location ^~`. */
  readonly prefix: string;
  /**
   * True when the SPA owns browser routes under this prefix — `/auth/telegram/callback`
   * against `/auth/register`, for instance. Those prefixes route a document
   * request to the SPA and everything else to the API, exactly as the deployed
   * proxy does; a prefix that no browser route shares always reaches the API.
   */
  readonly sharedWithSpaRoutes: boolean;
  readonly upstream: FrontendApiUpstream;
}

/**
 * The same split the deployed reverse proxy applies, so a path that resolves in
 * `pnpm dev` resolves in a container too. Keep this in step with the proxy
 * locations in `docker/nginx-fullstack.conf`; a prefix listed in one and not the
 * other is a route that works in exactly one of the two.
 */
export const frontendDevProxyRoutes: readonly FrontendDevProxyRoute[] = [
  // Better Auth owns `/api/auth`, including the Telegram OIDC callback, and no
  // browser route shares it.
  { prefix: '/api/auth/', sharedWithSpaRoutes: false, upstream: 'auth' },
  { prefix: '/auth/', sharedWithSpaRoutes: true, upstream: 'auth' },
  { prefix: '/profile/', sharedWithSpaRoutes: true, upstream: 'user' },
  // DehqonHub keeps its API under one namespace precisely so its browser routes
  // — `/catalog`, `/cart`, `/requests` — cannot collide with it.
  { prefix: '/marketplace/', sharedWithSpaRoutes: false, upstream: 'user' },
  { prefix: '/admin/', sharedWithSpaRoutes: true, upstream: 'admin' },
];

const upstreamEnvKey: Readonly<Record<FrontendApiUpstream, FrontendApiBaseUrlKey>> = {
  admin: 'VITE_ADMIN_API_BASE_URL',
  auth: 'VITE_AUTH_API_BASE_URL',
  user: 'VITE_USER_API_BASE_URL',
};

/** Where `pnpm dev` puts each API when nothing overrides it. */
export const defaultFrontendDevProxyTargets: Readonly<Record<FrontendApiUpstream, string>> = {
  admin: 'http://localhost:3001',
  auth: 'http://localhost:3003',
  user: 'http://localhost:3002',
};

export const resolveFrontendDevProxyTarget = (env: FrontendEnv, upstream: FrontendApiUpstream): string => {
  const configured = normalizeApiBaseUrl(String(env[upstreamEnvKey[upstream]] ?? ''));

  return configured || defaultFrontendDevProxyTargets[upstream];
};

export interface FrontendDevProxyRequest {
  readonly headers?: { readonly accept?: string | string[] };
  readonly method?: string;
}

const acceptHeaderValue = (request: FrontendDevProxyRequest): string => {
  const accept = request.headers?.accept;

  return Array.isArray(accept) ? accept.join(',') : (accept ?? '');
};

/**
 * A document request: the method and `Accept` pair a browser uses to navigate.
 * The deployed proxy tells SPA routes from API paths the same way, because a
 * shared prefix cannot be split any other way.
 */
export const isSpaNavigationRequest = (request: FrontendDevProxyRequest): boolean => {
  const method = (request.method ?? 'GET').toUpperCase();
  if (method !== 'GET' && method !== 'HEAD') {
    return false;
  }

  return acceptHeaderValue(request).toLowerCase().includes('text/html');
};

export interface FrontendDevProxyEntry {
  readonly bypass?: (request: FrontendDevProxyRequest) => string | undefined;
  readonly changeOrigin: boolean;
  readonly target: string;
}

/**
 * The dev-server proxy table. Without it the API paths the client builds —
 * `/marketplace/catalog` and friends, all same-origin by design — reach the Vite
 * dev server, which answers every one of them with a 404 and leaves the app
 * stacking error toasts over an empty page.
 */
export const createFrontendDevProxy = (env: FrontendEnv): Record<string, FrontendDevProxyEntry> =>
  Object.fromEntries(
    frontendDevProxyRoutes.map((route) => [
      route.prefix,
      {
        changeOrigin: false,
        target: resolveFrontendDevProxyTarget(env, route.upstream),
        ...(route.sharedWithSpaRoutes
          ? {
              bypass: (request: FrontendDevProxyRequest) =>
                isSpaNavigationRequest(request) ? '/index.html' : undefined,
            }
          : {}),
      },
    ]),
  );
