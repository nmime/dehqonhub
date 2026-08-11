// @requirements REQ-AGRITECH-MARKETPLACE-016, REQ-AGRITECH-ROUTING-015, REQ-API-PROBLEM-001, REQ-FRONTEND-SHELL-004
import { cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

  it('passes decoded product, seller and contract identifiers into marketplace states', async () => {
    let route = await renderRoute('/products/seed%2042');

    expect(route.dataset['view']).toBe('product');
    expect(route.dataset['productId']).toBe('seed 42');
    expect(screen.queryByTestId('generic-user-shell')).toBeNull();

    cleanup();
    route = await renderRoute('/sellers/seller%2042');

    expect(route.dataset['view']).toBe('seller');
    expect(route.dataset['sellerId']).toBe('seller 42');
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

    const dispatchAnchorClick = (configure?: (anchor: HTMLAnchorElement) => void, init?: MouseEventInit) => {
      const anchor = document.createElement('a');
      anchor.href = '/auth';
      configure?.(anchor);
      document.body.append(anchor);
      const event = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0, ...init });
      anchor.dispatchEvent(event);
      anchor.remove();
      return event;
    };

    expect(dispatchAnchorClick(undefined, { ctrlKey: true }).defaultPrevented).toBe(false);
    const text = document.createTextNode('not-an-element');
    document.body.append(text);
    const textClick = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
    text.dispatchEvent(textClick);
    text.remove();
    expect(textClick.defaultPrevented).toBe(false);
    expect(dispatchAnchorClick((anchor) => (anchor.target = '_blank')).defaultPrevented).toBe(false);
    expect(
      dispatchAnchorClick((anchor) => {
        anchor.setAttribute('download', '');
      }).defaultPrevented,
    ).toBe(false);
    expect(dispatchAnchorClick((anchor) => (anchor.href = 'https://example.test')).defaultPrevented).toBe(false);
    expect(dispatchAnchorClick((anchor) => (anchor.target = '_self')).defaultPrevented).toBe(true);
  });

  it('serves the RFC 9457 problem registry from the user application', async () => {
    window.history.replaceState({}, '', '/problems');
    render(<UserRouter applyUserLocale={vi.fn()} applyUserTheme={vi.fn()} />);

    expect(await screen.findByRole('heading', { level: 1, name: 'site.problems.title' })).toBeTruthy();
    expect(screen.getByText('https://dehqonhub.uz/problems')).toBeTruthy();
    expect(screen.getByRole('heading', { level: 2, name: 'about:blank' })).toBeTruthy();
  });
});
