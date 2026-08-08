// @requirements REQ-AGRITECH-WEB-006 REQ-AGRITECH-MARKETPLACE-016 REQ-AGRITECH-ENGAGEMENT-019
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  MarketplacePublicListingDto,
  MarketplacePublicRequestDto,
  MarketplaceReviewDto,
} from '@app/frontend-api-client';
import {
  MarketplaceCatalog,
  MarketplaceFavorites,
  MarketplaceHome,
  MarketplaceProductDetail,
  MarketplaceSellerProfile,
} from './marketplace-discovery';
import { MarketplaceProductCard, ProductMedia } from './marketplace-product-card';
import {
  formatDate,
  localizedProductName,
  querySearch,
  querySection,
  toMarketplaceListing,
  toMarketplaceRequestFeedItem,
  type MarketplaceListing,
  type MarketplaceTranslate,
} from './marketplace-ui';

const t: MarketplaceTranslate = (key) => key;

const listing = (overrides: Partial<MarketplaceListing> = {}): MarketplaceListing => ({
  category: 'seed',
  description: 'Certified seed for spring planting',
  id: 'listing-seed',
  images: [],
  kind: 'product',
  name: 'Corn seed',
  nameRu: 'Семена кукурузы',
  nameUz: 'Makkajoʻxori urugʻi',
  nameUzCyrl: 'Маккажўхори уруғи',
  priceUzs: 1_250_000,
  promoted: false,
  region: 'Samarqand',
  sampleAvailable: true,
  section: 'seeds',
  status: 'active',
  stockQuantity: 20,
  supplierId: 'seller-one',
  supplierName: 'Seed cooperative',
  unit: 't',
  ...overrides,
});

const baseActions = () => ({
  favoriteIds: new Set<string>(),
  locale: 'en' as const,
  navigate: vi.fn(),
  onAdd: vi.fn(),
  onFavorite: vi.fn(),
  onOpen: vi.fn(),
  t,
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.history.replaceState({}, '', '/');
});

describe('marketplace projections and discovery interactions', () => {
  it('projects public records and localizes every supported product title', () => {
    const publicListing: MarketplacePublicListingDto = {
      availableQuantity: 0,
      category: 'seed',
      description: undefined,
      id: 'public-listing',
      images: [],
      kind: 'product',
      priceUzs: 750_000,
      promoted: true,
      region: 'Buxoro',
      sampleAvailable: false,
      section: 'seeds',
      seller: { displayName: 'Public seller', id: 'seller-public' },
      title: 'Public seed',
      titleRu: 'Публичные семена',
      titleUz: 'Ommaviy urugʻ',
      titleUzCyrl: 'Оммавий уруғ',
      unit: 'kg',
    };
    const projected = toMarketplaceListing(publicListing);
    expect(projected).toMatchObject({ description: '', status: 'out_of_stock', supplierId: 'seller-public' });
    expect(localizedProductName(projected, 'ru')).toBe(publicListing.titleRu);
    expect(localizedProductName(projected, 'uz')).toBe(publicListing.titleUz);
    expect(localizedProductName(projected, 'uz-cyrl')).toBe(publicListing.titleUzCyrl);
    expect(localizedProductName({ ...projected, nameUzCyrl: undefined }, 'uz-cyrl')).toBe(publicListing.titleUz);
    expect(localizedProductName({ ...projected, nameUz: undefined, nameUzCyrl: undefined }, 'uz-cyrl')).toBe(
      publicListing.title,
    );
    expect(localizedProductName(projected, 'en')).toBe(publicListing.title);

    const request = {
      buyerDisplayName: 'Public buyer',
      createdAt: '2026-08-09T10:00:00.000Z',
      id: 'request-public',
      region: 'Buxoro',
      status: 'closed',
      title: 'Need seed',
      updatedAt: '2026-08-09T10:00:00.000Z',
    } as MarketplacePublicRequestDto;
    expect(toMarketplaceRequestFeedItem(request).status).toBe('open');
    expect(formatDate(undefined, 'en')).toBe('—');
    expect(formatDate('not-a-date', 'en')).toBe('not-a-date');
    expect(formatDate(new Date('2026-08-09T10:00:00.000Z'), 'en')).not.toBe('—');
    expect(querySection('?section=equipment')).toBe('equipment');
    expect(querySection('?section=unknown')).toBe('all');
    expect(querySection()).toBe('all');
    expect(querySearch('?q=seed')).toBe('seed');
    expect(querySearch()).toBe('');
  });

  it('runs the home navigation, shelf-empty, favorite, open, add, and image fallback controls', () => {
    const actions = baseActions();
    const seed = listing();
    render(<MarketplaceHome {...actions} products={[seed]} />);

    for (const name of [
      'agritech.marketplace.hero.cta',
      'agritech.marketplace.orders.create',
      'agritech.marketplace.scenario.createOrder',
      'agritech.marketplace.scenario.sample',
      'agritech.marketplace.scenario.verify',
      'agritech.marketplace.scenario.sell',
    ]) {
      fireEvent.click(screen.getAllByRole('button', { name })[0]!);
    }
    for (const name of [
      /^agritech\.marketplace\.section\.equipment/u,
      /^agritech\.marketplace\.section\.seeds/u,
      /^agritech\.marketplace\.section\.produce/u,
    ]) {
      fireEvent.click(screen.getByRole('button', { name }));
    }
    for (const seeAll of screen.getAllByRole('button', { name: 'agritech.marketplace.shelf.seeAll' })) {
      fireEvent.click(seeAll);
    }
    for (const create of screen.getAllByRole('button', { name: 'agritech.marketplace.orders.create' }).slice(1)) {
      fireEvent.click(create);
    }
    fireEvent.click(screen.getAllByRole('button', { name: 'agritech.marketplace.product.addToCart' })[0]!);
    fireEvent.click(screen.getByRole('button', { name: 'agritech.marketplace.product.addFavorite' }));
    fireEvent.click(screen.getByRole('button', { name: seed.name }));

    expect(actions.navigate).toHaveBeenCalledWith('/catalog');
    expect(actions.navigate).toHaveBeenCalledWith('/requests?create=1');
    expect(actions.navigate).toHaveBeenCalledWith('/catalog?section=equipment');
    expect(actions.onAdd).toHaveBeenCalledWith(seed);
    expect(actions.onFavorite).toHaveBeenCalledWith(seed);
    expect(actions.onOpen).toHaveBeenCalledWith(seed);

    cleanup();
    const imageProduct = listing({ images: ['https://images.test/seed.webp'] });
    const view = render(<ProductMedia locale="en" product={imageProduct} t={t} />);
    fireEvent.error(screen.getByRole('img', { name: imageProduct.name }));
    expect(screen.getByRole('img', { name: 'agritech.marketplace.product.imageFallback' })).toBeTruthy();
    view.rerender(
      <ProductMedia locale="en" product={{ ...imageProduct, images: ['https://images.test/new.webp'] }} t={t} />,
    );
    expect(screen.getByRole('img', { name: imageProduct.name })).toBeTruthy();
  });

  it('applies every catalog filter and sort before resetting to the full catalog', () => {
    const actions = baseActions();
    const cheap = listing({ id: 'cheap', name: 'Alpha seed', priceUzs: 100, region: 'Buxoro' });
    const expensive = listing({ id: 'expensive', name: 'Zulu seed', priceUzs: 900, region: 'Samarqand' });
    const emptyStock = listing({ id: 'empty', name: 'Empty seed', stockQuantity: 0, status: 'out_of_stock' });
    const activeEmpty = listing({ id: 'active-empty', name: 'Active empty seed', stockQuantity: 0 });
    const inactiveStock = listing({
      id: 'inactive-stock',
      name: 'Inactive seed',
      status: 'inactive',
      stockQuantity: 5,
    });
    let desktopMatches = false;
    let desktopListener: (() => void) | undefined;
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({
        addEventListener: (_type: string, listener: () => void) => {
          desktopListener = listener;
        },
        get matches() {
          return desktopMatches;
        },
        removeEventListener: vi.fn(),
      })),
    );
    render(
      <MarketplaceCatalog
        {...actions}
        locationSearch=""
        products={[expensive, cheap, emptyStock, activeEmpty, inactiveStock]}
      />,
    );

    const dialog = document.querySelector<HTMLDialogElement>('.dh-mobile-filter-dialog')!;
    const showModal = vi.fn(() => {
      dialog.setAttribute('open', '');
    });
    const closeDialog = vi.fn(() => {
      dialog.removeAttribute('open');
    });
    Object.defineProperty(dialog, 'showModal', { configurable: true, value: showModal });
    Object.defineProperty(dialog, 'close', { configurable: true, value: closeDialog });
    fireEvent.click(screen.getByRole('button', { name: 'agritech.marketplace.filter.open' }));
    fireEvent.click(screen.getByRole('button', { name: 'agritech.marketplace.close' }));
    expect(showModal).toHaveBeenCalledOnce();
    expect(closeDialog).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'agritech.marketplace.filter.open' }));
    desktopMatches = true;
    desktopListener?.();
    expect(closeDialog).toHaveBeenCalledTimes(2);
    Object.defineProperty(dialog, 'showModal', { configurable: true, value: undefined });
    Object.defineProperty(dialog, 'close', { configurable: true, value: undefined });
    desktopMatches = false;
    fireEvent.click(screen.getByRole('button', { name: 'agritech.marketplace.filter.open' }));
    fireEvent.click(screen.getByRole('button', { name: 'agritech.marketplace.filter.open' }));
    expect(dialog.hasAttribute('open')).toBe(true);
    fireEvent(dialog, new Event('cancel', { bubbles: false, cancelable: true }));
    expect(dialog.hasAttribute('open')).toBe(false);

    const filterPanel = screen.getByRole('complementary', { name: 'agritech.marketplace.filter.title' });
    const inputs = within(filterPanel).getAllByRole('spinbutton');
    fireEvent.change(within(filterPanel).getByRole('searchbox'), { target: { value: 'seed' } });
    fireEvent.change(inputs[0]!, { target: { value: '50' } });
    fireEvent.change(inputs[1]!, { target: { value: '500' } });
    fireEvent.change(within(filterPanel).getByRole('combobox'), { target: { value: 'Buxoro' } });
    fireEvent.click(within(filterPanel).getByRole('checkbox'));
    expect(screen.getByText(cheap.name)).toBeTruthy();
    expect(screen.queryByText(expensive.name)).toBeNull();

    fireEvent.click(within(filterPanel).getByRole('button', { name: 'agritech.marketplace.filter.reset' }));
    const sort = screen.getByLabelText('agritech.marketplace.sort');
    fireEvent.change(sort, { target: { value: 'priceAsc' } });
    expect(screen.getAllByRole('button', { name: /seed/u }).some((button) => button.textContent === cheap.name)).toBe(
      true,
    );
    fireEvent.change(sort, { target: { value: 'priceDesc' } });
    fireEvent.change(inputs[0]!, { target: { value: '500' } });
    expect(screen.queryByText(cheap.name)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'agritech.marketplace.section.equipment' }));
    fireEvent.click(within(filterPanel).getByRole('button', { name: 'agritech.marketplace.filter.reset' }));
    fireEvent.click(within(filterPanel).getByRole('checkbox'));
    expect(screen.getByText(expensive.name)).toBeTruthy();
    expect(screen.queryByText(inactiveStock.name)).toBeNull();
  });

  it('covers product-detail navigation, sampling, review toggles, similar products, and missing products', async () => {
    const actions = baseActions();
    const seed = listing();
    const similar = listing({ id: 'similar', name: 'Similar seed' });
    const review: MarketplaceReviewDto = {
      assetReferences: [],
      comment: 'Good seed',
      createdAt: '2026-08-09T10:00:00.000Z',
      id: 'review-one',
      listingPublicationId: seed.id,
      rating: 5,
      revision: 1,
      updatedAt: '2026-08-09T10:00:00.000Z',
      verifiedDeal: true,
    };
    const onSample = vi.fn();
    const onReply = vi.fn().mockResolvedValue(false);
    const onReport = vi.fn().mockResolvedValue(false);
    const onRetry = vi.fn();
    render(
      <MarketplaceProductDetail
        {...actions}
        canReplyToReviews
        canReportReviews
        canReview={false}
        onReplyToReview={onReply}
        onReportReview={onReport}
        onRetry={onRetry}
        onReview={vi.fn()}
        onSample={onSample}
        product={seed}
        reviews={{ data: [review], status: 'ready' }}
        sampleUsage={{ data: { limit: 5, period: '2026', policyVersion: 1, remaining: 1, used: 4 }, status: 'ready' }}
        similar={[similar]}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'agritech.marketplace.back' }));
    fireEvent.click(screen.getByRole('button', { name: seed.supplierName }));
    fireEvent.click(screen.getAllByRole('button', { name: 'agritech.marketplace.product.addFavorite' })[0]!);
    fireEvent.change(screen.getByLabelText('agritech.marketplace.product.quantity'), { target: { value: '0' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'agritech.marketplace.product.addToCart' })[0]!);
    fireEvent.click(screen.getByRole('button', { name: 'agritech.marketplace.product.sample' }));
    fireEvent.click(screen.getByRole('button', { name: similar.name }));
    fireEvent.click(screen.getByRole('button', { name: 'agritech.marketplace.reviews.reply' }));
    class FormDataWithFileValue {
      get() {
        return new File(['not text'], 'reply.txt');
      }
    }
    vi.stubGlobal('FormData', FormDataWithFileValue);
    fireEvent.submit(screen.getByRole('button', { name: 'agritech.marketplace.reviews.replySubmit' }).closest('form')!);
    vi.unstubAllGlobals();
    fireEvent.change(screen.getByLabelText('agritech.marketplace.reviews.reply'), {
      target: { value: 'We appreciate the feedback' },
    });
    fireEvent.submit(screen.getByRole('button', { name: 'agritech.marketplace.reviews.replySubmit' }).closest('form')!);
    fireEvent.click(screen.getByRole('button', { name: 'agritech.marketplace.reviews.reply' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'agritech.marketplace.reviews.report' })[0]!);
    fireEvent.change(screen.getByLabelText('agritech.marketplace.reviews.reportComment'), {
      target: { value: 'Off-topic promotion' },
    });
    fireEvent.submit(
      screen.getByRole('button', { name: 'agritech.marketplace.reviews.reportSubmit' }).closest('form')!,
    );
    fireEvent.click(screen.getByRole('button', { name: 'agritech.marketplace.reviews.report' }));

    expect(actions.navigate).toHaveBeenCalledWith('/catalog');
    expect(actions.navigate).toHaveBeenCalledWith('/sellers/seller-one');
    expect(actions.onAdd).toHaveBeenCalledWith(seed, 1);
    expect(onSample).toHaveBeenCalledWith(seed);

    cleanup();
    const repliedReview: MarketplaceReviewDto = {
      ...review,
      id: 'review-replied',
      reply: {
        comment: 'Thank you for the review',
        createdAt: '2026-08-09T10:10:00.000Z',
        id: 'reply-one',
        revision: 1,
        updatedAt: '2026-08-09T10:10:00.000Z',
      },
    };
    const successfulReply = vi.fn().mockResolvedValue(true);
    const successfulReport = vi.fn().mockResolvedValue(true);
    const successfulReview = vi.fn().mockResolvedValue(true);
    const completeView = render(
      <MarketplaceProductDetail
        {...actions}
        canReplyToReviews
        canReportReviews
        canReview
        favoriteIds={new Set([seed.id])}
        onReplyToReview={successfulReply}
        onReportReview={successfulReport}
        onRetry={onRetry}
        onReview={successfulReview}
        onSample={onSample}
        product={{ ...seed, section: 'all' as never }}
        reviews={{ data: [review, repliedReview], status: 'ready' }}
        sampleUsage={{ data: { limit: 5, period: '2026', policyVersion: 1, remaining: 0, used: 5 }, status: 'ready' }}
        similar={[]}
      />,
    );
    expect(screen.getByText('agritech.marketplace.catalog')).toBeTruthy();
    expect(screen.getByText('Thank you for the review')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'agritech.marketplace.product.removeFavorite' }));
    fireEvent.click(screen.getByRole('button', { name: 'agritech.marketplace.samples.unavailable' }));
    fireEvent.click(screen.getByRole('button', { name: 'agritech.marketplace.reviews.reply' }));
    fireEvent.change(screen.getByLabelText('agritech.marketplace.reviews.reply'), {
      target: { value: 'Resolved' },
    });
    fireEvent.submit(screen.getByRole('button', { name: 'agritech.marketplace.reviews.replySubmit' }).closest('form')!);
    fireEvent.click(screen.getAllByRole('button', { name: 'agritech.marketplace.reviews.report' })[0]!);
    fireEvent.submit(
      screen.getByRole('button', { name: 'agritech.marketplace.reviews.reportSubmit' }).closest('form')!,
    );
    fireEvent.submit(screen.getByRole('button', { name: 'agritech.marketplace.reviews.submit' }).closest('form')!);
    fireEvent.change(screen.getByLabelText('agritech.marketplace.reviews.comment'), {
      target: { value: 'Updated review' },
    });
    fireEvent.submit(screen.getByRole('button', { name: 'agritech.marketplace.reviews.submit' }).closest('form')!);
    await Promise.all([
      successfulReply.mock.results[0]?.value,
      successfulReport.mock.results[0]?.value,
      successfulReview.mock.results[0]?.value,
    ]);
    completeView.rerender(
      <MarketplaceProductDetail
        {...actions}
        canReplyToReviews={false}
        canReportReviews={false}
        canReview={false}
        onReplyToReview={vi.fn()}
        onReportReview={vi.fn()}
        onRetry={onRetry}
        onReview={vi.fn()}
        onSample={onSample}
        product={seed}
        reviews={{ data: [review], status: 'ready' }}
        sampleUsage={{ data: { limit: 5, period: '2026', policyVersion: 1, remaining: 1, used: 4 }, status: 'ready' }}
        similar={[]}
      />,
    );
    expect(screen.queryByRole('button', { name: 'agritech.marketplace.reviews.reply' })).toBeNull();
    completeView.rerender(
      <MarketplaceProductDetail
        {...actions}
        canReplyToReviews={false}
        canReportReviews={false}
        canReview={false}
        canTransact={false}
        onReplyToReview={vi.fn()}
        onReportReview={vi.fn()}
        onRetry={onRetry}
        onReview={vi.fn()}
        onSample={onSample}
        product={seed}
        reviews={{ data: [], status: 'error' }}
        sampleUsage={{ data: { limit: 5, period: '2026', policyVersion: 1, remaining: 1, used: 4 }, status: 'ready' }}
        similar={[]}
      />,
    );
    expect(screen.queryByLabelText('agritech.marketplace.product.quantity')).toBeNull();

    cleanup();
    render(
      <MarketplaceProductDetail
        {...actions}
        canReplyToReviews={false}
        canReportReviews={false}
        canReview={false}
        onReplyToReview={vi.fn()}
        onReportReview={vi.fn()}
        onRetry={onRetry}
        onReview={vi.fn()}
        onSample={onSample}
        reviews={{ data: [], status: 'empty' }}
        sampleUsage={{ data: { limit: 5, period: '2026', policyVersion: 1, remaining: 0, used: 5 }, status: 'ready' }}
        similar={[]}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'agritech.marketplace.back' }));
    expect(actions.navigate).toHaveBeenCalledWith('/catalog');
  });

  it('renders seller and favorites loading, error, empty, and ready branches with their actions', () => {
    const actions = baseActions();
    const seed = listing();
    const seller = {
      description: undefined,
      displayName: 'Seed cooperative',
      id: seed.supplierId,
      region: seed.region,
      verified: true,
    };
    const sellerView = render(
      <MarketplaceSellerProfile
        {...actions}
        catalog={{ data: [], status: 'loading' }}
        seller={{ data: null, status: 'loading' }}
      />,
    );
    expect(document.querySelector('.dh-skeleton-grid')).toBeTruthy();
    sellerView.rerender(
      <MarketplaceSellerProfile
        {...actions}
        catalog={{ data: [], status: 'empty' }}
        seller={{ data: null, status: 'error' }}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'agritech.marketplace.back' }));
    sellerView.rerender(
      <MarketplaceSellerProfile
        {...actions}
        catalog={{ data: [], status: 'idle' }}
        seller={{ data: seller, status: 'ready' }}
      />,
    );
    expect(document.querySelector('.dh-skeleton-grid')).toBeTruthy();
    sellerView.rerender(
      <MarketplaceSellerProfile
        {...actions}
        catalog={{ data: [], status: 'error' }}
        seller={{ data: seller, status: 'ready' }}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'agritech.marketplace.back' }));
    sellerView.rerender(
      <MarketplaceSellerProfile
        {...actions}
        catalog={{ data: [], status: 'empty' }}
        seller={{ data: seller, status: 'ready' }}
      />,
    );
    expect(screen.getByText('agritech.marketplace.seller.noDescription')).toBeTruthy();
    sellerView.rerender(
      <MarketplaceSellerProfile
        {...actions}
        catalog={{ data: [seed], status: 'ready' }}
        seller={{ data: seller, status: 'ready' }}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: seed.name }));
    sellerView.unmount();

    const favorites = render(<MarketplaceFavorites {...actions} products={[seed]} status="loading" />);
    favorites.rerender(<MarketplaceFavorites {...actions} products={[seed]} status="error" />);
    fireEvent.click(screen.getByRole('button', { name: 'ui.runtime.retry' }));
    favorites.rerender(
      <MarketplaceFavorites {...actions} favoriteIds={new Set([seed.id])} products={[seed]} status="ready" />,
    );
    fireEvent.click(screen.getByRole('button', { name: seed.name }));
    favorites.rerender(<MarketplaceFavorites {...actions} products={[seed]} status="empty" />);
    fireEvent.click(screen.getByRole('button', { name: 'agritech.marketplace.hero.cta' }));
    expect(actions.navigate).toHaveBeenCalledWith('/catalog');
  });

  it('runs both open controls on a product card and replaces a failed image', () => {
    const seed = listing({ images: ['https://images.test/product.webp'] });
    const onFavorite = vi.fn();
    const onOpen = vi.fn();
    render(
      <MarketplaceProductCard
        favorite
        locale="en"
        onAdd={vi.fn()}
        onFavorite={onFavorite}
        onOpen={onOpen}
        product={seed}
        t={t}
      />,
    );
    fireEvent.error(screen.getByRole('img', { name: seed.name }));
    fireEvent.click(screen.getByRole('button', { name: 'agritech.marketplace.product.removeFavorite' }));
    fireEvent.click(screen.getByRole('button', { name: 'agritech.marketplace.product.openDetails' }));
    fireEvent.click(screen.getByRole('button', { name: seed.name }));
    expect(onFavorite).toHaveBeenCalledWith(seed);
    expect(onOpen).toHaveBeenCalledTimes(2);
  });
});
