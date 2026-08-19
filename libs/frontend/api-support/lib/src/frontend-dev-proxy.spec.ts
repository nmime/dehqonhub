// @requirements REQ-FRONTEND-ERROR-005
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  createFrontendDevProxy,
  defaultFrontendDevProxyTargets,
  frontendDevProxyRouteForUrl,
  frontendDevProxyRouteKey,
  frontendDevProxyRoutes,
  frontendDevProxyUserApiNamespaces,
  isSpaNavigationRequest,
  resolveFrontendDevProxyTarget,
  type FrontendDevProxyRoute,
} from './frontend-dev-proxy';

const workspaceRoot = join(import.meta.dirname, '../../../../..');

const userApiNamespaceKey =
  '^/(?:advisories|deliveries|field-agent|field-visits|orders|partners|payments|produce|supplier)(?:[/?]|$)';

describe('frontend dev proxy targets', () => {
  it('sends each API prefix to the port pnpm dev serves it on', () => {
    const proxy = createFrontendDevProxy({});

    expect(proxy['/marketplace/']?.target).toBe('http://localhost:3002');
    expect(proxy['/profile/']?.target).toBe('http://localhost:3002');
    expect(proxy['^/farmer(?:\\?|$)']?.target).toBe('http://localhost:3002');
    expect(proxy['^/marketplace(?:\\?|$)']?.target).toBe('http://localhost:3002');
    expect(proxy[userApiNamespaceKey]?.target).toBe('http://localhost:3002');
    expect(proxy['/auth/']?.target).toBe('http://localhost:3003');
    expect(proxy['/api/auth/']?.target).toBe('http://localhost:3003');
    expect(proxy['/admin/']?.target).toBe('http://localhost:3001');
  });

  it('prefers a configured origin over the local default, trailing slash and all', () => {
    const env = { VITE_USER_API_BASE_URL: 'https://api.example.test/ ' };

    expect(resolveFrontendDevProxyTarget(env, 'user')).toBe('https://api.example.test');
    expect(createFrontendDevProxy(env)['/marketplace/']?.target).toBe('https://api.example.test');
    expect(createFrontendDevProxy(env)[userApiNamespaceKey]?.target).toBe('https://api.example.test');
  });

  it('falls back to the default when the configured value is blank or absent', () => {
    expect(resolveFrontendDevProxyTarget({ VITE_AUTH_API_BASE_URL: '   ' }, 'auth')).toBe(
      defaultFrontendDevProxyTargets.auth,
    );
    expect(resolveFrontendDevProxyTarget({}, 'admin')).toBe(defaultFrontendDevProxyTargets.admin);
    // A same-origin build blanks the keys by setting them to a boolean-ish value
    // rather than deleting them; that must not become the proxy target.
    expect(resolveFrontendDevProxyTarget({ VITE_USER_API_BASE_URL: undefined }, 'user')).toBe(
      defaultFrontendDevProxyTargets.user,
    );
  });

  it('keeps the browser origin on proxied requests so session cookies survive', () => {
    const proxy = createFrontendDevProxy({});

    expect(Object.keys(proxy)).toHaveLength(frontendDevProxyRoutes.length);
    for (const entry of Object.values(proxy)) {
      expect(entry.changeOrigin).toBe(false);
    }
  });
});

describe('frontend dev proxy route matching', () => {
  it('builds the proxy key Vite matches for each location modifier', () => {
    expect(
      frontendDevProxyRouteKey({
        match: 'prefix',
        path: '/marketplace/',
        sharedWithSpaRoutes: false,
        upstream: 'user',
      }),
    ).toBe('/marketplace/');
    expect(
      frontendDevProxyRouteKey({ match: 'exact', path: '/farmer', sharedWithSpaRoutes: false, upstream: 'user' }),
    ).toBe('^/farmer(?:\\?|$)');
    expect(
      frontendDevProxyRouteKey({
        match: 'namespaces',
        namespaces: ['orders', 'partners'],
        sharedWithSpaRoutes: false,
        upstream: 'user',
      }),
    ).toBe('^/(?:orders|partners)(?:[/?]|$)');
  });

  it('reaches a namespace root bare, nested and with a query string', () => {
    // The regression this whole route existed to prevent: the client calls
    // `GET /partners` with no trailing slash, so a `'/partners/'` prefix key
    // would leave it on the dev server and answer the SPA document instead.
    for (const namespace of frontendDevProxyUserApiNamespaces) {
      expect(frontendDevProxyRouteForUrl(`/${namespace}`)?.upstream, namespace).toBe('user');
      expect(frontendDevProxyRouteForUrl(`/${namespace}/nested/resource`)?.upstream, namespace).toBe('user');
      expect(frontendDevProxyRouteForUrl(`/${namespace}?page=2`)?.upstream, namespace).toBe('user');
    }
  });

  it('never swallows a path that only starts with the same letters', () => {
    expect(frontendDevProxyRouteForUrl('/partnerships')).toBeUndefined();
    expect(frontendDevProxyRouteForUrl('/produce-guide')).toBeUndefined();
    expect(frontendDevProxyRouteForUrl('/ordersummary')).toBeUndefined();
    // `/farmer` is an API endpoint while `/farmer/register` is a browser route,
    // which is why nginx gives it an exact location and no prefix beside it.
    expect(frontendDevProxyRouteForUrl('/farmer')?.upstream).toBe('user');
    expect(frontendDevProxyRouteForUrl('/farmer/register')).toBeUndefined();
    expect(frontendDevProxyRouteForUrl('/marketplace')?.upstream).toBe('user');
    expect(frontendDevProxyRouteForUrl('/marketplace/catalog')?.upstream).toBe('user');
  });

  it('resolves the OpenAPI pages ahead of the prefixes that share the SPA', () => {
    // Vite takes the first matching key, so ordering is the only thing keeping
    // a document request for the docs off the SPA fallback.
    expect(frontendDevProxyRouteForUrl('/auth/docs')?.sharedWithSpaRoutes).toBe(false);
    expect(frontendDevProxyRouteForUrl('/auth/docs/json')?.sharedWithSpaRoutes).toBe(false);
    expect(frontendDevProxyRouteForUrl('/auth/login')?.sharedWithSpaRoutes).toBe(true);
    expect(frontendDevProxyRouteForUrl('/admin/docs')?.sharedWithSpaRoutes).toBe(false);
    expect(frontendDevProxyRouteForUrl('/admin/partners')?.sharedWithSpaRoutes).toBe(true);
  });

  it('leaves every SPA document route to the SPA', () => {
    // The browser routes registered in
    // `apps/frontend/app/src/app/router/user-route-tree.tsx`. None may be
    // claimed by the proxy table, except the two prefixes the deployed proxy
    // also shares and hands back to the SPA on a document request.
    const spaOwnedRoutes = [
      '/',
      '/account',
      '/account/orders',
      '/cart',
      '/catalog',
      '/contracts/abc',
      '/dashboard',
      '/farmer/register',
      '/favorites',
      '/link/discord',
      '/link/telegram',
      '/operations',
      '/problems',
      '/products/abc',
      '/profile',
      '/requests',
      '/requests/incoming',
      '/requests/new',
      '/sellers/abc',
      '/settings',
      '/telegram-mini-app',
      '/tma',
      '/tma/auth',
      '/verification',
    ];

    for (const path of spaOwnedRoutes) {
      expect(frontendDevProxyRouteForUrl(path), path).toBeUndefined();
    }

    // `/auth` itself is a document route; only `/auth/*` is shared, and a
    // navigation there bypasses back to the SPA.
    expect(frontendDevProxyRouteForUrl('/auth')).toBeUndefined();
    for (const shared of ['/auth/telegram/callback', '/auth/discord/callback']) {
      expect(frontendDevProxyRouteForUrl(shared)?.sharedWithSpaRoutes, shared).toBe(true);
    }
  });
});

describe('frontend dev proxy navigation split', () => {
  it('treats a document request as SPA navigation', () => {
    expect(isSpaNavigationRequest({ headers: { accept: 'text/html,application/xhtml+xml' }, method: 'GET' })).toBe(
      true,
    );
    expect(isSpaNavigationRequest({ headers: { accept: 'TEXT/HTML' }, method: 'head' })).toBe(true);
    // Node hands a repeated header through as a list.
    expect(isSpaNavigationRequest({ headers: { accept: ['application/json', 'text/html'] } })).toBe(true);
  });

  it('treats an API call as an API call', () => {
    expect(isSpaNavigationRequest({ headers: { accept: 'application/json' }, method: 'GET' })).toBe(false);
    expect(isSpaNavigationRequest({ headers: { accept: 'text/html' }, method: 'POST' })).toBe(false);
    expect(isSpaNavigationRequest({ method: 'GET' })).toBe(false);
    expect(isSpaNavigationRequest({ headers: {} })).toBe(false);
    expect(isSpaNavigationRequest({})).toBe(false);
  });

  it('hands a navigation on a shared prefix back to the SPA and proxies everything else', () => {
    const proxy = createFrontendDevProxy({});
    const navigation = { headers: { accept: 'text/html' }, method: 'GET' };
    const apiCall = { headers: { accept: 'application/json' }, method: 'POST' };

    // `/auth/telegram/callback` is a browser route; `/auth/register` is an API path.
    expect(proxy['/auth/']?.bypass?.(navigation)).toBe('/index.html');
    expect(proxy['/auth/']?.bypass?.(apiCall)).toBeUndefined();
    expect(proxy['/profile/']?.bypass).toBeUndefined();
    expect(proxy['/admin/']?.bypass?.(navigation)).toBe('/index.html');
  });

  it('never hands a marketplace, business, docs or Better Auth path to the SPA', () => {
    const proxy = createFrontendDevProxy({});

    expect(proxy['/auth/docs']?.bypass).toBeUndefined();
    expect(proxy['/admin/docs']?.bypass).toBeUndefined();
    expect(proxy['/marketplace/']?.bypass).toBeUndefined();
    expect(proxy['^/marketplace(?:\\?|$)']?.bypass).toBeUndefined();
    expect(proxy['^/farmer(?:\\?|$)']?.bypass).toBeUndefined();
    expect(proxy[userApiNamespaceKey]?.bypass).toBeUndefined();
    expect(proxy['/api/auth/']?.bypass).toBeUndefined();
  });
});

interface NginxProxyLocation {
  readonly body: string;
  readonly header: string;
}

/**
 * `location ~ ^/(?:advisories|…)(?:/|$)` — the regex form nginx uses for a
 * namespace that must resolve both bare and with a sub-path.
 */
const namespaceLocationPattern = /^~ \^\/\(\?:([a-z|-]+)\)\(\?:\/\|\$\)$/u;
const upstreamServicePattern = /proxy_pass http:\/\/(admin|auth|user)-app-api:80;/u;

/** Every nginx `location` block that forwards to an API, header and body. */
const nginxProxyLocations = (nginx: string): readonly NginxProxyLocation[] =>
  nginx
    .split(/^ {2}location /mu)
    .slice(1)
    .map((chunk) => ({
      body: chunk.slice(0, chunk.indexOf('\n  }')),
      header: chunk.slice(0, chunk.indexOf(' {')),
    }))
    .filter(({ body }) => body.includes('proxy_pass http://'));

/** The nginx location header a dev proxy route claims to mirror. */
const nginxLocationHeader = (route: FrontendDevProxyRoute): string => {
  if (route.match === 'namespaces') {
    return `~ ^/(?:${route.namespaces.join('|')})(?:/|$)`;
  }

  return `${route.match === 'exact' ? '=' : '^~'} ${route.path}`;
};

/** Request paths that provably reach an API through the given nginx location. */
const requestPathsForLocation = (header: string): readonly string[] => {
  if (header.startsWith('= ')) {
    return [header.slice(2)];
  }

  if (header.startsWith('^~ ')) {
    const prefix = header.slice(3);

    return [prefix, `${prefix}nested/resource`];
  }

  const namespaces = namespaceLocationPattern.exec(header)?.[1]?.split('|');
  expect(namespaces, `unrecognized nginx proxy location \`location ${header}\``).toBeDefined();

  return (namespaces ?? []).flatMap((namespace) => [
    `/${namespace}`,
    `/${namespace}/nested/resource`,
    `/${namespace}?page=2`,
  ]);
};

describe('frontend dev proxy parity with the deployed proxy', () => {
  const nginx = readFileSync(join(workspaceRoot, 'docker/nginx-fullstack.conf'), 'utf8');

  it('routes exactly the locations nginx routes, to the same service', () => {
    const serviceByUpstream = {
      admin: 'admin-app-api',
      auth: 'auth-app-api',
      user: 'user-app-api',
    } as const;

    for (const route of frontendDevProxyRoutes) {
      const header = nginxLocationHeader(route);
      const location = nginx.slice(nginx.indexOf(`location ${header} {`));
      expect(location.startsWith(`location ${header} {`), `${header} is not proxied by nginx`).toBe(true);
      const block = location.slice(0, location.indexOf('\n  }'));
      expect(block, header).toContain(`proxy_pass http://${serviceByUpstream[route.upstream]}:80;`);
      // nginx returns 418 into the SPA fallback for document requests; a
      // location that does that is exactly a location the SPA shares.
      expect(block.includes('return 418;'), `${header} navigation handling`).toBe(route.sharedWithSpaRoutes);
    }
  });

  it('routes every path the deployed proxy hands to an API', () => {
    // The direction the repository was missing. The forward check above only
    // proves the dev proxy's own entries exist in nginx; a namespace nginx
    // routes and this table never heard of stays invisible to it. Here nginx is
    // the source of truth: every location it proxies is enumerated, turned into
    // concrete request paths, and resolved through the dev proxy's own matcher.
    const locations = nginxProxyLocations(nginx);
    expect(locations.length).toBeGreaterThan(0);
    expect(
      locations.some(({ header }) => namespaceLocationPattern.test(header)),
      'the namespace regex location disappeared from nginx-fullstack.conf',
    ).toBe(true);
    // One dev route per proxied nginx location, so the two tables can be
    // compared entry for entry rather than approximately.
    expect(locations).toHaveLength(frontendDevProxyRoutes.length);

    for (const { body, header } of locations) {
      const upstream = upstreamServicePattern.exec(body)?.[1];
      expect(upstream, `location ${header} forwards to an unknown service`).toBeDefined();

      for (const path of requestPathsForLocation(header)) {
        const route = frontendDevProxyRouteForUrl(path);
        expect(route, `nginx proxies ${path} to ${upstream} but the dev proxy does not route it`).toBeDefined();
        expect(route?.upstream, `${path} goes to a different service in dev`).toBe(upstream);
        // Vite resolves the first matching key while nginx resolves the longest
        // matching prefix, so a route ordered behind a broader one would answer
        // a document request from the SPA where nginx renders the API's page.
        expect(route?.sharedWithSpaRoutes, `${path} negotiates differently in dev`).toBe(body.includes('return 418;'));
      }
    }
  });
});
