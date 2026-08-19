// @requirements REQ-AGRITECH-EXPERIENCE-026
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { MarketplaceGallery } from './marketplace-gallery';
import type { MarketplaceListing, MarketplaceTranslate } from './marketplace-ui';

/** Keys carry their params so every generated label stays distinguishable. */
const t: MarketplaceTranslate = (key, params) =>
  params
    ? `${key}:${Object.entries(params)
        .map(([name, value]) => `${name}=${value}`)
        .join(',')}`
    : key;

const listing = (images: string[], id = 'listing-1'): MarketplaceListing => ({
  category: 'seed',
  description: 'Certified corn seed description',
  id,
  images,
  kind: 'product',
  name: 'Certified corn seed',
  priceUzs: 1_250_000,
  promoted: false,
  provenance: 'live',
  publishedAt: '2026-08-01T09:00:00.000Z',
  rating: { average: 4.6, count: 12 },
  region: 'Samarqand',
  sampleAvailable: true,
  section: 'seeds',
  status: 'active',
  stockQuantity: 20,
  supplierId: 'seller-a',
  supplierName: 'Seller A',
  transactional: true,
  unit: 't',
  updatedAt: '2026-08-09T10:00:00.000Z',
});

const threeImages = ['https://cdn.test/a.jpg', 'https://cdn.test/b.jpg', 'https://cdn.test/c.jpg'];

const openTrigger = () => screen.getByRole('button', { name: 'agritech.marketplace.product.galleryOpen' });

const frameSource = () => openTrigger().querySelector('img')?.getAttribute('src');

const thumb = (index: number, total: number) =>
  screen.getByRole('button', {
    name: `agritech.marketplace.product.galleryThumb:index=${index},total=${total}`,
  });

const lightbox = () => screen.getByRole('dialog');

const lightboxSource = () => lightbox().querySelector('.dh-gallery-lightbox__image')?.getAttribute('src') ?? undefined;

const openLightbox = () => {
  fireEvent.click(openTrigger());
  return lightbox();
};

afterEach(() => {
  cleanup();
  document.body.style.removeProperty('overflow');
});

describe('MarketplaceGallery', () => {
  it('keeps the tinted placeholder and offers no viewer without images', () => {
    render(<MarketplaceGallery locale="en" product={listing([])} t={t} />);

    expect(screen.getByRole('img', { name: 'agritech.marketplace.product.imageFallback' })).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByRole('list')).toBeNull();
  });

  it('renders no thumbnail strip and no arrows for a single image', () => {
    render(<MarketplaceGallery locale="en" product={listing([threeImages[0] ?? ''])} t={t} />);

    expect(screen.queryByRole('list')).toBeNull();

    openLightbox();

    expect(screen.queryByRole('button', { name: 'agritech.marketplace.product.galleryPrevious' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'agritech.marketplace.product.galleryNext' })).toBeNull();
    expect(screen.getByText('agritech.marketplace.product.galleryPosition:index=1,total=1')).toBeTruthy();
  });

  it('switches the main image when a thumbnail is chosen', () => {
    render(<MarketplaceGallery locale="en" product={listing(threeImages)} t={t} />);

    const strip = screen.getByRole('list', { name: 'agritech.marketplace.product.gallery' });
    expect(within(strip).getAllByRole('button')).toHaveLength(3);
    expect(frameSource()).toBe(threeImages[0]);
    expect(thumb(1, 3).getAttribute('aria-current')).toBe('true');

    fireEvent.click(thumb(3, 3));

    expect(frameSource()).toBe(threeImages[2]);
    expect(thumb(3, 3).getAttribute('aria-current')).toBe('true');
    expect(thumb(1, 3).getAttribute('aria-current')).toBeNull();
  });

  it('opens a labelled modal viewer on the selected image', () => {
    render(<MarketplaceGallery locale="en" product={listing(threeImages)} t={t} />);
    fireEvent.click(thumb(2, 3));

    const dialog = openLightbox();

    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.getAttribute('aria-label')).toBe('agritech.marketplace.product.gallery');
    expect(lightboxSource()).toBe(threeImages[1]);
    expect(screen.getByText('agritech.marketplace.product.galleryPosition:index=2,total=3')).toBeTruthy();
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'agritech.marketplace.product.galleryClose' }),
    );
  });

  it('moves through the images with the arrow keys and wraps at both ends', () => {
    render(<MarketplaceGallery locale="en" product={listing(threeImages)} t={t} />);
    openLightbox();

    fireEvent.keyDown(document, { key: 'ArrowRight' });
    expect(lightboxSource()).toBe(threeImages[1]);

    fireEvent.keyDown(document, { key: 'ArrowLeft' });
    expect(lightboxSource()).toBe(threeImages[0]);

    fireEvent.keyDown(document, { key: 'ArrowLeft' });
    expect(lightboxSource()).toBe(threeImages[2]);

    fireEvent.keyDown(document, { key: 'ArrowRight' });
    expect(lightboxSource()).toBe(threeImages[0]);
  });

  it('moves through the images with the previous and next controls', () => {
    render(<MarketplaceGallery locale="en" product={listing(threeImages)} t={t} />);
    openLightbox();

    fireEvent.click(screen.getByRole('button', { name: 'agritech.marketplace.product.galleryNext' }));
    expect(lightboxSource()).toBe(threeImages[1]);

    fireEvent.click(screen.getByRole('button', { name: 'agritech.marketplace.product.galleryPrevious' }));
    expect(lightboxSource()).toBe(threeImages[0]);
  });

  it('advances on a left swipe and returns on a right swipe', () => {
    render(<MarketplaceGallery locale="en" product={listing(threeImages)} t={t} />);
    const dialog = openLightbox();

    fireEvent.touchStart(dialog, { touches: [{ clientX: 300 }] });
    fireEvent.touchEnd(dialog, { changedTouches: [{ clientX: 200 }] });
    expect(lightboxSource()).toBe(threeImages[1]);

    fireEvent.touchStart(dialog, { touches: [{ clientX: 200 }] });
    fireEvent.touchEnd(dialog, { changedTouches: [{ clientX: 320 }] });
    expect(lightboxSource()).toBe(threeImages[0]);
  });

  it('ignores a touch that never travels far enough to be a swipe', () => {
    render(<MarketplaceGallery locale="en" product={listing(threeImages)} t={t} />);
    const dialog = openLightbox();

    fireEvent.touchStart(dialog, { touches: [{ clientX: 300 }] });
    fireEvent.touchEnd(dialog, { changedTouches: [{ clientX: 288 }] });

    expect(lightboxSource()).toBe(threeImages[0]);
  });

  it('closes on Escape and restores focus to the frame that opened it', () => {
    render(<MarketplaceGallery locale="en" product={listing(threeImages)} t={t} />);
    openLightbox();

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(openTrigger());
  });

  it('closes from the labelled close button and from the backdrop', () => {
    render(<MarketplaceGallery locale="en" product={listing(threeImages)} t={t} />);
    openLightbox();

    fireEvent.click(screen.getByRole('button', { name: 'agritech.marketplace.product.galleryClose' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(openTrigger());

    const dialog = openLightbox();
    const backdrop = dialog.parentElement;
    expect(backdrop).toBeTruthy();
    fireEvent.click(backdrop as HTMLElement);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('keeps a click inside the viewer from closing it', () => {
    render(<MarketplaceGallery locale="en" product={listing(threeImages)} t={t} />);
    const dialog = openLightbox();

    fireEvent.click(dialog);

    expect(screen.queryByRole('dialog')).toBeTruthy();
  });

  it('traps Tab and Shift+Tab inside the viewer', () => {
    render(<MarketplaceGallery locale="en" product={listing(threeImages)} t={t} />);
    openLightbox();
    const close = screen.getByRole('button', { name: 'agritech.marketplace.product.galleryClose' });
    const next = screen.getByRole('button', { name: 'agritech.marketplace.product.galleryNext' });

    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(next);

    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(close);

    openTrigger().focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(close);
  });

  it('locks body scroll while open and restores it on close and on unmount', () => {
    document.body.style.overflow = 'scroll';
    const view = render(<MarketplaceGallery locale="en" product={listing(threeImages)} t={t} />);

    openLightbox();
    expect(document.body.style.overflow).toBe('hidden');

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(document.body.style.overflow).toBe('scroll');

    openLightbox();
    expect(document.body.style.overflow).toBe('hidden');
    view.unmount();
    expect(document.body.style.overflow).toBe('scroll');
  });

  it('falls back to the placeholder for a broken url in the frame and in the viewer', () => {
    render(<MarketplaceGallery locale="en" product={listing(threeImages)} t={t} />);
    openLightbox();

    const viewerImage = lightbox().querySelector('.dh-gallery-lightbox__image');
    expect(viewerImage).toBeTruthy();
    fireEvent.error(viewerImage as HTMLElement);
    expect(within(lightbox()).getByRole('img', { name: 'agritech.marketplace.product.imageFallback' })).toBeTruthy();

    fireEvent.keyDown(document, { key: 'Escape' });
    const frameImage = openTrigger().querySelector('img');
    expect(frameImage).toBeTruthy();
    fireEvent.error(frameImage as HTMLElement);
    expect(within(openTrigger()).getByRole('img', { name: 'agritech.marketplace.product.imageFallback' })).toBeTruthy();
  });

  it('returns to the first image and closes the viewer when the listing changes', () => {
    const view = render(<MarketplaceGallery locale="en" product={listing(threeImages)} t={t} />);
    fireEvent.click(thumb(3, 3));
    openLightbox();

    const other = ['https://cdn.test/d.jpg', 'https://cdn.test/e.jpg'];
    view.rerender(<MarketplaceGallery locale="en" product={listing(other, 'listing-2')} t={t} />);

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(frameSource()).toBe(other[0]);
    expect(document.body.style.overflow).toBe('');
  });
});
