// @requirements REQ-AGRITECH-MARKETPLACE-016
import { cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UserRouter } from './user-router';

const marketplaceRender = vi.hoisted(() => vi.fn());

vi.mock('../../pages/marketplace', () => ({
  MarketplacePage: (props: { contractId?: string; productId?: string; view?: string }) => {
    marketplaceRender(props);

    return (
      <div
        data-contract-id={props.contractId}
        data-product-id={props.productId}
        data-testid="marketplace-route"
        data-view={props.view}
      />
    );
  },
}));

vi.mock('../../shared/ui', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../shared/ui')>();

  return {
    ...actual,
    MiniAppShell: ({ children }: Readonly<{ children: ReactNode }>) => (
      <div data-testid="generic-user-shell">{children}</div>
    ),
  };
});

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
  ])('maps %s to the %s marketplace state without the generic shell', async (path, view) => {
    const route = await renderRoute(path);

    expect(route.dataset['view']).toBe(view);
    expect(screen.queryByTestId('generic-user-shell')).toBeNull();
  });

  it('passes decoded product and contract identifiers into their marketplace states', async () => {
    let route = await renderRoute('/products/seed%2042');

    expect(route.dataset['view']).toBe('product');
    expect(route.dataset['productId']).toBe('seed 42');
    expect(screen.queryByTestId('generic-user-shell')).toBeNull();

    cleanup();
    route = await renderRoute('/contracts/DH%201042');

    expect(route.dataset['view']).toBe('contract');
    expect(route.dataset['contractId']).toBe('DH 1042');
    expect(screen.queryByTestId('generic-user-shell')).toBeNull();
  });

  it('keeps a non-canonical legacy path inside the generic user shell', async () => {
    window.history.replaceState({}, '', '/marketplace');
    render(<UserRouter applyUserLocale={vi.fn()} applyUserTheme={vi.fn()} />);

    expect(await screen.findByTestId('generic-user-shell')).toBeTruthy();
    expect(screen.queryByTestId('marketplace-route')).toBeNull();
  });
});
