// @requirements REQ-AGRITECH-EXPERIENCE-026
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  MarketplaceProductDetailSkeleton,
  MarketplaceSellerProfileSkeleton,
  MarketplaceSkeleton,
} from './marketplace-discovery';
import { MarketplaceGallerySkeleton } from './marketplace-gallery';
import {
  MarketplaceBusyButton,
  MarketplaceFactsSkeleton,
  MarketplaceListSkeleton,
  MarketplaceLoadingRegion,
  MarketplaceLoadingStatus,
  MarketplaceProductGridSkeleton,
  MarketplaceSpinner,
  MarketplaceStatsSkeleton,
  SkeletonCard,
  SkeletonFactRow,
  SkeletonGrid,
  SkeletonLine,
  SkeletonListRow,
  SkeletonMedia,
  SkeletonPill,
  SkeletonStat,
  useDeferredBusy,
  type DeferredBusyOptions,
} from './marketplace-loading';
import { MarketplaceProductSpecsSkeleton } from './marketplace-product-specs';
import type { MarketplaceTranslate } from './marketplace-ui';

/** Keys carry their params so a generated announcement stays distinguishable. */
const t: MarketplaceTranslate = (key, params) =>
  params
    ? `${key}:${Object.entries(params)
        .map(([name, value]) => `${name}=${value}`)
        .join(',')}`
    : key;

/** Every skeleton element the kit can emit; nothing here may reach a screen reader. */
const skeletonSelector =
  '.dh-sk, .dh-sk-card, .dh-sk-row, .dh-sk-stat, .dh-sk-fact, .dh-sk-hero, .dh-sk-detail, .dh-sk-chips';

const stubReducedMotion = (matches: boolean) => {
  const listeners = new Set<() => void>();
  vi.stubGlobal('matchMedia', (query: string) => ({
    addEventListener: (_event: string, listener: () => void) => listeners.add(listener),
    matches: query.includes('prefers-reduced-motion') ? matches : false,
    media: query,
    removeEventListener: (_event: string, listener: () => void) => listeners.delete(listener),
  }));
};

function DeferredHarness({ busy, options }: Readonly<{ busy: boolean; options?: DeferredBusyOptions }>) {
  const visible = useDeferredBusy(busy, options);
  return <output>{visible ? 'skeleton' : 'content'}</output>;
}

const shown = () => screen.getByRole('status').textContent;

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('marketplace loading kit primitives', () => {
  it('renders every primitive and keeps all of them out of the accessibility tree', () => {
    const { container } = render(
      <div>
        <SkeletonLine />
        <SkeletonLine size="lead" width="wide" />
        <SkeletonLine size="title" width="half" />
        <SkeletonLine width="third" />
        <SkeletonLine width="quarter" />
        <SkeletonMedia />
        <SkeletonMedia ratio="hero" />
        <SkeletonMedia ratio="thumb" />
        <SkeletonPill />
        <SkeletonPill variant="badge" />
        <SkeletonPill variant="card-action" />
        <SkeletonFactRow />
        <SkeletonListRow />
        <SkeletonListRow lines={3} tone="plain" trailing={false} />
        <SkeletonListRow tone="flush" />
        <SkeletonCard />
        <SkeletonStat />
      </div>,
    );

    /* Width and size variants are distinct classes, so a caller can mirror the
       real copy length rather than always painting a full-width bar. */
    for (const width of ['full', 'wide', 'half', 'third', 'quarter']) {
      expect(container.querySelector(`.dh-sk--line-${width}`)).toBeTruthy();
    }
    for (const size of ['body', 'lead', 'title']) {
      expect(container.querySelector(`.dh-sk--${size}`)).toBeTruthy();
    }
    for (const ratio of ['card', 'hero', 'thumb']) {
      expect(container.querySelector(`.dh-sk--media-${ratio}`)).toBeTruthy();
    }
    for (const variant of ['action', 'badge', 'card-action']) {
      expect(container.querySelector(`.dh-sk--pill-${variant}`)).toBeTruthy();
    }
    expect(container.querySelector('.dh-sk-fact')).toBeTruthy();
    expect(container.querySelector('.dh-sk-row--soft')).toBeTruthy();
    expect(container.querySelector('.dh-sk-row--plain')).toBeTruthy();
    /* The cart line is a flush rule-separated row, not a card. */
    expect(container.querySelector('.dh-sk-row--flush')).toBeTruthy();
    expect(container.querySelector('.dh-sk-card')).toBeTruthy();
    expect(container.querySelector('.dh-sk-stat')).toBeTruthy();

    /* Every primitive shares the one shimmer base so the loading language stays
       a single material. */
    expect(container.querySelectorAll('.dh-sk').length).toBeGreaterThan(10);

    const decorative = [...container.querySelectorAll(skeletonSelector)];
    expect(decorative.length).toBeGreaterThan(10);
    for (const element of decorative) {
      expect(element.getAttribute('aria-hidden')).toBe('true');
    }
    /* Decorative means decorative: a skeleton never leaves a stray landmark,
       heading or control behind for a screen reader to walk into. */
    expect(container.querySelectorAll('button, a, h1, h2, h3, [role]').length).toBe(0);
  });

  it('declares the container busy and names the shape of the content it replaces', () => {
    const { container } = render(
      <div>
        <SkeletonGrid shape="cards">
          <SkeletonCard />
        </SkeletonGrid>
        <SkeletonGrid shape="rows">
          <SkeletonListRow />
        </SkeletonGrid>
        <SkeletonGrid shape="facts">
          <SkeletonFactRow />
        </SkeletonGrid>
        <SkeletonGrid shape="stats">
          <SkeletonStat />
        </SkeletonGrid>
        <SkeletonGrid shape="detail">
          <SkeletonMedia ratio="hero" />
        </SkeletonGrid>
        <SkeletonGrid shape="gallery">
          <SkeletonMedia ratio="hero" />
        </SkeletonGrid>
        <SkeletonGrid shape="plain">
          <SkeletonLine />
        </SkeletonGrid>
      </div>,
    );

    const grids = [...container.querySelectorAll('.dh-skeleton-grid')];
    expect(grids).toHaveLength(7);
    for (const grid of grids) {
      expect(grid.getAttribute('aria-busy')).toBe('true');
      /* The container itself stays visible to assistive technology: it is what
         carries the busy state, so it must not be hidden along with its boxes. */
      expect(grid.getAttribute('aria-hidden')).toBeNull();
    }
    for (const shape of ['cards', 'rows', 'facts', 'stats', 'detail', 'gallery', 'plain']) {
      expect(container.querySelector(`.dh-skeleton-grid--${shape}`)).toBeTruthy();
    }
  });

  it('composes the common shapes at the requested length', () => {
    const { container } = render(
      <div>
        <MarketplaceProductGridSkeleton count={6} />
        <MarketplaceListSkeleton count={3} />
        <MarketplaceFactsSkeleton rows={5} />
        <MarketplaceStatsSkeleton count={4} />
      </div>,
    );

    expect(container.querySelectorAll('.dh-sk-card')).toHaveLength(6);
    expect(container.querySelectorAll('.dh-sk-row')).toHaveLength(3);
    expect(container.querySelectorAll('.dh-sk-fact')).toHaveLength(5);
    expect(container.querySelectorAll('.dh-sk-stat')).toHaveLength(4);
  });

  it('renders the spinner as a decorative mark in both sizes', () => {
    const { container } = render(
      <div>
        <MarketplaceSpinner />
        <MarketplaceSpinner size="sm" />
      </div>,
    );

    const spinners = [...container.querySelectorAll('.dh-spinner')];
    expect(spinners).toHaveLength(2);
    expect(container.querySelector('.dh-spinner--md')).toBeTruthy();
    expect(container.querySelector('.dh-spinner--sm')).toBeTruthy();
    for (const spinner of spinners) {
      expect(spinner.getAttribute('aria-hidden')).toBe('true');
    }
  });
});

describe('marketplace content-shaped skeletons', () => {
  it('keeps the shared skeleton signature while offering the shape of the real content', () => {
    const view = render(<MarketplaceSkeleton />);
    expect(document.querySelector('.dh-skeleton-grid')).toBeTruthy();
    expect(document.querySelectorAll('.dh-sk-card')).toHaveLength(4);

    view.rerender(<MarketplaceSkeleton count={2} />);
    expect(document.querySelectorAll('.dh-sk-card')).toHaveLength(2);

    /* A cart line, an offer or a publication is a row. Loading it as a tall 3:4
       tile is the defect this shape exists to remove. */
    view.rerender(<MarketplaceSkeleton count={3} shape="rows" />);
    expect(document.querySelectorAll('.dh-sk-card')).toHaveLength(0);
    expect(document.querySelectorAll('.dh-sk-row')).toHaveLength(3);

    view.rerender(<MarketplaceSkeleton count={4} shape="facts" />);
    expect(document.querySelectorAll('.dh-sk-fact')).toHaveLength(4);

    view.rerender(<MarketplaceSkeleton count={3} shape="stats" />);
    expect(document.querySelectorAll('.dh-sk-stat')).toHaveLength(3);
  });

  it('shapes the product route as its gallery, its specs and its buy action', () => {
    const { container } = render(<MarketplaceProductDetailSkeleton />);

    expect(container.querySelector('.dh-skeleton-grid--detail')).toBeTruthy();
    /* The visual column: one 1.72:1 frame plus the thumbnail strip. */
    expect(container.querySelector('.dh-skeleton-grid--gallery')).toBeTruthy();
    expect(container.querySelectorAll('.dh-sk--media-hero')).toHaveLength(1);
    expect(container.querySelectorAll('.dh-sk-strip .dh-sk--media-thumb')).toHaveLength(3);
    /* The content column: the two grouped definition lists the real specs
       render, plus the buy action. */
    expect(container.querySelectorAll('.dh-skeleton-grid--facts')).toHaveLength(2);
    expect(container.querySelectorAll('.dh-sk-fact')).toHaveLength(10);
    expect(container.querySelector('.dh-sk-detail > .dh-sk--pill-action')).toBeTruthy();
  });

  it('shapes the gallery and the spec block on their own geometry', () => {
    const gallery = render(<MarketplaceGallerySkeleton thumbs={2} />);
    expect(gallery.container.querySelectorAll('.dh-sk--media-thumb')).toHaveLength(2);
    cleanup();

    const specs = render(<MarketplaceProductSpecsSkeleton />);
    expect(specs.container.querySelectorAll('.dh-sk-chips .dh-sk--pill-badge')).toHaveLength(3);
    expect(specs.container.querySelectorAll('.dh-skeleton-grid--facts')).toHaveLength(2);
  });

  it('shapes the seller route as its hero above its catalog grid', () => {
    const { container } = render(<MarketplaceSellerProfileSkeleton />);

    expect(container.querySelector('.dh-sk-hero')).toBeTruthy();
    expect(container.querySelectorAll('.dh-sk-hero__copy .dh-sk--line')).toHaveLength(4);
    expect(container.querySelectorAll('.dh-sk-card')).toHaveLength(4);
  });
});

describe('marketplace loading announcements', () => {
  it('announces a region as loading and then as ready, and says nothing about a settled region', () => {
    render(<MarketplaceLoadingStatus busy={false} label="Saved products" t={t} />);
    expect(screen.queryByRole('status')).toBeNull();
    cleanup();

    const view = render(<MarketplaceLoadingStatus busy label="Saved products" t={t} />);
    expect(shown()).toBe('agritech.marketplace.loading');

    view.rerender(<MarketplaceLoadingStatus busy={false} label="Saved products" t={t} />);
    expect(shown()).toBe('user.state.ready:subject=Saved products');
  });

  it('renders the skeleton while busy and the content once settled, never both', () => {
    const view = render(
      <MarketplaceLoadingRegion busy label="Saved products" skeleton={<MarketplaceProductGridSkeleton />} t={t}>
        <p>real content</p>
      </MarketplaceLoadingRegion>,
    );

    expect(document.querySelector('.dh-skeleton-grid')?.getAttribute('aria-busy')).toBe('true');
    expect(screen.queryByText('real content')).toBeNull();
    expect(shown()).toBe('agritech.marketplace.loading');

    view.rerender(
      <MarketplaceLoadingRegion busy={false} label="Saved products" skeleton={<MarketplaceProductGridSkeleton />} t={t}>
        <p>real content</p>
      </MarketplaceLoadingRegion>,
    );

    expect(document.querySelector('.dh-skeleton-grid')).toBeNull();
    expect(screen.getByText('real content')).toBeTruthy();
    expect(shown()).toBe('user.state.ready:subject=Saved products');
  });
});

describe('marketplace busy controls', () => {
  it('says it is working, keeps its accessible name, and cannot be submitted twice', () => {
    const onClick = vi.fn();
    const view = render(
      <MarketplaceBusyButton
        busy={false}
        busyLabel="Working"
        className="dh-button dh-button--primary"
        icon="cart"
        onClick={onClick}
        type="button"
      >
        Add to cart
      </MarketplaceBusyButton>,
    );

    const idle = screen.getByRole('button', { name: 'Add to cart' });
    expect(idle.getAttribute('aria-busy')).toBeNull();
    expect(idle.hasAttribute('disabled')).toBe(false);
    /* The affordance slot is reserved in both states, so entering the busy state
       swaps a glyph for the spinner instead of changing the control's box. */
    expect(idle.querySelector('.dh-busy-button__slot')).toBeTruthy();
    expect(idle.querySelector('[data-marketplace-icon="cart"]')).toBeTruthy();
    expect(idle.querySelector('.dh-spinner')).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();

    fireEvent.click(idle);
    expect(onClick).toHaveBeenCalledTimes(1);

    view.rerender(
      <MarketplaceBusyButton
        busy
        busyLabel="Working"
        className="dh-button dh-button--primary"
        icon="cart"
        onClick={onClick}
        type="button"
      >
        Add to cart
      </MarketplaceBusyButton>,
    );

    /* The visible label is unchanged, so the control keeps the same accessible
       name a test, a script or a returning visitor already knows it by. */
    const busy = screen.getByRole('button', { name: 'Add to cart' });
    expect(busy.getAttribute('aria-busy')).toBe('true');
    expect(busy.hasAttribute('disabled')).toBe(true);
    expect(busy.querySelector('.dh-busy-button__slot .dh-spinner')).toBeTruthy();
    expect(busy.querySelector('[data-marketplace-icon="cart"]')).toBeNull();
    expect(shown()).toBe('Working');

    fireEvent.click(busy);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('keeps a disabled control disabled while it is busy and reserves the slot without a glyph', () => {
    render(
      <MarketplaceBusyButton busy={false} busyLabel="Working" className="dh-button" disabled type="button">
        Publish
      </MarketplaceBusyButton>,
    );

    const control = screen.getByRole('button', { name: 'Publish' });
    expect(control.hasAttribute('disabled')).toBe(true);
    expect(control.querySelector('.dh-busy-button__slot')?.childElementCount).toBe(0);
  });

  it('omits its own announcement when the caller already owns a live region', () => {
    render(
      <MarketplaceBusyButton busy className="dh-icon-button" icon="send" type="submit">
        {null}
      </MarketplaceBusyButton>,
    );

    expect(screen.queryByRole('status')).toBeNull();
    expect(document.querySelector('.dh-busy-button[aria-busy="true"] .dh-spinner')).toBeTruthy();
  });
});

describe('marketplace loading anti-flicker policy', () => {
  it('never paints a placeholder for work that finishes inside the instantaneous window', () => {
    vi.useFakeTimers();
    const view = render(<DeferredHarness busy />);
    /* Nothing is shown yet: the 120 ms gate has not elapsed. */
    expect(screen.getByText('content')).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(screen.getByText('content')).toBeTruthy();

    view.rerender(<DeferredHarness busy={false} />);
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    /* The request resolved in 100 ms, so no skeleton ever appeared. */
    expect(screen.getByText('content')).toBeTruthy();
  });

  it('shows a placeholder for slower work and then keeps it for its minimum duration', () => {
    vi.useFakeTimers();
    const view = render(<DeferredHarness busy />);

    act(() => {
      vi.advanceTimersByTime(120);
    });
    expect(screen.getByText('skeleton')).toBeTruthy();

    /* The data lands 40 ms after the skeleton appeared. Removing it now would be
       a two-frame flash, so it stays for the rest of the 320 ms window. */
    act(() => {
      vi.advanceTimersByTime(40);
    });
    view.rerender(<DeferredHarness busy={false} />);
    expect(screen.getByText('skeleton')).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(279);
    });
    expect(screen.getByText('skeleton')).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.getByText('content')).toBeTruthy();
  });

  it('drops a placeholder immediately once it has already outstayed its minimum', () => {
    vi.useFakeTimers();
    const view = render(<DeferredHarness busy />);

    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(screen.getByText('skeleton')).toBeTruthy();

    view.rerender(<DeferredHarness busy={false} />);
    expect(screen.getByText('content')).toBeTruthy();
  });

  it('is a synchronous pass-through when a caller disables the policy', () => {
    vi.useFakeTimers();
    const options: DeferredBusyOptions = { minVisibleMs: 0, showDelayMs: 0 };
    const view = render(<DeferredHarness busy options={options} />);
    expect(screen.getByText('skeleton')).toBeTruthy();

    view.rerender(<DeferredHarness busy={false} options={options} />);
    expect(screen.getByText('content')).toBeTruthy();
    /* No timer was ever scheduled, so no frame is owed to the caller. */
    expect(vi.getTimerCount()).toBe(0);
  });

  it('holds a motionless placeholder for longer when the visitor asks for reduced motion', () => {
    stubReducedMotion(true);
    vi.useFakeTimers();
    const view = render(<DeferredHarness busy />);

    act(() => {
      vi.advanceTimersByTime(120);
    });
    expect(screen.getByText('skeleton')).toBeTruthy();

    view.rerender(<DeferredHarness busy={false} />);
    /* The shimmer is a flat fill under reduced motion, so the placeholder has to
       stand still for 480 ms rather than 320 ms to register at all. */
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(screen.getByText('skeleton')).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(80);
    });
    expect(screen.getByText('content')).toBeTruthy();
  });

  it('keeps the standard minimum duration when reduced motion is not requested', () => {
    stubReducedMotion(false);
    vi.useFakeTimers();
    const view = render(<DeferredHarness busy />);

    act(() => {
      vi.advanceTimersByTime(120);
    });
    view.rerender(<DeferredHarness busy={false} />);
    act(() => {
      vi.advanceTimersByTime(320);
    });
    expect(screen.getByText('content')).toBeTruthy();
  });
});
