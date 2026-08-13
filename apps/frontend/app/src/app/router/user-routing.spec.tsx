// @requirements REQ-AGRITECH-MARKETPLACE-016
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getLinkRoute, isBareRoute, isMarketplaceRoute, normalizePath } from './user-navigation';
import { UserRouter } from './user-router';

const marketplaceRender = vi.hoisted(() => vi.fn());

vi.mock('../../pages/marketplace', () => ({
  MarketplacePage: (props: { contractId?: string; productId?: string; sellerId?: string; view?: string }) => {
    marketplaceRender(props);

    return (
      <div
        data-contract-id={props.contractId}
        data-product-id={props.productId}
        data-seller-id={props.sellerId}
        data-testid="marketplace-route"
        data-view={props.view}
      />
    );
  },
}));

vi.mock('@app/frontend-runtime', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@app/frontend-runtime')>();

  return {
    ...actual,
    useI18n: () => ({ t: (key: string) => key }),
  };
});

const renderRoute = async (path: string) => {
  window.history.replaceState({}, '', path);
  render(<UserRouter applyUserLocale={vi.fn()} applyUserTheme={vi.fn()} />);

  return screen.findByTestId('marketplace-route');
};

describe('DehqonHub marketplace routes', () => {
  beforeEach(() => {
    marketplaceRender.mockClear();
    vi.stubGlobal('scrollTo', vi.fn());
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    window.history.replaceState({}, '', '/');
  });

  it.each([
    ['/', 'home'],
    ['/catalog', 'catalog'],
    ['/favorites', 'favorites'],
    ['/cart', 'cart'],
    ['/requests', 'requests'],
    ['/verification', 'verification'],
    ['/account', 'account'],
  ])('maps %s to the %s marketplace state', async (path, view) => {
    const route = await renderRoute(path);

    expect(route.dataset['view']).toBe(view);
  });

  it('passes decoded product, seller and contract identifiers into marketplace states', async () => {
    let route = await renderRoute('/products/seed%2042');

    expect(route.dataset['view']).toBe('product');
    expect(route.dataset['productId']).toBe('seed 42');

    cleanup();
    route = await renderRoute('/sellers/seller%2042');

    expect(route.dataset['view']).toBe('seller');
    expect(route.dataset['sellerId']).toBe('seller 42');
    expect(screen.queryByTestId('generic-user-shell')).toBeNull();

    cleanup();
    route = await renderRoute('/contracts/DH%201042');

    expect(route.dataset['view']).toBe('contract');
    expect(route.dataset['contractId']).toBe('DH 1042');
  });

  // Everything that is not a marketplace view — the preferences page, the auth
  // flow, a legacy path that lands on not-found — renders as embedded content
  // inside the same chrome, so the site has one header and one navigation.
  it.each([['/marketplace'], ['/settings'], ['/auth']])('renders %s inside the site chrome', async (path) => {
    const route = await renderRoute(path);

    expect(route.dataset['view']).toBe('embedded');
  });

  it('routes in-app anchors client-side and leaves every other click to the browser', async () => {
    await renderRoute('/settings');
    const anchor = document.createElement('a');
    document.body.append(anchor);

    const clickAnchor = (attributes: Record<string, string>, init: MouseEventInit = {}) => {
      anchor.removeAttribute('download');
      anchor.removeAttribute('target');
      for (const [name, value] of Object.entries(attributes)) {
        anchor.setAttribute(name, value);
      }
      fireEvent.click(anchor, { button: 0, ...init });
    };

    // A click the browser must keep: modified clicks, new-tab targets, downloads
    // and anything pointing off-site never turn into a client-side navigation.
    clickAnchor({ href: '/catalog' }, { metaKey: true });
    clickAnchor({ href: '/catalog' }, { button: 1 });
    clickAnchor({ href: '/catalog', target: '_blank' });
    clickAnchor({ download: '', href: '/catalog' });
    clickAnchor({ href: 'https://example.test/catalog' });
    fireEvent.click(document.body);
    // A click that starts on a text node carries no element to read a link from.
    const looseText = document.createTextNode('loose text');
    document.body.append(looseText);
    looseText.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 }));
    looseText.remove();
    expect(window.location.pathname).toBe('/settings');

    clickAnchor({ href: '/catalog?section=seeds', target: '_self' });
    await vi.waitFor(() => {
      expect(window.location.pathname).toBe('/catalog');
    });
    expect(window.location.search).toBe('?section=seeds');

    anchor.remove();
  });

  // Telegram supplies its own frame around a mini app, so these routes render
  // with no chrome of their own rather than stacking a second one inside it.
  it('renders Telegram mini-app routes without the site chrome', async () => {
    window.history.replaceState({}, '', '/tma');
    render(<UserRouter applyUserLocale={vi.fn()} applyUserTheme={vi.fn()} />);

    await vi.waitFor(() => {
      expect(marketplaceRender).not.toHaveBeenCalled();
    });
    expect(screen.queryByTestId('marketplace-route')).toBeNull();
  });
});

describe('site route boundaries', () => {
  it('treats a trailing slash as the same route', () => {
    expect(normalizePath('/catalog/')).toBe('/catalog');
    expect(normalizePath('/')).toBe('/');
    expect(isMarketplaceRoute('/catalog/')).toBe(true);
    expect(isMarketplaceRoute('/products/seed-1')).toBe(true);
    expect(isMarketplaceRoute('/contracts/DH-1')).toBe(true);
    expect(isMarketplaceRoute('/products/seed-1/reviews')).toBe(false);
    expect(isMarketplaceRoute('/settings')).toBe(false);
  });

  it('keeps the Telegram entry points chrome-free and account linking on the site', () => {
    expect(isBareRoute('/tma')).toBe(true);
    expect(isBareRoute('/tma/auth')).toBe(true);
    expect(isBareRoute('/telegram-mini-app')).toBe(true);
    expect(isBareRoute('/link/telegram')).toBe(false);
  });

  it('recognizes only the two account-linking routes', () => {
    expect(getLinkRoute('/link/telegram')).toBe('/link/telegram');
    expect(getLinkRoute('/link/discord/')).toBe('/link/discord');
    expect(getLinkRoute('/link/github')).toBeNull();
    expect(getLinkRoute('/settings')).toBeNull();
  });
});
