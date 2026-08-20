import { normalizeApiBaseUrl, type FrontendApiBaseUrlKey, type FrontendEnv } from './frontend-env';

/**
 * Which API a same-origin path prefix belongs to. A deployment serves the SPA
 * and every API from one origin, so the reverse proxy — nginx in front of the
 * built assets, this table in front of the Vite dev server — is the only thing
 * that knows where a path goes.
 */
export type FrontendApiUpstream = 'admin' | 'auth' | 'user';

/**
 * How a route claims a request, named after the nginx location modifier it
 * exists to reproduce:
 *
 * - `prefix` mirrors `location ^~ <path>` — every path that starts with it.
 * - `exact` mirrors `location = <path>` — that one path and nothing below it.
 * - `namespaces` mirrors the single regex `location ~ ^/(?:a|b)(?:/|$)` — each
 *   namespace both bare and with any sub-path, and nothing that merely starts
 *   with the same letters.
 */
export type FrontendDevProxyMatch = 'exact' | 'namespaces' | 'prefix';

interface FrontendDevProxyRouteBase {
  /**
   * True when the SPA owns browser routes under this route — `/auth/telegram/callback`
   * against `/auth/register`, for instance. Those routes send a document
   * request to the SPA and everything else to the API, exactly as the deployed
   * proxy does with `return 418;` into its SPA fallback; a route no browser
   * route shares always reaches the API.
   */
  readonly sharedWithSpaRoutes: boolean;
  readonly upstream: FrontendApiUpstream;
}

export interface FrontendDevProxyPathRoute extends FrontendDevProxyRouteBase {
  readonly match: 'exact' | 'prefix';
  readonly path: string;
}

export interface FrontendDevProxyNamespaceRoute extends FrontendDevProxyRouteBase {
  readonly match: 'namespaces';
  readonly namespaces: readonly string[];
}

export type FrontendDevProxyRoute = FrontendDevProxyNamespaceRoute | FrontendDevProxyPathRoute;

/**
 * The user API roots that own a whole namespace, bare path included. They are
 * the alternatives of the regex location in `docker/nginx-fullstack.conf`, in
 * the same order, because both the Vite proxy key and the nginx location this
 * list has to match are built from it verbatim.
 */
export const frontendDevProxyUserApiNamespaces: readonly string[] = [
  'advisories',
  'deliveries',
  'field-agent',
  'field-visits',
  'orders',
  'partners',
  'payments',
  'produce',
  'supplier',
];

/**
 * The same split the deployed reverse proxy applies, so a path that resolves in
 * `pnpm dev` resolves in a container too. Keep this in step with the proxy
 * locations in `docker/nginx-fullstack.conf`; a path listed in one and not the
 * other is a route that works in exactly one of the two. `frontend dev proxy
 * parity with the deployed proxy` in the sibling spec checks both directions of
 * that statement against the checked-in nginx configuration.
 */
export const frontendDevProxyRoutes: readonly FrontendDevProxyRoute[] = [
  // Better Auth owns `/api/auth`, including the Telegram OIDC callback, and no
  // browser route shares it.
  { match: 'prefix', path: '/api/auth/', sharedWithSpaRoutes: false, upstream: 'auth' },
  // The OpenAPI pages must precede the prefixes they sit under. nginx picks the
  // longest matching `location ^~` whatever the file order, but Vite takes the
  // first key that matches, and `/auth/` hands a document request back to the
  // SPA — which would answer `index.html` where a deployment renders the docs.
  { match: 'prefix', path: '/auth/docs', sharedWithSpaRoutes: false, upstream: 'auth' },
  { match: 'prefix', path: '/auth/', sharedWithSpaRoutes: true, upstream: 'auth' },
  // The SPA owns only the exact `/profile` document route. Nested `/profile/*`
  // paths are user API endpoints, so a document-shaped request must still
  // reach the API just as it does behind the production proxy.
  { match: 'prefix', path: '/profile/', sharedWithSpaRoutes: false, upstream: 'user' },
  // `/farmer/register` is a browser route, so only the bare `/farmer` endpoint
  // is API-owned — nginx spells that distinction `location = /farmer` with no
  // `/farmer/` prefix beside it.
  { match: 'exact', path: '/farmer', sharedWithSpaRoutes: false, upstream: 'user' },
  // DehqonHub keeps its API under one namespace precisely so its browser routes
  // — `/catalog`, `/cart`, `/requests` — cannot collide with it. `/marketplace`
  // itself is not a product route, and nginx proxies it so it can never become
  // one by falling through to `index.html`.
  { match: 'exact', path: '/marketplace', sharedWithSpaRoutes: false, upstream: 'user' },
  { match: 'prefix', path: '/marketplace/', sharedWithSpaRoutes: false, upstream: 'user' },
  // The remaining user API roots. One regex entry rather than eighteen paired
  // prefixes: nginx already states them as one regex location, and a bare
  // `GET /partners` is a real endpoint that a `'/partners/'` prefix key would
  // silently miss, while a `'/partners'` prefix key would swallow an unrelated
  // `/partnerships` route. The regex reproduces nginx's `(?:/|$)` boundary
  // exactly, so the two configurations can be compared literally.
  {
    match: 'namespaces',
    namespaces: frontendDevProxyUserApiNamespaces,
    sharedWithSpaRoutes: false,
    upstream: 'user',
  },
  { match: 'prefix', path: '/admin/docs', sharedWithSpaRoutes: false, upstream: 'admin' },
  { match: 'prefix', path: '/admin/', sharedWithSpaRoutes: true, upstream: 'admin' },
];

/**
 * The `server.proxy` key Vite matches this route with. Vite treats a key that
 * starts with `^` as a regular expression and every other key as a literal path
 * prefix, so the modifiers nginx expresses with `=` and `~` both become regular
 * expressions here.
 *
 * The boundary is `[/?]` rather than nginx's `/` because Vite tests the raw
 * request URL, query string included, while nginx matches a path with the query
 * string already stripped. Without `?` in the class a bare `GET /partners?x=1`
 * would miss the route it must reach.
 */
export const frontendDevProxyRouteKey = (route: FrontendDevProxyRoute): string => {
  if (route.match === 'namespaces') {
    return `^/(?:${route.namespaces.join('|')})(?:[/?]|$)`;
  }

  if (route.match === 'exact') {
    return `^${route.path}(?:\\?|$)`;
  }

  return route.path;
};

/**
 * Which route claims a request URL, resolved exactly the way Vite's proxy
 * middleware resolves it: the first key that matches wins, a `^` key as a
 * regular expression and any other key as a string prefix.
 */
export const frontendDevProxyRouteForUrl = (url: string): FrontendDevProxyRoute | undefined =>
  frontendDevProxyRoutes.find((route) => {
    const key = frontendDevProxyRouteKey(route);

    return key.startsWith('^') ? new RegExp(key, 'u').test(url) : url.startsWith(key);
  });

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
 * `/marketplace/catalog`, `/partners` and friends, all same-origin by design —
 * reach the Vite dev server, which answers every one of them with a 404 and
 * leaves the app stacking error toasts over an empty page.
 */
export const createFrontendDevProxy = (env: FrontendEnv): Record<string, FrontendDevProxyEntry> =>
  Object.fromEntries(
    frontendDevProxyRoutes.map((route) => [
      frontendDevProxyRouteKey(route),
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
