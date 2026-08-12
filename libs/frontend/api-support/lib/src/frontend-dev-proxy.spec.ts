// @requirements REQ-FRONTEND-ERROR-005
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  createFrontendDevProxy,
  defaultFrontendDevProxyTargets,
  frontendDevProxyRoutes,
  isSpaNavigationRequest,
  resolveFrontendDevProxyTarget,
} from './frontend-dev-proxy';

const workspaceRoot = join(import.meta.dirname, '../../../../..');

describe('frontend dev proxy targets', () => {
  it('sends each API prefix to the port pnpm dev serves it on', () => {
    const proxy = createFrontendDevProxy({});

    expect(proxy['/marketplace/']?.target).toBe('http://localhost:3002');
    expect(proxy['/profile/']?.target).toBe('http://localhost:3002');
    expect(proxy['/auth/']?.target).toBe('http://localhost:3003');
    expect(proxy['/api/auth/']?.target).toBe('http://localhost:3003');
    expect(proxy['/admin/']?.target).toBe('http://localhost:3001');
  });

  it('prefers a configured origin over the local default, trailing slash and all', () => {
    const env = { VITE_USER_API_BASE_URL: 'https://api.example.test/ ' };

    expect(resolveFrontendDevProxyTarget(env, 'user')).toBe('https://api.example.test');
    expect(createFrontendDevProxy(env)['/marketplace/']?.target).toBe('https://api.example.test');
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
    for (const entry of Object.values(createFrontendDevProxy({}))) {
      expect(entry.changeOrigin).toBe(false);
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
    expect(proxy['/profile/']?.bypass?.(navigation)).toBe('/index.html');
    expect(proxy['/admin/']?.bypass?.(navigation)).toBe('/index.html');
  });

  it('never hands a marketplace or Better Auth path to the SPA', () => {
    const proxy = createFrontendDevProxy({});

    expect(proxy['/marketplace/']?.bypass).toBeUndefined();
    expect(proxy['/api/auth/']?.bypass).toBeUndefined();
  });
});

describe('frontend dev proxy parity with the deployed proxy', () => {
  it('routes exactly the prefixes nginx routes, to the same service', () => {
    const nginx = readFileSync(join(workspaceRoot, 'docker/nginx-fullstack.conf'), 'utf8');
    const serviceByUpstream = {
      admin: 'admin-app-api',
      auth: 'auth-app-api',
      user: 'user-app-api',
    } as const;

    for (const route of frontendDevProxyRoutes) {
      const location = nginx.slice(nginx.indexOf(`location ^~ ${route.prefix} {`));
      expect(location.startsWith(`location ^~ ${route.prefix} {`), `${route.prefix} is not proxied by nginx`).toBe(
        true,
      );
      const block = location.slice(0, location.indexOf('\n  }'));
      expect(block, route.prefix).toContain(`proxy_pass http://${serviceByUpstream[route.upstream]}:80;`);
      // nginx returns 418 into the SPA fallback for document requests; a prefix
      // that does that is exactly a prefix the SPA shares.
      expect(block.includes('return 418;'), `${route.prefix} navigation handling`).toBe(route.sharedWithSpaRoutes);
    }
  });
});
